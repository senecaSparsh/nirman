"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
 Truck,
 ClipboardList,
 CheckCircle2,
 XCircle,
 ChevronDown,
 ChevronRight,
 Loader2,
 ClipboardCheck,
 CalendarCheck,
 ShieldCheck,
 CheckCheck,
 Receipt,
 FileText,
 CalendarOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { useSnooze } from "@/lib/use-snooze";
import { SnoozeButton } from "@/components/mobile/v2/snooze-button";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

// ── Types (mirrors the server-component payload) ───────────────

interface PoLine {
 materialName: string;
 materialCode: string;
 unit: string;
 qtyOrdered: number;
 unitCost: number;
 gstRate: number;
}
interface PoRow {
 id: string;
 poNumber: string;
 supplierName: string;
 createdAt: string;
 subtotal: number;
 gstTotal: number;
 total: number;
 lines: PoLine[];
}
interface ReqLine {
 materialName: string;
 materialCode: string;
 unit: string;
 qtyRequested: number;
 notes: string | null;
}
interface ReqRow {
 id: string;
 requisitionNumber: string;
 projectName: string | null;
 createdAt: string;
 lines: ReqLine[];
}
interface DprRow {
 id: string;
 projectName: string | null;
 submittedByName: string | null;
 createdAt: string;
 date: string;
 approvalStatus: string;
 workSummary: string;
 progressPct: number;
 canApproveSubAdmin: boolean;
 canApproveAdmin: boolean;
}
interface GpLine {
 materialName: string | null;
 materialCode: string | null;
 unit: string | null;
 qty: number;
 description: string | null;
}
interface GatePassRow {
 id: string;
 gatePassNumber: string;
 category: string;
 locationName: string;
 destination: string | null;
 vehicleNumber: string | null;
 driverName: string | null;
 createdByName: string | null;
 createdAt: string;
 lineCount: number;
 lines: GpLine[];
}

interface ExpenseRow {
 id: string;
 description: string;
 amount: number;
 category: string;
 projectName: string | null;
 createdByName: string | null;
 createdAt: string;
 date: string;
}

interface RaBillRow {
 id: string;
 raBillNumber: string;
 workOrderNumber: string | null;
 projectName: string | null;
 grossAmount: number;
 netPayable: number;
 periodFrom: string;
 periodTo: string;
 submittedByName: string | null;
 createdAt: string;
}
interface ClaimLine {
 category: string;
 amount: number;
 date: string;
 notes: string | null;
}
interface ClaimRow {
 id: string;
 claimantName: string;
 projectName: string | null;
 totalAmount: number;
 description: string | null;
 submittedAt: string | null;
 createdAt: string;
 lines: ClaimLine[];
}
interface LeaveRow {
 id: string;
 employeeName: string;
 type: string;
 days: number;
 startDate: string;
 endDate: string;
 reason: string | null;
 createdAt: string;
}
type ItemKind = "po" | "req" | "dpr" | "gp" | "expense" | "raBill" | "claim" | "leave";
type ItemState = "pending" | "approving" | "approved" | "rejecting" | "rejected";

// ── Component ───────────────────────────────────────────────────

export function MobileApprovalsQueue({
 purchaseOrders,
 requisitions,
 gatePasses = [],
 dprs = [],
 expenses = [],
 raBills = [],
 expenseClaims = [],
 leaves = [],
}: {
 purchaseOrders: PoRow[];
 requisitions: ReqRow[];
 gatePasses?: GatePassRow[];
 dprs?: DprRow[];
 expenses?: ExpenseRow[];
 raBills?: RaBillRow[];
 expenseClaims?: ClaimRow[];
 leaves?: LeaveRow[];
}) {
 const router = useRouter();
 const { isSnoozed } = useSnooze();
 const [poStates, setPoStates] = useState<Record<string, ItemState>>({});
 const [reqStates, setReqStates] = useState<Record<string, ItemState>>({});
 const [gpStates, setGpStates] = useState<Record<string, ItemState>>({});
 const [dprStates, setDprStates] = useState<Record<string, ItemState>>({});
const [expenseStates, setExpenseStates] = useState<Record<string, ItemState>>({});
const [raBillStates, setRaBillStates] = useState<Record<string, ItemState>>({});
const [claimStates, setClaimStates] = useState<Record<string, ItemState>>({});
const [leaveStates, setLeaveStates] = useState<Record<string, ItemState>>({});
const [rejectLeaveState, setRejectLeave] = useState<LeaveRow | null>(null);
const [leaveRejectReason, setLeaveRejectReason] = useState("");
 const [expanded, setExpanded] = useState<string | null>(null);
 const [rejectGp, setRejectGp] = useState<GatePassRow | null>(null);
 const [gpRejectReason, setGpRejectReason] = useState("");
 const [rejectPoState, setRejectPo] = useState<PoRow | null>(null);
 const [poRejectReason, setPoRejectReason] = useState("");
 const [rejectDprState, setRejectDpr] = useState<DprRow | null>(null);
 const [dprRejectReason, setDprRejectReason] = useState("");
const [rejectExpenseState, setRejectExpense] = useState<ExpenseRow | null>(null);
const [rejectRaBillState, setRejectRaBill] = useState<RaBillRow | null>(null);
const [rejectClaimState, setRejectClaim] = useState<ClaimRow | null>(null);
const [expenseRejectReason, setExpenseRejectReason] = useState("");
const [raBillRejectReason, setRaBillRejectReason] = useState("");
const [claimRejectReason, setClaimRejectReason] = useState("");
 const [batchApproving, setBatchApproving] = useState(false);

 // ── Batch approve: approve all visible items of a given type ──
 async function batchApprove(type: "po" | "requisition" | "gatePass" | "dpr" | "expense" | "raBill" | "claim") {
 haptic(10);
 setBatchApproving(true);

 let items: { type: "po" | "requisition" | "gatePass"; id: string }[] = [];
 if (type === "po") {
 items = visiblePOs.map((po) => ({ type: "po" as const, id: po.id }));
 // Optimistically mark all as approving
 setPoStates((s) => {
 const next = { ...s };
 for (const po of visiblePOs) next[po.id] = "approving";
 return next;
 });
 } else if (type === "requisition") {
 items = visibleReqs.map((r) => ({ type: "requisition" as const, id: r.id }));
 setReqStates((s) => {
 const next = { ...s };
 for (const r of visibleReqs) next[r.id] = "approving";
 return next;
 });
 } else if (type === "gatePass") {
 items = visibleGps.map((g) => ({ type: "gatePass" as const, id: g.id }));
 setGpStates((s) => {
 const next = { ...s };
 for (const g of visibleGps) next[g.id] = "approving";
 return next;
 });
 } else if (type === "dpr") {
 // DPRs don't have a batch API yet — approve individually
 setDprStates((s) => {
 const next = { ...s };
 for (const d of visibleDprs) next[d.id] = "approving";
 return next;
 });
 // Fall back to individual approves
 for (const dpr of visibleDprs) {
 await approveDpr(dpr);
 }
 setBatchApproving(false);
 return;
 } else if (type === "expense") {
 // Expenses: approve individually (no batch API)
 setExpenseStates((s) => {
 const next = { ...s };
 for (const e of visibleExpenses) next[e.id] = "approving";
 return next;
 });
 for (const exp of visibleExpenses) {
 await approveExpense(exp);
 }
 setBatchApproving(false);
 return;
 } else if (type === "raBill") {
 // RA Bills: approve individually (no batch API)
 setRaBillStates((s) => {
 const next = { ...s };
 for (const b of visibleRaBills) next[b.id] = "approving";
 return next;
 });
 for (const b of visibleRaBills) {
 await approveRaBill(b);
 }
 setBatchApproving(false);
 return;
 } else if (type === "claim") {
 // Expense claims: approve individually (no batch API)
 setClaimStates((s) => {
 const next = { ...s };
 for (const c of visibleClaims) next[c.id] = "approving";
 return next;
 });
 for (const c of visibleClaims) {
 await approveClaim(c);
 }
 setBatchApproving(false);
 return;
 }

 try {
 const res = await fetch("/api/approvals/batch", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ items }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Batch approve failed");

 const { succeeded, failed } = data.summary;
 if (succeeded > 0) {
 haptic([10, 40, 80]);
 toast.success(`Approved ${succeeded} ${type === "po" ? "PO" : type === "requisition" ? "indent" : "gate pass"}${succeeded === 1 ? "" : "s"}`);
 }
 if (failed > 0) {
 toast.error(`${failed} item${failed === 1 ? "" : "s"} failed to approve`);
 }
 const warned = data.results.filter((r: { warning?: string }) => r.warning).length;
 if (warned > 0) {
   toast.warning(`${warned} approved but the linked material movement failed — check stock levels and retry`);
 }

 // Update local states based on results
 for (const result of data.results) {
 if (result.type === "po") {
 setPoStates((s) => ({ ...s, [result.id]: result.success ? "approved" : "pending" }));
 } else if (result.type === "requisition") {
 setReqStates((s) => ({ ...s, [result.id]: result.success ? "approved" : "pending" }));
 } else if (result.type === "gatePass") {
 setGpStates((s) => ({ ...s, [result.id]: result.success ? "approved" : "pending" }));
 }
 }

 router.refresh();
 } catch (err) {
 haptic([50, 20, 50]);
 toast.error(err instanceof Error ? err.message : "Batch approve failed");
 // Revert all optimistic states
 if (type === "po") {
 setPoStates((s) => {
 const next = { ...s };
 for (const po of visiblePOs) if (next[po.id] === "approving") next[po.id] = "pending";
 return next;
 });
 } else if (type === "requisition") {
 setReqStates((s) => {
 const next = { ...s };
 for (const r of visibleReqs) if (next[r.id] === "approving") next[r.id] = "pending";
 return next;
 });
 } else if (type === "gatePass") {
 setGpStates((s) => {
 const next = { ...s };
 for (const g of visibleGps) if (next[g.id] === "approving") next[g.id] = "pending";
 return next;
 });
 }
 } finally {
 setBatchApproving(false);
 }
 }

 const visiblePOs = purchaseOrders.filter((po) => {
 if (isSnoozed(`approval:po:${po.id}`)) return false;
 const s = poStates[po.id];
 return !s || s === "pending" || s === "approving" || s === "rejecting";
 });
 const visibleReqs = requisitions.filter((r) => {
 if (isSnoozed(`approval:req:${r.id}`)) return false;
 const s = reqStates[r.id];
 return !s || s === "pending" || s === "approving" || s === "rejecting";
 });
 const visibleGps = gatePasses.filter((g) => {
 if (isSnoozed(`approval:gp:${g.id}`)) return false;
 const s = gpStates[g.id];
 return !s || s === "pending" || s === "approving" || s === "rejecting";
 });
 const visibleDprs = dprs.filter((d) => {
 if (isSnoozed(`approval:dpr:${d.id}`)) return false;
 const s = dprStates[d.id];
 return !s || s === "pending" || s === "approving" || s === "rejecting";
 });
const visibleExpenses = expenses.filter((e) => {
 if (isSnoozed(`approval:expense:${e.id}`)) return false;
 const s = expenseStates[e.id];
 return !s || s === "pending" || s === "approving" || s === "rejecting";
});
const visibleRaBills = raBills.filter((b) => {
 if (isSnoozed(`approval:raBill:${b.id}`)) return false;
 const s = raBillStates[b.id];
 return !s || s === "pending" || s === "approving" || s === "rejecting";
});
const visibleClaims = expenseClaims.filter((c) => {
 if (isSnoozed(`approval:claim:${c.id}`)) return false;
 const s = claimStates[c.id];
 return !s || s === "pending" || s === "approving" || s === "rejecting";
});
const visibleLeaves = leaves.filter((l) => {
 if (isSnoozed(`approval:leave:${l.id}`)) return false;
 const s = leaveStates[l.id];
 return !s || s === "pending" || s === "approving" || s === "rejecting";
});

// ── Auto-advance: after an action, expand the next pending item ──
function advanceToNext(type: "po" | "requisition" | "gatePass" | "dpr" | "expense" | "raBill" | "claim" | "leave", currentId: string) {
 const lists: Record<string, { id: string }[]> = {
 po: visiblePOs,
 requisition: visibleReqs,
 gatePass: visibleGps,
 dpr: visibleDprs,
 expense: visibleExpenses,
 raBill: visibleRaBills,
 claim: visibleClaims,
 leave: visibleLeaves,
 };
 const list = lists[type] ?? [];
 const idx = list.findIndex((item) => item.id === currentId);
 if (idx >= 0 && idx + 1 < list.length) {
 const next = list[idx + 1];
 if (next) setExpanded(`${type}:${next.id}`);
 } else if (idx > 0) {
 // current item was last — expand the previous one
 const prev = list[idx - 1];
 if (prev) setExpanded(`${type}:${prev.id}`);
 } else {
 setExpanded(null);
 }
 }

 async function approvePo(po: PoRow) {
 haptic(10);
 setPoStates((s) => ({ ...s, [po.id]: "approving" }));
 try {
 const res = await fetch(`/api/purchase-orders/${po.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "approve" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to approve PO");
 toast.success(`PO ${po.poNumber} approved & ordered`, {
   description: "The order has been placed with the supplier automatically.",
   action: { label: "View PO", onClick: () => router.push(`/m/procurement/${po.id}`) },
 });
 setPoStates((s) => ({ ...s, [po.id]: "approved" }));
 advanceToNext("po", po.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setPoStates((s) => ({ ...s, [po.id]: "pending" }));
 }
 }

 function rejectPo(po: PoRow) {
 setRejectPo(po);
 setPoRejectReason("");
 }

 async function confirmRejectPo() {
 const po = rejectPoState;
 if (!po || !poRejectReason.trim()) return;
 haptic([10, 30]);
 setPoStates((s) => ({ ...s, [po.id]: "rejecting" }));
 try {
 const res = await fetch(`/api/purchase-orders/${po.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "reject", reason: poRejectReason.trim() }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject PO");
 toast.success(`PO ${po.poNumber} rejected`);
 setPoStates((s) => ({ ...s, [po.id]: "rejected" }));
 setRejectPo(null);
 setPoRejectReason("");
 advanceToNext("po", po.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setPoStates((s) => ({ ...s, [po.id]: "pending" }));
 }
 }

 async function approveReq(req: ReqRow) {
 haptic(10);
 setReqStates((s) => ({ ...s, [req.id]: "approving" }));
 try {
 const res = await fetch(`/api/requisitions/${req.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "approve" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to approve indent");
 toast.success(`Indent ${req.requisitionNumber} approved`, {
   description: "Collect vendor quotes — selecting a winner auto-creates the PO.",
   action: { label: "Collect Quotes", onClick: () => router.push(`/m/requisitions/${req.id}`) },
 });
 setReqStates((s) => ({ ...s, [req.id]: "approved" }));
 advanceToNext("requisition", req.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setReqStates((s) => ({ ...s, [req.id]: "pending" }));
 }
 }

 async function rejectReq(req: ReqRow) {
 haptic([10, 30]);
 setReqStates((s) => ({ ...s, [req.id]: "rejecting" }));
 try {
 const res = await fetch(`/api/requisitions/${req.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "reject" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject indent");
 toast.success(`Indent ${req.requisitionNumber} rejected`);
 setReqStates((s) => ({ ...s, [req.id]: "rejected" }));
 advanceToNext("requisition", req.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setReqStates((s) => ({ ...s, [req.id]: "pending" }));
 }
 }

 async function approveDpr(dpr: DprRow) {
 haptic(10);
 setDprStates((s) => ({ ...s, [dpr.id]: "approving" }));
 const action = dpr.approvalStatus === "SUBMITTED" ? "subAdminApprove" : "adminApprove";
 const label = dpr.approvalStatus === "SUBMITTED" ? "Sub-admin approved" : "Admin approved";
 try {
 const res = await fetch(`/api/dprs/${dpr.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to approve DPR");
 toast.success(label, {
   action: { label: "View DPRs", onClick: () => router.push("/m/dprs") },
 });
 setDprStates((s) => ({ ...s, [dpr.id]: "approved" }));
 advanceToNext("dpr", dpr.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setDprStates((s) => ({ ...s, [dpr.id]: "pending" }));
 }
 }

function rejectDpr(dpr: DprRow) {
 haptic([10, 30]);
 setRejectDpr(dpr);
}

async function confirmRejectDpr() {
 if (!rejectDprState || !dprRejectReason.trim()) return;
 const dpr = rejectDprState;
 haptic([10, 30]);
 setDprStates((s) => ({ ...s, [dpr.id]: "rejecting" }));
 setRejectDpr(null);
 try {
 const res = await fetch(`/api/dprs/${dpr.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "reject", reason: dprRejectReason.trim() }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject DPR");
 toast.success("DPR rejected");
 setDprStates((s) => ({ ...s, [dpr.id]: "rejected" }));
 advanceToNext("dpr", dpr.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setDprStates((s) => ({ ...s, [dpr.id]: "pending" }));
 } finally {
 setDprRejectReason("");
 }
}

 async function approveExpense(exp: ExpenseRow) {
 haptic(10);
 setExpenseStates((s) => ({ ...s, [exp.id]: "approving" }));
 try {
 const res = await fetch(`/api/expenses/${exp.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "approve" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to approve expense");
 toast.success("Expense approved", {
   action: { label: "View Expenses", onClick: () => router.push("/m/expenses") },
 });
 setExpenseStates((s) => ({ ...s, [exp.id]: "approved" }));
 advanceToNext("expense", exp.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setExpenseStates((s) => ({ ...s, [exp.id]: "pending" }));
 }
}

function rejectExpense(exp: ExpenseRow) {
 haptic([10, 30]);
 setRejectExpense(exp);
}

async function confirmRejectExpense() {
 if (!rejectExpenseState || !expenseRejectReason.trim()) return;
 const exp = rejectExpenseState;
 haptic([10, 30]);
 setExpenseStates((s) => ({ ...s, [exp.id]: "rejecting" }));
 setRejectExpense(null);
 try {
 const res = await fetch(`/api/expenses/${exp.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "reject", rejectionReason: expenseRejectReason.trim() }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject expense");
 toast.success("Expense rejected");
 setExpenseStates((s) => ({ ...s, [exp.id]: "rejected" }));
 advanceToNext("expense", exp.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setExpenseStates((s) => ({ ...s, [exp.id]: "pending" }));
 } finally {
 setExpenseRejectReason("");
 }
}

async function approveRaBill(b: RaBillRow) {
 haptic(10);
 setRaBillStates((s) => ({ ...s, [b.id]: "approving" }));
 try {
 const res = await fetch(`/api/ra-bills/${b.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "approve" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to approve RA bill");
 toast.success("RA bill approved", {
   description: "Work order totals updated + GL posted.",
   action: { label: "View Work Orders", onClick: () => router.push("/m/work-orders") },
 });
 setRaBillStates((s) => ({ ...s, [b.id]: "approved" }));
 advanceToNext("raBill", b.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setRaBillStates((s) => ({ ...s, [b.id]: "pending" }));
 }
}

function rejectRaBill(b: RaBillRow) {
 haptic([10, 30]);
 setRejectRaBill(b);
}

async function confirmRejectRaBill() {
 if (!rejectRaBillState || !raBillRejectReason.trim()) return;
 const b = rejectRaBillState;
 haptic([10, 30]);
 setRaBillStates((s) => ({ ...s, [b.id]: "rejecting" }));
 setRejectRaBill(null);
 try {
 const res = await fetch(`/api/ra-bills/${b.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "reject", rejectionReason: raBillRejectReason.trim() }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject RA bill");
 toast.success("RA bill rejected");
 setRaBillStates((s) => ({ ...s, [b.id]: "rejected" }));
 advanceToNext("raBill", b.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setRaBillStates((s) => ({ ...s, [b.id]: "pending" }));
 } finally {
 setRaBillRejectReason("");
 }
}

async function approveClaim(c: ClaimRow) {
 haptic(10);
 setClaimStates((s) => ({ ...s, [c.id]: "approving" }));
 try {
 const res = await fetch(`/api/expense-claims/${c.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "approve" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to approve claim");
 toast.success(`Claim approved — ${formatCurrency(c.totalAmount)}`, {
   description: "Expense rows created + GL posted. Ready for payment.",
   action: { label: "View Claims", onClick: () => router.push("/m/expense-claims") },
 });
 setClaimStates((s) => ({ ...s, [c.id]: "approved" }));
 advanceToNext("claim", c.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setClaimStates((s) => ({ ...s, [c.id]: "pending" }));
 }
}

function rejectClaim(c: ClaimRow) {
 haptic([10, 30]);
 setRejectClaim(c);
 setClaimRejectReason("");
}

async function confirmRejectClaim() {
 if (!rejectClaimState || !claimRejectReason.trim()) return;
 const c = rejectClaimState;
 haptic([10, 30]);
 setClaimStates((s) => ({ ...s, [c.id]: "rejecting" }));
 setRejectClaim(null);
 try {
 const res = await fetch(`/api/expense-claims/${c.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "reject", rejectionReason: claimRejectReason.trim() }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject claim");
 toast.success("Claim rejected");
 setClaimStates((s) => ({ ...s, [c.id]: "rejected" }));
 advanceToNext("claim", c.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setClaimStates((s) => ({ ...s, [c.id]: "pending" }));
 } finally {
 setClaimRejectReason("");
 }
}

async function approveLeave(l: LeaveRow) {
 haptic(10);
 setLeaveStates((s) => ({ ...s, [l.id]: "approving" }));
 try {
 const res = await fetch(`/api/leaves/${l.id}`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ approve: true }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to approve leave");
 toast.success(`${l.employeeName}'s ${l.type.toLowerCase()} leave approved`, {
   description: `${l.days} day${l.days === 1 ? "" : "s"} — attendance marked as paid leave.`,
   action: { label: "View Leaves", onClick: () => router.push("/m/hr?tab=leaves") },
 });
 setLeaveStates((s) => ({ ...s, [l.id]: "approved" }));
 advanceToNext("leave", l.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setLeaveStates((s) => ({ ...s, [l.id]: "pending" }));
 }
}

function rejectLeave(l: LeaveRow) {
 haptic([10, 30]);
 setRejectLeave(l);
 setLeaveRejectReason("");
}

async function confirmRejectLeave() {
 if (!rejectLeaveState || !leaveRejectReason.trim()) return;
 const l = rejectLeaveState;
 haptic([10, 30]);
 setLeaveStates((s) => ({ ...s, [l.id]: "rejecting" }));
 setRejectLeave(null);
 try {
 const res = await fetch(`/api/leaves/${l.id}`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ approve: false, rejectedReason: leaveRejectReason.trim() }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject leave");
 toast.success("Leave rejected");
 setLeaveStates((s) => ({ ...s, [l.id]: "rejected" }));
 advanceToNext("leave", l.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setLeaveStates((s) => ({ ...s, [l.id]: "pending" }));
 } finally {
 setLeaveRejectReason("");
 }
}

async function approveGp(gp: GatePassRow) {
 haptic(10);
 setGpStates((s) => ({ ...s, [gp.id]: "approving" }));
 try {
 const res = await fetch(`/api/gate-passes/${gp.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "approve" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to approve gate pass");
 if (data.executionWarning) {
   toast.warning(`Gate pass ${gp.gatePassNumber} approved, but the material movement failed: ${data.executionWarning}`);
 } else {
   toast.success(`Gate pass ${gp.gatePassNumber} approved`, {
     action: { label: "View Gate Passes", onClick: () => router.push("/m/gate-pass") },
   });
 }
 setGpStates((s) => ({ ...s, [gp.id]: "approved" }));
 advanceToNext("gatePass", gp.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setGpStates((s) => ({ ...s, [gp.id]: "pending" }));
 }
 }

 async function confirmRejectGp() {
 if (!rejectGp || !gpRejectReason.trim()) return;
 const gp = rejectGp;
 haptic([10, 30]);
 setGpStates((s) => ({ ...s, [gp.id]: "rejecting" }));
 setRejectGp(null);
 try {
 const res = await fetch(`/api/gate-passes/${gp.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "reject", reason: gpRejectReason.trim() }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject gate pass");
 toast.success(`Gate pass ${gp.gatePassNumber} rejected`);
 setGpStates((s) => ({ ...s, [gp.id]: "rejected" }));
 advanceToNext("gatePass", gp.id);
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setGpStates((s) => ({ ...s, [gp.id]: "pending" }));
 } finally {
 setGpRejectReason("");
 }
 }

 return (
 <div>
 {/* ── Purchase Orders ──────────────────────────────────── */}
 {purchaseOrders.length > 0 && (
 <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
 <h2 className="text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 Purchase Orders ({visiblePOs.length})
 </h2>
 {visiblePOs.length > 1 && (
 <button
 disabled={batchApproving}
 onClick={() => batchApprove("po")}
 className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold text-m-body press disabled:opacity-50" style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
 >
 {batchApproving ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
 Approve All
 </button>
 )}
 </div>
 )}
 {visiblePOs.map((po) => {
 const state = poStates[po.id] ?? "pending";
 const isOpen = expanded === `po:${po.id}`;
 return (
 <ApprovalCard
 key={po.id}
 kind="po"
 isOpen={isOpen}
 onToggle={() => setExpanded(isOpen ? null : `po:${po.id}`)}
 icon={Truck}
 title={po.supplierName}
 subtitle={`PO ${po.poNumber} · ${formatDate(po.createdAt)}`}
 meta={formatCurrency(po.total)}
 state={state}
 onApprove={() => approvePo(po)}
 onReject={() => rejectPo(po)}
 snoozeId={`approval:po:${po.id}`}
 snoozeLabel={`PO ${po.poNumber}`}
 >
 <div className="space-y-1.5">
 {po.lines.map((l, i) => (
 <div key={i} className="flex items-center justify-between gap-2 text-m-caption">
 <div className="min-w-0">
 <div className="truncate font-medium" style={{ color: "var(--color-ink-950)" }}>{l.materialName}</div>
 <div>{l.materialCode}{l.gstRate > 0 ? ` · GST ${l.gstRate}%` : ""}</div>
 </div>
 <div className="shrink-0 text-right">
 <div className="tnum" style={{ color: "var(--color-ink-950)" }}>{formatNumber(l.qtyOrdered, 3)} {l.unit}</div>
 <div className="tnum" style={{ color: "var(--color-ink-950)" }}>@ {formatCurrency(l.unitCost)}</div>
 </div>
 </div>
 ))}
 <div className="border-t pt-1.5 space-y-0.5" style={{ borderColor: "var(--color-line)" }}>
 <div className="flex justify-between text-m-caption" style={{ color: "var(--color-ink-500)" }}>
 <span>Subtotal</span>
 <span className="tnum">{formatCurrency(po.subtotal)}</span>
 </div>
 {po.gstTotal > 0 && (
 <div className="flex justify-between text-m-caption" style={{ color: "var(--color-ink-500)" }}>
 <span>GST</span>
 <span className="tnum">{formatCurrency(po.gstTotal)}</span>
 </div>
 )}
 <div className="flex justify-between text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
 <span>Total (incl. GST)</span>
 <span className="tnum">{formatCurrency(po.total)}</span>
 </div>
 </div>
 </div>
 </ApprovalCard>
 );
 })}
 {purchaseOrders.length > 0 && visiblePOs.length === 0 && (
 <MobileEmptyState icon={CheckCircle2} title="All POs reviewed" size="compact" />
 )}

 {/* ── Indents ─────────────────────────────────────── */}
 {requisitions.length > 0 && (
 <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
 <h2 className="text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 Indents ({visibleReqs.length})
 </h2>
 {visibleReqs.length > 1 && (
 <button
 disabled={batchApproving}
 onClick={() => batchApprove("requisition")}
 className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold text-m-body press disabled:opacity-50" style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
 >
 {batchApproving ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
 Approve All
 </button>
 )}
 </div>
 )}
 {visibleReqs.map((req) => {
 const state = reqStates[req.id] ?? "pending";
 const isOpen = expanded === `req:${req.id}`;
 return (
 <ApprovalCard
 key={req.id}
 kind="req"
 isOpen={isOpen}
 onToggle={() => setExpanded(isOpen ? null : `req:${req.id}`)}
 icon={ClipboardList}
 title={req.projectName ?? "N/A"}
 subtitle={`Indent ${req.requisitionNumber} · ${formatDate(req.createdAt)}`}
 meta={`${req.lines.length} line${req.lines.length === 1 ? "" : "s"}`}
 state={state}
 onApprove={() => approveReq(req)}
 onReject={() => rejectReq(req)}
 snoozeId={`approval:req:${req.id}`}
 snoozeLabel={`Indent ${req.requisitionNumber}`}
 >
 <div className="space-y-1.5">
 {req.lines.map((l, i) => (
 <div key={i} className="flex items-center justify-between gap-2 text-m-caption">
 <div className="min-w-0">
 <div className="truncate font-medium" style={{ color: "var(--color-ink-950)" }}>{l.materialName}</div>
 {l.notes && <div className="truncate ">{l.notes}</div>}
 </div>
 <div className="shrink-0 text-right tnum" style={{ color: "var(--color-ink-950)" }}>
 {formatNumber(l.qtyRequested, 3)} {l.unit}
 </div>
 </div>
 ))}
 </div>
 </ApprovalCard>
 );
 })}
 {requisitions.length > 0 && visibleReqs.length === 0 && (
 <MobileEmptyState icon={CheckCircle2} title="All indents reviewed" size="compact" />
 )}

 {/* ── Gate Passes ──────────────────────────────────────── */}
 {gatePasses.length > 0 && (
 <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
 <h2 className="text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 Gate Passes ({visibleGps.length})
 </h2>
 {visibleGps.length > 1 && (
 <button
 disabled={batchApproving}
 onClick={() => batchApprove("gatePass")}
 className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold text-m-body press disabled:opacity-50" style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
 >
 {batchApproving ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
 Approve All
 </button>
 )}
 </div>
 )}
 {visibleGps.map((gp) => {
 const state = gpStates[gp.id] ?? "pending";
 const isOpen = expanded === `gp:${gp.id}`;
 const categoryLabel = gp.category === "MATERIAL_ISSUE" ? "Material Issue"
 : gp.category === "STOCK_TRANSFER" ? "Stock Transfer"
 : gp.category === "MATERIAL_SALE" ? "Material Sale"
 : gp.category === "SUPPLIER_RETURN" ? "Supplier Return"
 : "Manual";
 return (
 <ApprovalCard
 key={gp.id}
 kind="gp"
 isOpen={isOpen}
 onToggle={() => setExpanded(isOpen ? null : `gp:${gp.id}`)}
 icon={ShieldCheck}
 title={gp.gatePassNumber}
 subtitle={`${categoryLabel} · ${gp.locationName}${gp.destination ? ` → ${gp.destination}` : ""}`}
 meta={`${gp.lineCount} item${gp.lineCount === 1 ? "" : "s"}`}
 state={state}
 onApprove={() => approveGp(gp)}
 onReject={() => { setRejectGp(gp); setGpRejectReason(""); }}
 snoozeId={`approval:gp:${gp.id}`}
 snoozeLabel={`GP ${gp.gatePassNumber}`}
 >
 <div className="space-y-1.5">
 {gp.lines.map((l, i) => (
 <div key={i} className="flex items-center justify-between gap-2 text-m-caption">
 <div className="min-w-0">
 <div className="truncate font-medium" style={{ color: "var(--color-ink-950)" }}>
 {l.materialName ?? l.description ?? "—"}
 </div>
 {l.materialCode && <div>{l.materialCode}</div>}
 </div>
 <div className="shrink-0 text-right tnum" style={{ color: "var(--color-ink-950)" }}>
 {formatNumber(l.qty, 3)} {l.unit ?? ""}
 </div>
 </div>
 ))}
 <div className="border-t pt-1.5 text-m-caption" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}>
 {gp.vehicleNumber && <div>Vehicle: {gp.vehicleNumber}</div>}
 {gp.driverName && <div>Driver: {gp.driverName}</div>}
 {gp.createdByName && <div>Created by: {gp.createdByName}</div>}
 </div>
 </div>
 </ApprovalCard>
 );
 })}
 {gatePasses.length > 0 && visibleGps.length === 0 && (
 <MobileEmptyState icon={CheckCircle2} title="All gate passes reviewed" size="compact" />
 )}

 {/* ── DPRs ─────────────────────────────────────────────── */}
 {dprs.length > 0 && (
 <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
 <h2 className="text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 DPRs ({visibleDprs.length})
 </h2>
 {visibleDprs.length > 1 && (
 <button
 disabled={batchApproving}
 onClick={() => batchApprove("dpr")}
 className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold text-m-body press disabled:opacity-50" style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
 >
 {batchApproving ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
 Approve All
 </button>
 )}
 </div>
 )}
 {visibleDprs.map((dpr) => {
 const state = dprStates[dpr.id] ?? "pending";
 const isOpen = expanded === `dpr:${dpr.id}`;
 const approvalLabel = dpr.approvalStatus === "SUBMITTED" ? "Sub-Admin" : "Admin";
 return (
 <ApprovalCard
 key={dpr.id}
 kind="dpr"
 isOpen={isOpen}
 onToggle={() => setExpanded(isOpen ? null : `dpr:${dpr.id}`)}
 icon={CalendarCheck}
 title={dpr.projectName ?? "N/A"}
 subtitle={`DPR · ${formatDate(dpr.date)} · ${approvalLabel} approval`}
 meta={`${dpr.progressPct}%`}
 state={state}
 onApprove={() => approveDpr(dpr)}
 onReject={() => rejectDpr(dpr)}
 snoozeId={`approval:dpr:${dpr.id}`}
 snoozeLabel={`DPR ${dpr.date}`}
 >
 <div className="space-y-2">
 {dpr.submittedByName ? (
 <div className="text-m-caption ">
 Submitted by {dpr.submittedByName}
 </div>
 ) : null}
 <div className="text-m-body ">{dpr.workSummary}</div>
 <div className="flex items-center gap-2">
 <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-500) 10%, transparent)" }}>
 <div
 className="h-1.5 rounded-full "
 style={{ width: `${dpr.progressPct}%` }}
 />
 </div>
 <span className="text-m-caption tnum" style={{ color: "var(--color-ink-500)" }}>{dpr.progressPct}%</span>
 </div>
 </div>
 </ApprovalCard>
 );
 })}
 {dprs.length > 0 && visibleDprs.length === 0 && (
 <MobileEmptyState icon={CheckCircle2} title="All DPRs reviewed" size="compact" />
 )}

 {/* ── Expenses ─────────────────────────────────────── */}
{expenses.length > 0 && (
 <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
 <h2 className="text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 Expenses ({visibleExpenses.length})
 </h2>
 {visibleExpenses.length > 1 && (
 <button
 disabled={batchApproving}
 onClick={() => batchApprove("expense")}
 className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold text-m-body press disabled:opacity-50" style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
 >
 {batchApproving ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
 Approve All
 </button>
 )}
 </div>
)}
{visibleExpenses.map((exp) => {
 const state = expenseStates[exp.id] ?? "pending";
 const isOpen = expanded === `expense:${exp.id}`;
 return (
 <ApprovalCard
 key={exp.id}
 kind="expense"
 isOpen={isOpen}
 onToggle={() => setExpanded(isOpen ? null : `expense:${exp.id}`)}
 icon={Receipt}
 title={exp.description || exp.category}
 subtitle={`${exp.category} · ${formatDate(exp.date)}`}
 meta={formatCurrency(exp.amount)}
 state={state}
 onApprove={() => approveExpense(exp)}
 onReject={() => rejectExpense(exp)}
 snoozeId={`approval:expense:${exp.id}`}
 snoozeLabel={`Expense ${exp.description}`}
 >
 <div className="space-y-1.5">
 {exp.projectName && (
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
 Project: {exp.projectName}
 </div>
 )}
 {exp.createdByName && (
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
 Created by: {exp.createdByName}
 </div>
 )}
 <div className="border-t pt-1.5 flex justify-between text-m-body font-semibold" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)" }}>
 <span>Amount</span>
 <span className="tnum">{formatCurrency(exp.amount)}</span>
 </div>
 </div>
 </ApprovalCard>
 );
})}
{expenses.length > 0 && visibleExpenses.length === 0 && (
 <MobileEmptyState icon={CheckCircle2} title="All expenses reviewed" size="compact" />
)}

{/* ── Expense Claims ────────────────────────────────── */}
{expenseClaims.length > 0 && (
 <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
 <h2 className="text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 Expense Claims ({visibleClaims.length})
 </h2>
 {visibleClaims.length > 1 && (
 <button
 disabled={batchApproving}
 onClick={() => batchApprove("claim")}
 className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold text-m-body press disabled:opacity-50" style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
 >
 {batchApproving ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
 Approve All
 </button>
 )}
 </div>
)}
{visibleClaims.map((c) => {
 const state = claimStates[c.id] ?? "pending";
 const isOpen = expanded === `claim:${c.id}`;
 return (
 <ApprovalCard
 key={c.id}
 kind="claim"
 isOpen={isOpen}
 onToggle={() => setExpanded(isOpen ? null : `claim:${c.id}`)}
 icon={Receipt}
 title={c.claimantName}
 subtitle={`Claim · ${c.projectName ?? "No project"} · ${formatDate(c.submittedAt ?? c.createdAt)}`}
 meta={formatCurrency(c.totalAmount)}
 state={state}
 onApprove={() => approveClaim(c)}
 onReject={() => rejectClaim(c)}
 snoozeId={`approval:claim:${c.id}`}
 snoozeLabel={`Claim ${c.claimantName}`}
 >
 <div className="space-y-1.5">
 {c.description && (
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
 {c.description}
 </div>
 )}
 {c.lines.map((l, i) => (
 <div key={i} className="flex items-center justify-between gap-2 text-m-caption">
 <div className="min-w-0">
 <div className="truncate font-medium" style={{ color: "var(--color-ink-950)" }}>{l.category}</div>
 {l.notes && <div className="truncate">{l.notes}</div>}
 </div>
 <div className="shrink-0 text-right tnum" style={{ color: "var(--color-ink-950)" }}>
 {formatCurrency(l.amount)}
 </div>
 </div>
 ))}
 <div className="border-t pt-1.5 flex justify-between text-m-body font-semibold" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)" }}>
 <span>Total</span>
 <span className="tnum">{formatCurrency(c.totalAmount)}</span>
 </div>
 </div>
 </ApprovalCard>
 );
})}
{expenseClaims.length > 0 && visibleClaims.length === 0 && (
 <MobileEmptyState icon={CheckCircle2} title="All claims reviewed" size="compact" />
)}

{/* ── Leave Requests ────────────────────────────────── */}
{leaves.length > 0 && (
 <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
 <h2 className="text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 Leave Requests ({visibleLeaves.length})
 </h2>
 </div>
)}
{visibleLeaves.map((l) => {
 const state = leaveStates[l.id] ?? "pending";
 const isOpen = expanded === `leave:${l.id}`;
 return (
 <ApprovalCard
 key={l.id}
 kind="leave"
 isOpen={isOpen}
 onToggle={() => setExpanded(isOpen ? null : `leave:${l.id}`)}
 icon={CalendarOff}
 title={l.employeeName}
 subtitle={`${l.type.charAt(0) + l.type.slice(1).toLowerCase()} leave · ${l.days} day${l.days === 1 ? "" : "s"} · ${formatDate(l.startDate)}`}
 meta={formatDate(l.createdAt)}
 state={state}
 onApprove={() => approveLeave(l)}
 onReject={() => rejectLeave(l)}
 snoozeId={`approval:leave:${l.id}`}
 snoozeLabel={`${l.employeeName} leave`}
 >
 <div className="space-y-1.5">
 <div className="flex items-center justify-between gap-2 text-m-caption">
 <span style={{ color: "var(--color-ink-500)" }}>Dates</span>
 <span className="font-medium" style={{ color: "var(--color-ink-950)" }}>
 {formatDate(l.startDate)}{l.startDate !== l.endDate ? ` → ${formatDate(l.endDate)}` : ""}
 </span>
 </div>
 <div className="flex items-center justify-between gap-2 text-m-caption">
 <span style={{ color: "var(--color-ink-500)" }}>Duration</span>
 <span className="font-medium tnum" style={{ color: "var(--color-ink-950)" }}>
 {l.days} working day{l.days === 1 ? "" : "s"}
 </span>
 </div>
 {l.reason && (
 <div className="text-m-caption pt-1 border-t" style={{ color: "var(--color-ink-500)", borderColor: "var(--color-line)" }}>
 {l.reason}
 </div>
 )}
 </div>
 </ApprovalCard>
 );
})}
{leaves.length > 0 && visibleLeaves.length === 0 && (
 <MobileEmptyState icon={CheckCircle2} title="All leave requests reviewed" size="compact" />
)}

{/* ── RA Bills ─────────────────────────────────────── */}
{visibleRaBills.length > 1 && (
 <div className="flex items-center justify-between mb-1">
 <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
 RA Bills ({visibleRaBills.length})
 </p>
 <button
 onClick={() => batchApprove("raBill")}
 disabled={batchApproving}
 className="flex items-center gap-1 text-m-caption font-bold text-m-body press rounded-[0.25rem] px-1.5 py-0.5"
 style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}
 >
 <CheckCircle2 className="size-2.5" /> Approve All
 </button>
 </div>
)}
{visibleRaBills.map((b) => {
 const state = raBillStates[b.id] ?? "pending";
 const isOpen = expanded === `raBill:${b.id}`;
 return (
 <ApprovalCard
 key={b.id}
 kind="raBill"
 isOpen={isOpen}
 onToggle={() => setExpanded(isOpen ? null : `raBill:${b.id}`)}
 icon={FileText}
 title={b.raBillNumber}
 subtitle={`${b.workOrderNumber ?? "WO"} · ${formatDate(b.periodFrom)} → ${formatDate(b.periodTo)}`}
 meta={formatCurrency(b.netPayable)}
 state={state}
 onApprove={() => approveRaBill(b)}
 onReject={() => rejectRaBill(b)}
 snoozeId={`approval:raBill:${b.id}`}
 snoozeLabel={`RA Bill ${b.raBillNumber}`}
 >
 <div className="space-y-1.5">
 {b.projectName && (
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
 Project: {b.projectName}
 </div>
 )}
 {b.submittedByName && (
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
 Submitted by: {b.submittedByName}
 </div>
 )}
 <div className="border-t pt-1.5 flex justify-between text-m-body font-semibold" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)" }}>
 <span>Net Payable</span>
 <span className="tnum">{formatCurrency(b.netPayable)}</span>
 </div>
 <div className="flex justify-between text-m-caption" style={{ color: "var(--color-ink-500)" }}>
 <span>Gross Amount</span>
 <span className="tnum">{formatCurrency(b.grossAmount)}</span>
 </div>
 </div>
 </ApprovalCard>
 );
})}
{raBills.length > 0 && visibleRaBills.length === 0 && (
 <MobileEmptyState icon={CheckCircle2} title="All RA bills reviewed" size="compact" />
)}

{purchaseOrders.length === 0 && requisitions.length === 0 && gatePasses.length === 0 && dprs.length === 0 && expenses.length === 0 && raBills.length === 0 && expenseClaims.length === 0 && leaves.length === 0 && (
 <MobileEmptyState
 icon={ClipboardCheck}
 title="Nothing to approve"
 description="Draft purchase orders, submitted indents, pending gate passes, pending DPRs, pending expenses, submitted expense claims, submitted RA bills, and pending leave requests appear here."
 />
 )}

 {/* ── Gate pass reject dialog ──────────────────────────── */}
 {rejectGp && (
 <MobileDialog open={true} onClose={() => setRejectGp(null)} title={`Reject ${rejectGp.gatePassNumber}`}>
 <div className="flex flex-col gap-3">
 <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
 <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
 Rejection Reason
 </p>
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Provide a reason for rejection</div>
 <textarea
 value={gpRejectReason}
 onChange={(e) => setGpRejectReason(e.target.value)}
 rows={3}
 placeholder="Why is this gate pass being rejected?"
 className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
 style={{ backgroundColor: "transparent" }}
 autoFocus
 />
 </div>
 <div className="flex justify-end gap-2">
 <button
 onClick={() => setRejectGp(null)}
 className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption press"
 style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
 >
 Cancel
 </button>
 <button
 disabled={!gpRejectReason.trim() || gpStates[rejectGp.id] === "rejecting"}
 onClick={confirmRejectGp}
 className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
 style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
 >
 {gpStates[rejectGp.id] === "rejecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject Gate Pass"}
 </button>
 </div>
 </div>
 </MobileDialog>
 )}

 {/* ── DPR reject dialog ──────────────────────────── */}
 {rejectDprState && (
 <MobileDialog open={true} onClose={() => setRejectDpr(null)} title={`Reject DPR`}>
 <div className="flex flex-col gap-3">
 <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
 <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
 Rejection Reason
 </p>
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Provide a reason for rejection</div>
 <textarea
 value={dprRejectReason}
 onChange={(e) => setDprRejectReason(e.target.value)}
 rows={3}
 placeholder="Why is this DPR being rejected?"
 className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
 style={{ backgroundColor: "transparent" }}
 autoFocus
 />
 </div>
 <div className="flex justify-end gap-2">
 <button
 onClick={() => setRejectDpr(null)}
 className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption press"
 style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
 >
 Cancel
 </button>
 <button
 disabled={!dprRejectReason.trim() || dprStates[rejectDprState.id] === "rejecting"}
 onClick={confirmRejectDpr}
 className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
 style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
 >
 {dprStates[rejectDprState.id] === "rejecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject DPR"}
 </button>
 </div>
 </div>
 </MobileDialog>
 )}

{/* ── PO reject dialog ──────────────────────────── */}
{rejectPoState && (
 <MobileDialog open={true} onClose={() => setRejectPo(null)} title={`Reject PO ${rejectPoState.poNumber}`}>
 <div className="flex flex-col gap-3">
 <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
 <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
 Rejection Reason
 </p>
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Provide a reason for rejection</div>
 <textarea
 value={poRejectReason}
 onChange={(e) => setPoRejectReason(e.target.value)}
 rows={3}
 placeholder="Why is this PO being rejected?"
 className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
 style={{ backgroundColor: "transparent" }}
 autoFocus
 />
 </div>
 <div className="flex justify-end gap-2">
 <button
 onClick={() => setRejectPo(null)}
 className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press"
 style={{ color: "var(--color-ink-500)" }}
 >
 Cancel
 </button>
 <button
 disabled={!poRejectReason.trim() || poStates[rejectPoState.id] === "rejecting"}
 onClick={confirmRejectPo}
 className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
 style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
 >
 {poStates[rejectPoState.id] === "rejecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject PO"}
 </button>
 </div>
 </div>
 </MobileDialog>
)}

{/* ── Expense reject dialog ──────────────────────────── */}
{rejectExpenseState && (
 <MobileDialog open={true} onClose={() => setRejectExpense(null)} title="Reject Expense">
 <div className="flex flex-col gap-3">
 <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
 <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
 Rejection Reason
 </p>
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Provide a reason for rejection</div>
 <textarea
 value={expenseRejectReason}
 onChange={(e) => setExpenseRejectReason(e.target.value)}
 rows={3}
 placeholder="Why is this expense being rejected?"
 className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
 style={{ backgroundColor: "transparent" }}
 autoFocus
 />
 </div>
 <div className="flex justify-end gap-2">
 <button
 onClick={() => setRejectExpense(null)}
 className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption press"
 style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
 >
 Cancel
 </button>
 <button
 disabled={!expenseRejectReason.trim() || expenseStates[rejectExpenseState.id] === "rejecting"}
 onClick={confirmRejectExpense}
 className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
 style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
 >
 {expenseStates[rejectExpenseState.id] === "rejecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject Expense"}
 </button>
 </div>
 </div>
 </MobileDialog>
)}

{/* ── RA Bill reject dialog ──────────────────────────── */}
{rejectRaBillState && (
 <MobileDialog open={true} onClose={() => setRejectRaBill(null)} title={`Reject ${rejectRaBillState.raBillNumber}`}>
 <div className="flex flex-col gap-3 p-4">
 <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
 <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
 Rejection Reason
 </p>
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Provide a reason for rejection</div>
 <textarea
 value={raBillRejectReason}
 onChange={(e) => setRaBillRejectReason(e.target.value)}
 rows={3}
 placeholder="Why is this RA bill being rejected?"
 className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
 style={{ backgroundColor: "transparent" }}
 autoFocus
 />
 </div>
 <div className="flex justify-end gap-2">
 <button
 onClick={() => setRejectRaBill(null)}
 className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption press"
 style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
 >
 Cancel
 </button>
 <button
 disabled={!raBillRejectReason.trim() || raBillStates[rejectRaBillState.id] === "rejecting"}
 onClick={confirmRejectRaBill}
 className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
 style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
 >
 {raBillStates[rejectRaBillState.id] === "rejecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject RA Bill"}
 </button>
 </div>
 </div>
 </MobileDialog>
)}

{/* ── Expense Claim reject dialog ──────────────────────────── */}
{rejectClaimState && (
 <MobileDialog open={true} onClose={() => setRejectClaim(null)} title={`Reject Claim — ${rejectClaimState.claimantName}`}>
 <div className="flex flex-col gap-3">
 <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
 <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
 Rejection Reason
 </p>
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Provide a reason for rejection</div>
 <textarea
 value={claimRejectReason}
 onChange={(e) => setClaimRejectReason(e.target.value)}
 rows={3}
 placeholder="Why is this claim being rejected?"
 className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
 style={{ backgroundColor: "transparent" }}
 autoFocus
 />
 </div>
 <div className="flex justify-end gap-2">
 <button
 onClick={() => setRejectClaim(null)}
 className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption press"
 style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
 >
 Cancel
 </button>
 <button
 disabled={!claimRejectReason.trim() || claimStates[rejectClaimState.id] === "rejecting"}
 onClick={confirmRejectClaim}
 className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
 style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
 >
 {claimStates[rejectClaimState.id] === "rejecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject Claim"}
 </button>
 </div>
 </div>
 </MobileDialog>
)}

{/* ── Leave rejection dialog ── */}
{rejectLeaveState && (
 <MobileDialog open={true} onClose={() => setRejectLeave(null)} title={`Reject Leave — ${rejectLeaveState.employeeName}`}>
 <div className="flex flex-col gap-3">
 <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
 <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
 Rejection Reason
 </p>
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>The employee will see this reason</div>
 <textarea
 value={leaveRejectReason}
 onChange={(e) => setLeaveRejectReason(e.target.value)}
 rows={3}
 placeholder="Why is this leave being rejected?"
 className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
 style={{ backgroundColor: "transparent" }}
 autoFocus
 />
 </div>
 <div className="flex justify-end gap-2">
 <button
 onClick={() => setRejectLeave(null)}
 className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption press"
 style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
 >
 Cancel
 </button>
 <button
 disabled={!leaveRejectReason.trim() || leaveStates[rejectLeaveState.id] === "rejecting"}
 onClick={confirmRejectLeave}
 className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
 style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
 >
 {leaveStates[rejectLeaveState.id] === "rejecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject Leave"}
 </button>
 </div>
 </div>
 </MobileDialog>
)}
 </div>
 );
}

// ── Approval card with expandable detail + action buttons ───────

function ApprovalCard({
 kind: _kind,
 isOpen,
 onToggle,
 icon: Icon,
 title,
 subtitle,
 meta,
 state,
 onApprove,
 onReject,
 snoozeId,
 snoozeLabel,
 children,
}: {
 kind: ItemKind;
 isOpen: boolean;
 onToggle: () => void;
 icon: typeof Truck;
 title: string;
 subtitle: string;
 meta: string;
 state: ItemState;
 onApprove: () => void;
 onReject?: () => void;
 snoozeId?: string;
 snoozeLabel?: string;
 children: React.ReactNode;
}) {
 const busy = state === "approving" || state === "rejecting";
 return (
 <div className="border-b /70 ">
 {/* Header row — tap to expand */}
 <button
 onClick={onToggle}
 disabled={busy}
 className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors press"
 >
 <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.375rem] ">
 <Icon className="h-4 w-4" style={{ color: "var(--color-ink-500)" }} />
 </span>
 <div className="min-w-0 flex-1">
 <div className="truncate text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>{title}</div>
 <div className="truncate text-m-caption" style={{ color: "var(--color-ink-500)" }}>{subtitle}</div>
 </div>
 <span className="shrink-0 text-m-caption font-medium" style={{ color: "var(--color-ink-500)" }}>{meta}</span>
 {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />}
 </button>

 {/* Expanded detail + actions */}
 {isOpen && (
 <div className="px-4 pb-4">
 <div className="rounded-[0.375rem] border p-3">
 {children}
 </div>

 {/* Action buttons */}
 <div className="mt-3 flex gap-2 items-center">
 <button
 onClick={onApprove}
 disabled={busy}
 className={cn(
 "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.625rem] px-4 py-3 text-m-body font-semibold transition-transform press active:scale-[0.99] disabled:opacity-50",
 )}
 style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
 >
 {state === "approving" ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <CheckCircle2 className="h-4 w-4" />
 )}
 Approve
 </button>
 {onReject && (
 <button
 onClick={onReject}
 disabled={busy}
 className={cn(
 "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[0.625rem] border px-4 py-3 text-m-body font-semibold transition-colors active:scale-[0.99] disabled:opacity-50",
 )}
 >
 {state === "rejecting" ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <XCircle className="h-4 w-4" />
 )}
 Reject
 </button>
 )}
 {snoozeId && snoozeLabel ? (
 <SnoozeButton itemId={snoozeId} label={snoozeLabel} size="md" />
 ) : null}
 </div>
 </div>
 )}
 </div>
 );
}
