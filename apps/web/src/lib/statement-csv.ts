// Bank statement CSV → bank-feed messages.
// Every Indian bank (SBI, HDFC, ICICI, Axis) lets you download statements as
// CSV/Excel — headers vary, so we detect columns by name and synthesize a
// message string the existing SMS parser + matcher understands. Only credit
// rows convert: money IN is what receivable matching consumes; debits flow
// through supplier payments, not matching.

export interface StatementRow {
  receivedAt: Date | null;
  message: string;
}

const COL_MAP: Record<string, RegExp[]> = {
  date: [/^(txn|tran|value|posting)?\s*date$/i, /date/i],
  narration: [/narration|description|particulars|details|remarks|mode/i],
  credit: [/credit|deposit|cr\s*amt|cr\b|paid\s*in/i],
  debit: [/debit|withdrawal|dr\s*amt|dr\b|paid\s*out/i],
  amount: [/^amount$|^amt$|transaction\s*amount/i],
  ref: [/ref|utr|cheque|chq|instrument|txn\s*id/i],
};

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[./_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function pickCol(headers: string[], key: keyof typeof COL_MAP): number {
  const norms = headers.map(normHeader);
  for (const re of COL_MAP[key] ?? []) {
    const idx = norms.findIndex((n) => re.test(n) || n.includes(re.source.replace(/\\\w|\/i/g, "")));
    if (idx >= 0) return idx;
  }
  // fallback: fuzzy contains for credit/debit/ref
  const fallback: Record<string, string[]> = {
    date: ["date"],
    narration: ["narration", "desc", "particular"],
    credit: ["credit", "deposit", "cr"],
    debit: ["debit", "withdraw", "dr"],
    amount: ["amount", "amt"],
    ref: ["ref", "utr", "chq", "cheque"],
  };
  for (const hint of fallback[key] ?? []) {
    const idx = norms.findIndex((n) => n.includes(hint));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/[,\s₹]/g, "").replace(/cr$/i, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDate(raw: string): Date | null {
  const t = raw.trim();
  // DD/MM/YYYY or DD-MM-YYYY (Indian formats first — d/m, not m/d)
  const dmy = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const y = dmy[3]!.length === 2 ? 2000 + parseInt(dmy[3]!) : parseInt(dmy[3]!);
    // Noon UTC keeps the calendar date stable across server timezones —
    // a statement's "15/10" must not serialize back as the 14th.
    return new Date(Date.UTC(y, parseInt(dmy[2]!) - 1, parseInt(dmy[1]!), 12));
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Split CSV text into rows, respecting quoted fields. */
function rows(csv: string): string[][] {
  const out: string[][] = [];
  let cur: string[] = [], field = "", inQ = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQ) {
      if (c === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((x) => x.trim())) out.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some((x) => x.trim())) out.push(cur);
  return out;
}

/** Parse a bank statement CSV into ingestable credit messages. */
export function parseStatementCsv(csv: string): { rows: StatementRow[]; skipped: number; error?: string } {
  const all = rows(csv);
  // find the header row (first row that maps ≥2 columns)
  let headerIdx = -1;
  let cols = { date: -1, narration: -1, credit: -1, debit: -1, amount: -1, ref: -1 };
  for (let i = 0; i < Math.min(all.length, 10); i++) {
    const c = {
      date: pickCol(all[i]!, "date"),
      narration: pickCol(all[i]!, "narration"),
      credit: pickCol(all[i]!, "credit"),
      debit: pickCol(all[i]!, "debit"),
      amount: pickCol(all[i]!, "amount"),
      ref: pickCol(all[i]!, "ref"),
    };
    const score = Object.values(c).filter((v) => v >= 0).length;
    if (score >= 2 && (c.credit >= 0 || c.amount >= 0)) {
      headerIdx = i; cols = c; break;
    }
  }
  if (headerIdx < 0) return { rows: [], skipped: 0, error: "Couldn't detect statement columns — expected headers like Date, Narration, Credit, Debit" };

  const out: StatementRow[] = [];
  let skipped = 0;
  for (const r of all.slice(headerIdx + 1)) {
    const creditRaw = cols.credit >= 0 ? r[cols.credit] : undefined;
    const debitRaw = cols.debit >= 0 ? r[cols.debit] : undefined;
    const amountRaw = cols.amount >= 0 ? r[cols.amount] : undefined;
    // credit = explicit credit col, or single amount col that looks like a deposit
    const credit = parseAmount(creditRaw ?? "") ?? (debitRaw?.trim() ? null : parseAmount(amountRaw ?? ""));
    if (credit == null) { skipped++; continue; }
    const narration = cols.narration >= 0 ? (r[cols.narration] ?? "").trim() : "";
    const ref = cols.ref >= 0 ? (r[cols.ref] ?? "").trim() : "";
    const receivedAt = cols.date >= 0 ? parseDate(r[cols.date] ?? "") : null;
    // The parser keys on INR-amount + UPI/NEFT/IMPS refs — say it in its language
    const message = `${narration || "Bank credit"} credited INR ${credit.toFixed(2)}${ref ? ` Ref No ${ref}` : ""}`.slice(0, 2000);
    out.push({ receivedAt, message });
  }
  return { rows: out, skipped };
}
