/**
 * state-matrix.ts — exhaustive status × action probe matrix.
 *
 * For every business entity with a status enum and mutating actions, this
 * seeds a cloned fixture row in EVERY legal status, calls EVERY action over
 * HTTP, and classifies each cell:
 *
 *   OK      action allowed on a legal status, or cleanly refused (4xx) on an
 *           illegal one — the guard works.
 *   REVIEW  action refused on a legal status — another rule blocked it
 *           (e.g. missing gate pass). Usually fine; the message is recorded.
 *   GAP     action SUCCEEDED on a status outside its legal set — a missing
 *           or wrong status guard. Highest-value finding.
 *   BUG     HTTP 5xx — unhandled error regardless of legality.
 *
 * Usage:
 *   BASE=http://localhost:3000 npx tsx scripts/state-matrix.ts
 *   BASE=... npx tsx scripts/state-matrix.ts --only MaterialIssue
 *   BASE=... npx tsx scripts/state-matrix.ts --report-only   # keep seeds, no run
 *
 * DEV ONLY — seeds fixture rows (marker prefix mx_), mutates them via real
 * API calls, deletes the entity rows afterwards. Side-effect rows created by
 * successful actions (journal entries, stock movements) stay in the dev DB —
 * same caveat as verify-workflows-full.sh.
 *
 * Auth: `POST /api/auth/demo-login` as OWNER (dev-only endpoint).
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const DB = { db: "nirman_inventory", user: "postgres", host: "localhost" };
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

// ── psql helper ──────────────────────────────────────────────
function sql(q: string): string {
  return execFileSync(
    "psql",
    ["-h", DB.host, "-U", DB.user, "-d", DB.db, "-tAc", q],
    { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" },
  ).trim();
}
function q(s: string) { return s.replace(/'/g, "''"); }
const mx = () => "mx" + crypto.randomBytes(6).toString("hex"); // 14-char marker ids (cuid-safe prefix)

/** List all columns of a table except the given ones, quoted. */
function cols(table: string, except: string[]): string[] {
  const rows = sql(
    `SELECT column_name FROM information_schema.columns WHERE table_name='${q(table)}' ORDER BY ordinal_position`,
  ).split("\n").filter(Boolean);
  return rows.filter((c) => !except.includes(c));
}

/** Clone template row into a new row with id/status (+ unique-col remints). Returns new id. */
function cloneRow(table: string, templateId: string, statusCol: string, status: string, uniqueCols: string[] = [], shiftCols: string[] = []): string {
  const id = mx();
  const others = cols(table, ["id", statusCol]);
  const selects = others.map((c) =>
    uniqueCols.includes(c) ? `'${id}_${c}'` :
    shiftCols.includes(c) ? `"${c}" + (interval '${(Date.now() % 900) + 30} days')` :
    `"${c}"`,
  );
  sql(
    `INSERT INTO "${table}" (id, "${statusCol}", ${others.map((c) => `"${c}"`).join(",")}) ` +
    `SELECT '${id}', '${status}', ${selects.join(",")} FROM "${table}" WHERE id='${q(templateId)}'`,
  );
  return id;
}

/** Clone child rows, remapping parent FK + unique cols + overrides. Returns count. */
function cloneChildren(table: string, fk: string, oldParent: string, newParent: string, uniqueCols: string[] = [], overrides: Record<string, string> = {}): number {
  const except = ["id", fk];
  const others = cols(table, except);
  const selects = others.map((c) =>
    uniqueCols.includes(c) ? `'${mx()}_${c}'` :
    overrides[c] !== undefined ? `'${q(overrides[c]!)}'` :
    `"${c}"`,
  );
  sql(
    `INSERT INTO "${table}" (id, "${fk}", ${others.map((c) => `"${c}"`).join(",")}) ` +
    `SELECT 'mx'||id, '${newParent}', ${selects.join(",")} FROM "${table}" WHERE "${fk}"='${q(oldParent)}'`,
  );
  return Number(sql(`SELECT count(*) FROM "${table}" WHERE "${fk}"='${newParent}'`));
}

function del(table: string, id: string) {
  try { sql(`DELETE FROM "${table}" WHERE id='${q(id)}'`); } catch { /* FK leftovers — dev-only */ }
}

// ── HTTP helper ──────────────────────────────────────────────
let COOKIE = "";
async function http(method: string, path: string, body?: unknown): Promise<{ code: number; body: string }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", cookie: COOKIE },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  return { code: res.status, body: (await res.text()).slice(0, 300) };
}

async function login() {
  // Prefer an existing cookie jar (Netscape format, e.g. /tmp/nirman-cookies.txt
  // produced by `curl -c`), else demo-login → phone-password for a real session.
  const jar = process.env.COOKIE_JAR ?? "/tmp/nirman-cookies.txt";
  if (existsSync(jar)) {
    COOKIE = readFileSync(jar, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => { const p = l.split("\t"); return p.length >= 7 ? `${p[5]}=${p[6].trim()}` : ""; })
      .filter(Boolean)
      .join("; ");
    if (COOKIE) {
      const me = await http("GET", "/api/me");
      if (me.code === 200) return;
    }
  }
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "OWNER" }),
  });
  const creds = await res.json().catch(() => ({}));
  const phone = creds.email?.match(/^phone\+(\d+)@/)?.[1];
  if (!phone) throw new Error("demo-login failed — provide COOKIE_JAR or dev auth");
  const login = await fetch(`${BASE}/api/auth/phone-password`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: `+${phone}`, password: creds.password }),
  });
  const setC = login.headers.getSetCookie?.() ?? [];
  COOKIE = setC.map((c) => c.split(";")[0]).join("; ");
  if (!COOKIE) {
    const err = await login.text().catch(() => "");
    throw new Error(`phone-password login failed: ${err.slice(0, 120)}`);
  }
}

// ── Registry ─────────────────────────────────────────────────
type Action = { name: string; method: "PATCH" | "POST" | "DELETE"; path: (id: string) => string; body?: unknown; legal: string[] };
type Entity = {
  table: string;
  /** Column holding the lifecycle status (default: "status"). */
  statusCol?: string;
  statuses: string[];
  uniqueCols?: string[];
  /** Date columns to shift by a random interval (compound-unique seeds). */
  shiftCols?: string[];
  children?: {
    table: string; fk: string; uniqueCols?: string[];
    /** Force-clone extra columns per status — e.g. only seed returns when the sale status implies them. */
    onlyStatuses?: string[];
    /** Column overrides applied during the clone (e.g. status="COMPLETED"). */
    overrides?: Record<string, string>;
  }[];
  /** Optional SQL run right after cloning each row — e.g. seed an APPROVED gate pass. */
  postSeed?: (id: string) => void;
  actions: Action[];
};

const APPROVED_GP = (refType: string) => (id: string) => {
  const gid = mx();
  try {
    const others = cols("GatePass", ["id", "status", "refId"]);
    const selects = others.map((c) => (c === "gatePassNumber" ? `'${gid}_gp'` : `"${c}"`));
    sql(`INSERT INTO "GatePass" (id, status, "refId", ${others.map(c => `"${c}"`).join(",")}) ` +
      `SELECT '${gid}', 'APPROVED', '${id}', ${selects.join(",")} FROM "GatePass" WHERE "refType"='${refType}' AND status IN ('PENDING','APPROVED','EXITED') LIMIT 1`);
  } catch { /* no template gate pass — probes on legal statuses will report REVIEW */ }
};

const E: Entity[] = [
  {
    table: "MaterialIssue", statuses: ["PENDING", "COMPLETED", "CANCELLED"],
    uniqueCols: ["issueNumber"],
    children: [{ table: "MaterialIssueLine", fk: "materialIssueId" }],
    postSeed: APPROVED_GP("MaterialIssue"),
    actions: [
      { name: "execute", method: "PATCH", path: (id) => `/api/issue-materials/${id}`, body: { action: "execute" }, legal: ["PENDING"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/issue-materials/${id}`, body: { action: "cancel" }, legal: ["PENDING", "COMPLETED"] },
    ],
  },
  {
    table: "StockTransfer", statuses: ["DRAFT", "IN_TRANSIT", "COMPLETED", "CANCELLED"],
    uniqueCols: ["transferNumber", "challanNumber", "referenceNo"],
    children: [{ table: "StockTransferLine", fk: "stockTransferId" }],
    postSeed: APPROVED_GP("StockTransfer"),
    actions: [
      { name: "dispatch", method: "PATCH", path: (id) => `/api/transfers/${id}`, body: { action: "dispatch" }, legal: ["DRAFT"] },
      { name: "complete", method: "PATCH", path: (id) => `/api/transfers/${id}`, body: { action: "complete" }, legal: ["DRAFT", "IN_TRANSIT"] },
      { name: "returnToSource", method: "PATCH", path: (id) => `/api/transfers/${id}`, body: { action: "returnToSource" }, legal: ["IN_TRANSIT"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/transfers/${id}`, body: { action: "cancel" }, legal: ["DRAFT"] },
    ],
  },
  {
    table: "PurchaseOrder", statuses: ["DRAFT", "APPROVED", "REJECTED", "ORDERED", "PARTIAL", "RECEIVED", "SHORT_CLOSED", "CANCELLED"],
    uniqueCols: ["orderNumber", "poNumber", "referenceNo"],
    children: [{ table: "PurchaseOrderLine", fk: "purchaseOrderId" }],
    actions: [
      { name: "approve", method: "PATCH", path: (id) => `/api/purchase-orders/${id}`, body: { action: "approve" }, legal: ["DRAFT"] },
      { name: "reject", method: "PATCH", path: (id) => `/api/purchase-orders/${id}`, body: { action: "reject", reason: "matrix probe" }, legal: ["DRAFT"] },
      { name: "resubmit", method: "PATCH", path: (id) => `/api/purchase-orders/${id}`, body: { action: "resubmit" }, legal: ["REJECTED"] },
      { name: "order", method: "PATCH", path: (id) => `/api/purchase-orders/${id}`, body: { action: "order" }, legal: ["APPROVED"] },
      { name: "shortClose", method: "PATCH", path: (id) => `/api/purchase-orders/${id}`, body: { action: "shortClose", reason: "matrix" }, legal: ["ORDERED", "PARTIAL"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/purchase-orders/${id}`, body: { action: "cancel", reason: "matrix" }, legal: ["DRAFT", "APPROVED", "REJECTED", "ORDERED", "PARTIAL", "SHORT_CLOSED"] },
    ],
  },
  {
    table: "Tenancy", statuses: ["PENDING", "ACTIVE", "EXPIRED", "TERMINATED"],
    uniqueCols: ["tenancyNumber", "agreementNumber", "referenceNo"],
    actions: [
      { name: "activate", method: "POST", path: (id) => `/api/tenancies/${id}`, body: { action: "activate" }, legal: ["PENDING", "ACTIVE"] },
      { name: "terminate", method: "POST", path: (id) => `/api/tenancies/${id}`, body: { action: "terminate" }, legal: ["ACTIVE", "PENDING"] },
      { name: "escalate", method: "POST", path: (id) => `/api/tenancies/${id}`, body: { action: "escalate" }, legal: ["ACTIVE"] },
    ],
  },
  {
    table: "ExpenseClaim", statuses: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"],
    uniqueCols: ["claimNumber", "referenceNo"],
    children: [{ table: "ExpenseClaimLine", fk: "claimId" }],
    actions: [
      { name: "submit", method: "PATCH", path: (id) => `/api/expense-claims/${id}`, body: { action: "submit" }, legal: ["DRAFT", "REJECTED"] },
      { name: "approve", method: "PATCH", path: (id) => `/api/expense-claims/${id}`, body: { action: "approve" }, legal: ["SUBMITTED"] },
      { name: "reject", method: "PATCH", path: (id) => `/api/expense-claims/${id}`, body: { action: "reject", reason: "matrix" }, legal: ["SUBMITTED"] },
      { name: "pay", method: "PATCH", path: (id) => `/api/expense-claims/${id}`, body: { action: "pay", paymentMode: "UPI" }, legal: ["APPROVED"] },
    ],
  },
  {
    table: "GatePass", statuses: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "EXITED", "CANCELLED"],
    uniqueCols: ["gatePassNumber", "passNumber"],
    children: [{ table: "GatePassLine", fk: "gatePassId" }],
    actions: [
      { name: "submit", method: "PATCH", path: (id) => `/api/gate-passes/${id}`, body: { action: "submit" }, legal: ["DRAFT"] },
      { name: "approve", method: "PATCH", path: (id) => `/api/gate-passes/${id}`, body: { action: "approve" }, legal: ["PENDING"] },
      { name: "reject", method: "PATCH", path: (id) => `/api/gate-passes/${id}`, body: { action: "reject", reason: "matrix" }, legal: ["PENDING"] },
      { name: "resubmit", method: "PATCH", path: (id) => `/api/gate-passes/${id}`, body: { action: "resubmit" }, legal: ["REJECTED"] },
      { name: "confirmExit", method: "PATCH", path: (id) => `/api/gate-passes/${id}`, body: { action: "confirmExit" }, legal: ["APPROVED"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/gate-passes/${id}`, body: { action: "cancel" }, legal: ["DRAFT", "PENDING", "REJECTED"] },
    ],
  },
  {
    table: "RaBill", statuses: ["DRAFT", "SUBMITTED", "APPROVED", "PAID", "REJECTED"],
    uniqueCols: ["billNumber", "raBillNumber", "referenceNo"],
    children: [{ table: "RaBillLine", fk: "raBillId" }],
    actions: [
      { name: "submit", method: "PATCH", path: (id) => `/api/ra-bills/${id}`, body: { action: "submit" }, legal: ["DRAFT", "REJECTED"] },
      { name: "approve", method: "PATCH", path: (id) => `/api/ra-bills/${id}`, body: { action: "approve" }, legal: ["SUBMITTED"] },
      { name: "reject", method: "PATCH", path: (id) => `/api/ra-bills/${id}`, body: { action: "reject", reason: "matrix" }, legal: ["SUBMITTED"] },
      { name: "pay", method: "PATCH", path: (id) => `/api/ra-bills/${id}`, body: { action: "pay", paymentMode: "UPI" }, legal: ["APPROVED"] },
    ],
  },
  {
    table: "DailyProgressReport", statuses: ["SUBMITTED", "SUB_ADMIN_APPROVED", "APPROVED", "REJECTED"],
    statusCol: "approvalStatus",
    shiftCols: ["date"],
    actions: [
      { name: "subAdminApprove", method: "PATCH", path: (id) => `/api/dprs/${id}`, body: { action: "subAdminApprove" }, legal: ["SUBMITTED"] },
      { name: "adminApprove", method: "PATCH", path: (id) => `/api/dprs/${id}`, body: { action: "adminApprove" }, legal: ["SUB_ADMIN_APPROVED"] },
      { name: "reject", method: "PATCH", path: (id) => `/api/dprs/${id}`, body: { action: "reject", reason: "matrix" }, legal: ["SUBMITTED", "SUB_ADMIN_APPROVED"] },
      { name: "resubmit", method: "PATCH", path: (id) => `/api/dprs/${id}`, body: { action: "resubmit" }, legal: ["REJECTED"] },
    ],
  },
  {
    table: "MeasurementBookEntry", statuses: ["DRAFT", "VERIFIED", "APPROVED", "REJECTED"],
    actions: [
      { name: "verify", method: "PATCH", path: (id) => `/api/mb-entries/${id}`, body: { action: "verify" }, legal: ["DRAFT"] },
      { name: "approve", method: "PATCH", path: (id) => `/api/mb-entries/${id}`, body: { action: "approve" }, legal: ["VERIFIED"] },
      { name: "reject", method: "PATCH", path: (id) => `/api/mb-entries/${id}`, body: { action: "reject", reason: "matrix" }, legal: ["DRAFT", "VERIFIED"] },
    ],
  },
  {
    table: "EmployeeAdvance", statuses: ["ACTIVE", "PAUSED", "SETTLED", "CANCELLED"],
    actions: [
      { name: "pause", method: "PATCH", path: (id) => `/api/advances/${id}`, body: { status: "PAUSED" }, legal: ["ACTIVE", "PAUSED"] },
      { name: "resume", method: "PATCH", path: (id) => `/api/advances/${id}`, body: { status: "ACTIVE" }, legal: ["PAUSED", "ACTIVE"] },
      { name: "settle", method: "PATCH", path: (id) => `/api/advances/${id}`, body: { status: "SETTLED" }, legal: ["ACTIVE", "PAUSED"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/advances/${id}`, body: { status: "CANCELLED" }, legal: ["ACTIVE", "PAUSED"] },
    ],
  },
  {
    table: "LeaveRequest", statuses: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    actions: [
      { name: "approve", method: "POST", path: (id) => `/api/leaves/${id}`, body: { approve: true }, legal: ["PENDING"] },
      { name: "reject", method: "POST", path: (id) => `/api/leaves/${id}`, body: { approve: false, rejectedReason: "matrix" }, legal: ["PENDING"] },
      { name: "cancel", method: "DELETE", path: (id) => `/api/leaves/${id}`, legal: ["PENDING", "APPROVED"] },
    ],
  },
  {
    table: "SafetyIncident", statuses: ["REPORTED", "UNDER_INVESTIGATION", "INVESTIGATED", "CLOSED", "CANCELLED"],
    uniqueCols: ["incidentNumber"],
    actions: [
      { name: "investigate", method: "PATCH", path: (id) => `/api/safety/incidents/${id}`, body: { action: "investigate", rootCause: "matrix", correctiveActions: "matrix" }, legal: ["REPORTED", "UNDER_INVESTIGATION"] },
      { name: "close", method: "PATCH", path: (id) => `/api/safety/incidents/${id}`, body: { action: "close", closureNotes: "matrix" }, legal: ["INVESTIGATED"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/safety/incidents/${id}`, body: { action: "cancel" }, legal: ["REPORTED", "UNDER_INVESTIGATION", "INVESTIGATED"] },
      { name: "delete", method: "PATCH", path: (id) => `/api/safety/incidents/${id}`, body: { action: "delete" }, legal: ["REPORTED", "CANCELLED"] },
    ],
  },
  {
    table: "SafetyHazard", statuses: ["IDENTIFIED", "MITIGATING", "RESOLVED"],
    uniqueCols: ["hazardNumber"],
    actions: [
      { name: "mitigate", method: "PATCH", path: (id) => `/api/safety/hazards/${id}`, body: { action: "mitigate", mitigationPlan: "matrix" }, legal: ["IDENTIFIED"] },
      { name: "resolve", method: "PATCH", path: (id) => `/api/safety/hazards/${id}`, body: { action: "resolve", resolutionNotes: "matrix" }, legal: ["IDENTIFIED", "MITIGATING"] },
      { name: "delete", method: "PATCH", path: (id) => `/api/safety/hazards/${id}`, body: { action: "delete" }, legal: ["IDENTIFIED", "MITIGATING"] },
    ],
  },
  {
    table: "SafetyInspection", statuses: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
    uniqueCols: ["inspectionNumber"],
    actions: [
      { name: "start", method: "PATCH", path: (id) => `/api/safety/inspections/${id}`, body: { action: "start" }, legal: ["SCHEDULED"] },
      { name: "complete", method: "PATCH", path: (id) => `/api/safety/inspections/${id}`, body: { action: "complete", result: "PASS", findings: "matrix" }, legal: ["IN_PROGRESS"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/safety/inspections/${id}`, body: { action: "cancel" }, legal: ["SCHEDULED", "IN_PROGRESS"] },
      { name: "delete", method: "PATCH", path: (id) => `/api/safety/inspections/${id}`, body: { action: "delete" }, legal: ["SCHEDULED", "CANCELLED"] },
    ],
  },
  {
    table: "ChangeOrder", statuses: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "IMPLEMENTED", "CANCELLED"],
    uniqueCols: ["coNumber", "changeOrderNumber", "changeOrderNo"],
    actions: [
      { name: "submit", method: "PATCH", path: (id) => `/api/change-orders/${id}`, body: { action: "submit" }, legal: ["DRAFT", "REJECTED"] },
      { name: "approve", method: "PATCH", path: (id) => `/api/change-orders/${id}`, body: { action: "approve" }, legal: ["SUBMITTED"] },
      { name: "reject", method: "PATCH", path: (id) => `/api/change-orders/${id}`, body: { action: "reject", reason: "matrix" }, legal: ["SUBMITTED"] },
      { name: "implement", method: "PATCH", path: (id) => `/api/change-orders/${id}`, body: { action: "implement" }, legal: ["APPROVED"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/change-orders/${id}`, body: { action: "cancel" }, legal: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] },
      { name: "delete", method: "PATCH", path: (id) => `/api/change-orders/${id}`, body: { action: "delete" }, legal: ["DRAFT", "REJECTED", "CANCELLED"] },
    ],
  },
  {
    table: "MaterialRequisition", statuses: ["DRAFT", "SUBMITTED", "APPROVED", "CONVERTED", "REJECTED"],
    uniqueCols: ["requisitionNumber", "reqNumber"],
    children: [{ table: "MaterialRequisitionLine", fk: "requisitionId" }],
    actions: [
      { name: "submit", method: "PATCH", path: (id) => `/api/requisitions/${id}`, body: { action: "submit" }, legal: ["DRAFT", "REJECTED"] },
      { name: "approve", method: "PATCH", path: (id) => `/api/requisitions/${id}`, body: { action: "approve" }, legal: ["SUBMITTED"] },
      { name: "reject", method: "PATCH", path: (id) => `/api/requisitions/${id}`, body: { action: "reject", reason: "matrix" }, legal: ["SUBMITTED"] },
      { name: "convert", method: "PATCH", path: (id) => `/api/requisitions/${id}`, body: { action: "convert" }, legal: ["APPROVED"] },
      { name: "waiveQuotes", method: "PATCH", path: (id) => `/api/requisitions/${id}`, body: { action: "waiveQuotes" }, legal: ["APPROVED", "SUBMITTED"] },
    ],
  },
  {
    table: "SupplierReturn", statuses: ["DRAFT", "SUBMITTED", "COMPLETED", "CANCELLED"],
    uniqueCols: ["returnNumber", "creditNoteNo"],
    children: [{ table: "SupplierReturnLine", fk: "supplierReturnId" }],
    postSeed: APPROVED_GP("SupplierReturn"),
    actions: [
      { name: "submit", method: "PATCH", path: (id) => `/api/supplier-returns/${id}`, body: { action: "submit" }, legal: ["DRAFT"] },
      { name: "complete", method: "PATCH", path: (id) => `/api/supplier-returns/${id}`, body: { action: "complete" }, legal: ["SUBMITTED"] },
      { name: "cancel", method: "PATCH", path: (id) => `/api/supplier-returns/${id}`, body: { action: "cancel" }, legal: ["DRAFT", "SUBMITTED"] },
    ],
  },
  {
    table: "StockCount", statuses: ["DRAFT", "COUNTED", "RECONCILED"],
    uniqueCols: ["countNumber"],
    children: [{ table: "StockCountLine", fk: "stockCountId" }],
    actions: [
      { name: "confirm", method: "PATCH", path: (id) => `/api/stock-counts/${id}`, body: { action: "confirm" }, legal: ["DRAFT"] },
      { name: "reconcile", method: "PATCH", path: (id) => `/api/stock-counts/${id}`, body: { action: "reconcile" }, legal: ["COUNTED"] },
    ],
  },
  {
    table: "SupplierInvoice", statuses: ["PENDING", "MATCHED", "DISPUTED", "APPROVED", "PAID", "VOID"],
    uniqueCols: ["invoiceNumber"],
    actions: [
      { name: "approve", method: "PATCH", path: (id) => `/api/supplier-invoices/${id}`, body: { action: "approve" }, legal: ["PENDING", "DISPUTED", "MATCHED"] },
      { name: "void", method: "PATCH", path: (id) => `/api/supplier-invoices/${id}`, body: { action: "void", reason: "matrix" }, legal: ["PENDING", "MATCHED", "DISPUTED", "APPROVED"] },
    ],
  },
  {
    table: "SubcontractorWorkOrder", statuses: ["DRAFT", "ISSUED", "ACTIVE", "COMPLETED", "CLOSED", "CANCELLED"],
    uniqueCols: ["workOrderNumber", "woNumber"],
    children: [{ table: "SubcontractorWorkOrderLine", fk: "workOrderId" }],
    actions: [
      { name: "issue", method: "PATCH", path: (id) => `/api/work-orders/${id}`, body: { action: "issue" }, legal: ["DRAFT"] },
      { name: "complete", method: "PATCH", path: (id) => `/api/work-orders/${id}`, body: { action: "complete" }, legal: ["ISSUED", "ACTIVE"] },
      { name: "release-retention", method: "PATCH", path: (id) => `/api/work-orders/${id}`, body: { action: "release-retention" }, legal: ["COMPLETED"] },
    ],
  },
  {
    table: "MaterialSale", statuses: ["PENDING", "ACTIVE", "PARTIALLY_RETURNED", "RETURNED", "CANCELLED"],
    uniqueCols: ["saleNumber"],
    children: [
      { table: "MaterialSaleLine", fk: "materialSaleId" },
      // PARTIALLY_RETURNED/RETURNED seeds must carry a COMPLETED return — the
      // cancel guard keys off it (cancelling such a sale would double-restore).
      { table: "MaterialSaleReturn", fk: "materialSaleId", uniqueCols: ["returnNumber"], onlyStatuses: ["PARTIALLY_RETURNED", "RETURNED"], overrides: { status: "COMPLETED" } },
    ],
    actions: [
      { name: "cancel", method: "PATCH", path: (id) => `/api/material-sales/${id}`, body: { action: "cancel" }, legal: ["PENDING", "ACTIVE"] },
    ],
  },
];

// ── Runner ───────────────────────────────────────────────────
type Verdict = "OK" | "GAP" | "REVIEW" | "BUG";
type Cell = { status: string; action: string; code: number; verdict: Verdict; msg: string };

function classify(code: number, legal: boolean): Verdict {
  if (code >= 500) return "BUG";
  const ok = code >= 200 && code < 300;
  if (ok && !legal) return "GAP";
  if (!ok && legal) return "REVIEW";
  return "OK";
}

async function main() {
  await login();
  const report: Record<string, Cell[]> = {};
  const targets = E.filter((e) => !ONLY || e.table === ONLY);
  const counts: Record<Verdict, number> = { OK: 0, GAP: 0, REVIEW: 0, BUG: 0 };

  for (const ent of targets) {
    const statusCol = ent.statusCol ?? "status";
    const template = sql(`SELECT id FROM "${ent.table}" WHERE id NOT LIKE 'mx%' ORDER BY "createdAt" DESC LIMIT 1`);
    if (!template) { console.log(`— ${ent.table}: no template row, skipped`); continue; }
    console.log(`\n## ${ent.table}`);
    report[ent.table] = [];

    for (const status of ent.statuses) {
      for (const act of ent.actions) {
        // Fresh clone per cell — action side effects can't contaminate siblings.
        let id: string;
        try {
          id = cloneRow(ent.table, template, statusCol, status, ent.uniqueCols, ent.shiftCols);
        } catch (e) {
          console.log(`  ${status} ${act.name}: SEED-FAIL ${String(e).split("\n")[0]}`);
          report[ent.table].push({ status, action: act.name, code: 0, verdict: "REVIEW", msg: "seed-fail" });
          continue;
        }
        try {
          for (const ch of ent.children ?? []) {
            if (ch.onlyStatuses && !ch.onlyStatuses.includes(status)) continue;
            cloneChildren(ch.table, ch.fk, template, id, ch.uniqueCols, ch.overrides);
          }
          ent.postSeed?.(id);
          const r = await http(act.method, act.path(id), act.body);
          const legal = act.legal.includes(status);
          const verdict = classify(r.code, legal);
          counts[verdict]++;
          const msg = r.code >= 400 ? r.body.slice(0, 110).replace(/\n/g, " ") : "";
          const mark = verdict === "OK" ? "  " : verdict === "REVIEW" ? "?" : "**";
          console.log(`  ${mark} ${status.padEnd(20)} ${act.name.padEnd(16)} → ${r.code} ${verdict} ${msg}`);
          report[ent.table].push({ status, action: act.name, code: r.code, verdict, msg });
        } finally {
          for (const ch of [...(ent.children ?? [])].reverse()) {
            try { sql(`DELETE FROM "${ch.table}" WHERE "${ch.fk}"='${id}'`); } catch { /* ok */ }
          }
          del(ent.table, id);
        }
      }
    }
  }

  // Sweep any gate-pass clones left behind (postSeed creates refId-linked rows).
  try { sql(`DELETE FROM "GatePass" WHERE id LIKE 'mx%'`); } catch { /* ok */ }

  // ── Report ──
  let md = `# State-machine transition matrix\n\nGenerated: ${new Date().toISOString()} — ${BASE}\n\n`;
  md += `| Verdict | Count |\n|---|---|\n` + Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`).join("\n") + "\n\n";
  for (const [ent, cells] of Object.entries(report)) {
    md += `## ${ent}\n\n| Status | Action | HTTP | Verdict | Message |\n|---|---|---|---|---|\n`;
    for (const c of cells) md += `| ${c.status} | ${c.action} | ${c.code} | ${c.verdict} | ${c.msg.replace(/\|/g, "\\|")} |\n`;
    md += "\n";
  }
  writeFileSync("state-matrix-report.md", md);
  console.log(`\n═══ RESULT: ${counts.OK} ok · ${counts.REVIEW} review · ${counts.GAP} gap · ${counts.BUG} bug — report → state-matrix-report.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
