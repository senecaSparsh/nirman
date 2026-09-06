/**
 * Web Worker for offloading list computations from the main thread.
 *
 * When the user sorts, filters, or aggregates a large list (e.g. 500+
 * attendance records, stock movements), doing it on the main thread
 * causes jank (frozen UI, delayed input). This worker does the heavy
 * lifting off-thread so the UI stays responsive.
 *
 * Usage:
 *   import { computeList } from "@/lib/workers/list-compute";
 *   const result = await computeList({
 *     items: largeArray,
 *     operation: "sort+filter",
 *     sort: { field: "date", direction: "desc" },
 *     filter: { field: "status", value: "ACTIVE" },
 *   });
 *
 * Falls back to synchronous computation if Workers aren't available
 * (older browsers, SSR).
 */

interface SortConfig {
  field: string;
  direction: "asc" | "desc";
}

interface FilterConfig {
  field: string;
  value: unknown;
  /** "eq" (default), "contains" (string), "gte"/"lte" (numbers/dates), "in" (array) */
  op?: "eq" | "contains" | "gte" | "lte" | "in" | "neq";
}

interface AggregateConfig {
  field: string;
  op: "sum" | "avg" | "count" | "min" | "max";
}

export interface ComputeRequest {
  items: Record<string, unknown>[];
  operation: "sort" | "filter" | "sort+filter" | "aggregate" | "group+aggregate";
  sort?: SortConfig;
  filter?: FilterConfig;
  aggregate?: AggregateConfig;
  groupBy?: string;
  limit?: number;
  offset?: number;
}

export interface ComputeResponse {
  items?: Record<string, unknown>[];
  aggregate?: { value: number };
  groups?: Array<{ key: string; count: number; value?: number }>;
  total: number;
}

function getFieldValue(item: Record<string, unknown>, field: string): unknown {
  // Support nested paths like "customer.name"
  const parts = field.split(".");
  let val: unknown = item;
  for (const p of parts) {
    if (val == null) return null;
    val = (val as Record<string, unknown>)[p];
  }
  return val;
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function matchesFilter(item: Record<string, unknown>, filter: FilterConfig): boolean {
  const val = getFieldValue(item, filter.field);
  const target = filter.value;
  switch (filter.op ?? "eq") {
    case "eq": return val === target;
    case "neq": return val !== target;
    case "contains":
      return val != null && String(val).toLowerCase().includes(String(target).toLowerCase());
    case "gte":
      return val != null && compareValues(val, target) >= 0;
    case "lte":
      return val != null && compareValues(val, target) <= 0;
    case "in":
      return Array.isArray(target) && target.includes(val);
    default: return val === target;
  }
}

function sortItems(items: Record<string, unknown>[], sort: SortConfig): Record<string, unknown>[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const av = getFieldValue(a, sort.field);
    const bv = getFieldValue(b, sort.field);
    const cmp = compareValues(av, bv);
    return sort.direction === "desc" ? -cmp : cmp;
  });
  return sorted;
}

function filterItems(items: Record<string, unknown>[], filter: FilterConfig): Record<string, unknown>[] {
  return items.filter((item) => matchesFilter(item, filter));
}

function aggregateItems(items: Record<string, unknown>[], agg: AggregateConfig): number {
  const values = items.map((i) => Number(getFieldValue(i, agg.field) ?? 0));
  switch (agg.op) {
    case "sum": return values.reduce((s, v) => s + v, 0);
    case "avg": return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    case "count": return items.length;
    case "min": return values.length > 0 ? Math.min(...values) : 0;
    case "max": return values.length > 0 ? Math.max(...values) : 0;
    default: return 0;
  }
}

function groupAndAggregate(
  items: Record<string, unknown>[],
  groupBy: string,
  agg: AggregateConfig,
): Array<{ key: string; count: number; value: number }> {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const key = String(getFieldValue(item, groupBy) ?? "—");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()].map(([key, groupItems]) => ({
    key,
    count: groupItems.length,
    value: aggregateItems(groupItems, agg),
  }));
}

self.onmessage = (e: MessageEvent<ComputeRequest>) => {
  const req = e.data;
  let items = req.items;

  if (req.operation === "sort+filter" || req.operation === "filter") {
    if (req.filter) items = filterItems(items, req.filter);
  }
  if (req.operation === "sort+filter" || req.operation === "sort") {
    if (req.sort) items = sortItems(items, req.sort);
  }

  const total = items.length;

  // Apply pagination
  if (req.offset != null) items = items.slice(req.offset);
  if (req.limit != null) items = items.slice(0, req.limit);

  if (req.operation === "aggregate" && req.aggregate) {
    const value = aggregateItems(req.items, req.aggregate);
    self.postMessage({ aggregate: { value }, total: req.items.length } satisfies ComputeResponse);
    return;
  }

  if (req.operation === "group+aggregate" && req.groupBy && req.aggregate) {
    const groups = groupAndAggregate(req.items, req.groupBy, req.aggregate);
    self.postMessage({ groups, total: req.items.length } satisfies ComputeResponse);
    return;
  }

  self.postMessage({ items, total } satisfies ComputeResponse);
};
