/**
 * Nav badge helpers — zero-dependency module so both shells (desktop
 * app-shell, mobile mobile-shell) can use it without pulling in
 * tailwind-merge or the nav config.
 *
 * The shells fetch badge endpoints only to display a count, so they
 * append `countOnly=1` and the endpoint returns `{ count }` computed via
 * a cheap `.count()` query instead of hydrating full lists with
 * includes. Endpoints that don't support countOnly still work — the
 * reader falls back to counting arrays / common list shapes.
 */
export function badgeCountUrl(endpoint: string): string {
  return endpoint + (endpoint.includes("?") ? "&" : "?") + "countOnly=1";
}

/** Extract a badge count from a countOnly (`{count}`) or legacy response. */
export function badgeCountFrom(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.count === "number") return obj.count;
    if (typeof obj.total === "number") return obj.total;
    // Legacy object-of-lists shapes (e.g. /api/approvals).
    if (Array.isArray(obj.rows)) return obj.rows.length;
    if (Array.isArray(obj.data)) return obj.data.length;
    let sum = 0;
    let sawList = false;
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) {
        sum += v.length;
        sawList = true;
      }
    }
    if (sawList) return sum;
  }
  return 0;
}
