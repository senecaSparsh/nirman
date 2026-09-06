/**
 * Type declarations for the list-compute Web Worker module.
 * The actual worker code is in list-compute.worker.ts.
 */

export interface SortConfig {
  field: string;
  direction: "asc" | "desc";
}

export interface FilterConfig {
  field: string;
  value: unknown;
  op?: "eq" | "contains" | "gte" | "lte" | "in" | "neq";
}

export interface AggregateConfig {
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
