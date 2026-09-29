import { formatNumber } from "@/lib/utils";

export interface SummaryLine {
  name: string;
  qty: number;
  unit?: string | null;
}

/**
 * One-line "what is being bought" headline for list cards:
 *   [Cement 50 BAG]                       → "Cement · 50 BAG"
 *   [Cement 50 BAG, Sand 10 CUM, Steel 2 T] → "Cement · 50 BAG +2 more"
 *
 * Indent / PO / quotation numbers are machine IDs; the material is what a
 * site or purchase person actually scans for, so cards lead with this.
 */
export function summarizeLines(lines: SummaryLine[]): string | null {
  const first = lines[0];
  if (!first) return null;
  const qty = `${formatNumber(first.qty, 2)}${first.unit ? ` ${first.unit}` : ""}`;
  const more = lines.length > 1 ? ` +${lines.length - 1} more` : "";
  return `${first.name} · ${qty}${more}`;
}
