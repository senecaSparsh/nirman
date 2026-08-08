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
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

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
  projectName: string;
  createdAt: string;
  lines: ReqLine[];
}

type ItemKind = "po" | "req";
type ItemState = "pending" | "approving" | "approved" | "rejecting" | "rejected";

// ── Component ───────────────────────────────────────────────────

export function MobileApprovalsQueue({
  purchaseOrders,
  requisitions,
}: {
  purchaseOrders: PoRow[];
  requisitions: ReqRow[];
}) {
  const router = useRouter();
  // Track per-item state so approved/rejected items collapse out of the queue
  // without waiting for a full server re-render.
  const [poStates, setPoStates] = useState<Record<string, ItemState>>({});
  const [reqStates, setReqStates] = useState<Record<string, ItemState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const visiblePOs = purchaseOrders.filter((po) => {
    const s = poStates[po.id];
    return !s || s === "pending" || s === "approving" || s === "rejecting";
  });
  const visibleReqs = requisitions.filter((r) => {
    const s = reqStates[r.id];
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

  return (
    <div>
      {/* ── Purchase Orders ──────────────────────────────────── */}
      {purchaseOrders.length > 0 && (
        <h2 className="px-4 pb-1.5 pt-5 text-label text-muted-foreground/75">
          Purchase Orders ({visiblePOs.length})
        </h2>
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
            onReject={undefined}
          >
            <div className="space-y-1.5">
              {po.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-meta">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{l.materialName}</div>
                    <div className="text-muted-foreground">{l.materialCode}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum text-foreground">{formatNumber(l.qtyOrdered, 3)} {l.unit}</div>
                    <div className="tnum text-muted-foreground">@ {formatCurrency(l.unitCost)}</div>
                  </div>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5 text-body font-semibold">
                <span>Total</span>
                <span className="tnum">{formatCurrency(po.total)}</span>
              </div>
            </div>
          </ApprovalCard>
        );
      })}
      {purchaseOrders.length > 0 && visiblePOs.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <CheckCircle2 className="mb-2 h-8 w-8 text-success/60" />
          <p className="text-body font-semibold text-foreground">All POs reviewed</p>
        </div>
      )}

      {/* ── Requisitions ─────────────────────────────────────── */}
      {requisitions.length > 0 && (
        <h2 className="px-4 pb-1.5 pt-5 text-label text-muted-foreground/75">
          Requisitions ({visibleReqs.length})
        </h2>
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
            title={req.projectName}
            subtitle={`Req ${req.requisitionNumber} · ${formatDate(req.createdAt)}`}
            meta={`${req.lines.length} lines`}
            state={state}
            onApprove={() => approveReq(req)}
            onReject={() => rejectReq(req)}
          >
            <div className="space-y-1.5">
              {req.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-meta">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{l.materialName}</div>
                    {l.notes && <div className="truncate text-muted-foreground">{l.notes}</div>}
                  </div>
                  <div className="shrink-0 text-right tnum text-foreground">
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
          <CheckCircle2 className="mb-2 h-8 w-8 text-success/60" />
          <p className="text-body font-semibold text-foreground">All requisitions reviewed</p>
        </div>
      )}

      {purchaseOrders.length === 0 && requisitions.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <ClipboardCheck className="mb-3 h-10 w-10 text-muted-foreground/55" />
          <p className="text-body font-semibold text-foreground">Nothing to approve</p>
          <p className="mt-1 max-w-xs text-meta leading-relaxed text-muted-foreground">
            Draft purchase orders and submitted requisitions appear here.
          </p>
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
  children: React.ReactNode;
}) {
  const busy = state === "approving" || state === "rejecting";
  return (
    <div className="border-b border-border/70 bg-card">
      {/* Header row — tap to expand */}
      <button
        onClick={onToggle}
        disabled={busy}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-accent"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold text-foreground">{title}</div>
          <div className="truncate text-caption text-muted-foreground">{subtitle}</div>
        </div>
        <span className="shrink-0 text-meta font-medium text-muted-foreground">{meta}</span>
        {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
      </button>

      {/* Expanded detail + actions */}
      {isOpen && (
        <div className="px-4 pb-4">
          <div className="rounded-md border border-border bg-background p-3">
            {children}
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={onApprove}
              disabled={busy}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-body font-semibold transition-colors active:scale-[0.99]",
                "bg-success text-white shadow-raised disabled:opacity-50",
              )}
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
                  "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-body font-semibold text-foreground transition-colors active:scale-[0.99] disabled:opacity-50",
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
          </div>
        </div>
      )}
    </div>
  );
}
