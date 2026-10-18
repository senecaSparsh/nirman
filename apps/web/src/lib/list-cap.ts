/**
 * LIST CAP — hub pages cap list queries (`take: 500`) for performance.
 * The cap itself is fine; silent truncation isn't — row 501 simply never
 * appears, and the user has no way to know it's missing.
 *
 * Convention: query with `take: cap + 1`, then run the result through
 * `applyCap`. If more than `cap` rows came back, the extra row proves the
 * list was truncated — we slice it off and set `capped: true` so the page
 * can warn ("Showing the latest 500 — older records are hidden").
 *
 * ```ts
 * const pos = await prisma.purchaseOrder.findMany({ take: LIST_CAP + 1, ... });
 * const posC = applyCap(pos); // { rows, capped }
 * ```
 */
export const LIST_CAP = 500;

export function applyCap<T>(rows: T[], cap = LIST_CAP): { rows: T[]; capped: boolean } {
  if (rows.length <= cap) return { rows, capped: false };
  return { rows: rows.slice(0, cap), capped: true };
}
