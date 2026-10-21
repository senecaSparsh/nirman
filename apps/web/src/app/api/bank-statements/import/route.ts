import { NextRequest } from "next/server";
import Decimal from "decimal.js";
import { apiHandler, getCompany, json, requireEffectivePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { importBankStatement, ServiceError } from "@nirman/services";

/**
 * POST /api/bank-statements/import — upload a bank/CC statement (CSV/TSV).
 *
 * Accepted shapes (headers case-insensitive, comma/semicolon/tab):
 *   Date, Narration/Description, Reference/Chq No, Withdrawal/Debit, Deposit/Credit, [Balance]
 *
 * Date formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD MMM YYYY.
 * Each credit row runs through the same matcher the bank SMS parser uses —
 * statement credits on their own, one-per-month reconciliation.
 */

const DATE_FMT = [
  /^(\d{2})[/-](\d{2})[/-](\d{4})$/,        // DD/MM/YYYY or DD-MM-YYYY
  /^(\d{4})-(\d{2})-(\d{2})$/,             // YYYY-MM-DD
  /^(\d{2})\s([A-Za-z]{3})\s(\d{4})$/,      // DD MMM YYYY
];
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  let m = s.match(DATE_FMT[0]!);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(DATE_FMT[1]!);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(DATE_FMT[2]!);
  if (m) {
    const mon = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
    if (mon >= 0) return new Date(Number(m[3]), mon, Number(m[1]));
  }
  return null;
}

function parseAmt(raw: string): Decimal {
  const cleaned = raw.replace(/[,₹\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!cleaned || cleaned === "-") return new Decimal(0);
  const d = new Decimal(cleaned);
  return d.isNaN() ? new Decimal(0) : d.abs();
}

function splitRow(line: string): string[] {
  // CSV-aware split — quoted fields containing separators.
  const out: string[] = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if ((ch === "," || ch === ";" || ch === "\t") && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseStatement(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new ServiceError("Empty statement file", 400);

  // Header detection — find a line containing "date" + a cr/dr column word.
  let headerIdx = -1;
  let cols: { date: number; narration: number; ref: number; debit: number; credit: number } | null = null;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitRow(lines[i]!).map((c) => c.toLowerCase());
    const dateIdx = cells.findIndex((c) => /date/.test(c));
    const drIdx = cells.findIndex((c) => /debit|withdrawal|dr\b/.test(c));
    const crIdx = cells.findIndex((c) => /credit|deposit|cr\b/.test(c));
    if (dateIdx >= 0 && (drIdx >= 0 || crIdx >= 0)) {
      headerIdx = i;
      cols = {
        date: dateIdx,
        narration: cells.findIndex((c) => /narrat|descript|particular|remarks|detail/.test(c)),
        ref: cells.findIndex((c) => /ref|chq|cheque|utr/.test(c)),
        debit: drIdx,
        credit: crIdx,
      };
      break;
    }
  }
  if (!cols) throw new ServiceError("Could not find a date+amount header row — expected columns like Date / Narration / Reference / Debit / Credit", 400);

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]!);
    if (cells.length <= cols.date) continue;
    const date = parseDate(cells[cols.date]!);
    if (!date) continue;
    rows.push({
      date,
      narration: cols.narration >= 0 ? (cells[cols.narration] ?? "") : cells.slice(1, 3).join(" "),
      refNo: cols.ref >= 0 ? (cells[cols.ref] || null) : null,
      credit: cols.credit >= 0 ? parseAmt(cells[cols.credit] ?? "") : new Decimal(0),
      debit: cols.debit >= 0 ? parseAmt(cells[cols.debit] ?? "") : new Decimal(0),
    });
  }
  return rows;
}

export const POST = apiHandler(async (req: NextRequest) => {
  await requireEffectivePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();

  let fileName = "statement.csv";
  let text = "";
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ServiceError("file field required", 400);
    fileName = file.name || fileName;
    text = await file.text();
  } else {
    const body = await req.json();
    fileName = body.fileName ?? fileName;
    text = body.csv ?? body.text ?? "";
  }
  if (!text.trim()) throw new ServiceError("No statement text provided", 400);

  const rows = parseStatement(text);
  if (rows.length === 0) throw new ServiceError("No transaction rows parsed — check the date/amount columns", 400);

  const result = await importBankStatement({ companyId: company.id, fileName, rows });
  return json({ ok: true, parsedRows: rows.length, ...result });
});
