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
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { useSnooze } from "@/lib/use-snooze";
import { SnoozeButton } from "@/components/mobile/v2/snooze-button";

// ── Types (mirrors the server-component payload) ───────────────

interface PoLine {
 materialName: string;
 materialCode: string;
 unit: string;
 qtyOrdered: number;
 unitCost: number;
}
interface PoRow {
 id: string;
 poNumber: string;
 supplierName: string;
 createdAt: string;
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

type ItemKind = "po" | "req" | "dpr" | "gp";
type ItemState = "pending" | "approving" | "approved" | "rejecting" | "rejected";

// ── Component ───────────────────────────────────────────────────

export function MobileApprovalsQueue({
 purchaseOrders,
 requisitions,
 gatePasses = [],
 dprs = [],
}: {
 purchaseOrders: PoRow[];
 requisitions: ReqRow[];
 gatePasses?: GatePassRow[];
 dprs?: DprRow[];
}) {
 const router = useRouter();
 const { isSnoozed } = useSnooze();
 const [poStates, setPoStates] = useState<Record<string, ItemState>>({});
 const [reqStates, setReqStates] = useState<Record<string, ItemState>>({});
 const [gpStates, setGpStates] = useState<Record<string, ItemState>>({});
 const [dprStates, setDprStates] = useState<Record<string, ItemState>>({});
 const [expanded, setExpanded] = useState<string | null>(null);
 const [rejectGp, setRejectGp] = useState<GatePassRow | null>(null);
 const [gpRejectReason, setGpRejectReason] = useState("");
 const [batchApproving, setBatchApproving] = useState(false);

 // ── Batch approve: approve all visible items of a given type ──
 async function batchApprove(type: "po" | "requisition" | "gatePass" | "dpr") {
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
 items = visibleDprs.map((d) => ({ type: "gatePass" as const, id: d.id }));
 // DPRs don't have a batch API yet — approve individually
 setBatchApproving(false);
 // Fall back to individual approves
 for (const dpr of visibleDprs) {
 await approveDpr(dpr);
 }
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
 toast.success(`PO ${po.poNumber} approved`);
 setPoStates((s) => ({ ...s, [po.id]: "approved" }));
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setPoStates((s) => ({ ...s, [po.id]: "pending" }));
 }
 }

 async function rejectPo(po: PoRow) {
 haptic([10, 30]);
 setPoStates((s) => ({ ...s, [po.id]: "rejecting" }));
 try {
 const res = await fetch(`/api/purchase-orders/${po.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "cancel" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject PO");
 toast.success(`PO ${po.poNumber} rejected`);
 setPoStates((s) => ({ ...s, [po.id]: "rejected" }));
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
 if (!res.ok) throw new Error(data.error ?? "Failed to approve requisition");
 toast.success(`Indent ${req.requisitionNumber} approved`);
 setReqStates((s) => ({ ...s, [req.id]: "approved" }));
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
 if (!res.ok) throw new Error(data.error ?? "Failed to reject requisition");
 toast.success(`Indent ${req.requisitionNumber} rejected`);
 setReqStates((s) => ({ ...s, [req.id]: "rejected" }));
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
 toast.success(label);
 setDprStates((s) => ({ ...s, [dpr.id]: "approved" }));
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setDprStates((s) => ({ ...s, [dpr.id]: "pending" }));
 }
 }

 async function rejectDpr(dpr: DprRow) {
 haptic([10, 30]);
 setDprStates((s) => ({ ...s, [dpr.id]: "rejecting" }));
 try {
 const res = await fetch(`/api/dprs/${dpr.id}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "reject" }),
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.error ?? "Failed to reject DPR");
 toast.success("DPR rejected");
 setDprStates((s) => ({ ...s, [dpr.id]: "rejected" }));
 router.refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "An error occurred");
 setDprStates((s) => ({ ...s, [dpr.id]: "pending" }));
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
 toast.success(`Gate pass ${gp.gatePassNumber} approved`);
 setGpStates((s) => ({ ...s, [gp.id]: "approved" }));
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
 <div>{l.materialCode}</div>
 </div>
 <div className="shrink-0 text-right">
 <div className="tnum" style={{ color: "var(--color-ink-950)" }}>{formatNumber(l.qtyOrdered, 3)} {l.unit}</div>
 <div className="tnum" style={{ color: "var(--color-ink-950)" }}>@ {formatCurrency(l.unitCost)}</div>
 </div>
 </div>
 ))}
 <div className="flex justify-between border-t pt-1.5 text-m-body font-semibold" style={{ borderColor: "var(--color-line)" }}>
 <span>Total</span>
 <span className="tnum">{formatCurrency(po.total)}</span>
 </div>
 </div>
 </ApprovalCard>
 );
 })}
 {purchaseOrders.length > 0 && visiblePOs.length === 0 && (
 <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
 <CheckCircle2 className="mb-2 h-8 w-8" style={{ color: "color-mix(in srgb, var(--color-go) 60%, transparent)" }} />
 <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>All POs reviewed</p>
 </div>
 )}

 {/* ── Requisitions ─────────────────────────────────────── */}
 {requisitions.length > 0 && (
 <div className="flex items-center justify-between px-4 pb-1.5 pt-5">
 <h2 className="text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 Requisitions ({visibleReqs.length})
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
 subtitle={`Req ${req.requisitionNumber} · ${formatDate(req.createdAt)}`}
 meta={`${req.lines.length} lines`}
 state={state}
 onApprove={() => approveReq(req)}
 onReject={() => rejectReq(req)}
 snoozeId={`approval:req:${req.id}`}
 snoozeLabel={`Req ${req.requisitionNumber}`}
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
 <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
 <CheckCircle2 className="mb-2 h-8 w-8" style={{ color: "color-mix(in srgb, var(--color-go) 60%, transparent)" }} />
 <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>All requisitions reviewed</p>
 </div>
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
 meta={`${gp.lineCount} items`}
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
 <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
 <CheckCircle2 className="mb-2 h-8 w-8" style={{ color: "color-mix(in srgb, var(--color-go) 60%, transparent)" }} />
 <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>All gate passes reviewed</p>
 </div>
 )}

 {/* ── DPRs ─────────────────────────────────────────────── */}
 {dprs.length > 0 && (
 <h2 className="px-4 pb-1.5 pt-5 text-m-caption " style={{ color: "var(--color-ink-500)" }}>
 DPRs ({visibleDprs.length})
 </h2>
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
 <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
 <CheckCircle2 className="mb-2 h-8 w-8" style={{ color: "color-mix(in srgb, var(--color-go) 60%, transparent)" }} />
 <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>All DPRs reviewed</p>
 </div>
 )}

 {purchaseOrders.length === 0 && requisitions.length === 0 && gatePasses.length === 0 && dprs.length === 0 && (
 <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
 <ClipboardCheck className="mb-3 h-10 w-10" style={{ color: "color-mix(in srgb, var(--color-ink-500) 55%, transparent)" }} />
 <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>Nothing to approve</p>
 <p className="mt-1 max-w-xs text-m-caption leading-relaxed" style={{ color: "var(--color-ink-500)" }}>
 Draft purchase orders, submitted requisitions, pending gate passes, and pending DPRs appear here.
 </p>
 </div>
 )}

 {/* ── Gate pass reject dialog ──────────────────────────── */}
 {rejectGp && (
 <div
 className="fixed inset-0 z-50 flex items-end justify-center"
 style={{ backgroundColor: "rgba(18, 17, 13, 0.5)" }}
 onClick={() => setRejectGp(null)}
 >
 <div
 className="w-full max-w-md rounded-t-[0.75rem] p-4 space-y-3"
 style={{ backgroundColor: "var(--color-paper)" }}
 onClick={(e) => e.stopPropagation()}
 >
 <div>
 <div className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>Reject {rejectGp.gatePassNumber}</div>
 <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Provide a reason for rejection</div>
 </div>
 <textarea
 value={gpRejectReason}
 onChange={(e) => setGpRejectReason(e.target.value)}
 rows={3}
 placeholder="Why is this gate pass being rejected?"
 className="w-full rounded-[0.375rem] border px-3 py-2 text-m-body outline-none"
 style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
 autoFocus
 />
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
 </div>
 )}
 </div>
 );
}

// ── Approval card with expandable detail + action buttons ───────

function ApprovalCard({
 kind,
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
