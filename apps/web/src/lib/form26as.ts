/**
 * Form 26AS parser — extracts TDS-credit rows from the income-tax portal's
 * text/tabular export (or an Excel copy-paste of it). The portal's own export
 * is a PDF, but accountants commonly paste the tabular body (e.g. from the
 * older .txt export, TIS, or a copied PDF table), so the parser is tolerant:
 * any line carrying a section code (194C, 194IA, 194H, 194J, 194Q, 195, …)
 * plus at least two numeric amounts is a candidate row.
 *
 * Column order in the canonical export is:
 *   Sr | Section | Txn date | Status | Booking date | Remarks |
 *   Amount paid/credited | Tax deducted | TDS deposited
 * We take the trailing numeric columns positionally: deposited = last,
 * deducted = second-last, paid/credited = third-last (when present).
 *
 * "Name of deductor" / "TAN of deductor" header lines are captured so each
 * data row inherits the deductor block it sits under.
 */

export type Form26asRow = {
  /** Normalised section, e.g. "194IA", "194C". */
  section: string;
  deductorName: string | null;
  deductorTan: string | null;
  /** ISO yyyy-mm-dd when a date token was found on the row. */
  txnDate: string | null;
  /** Tax deducted per the statement. */
  taxDeducted: number;
  /** Tax actually deposited with govt — the amount 26AS credits. */
  tdsDeposited: number;
  /** Gross amount paid/credited, when present. */
  amountPaid: number | null;
  /** Raw source line, for the preview UI's tooltip/debugging. */
  raw: string;
};

const SECTION_RE = /\b(19[0-9][A-Z]{0,2})\b/;
const TAN_RE = /\bTAN(?:\s+of\s+(?:the\s+)?deductor)?[:\s]+([A-Z]{4}[0-9]{5}[A-Z])\b/i;
const NAME_RE = /name\s+of\s+(?:the\s+)?deductor[:\s]+([^\t|]+)/i;
const NUM_RE = /-?\d[\d,]*\.\d{2}|-?\d[\d,]*/g;
const DATE_RES = [
  /\b(\d{2})[-/](\d{2})[-/](\d{4})\b/, // dd-mm-yyyy / dd/mm/yyyy
  /\b(\d{2})-([A-Za-z]{3})-(\d{4})\b/, // dd-MMM-yyyy
];
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseDate(line: string): string | null {
  const numeric = line.match(DATE_RES[0]!);
  if (numeric) {
    const [, dd, mm, yyyy] = numeric;
    return `${yyyy}-${mm}-${dd}`;
  }
  const named = line.match(DATE_RES[1]!);
  if (named) {
    const [, dd, mon, yyyy] = named;
    const mm = MONTHS[mon!.toLowerCase()];
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/** Keep only plausibly-TDS sections (194x/195/206C-series codes seen in 26AS). */
function isTdsSection(s: string): boolean {
  return /^19[0-9][A-Z]{0,2}$/.test(s) || /^20[0-9][A-Z]{0,2}$/.test(s);
}

export function parseForm26as(text: string): Form26asRow[] {
  const rows: Form26asRow[] = [];
  let deductorName: string | null = null;
  let deductorTan: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const tan = line.match(TAN_RE);
    if (tan) deductorTan = tan[1]!.toUpperCase();
    const name = line.match(NAME_RE);
    if (name) deductorName = name[1]!.trim().replace(/\s{2,}.*$/, "").trim();

    const sectionMatch = line.match(SECTION_RE);
    if (!sectionMatch || !isTdsSection(sectionMatch[1]!)) continue;

    const numbers = line.match(NUM_RE) ?? [];
    // Need at least deducted + deposited; serial-no numbers (small integers
    // at line start) are excluded by requiring ≥2 decimal amounts or 3 nums.
    const decimals = line.match(/\d[\d,]*\.\d{2}/g) ?? [];
    if (numbers.length < 3 && decimals.length < 2) continue;

    // Positional amounts from the right, ignoring a leading serial number.
    const amountTokens = decimals.length >= 2 ? decimals : numbers.slice(-3);
    const tdsDeposited = toNum(amountTokens[amountTokens.length - 1]!);
    const taxDeducted = toNum(amountTokens[amountTokens.length - 2]!);
    const amountPaid = amountTokens.length >= 3 ? toNum(amountTokens[amountTokens.length - 3]!) : null;
    if (!Number.isFinite(tdsDeposited) || !Number.isFinite(taxDeducted)) continue;
    if (tdsDeposited <= 0 && taxDeducted <= 0) continue;

    rows.push({
      section: sectionMatch[1]!.toUpperCase(),
      deductorName,
      deductorTan,
      txnDate: parseDate(line),
      taxDeducted,
      tdsDeposited,
      amountPaid,
      raw: line.slice(0, 200),
    });
  }
  return rows;
}

function toNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}
