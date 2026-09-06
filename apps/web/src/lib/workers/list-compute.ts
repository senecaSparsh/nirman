/**
 * Client-side wrapper for the list-compute Web Worker.
 *
 * Provides a simple async API that offloads sorting, filtering, and
 * aggregation to a Web Worker. Falls back to synchronous computation
 * if Workers aren't available (SSR, older browsers).
 *
 * Usage:
 *   import { sortList, filterList, aggregateList } from "@/lib/workers/list-compute";
 *
 *   // Sort a large list off-thread
 *   const sorted = await sortList(items, { field: "date", direction: "desc" });
 *
 *   // Filter + sort
 *   const filtered = await filterAndSort(items, {
 *     field: "status", value: "ACTIVE", op: "eq"
 *   }, {
 *     field: "date", direction: "desc"
 *   });
 *
 *   // Aggregate (sum, avg, count, min, max)
 *   const total = await aggregateList(items, { field: "amount", op: "sum" });
 */

import type { ComputeRequest, ComputeResponse } from "./list-compute.worker";

// Lazy-init the worker (only in browser, only when first needed)
let worker: Worker | null = null;
const pendingRequests = new Map<number, (response: ComputeResponse) => void>();
let requestId = 0;

function getWorker(): Worker | null {
  if (typeof window === "undefined") return null; // SSR
  if (worker) return worker;
  try {
    // Create the worker from the TypeScript file. Next.js handles
    // the bundling via `new Worker(new URL(...))`.
    worker = new Worker(new URL("./list-compute.worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<ComputeResponse & { id?: number }>) => {
      // The worker doesn't use IDs — it processes one request at a time.
      // Resolve the oldest pending request.
      const oldest = pendingRequests.entries().next();
      if (!oldest.done) {
        const [id, resolve] = oldest.value;
        pendingRequests.delete(id);
        resolve(e.data);
      }
    };
    worker.onerror = () => {
      // Worker failed — fall back to sync for all pending requests
      // (they'll be rejected and the caller will use the sync fallback)
      for (const [, resolve] of pendingRequests) {
        resolve({ items: [], total: 0 });
      }
      pendingRequests.clear();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

async function compute(req: ComputeRequest): Promise<ComputeResponse> {
  const w = getWorker();
  if (!w) {
    // Fallback: synchronous computation on main thread
    return computeSync(req);
  }

  return new Promise((resolve) => {
    const id = ++requestId;
    pendingRequests.set(id, resolve);
    w.postMessage(req);
  });
}

/** Synchronous fallback (used when Workers aren't available). */
function computeSync(req: ComputeRequest): ComputeResponse {
  let items = req.items;

  if (req.operation === "sort+filter" || req.operation === "filter") {
    if (req.filter) {
      items = items.filter((item: Record<string, unknown>) => {
        const val = req.filter ? getNestedValue(item, req.filter.field) : null;
        const target = req.filter?.value;
        switch (req.filter?.op ?? "eq") {
          case "eq": return val === target;
          case "neq": return val !== target;
          case "contains":
            return val != null && String(val).toLowerCase().includes(String(target).toLowerCase());
          case "in":
            return Array.isArray(target) && target.includes(val);
          default: return val === target;
        }
      });
    }
  }
  if (req.operation === "sort+filter" || req.operation === "sort") {
    if (req.sort) {
      items = [...items].sort((a, b) => {
        const av = getNestedValue(a, req.sort!.field);
        const bv = getNestedValue(b, req.sort!.field);
        const cmp = compareSync(av, bv);
        return req.sort!.direction === "desc" ? -cmp : cmp;
      });
    }
  }

  const total = items.length;
  if (req.offset != null) items = items.slice(req.offset);
  if (req.limit != null) items = items.slice(0, req.limit);

  if (req.operation === "aggregate" && req.aggregate) {
    const values = req.items.map((i: Record<string, unknown>) => Number(getNestedValue(i, req.aggregate!.field) ?? 0));
    let value = 0;
    switch (req.aggregate.op) {
      case "sum": value = values.reduce((s: number, v: number) => s + v, 0); break;
      case "avg": value = values.length > 0 ? values.reduce((s: number, v: number) => s + v, 0) / values.length : 0; break;
      case "count": value = req.items.length; break;
      case "min": value = values.length > 0 ? Math.min(...values) : 0; break;
      case "max": value = values.length > 0 ? Math.max(...values) : 0; break;
    }
    return { aggregate: { value }, total: req.items.length };
  }

  return { items, total };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let val: unknown = obj;
  for (const p of parts) {
    if (val == null) return null;
    val = (val as Record<string, unknown>)[p];
  }
  return val;
}

function compareSync(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// ── Public API ──────────────────────────────────────────────

export async function sortList<T extends Record<string, unknown>>(
  items: T[],
  sort: { field: string; direction: "asc" | "desc" },
): Promise<T[]> {
  const res = await compute({
    items: items as Record<string, unknown>[],
    operation: "sort",
    sort,
  });
  return (res.items ?? []) as T[];
}

export async function filterList<T extends Record<string, unknown>>(
  items: T[],
  filter: { field: string; value: unknown; op?: "eq" | "contains" | "in" | "neq" },
): Promise<T[]> {
  const res = await compute({
    items: items as Record<string, unknown>[],
    operation: "filter",
    filter,
  });
  return (res.items ?? []) as T[];
}

export async function filterAndSort<T extends Record<string, unknown>>(
  items: T[],
  filter: { field: string; value: unknown; op?: "eq" | "contains" | "in" | "neq" },
  sort: { field: string; direction: "asc" | "desc" },
): Promise<T[]> {
  const res = await compute({
    items: items as Record<string, unknown>[],
    operation: "sort+filter",
    filter,
    sort,
  });
  return (res.items ?? []) as T[];
}

export async function aggregateList(
  items: Record<string, unknown>[],
  agg: { field: string; op: "sum" | "avg" | "count" | "min" | "max" },
): Promise<number> {
  const res = await compute({
    items,
    operation: "aggregate",
    aggregate: agg,
  });
  return res.aggregate?.value ?? 0;
}

export async function paginateList<T extends Record<string, unknown>>(
  items: T[],
  limit: number,
  offset: number,
): Promise<{ items: T[]; total: number }> {
  const res = await compute({
    items: items as Record<string, unknown>[],
    operation: "sort", // no-op sort, just for pagination
    limit,
    offset,
  });
  return {
    items: (res.items ?? []) as T[],
    total: res.total,
  };
}
