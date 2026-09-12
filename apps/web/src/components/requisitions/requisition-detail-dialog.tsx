"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X, ShoppingCart, FileText, Truck, Trophy, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/page";
import { PipelineStepper, type PipelineStep } from "@/components/ui/pipeline-stepper";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { ConvertToPoDialog } from "./convert-to-po-dialog";
import { AuditTrail } from "@/components/audit-trail";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { useTrackRecent } from "@/lib/use-recently-viewed";
import type { RequisitionDetail, RequisitionRow } from "@/lib/types";

type SupplierOption = { id: string; name: string };
type LocationOption = {
  id: string;
  name: string;
  type: "CENTRAL_WAREHOUSE" | "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT";
  projectId: string | null;
};

export function RequisitionDetailDialog({
  open,
  onOpenChange,
  requisition,
  suppliers,
  locations,
  canApprove,
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requisition: RequisitionRow | null;
  suppliers: SupplierOption[];
  locations: LocationOption[];
  canApprove?: boolean;
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<RequisitionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const trackRecent = useTrackRecent();

  useEffect(() => {
    if (open && requisition) {
      setLoading(true);
      setDetail(null);
      fetch(`/api/requisitions/${requisition.id}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setDetail(d); })
        .catch(() => { /* silent — loading state reset below */ })
        .finally(() => setLoading(false));
      // Track in recently viewed
      trackRecent({ type: "requisition", id: requisition.id, label: requisition.reqNumber, href: `/requisitions?req=${requisition.id}` });
    }
  }, [open, requisition, trackRecent]);

  // ── Single-key action mnemonics ───────────────────────────────
  // S = Submit, A = Approve, R = Reject, C = Convert to PO
  useEffect(() => {
    if (!open || !detail) return;
    const d = detail;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s" && (d.status === "DRAFT" || d.status === "REJECTED") && !acting) {
        e.preventDefault();
        doAction("submit");
      } else if (key === "a" && d.status === "SUBMITTED" && !acting && canApprove && d.requestedById !== currentUserId) {
        e.preventDefault();
        doAction("approve");
      } else if (key === "r" && d.status === "SUBMITTED" && !acting && canApprove && d.requestedById !== currentUserId) {
        e.preventDefault();
        doAction("reject");
      } else if (key === "c" && d.status === "APPROVED" && !acting && (d.quotes?.waived || d.quotes?.selected)) {
        e.preventDefault();
        setConvertOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doAction uses latest state via closure
  }, [open, detail, acting]);

  async function doAction(action: "submit" | "approve" | "reject") {
    if (!requisition) return;
    setActing(true);
    try {
      const res = await fetch(`/api/requisitions/${requisition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`Indent ${action}ted`);
      // Re-fetch detail
      const r2 = await fetch(`/api/requisitions/${requisition.id}`);
      if (!r2.ok) throw new Error("Failed to re-fetch indent details");
      const d2 = await r2.json();
      if (!d2.error) setDetail(d2);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  async function handleDelete() {
    if (!requisition) return;
    if (!window.confirm(`Delete indent ${requisition.reqNumber}?\n\nThis cannot be undone.`)) return;
    setActing(true);
    try {
      const res = await fetch(`/api/requisitions/${requisition.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      toast.success("Indent deleted");
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  if (!requisition) return null;

  // ── Pipeline position: Indent → Quote → PO → GRN → Issue ──────
  // The requisition IS the indent — it's the current step. Quote is
  // done if any quotes have been uploaded. PO is done if converted.
  // GRN and Issue are downstream — pending until the PO is received.
  const pipelineSteps: PipelineStep[] = detail
    ? [
        { label: "Indent", state: "current" },
        {
          label: "Quote",
          state: (detail.quotes?.count ?? 0) > 0 ? "done" : "pending",
        },
        {
          label: "PO",
          state: detail.convertedPoId ? "done" : "pending",
          href: detail.convertedPoId ? `/procurement?po=${detail.convertedPoId}` : undefined,
        },
        { label: "GRN", state: "pending" },
        { label: "Issue", state: "pending" },
      ]
    : [];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={requisition.reqNumber}
        description={`${requisition.projectName}${requisition.phaseName ? ` · Phase: ${requisition.phaseName}` : ""}`}
        className="max-w-3xl"
        action={
          <a
            href={`/print/requisition/${requisition.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border px-3 py-1.5 text-body font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Print Demand Slip
          </a>
        }
      >
        {loading ? (
          <p className="py-10 text-center text-body text-muted-foreground">Loading…</p>
        ) : detail ? (
          <div className="space-y-3">
            {/* Status + meta */}
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={detail.status} />
              <span className="text-meta text-muted-foreground">
                Requested: {formatDate(detail.requestDate)}
              </span>
              {detail.neededByDate && (
                <span className="text-meta text-muted-foreground">
                  Needed by: {formatDate(detail.neededByDate)}
                </span>
              )}
            </div>

            {/* Pipeline position — where this indent sits in the flow */}
            {pipelineSteps.length > 0 && (
              <PipelineStepper steps={pipelineSteps} />
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {detail.status === "DRAFT" && (
                <Button size="sm" onClick={() => doAction("submit")} disabled={acting}>
                  <ArrowRight className="h-4 w-4" /> Submit <kbd className="ml-1 rounded border border-border px-1 text-[0.625rem] text-muted-foreground">S</kbd>
                </Button>
              )}
              {detail.status === "REJECTED" && (
                <Button size="sm" onClick={() => doAction("submit")} disabled={acting}>
                  <ArrowRight className="h-4 w-4" /> Resubmit
                </Button>
              )}
              {detail.status === "SUBMITTED" && canApprove && detail.requestedById !== currentUserId && (
                <>
                  <Button size="sm" onClick={() => doAction("approve")} disabled={acting}>
                    <Check className="h-4 w-4" /> Approve <kbd className="ml-1 rounded border border-border px-1 text-[0.625rem] text-muted-foreground">A</kbd>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => doAction("reject")} disabled={acting} className="text-muted-foreground hover:text-danger">
                    <X className="h-4 w-4" /> Reject <kbd className="ml-1 rounded border border-border px-1 text-[0.625rem] text-muted-foreground">R</kbd>
                  </Button>
                </>
              )}
              {detail.status === "APPROVED" && (detail.quotes?.waived || detail.quotes?.selected) && (
                <Button size="sm" onClick={() => setConvertOpen(true)}>
                  <ShoppingCart className="h-4 w-4" /> Convert to PO <kbd className="ml-1 rounded border border-border px-1 text-[0.625rem] text-muted-foreground">C</kbd>
                </Button>
              )}
              {detail.status === "APPROVED" && !detail.quotes?.waived && !detail.quotes?.selected && (
                <span className="text-caption text-muted-foreground italic self-center">
                  Collect quotes & select a winner to auto-create the PO
                </span>
              )}
              {detail.status === "CONVERTED" && detail.convertedPoId && (
                <a href={`/procurement?po=${detail.convertedPoId}`} className="inline-flex">
                  <Button size="sm" variant="outline">
                    <FileText className="h-4 w-4" /> View PO
                  </Button>
                </a>
              )}
              {(detail.status === "DRAFT" || detail.status === "REJECTED") && (
                <Button size="sm" variant="outline" onClick={handleDelete} disabled={acting} className="text-muted-foreground hover:text-danger">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>

            {/* Line items */}
            <div className="rounded-lg border border-border/60">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Material</TH>
                    <TH className="text-right">Qty Requested</TH>
                    <TH className="text-right">Stock</TH>
                    <TH className="text-right">Last Rate</TH>
                    <TH>Preferred Supplier</TH>
                    <TH>Notes</TH>
                  </TR>
                </THead>
                <TBody>
                  {detail.lines.map((l) => (
                    <TR key={l.id}>
                      <TD>
                        <div className="font-medium">{l.materialName}</div>
                        <div className="font-mono text-caption text-muted-foreground">{l.materialCode}</div>
                      </TD>
                      <TD className="tnum text-right">{formatNumber(l.qtyRequested, 3)} {l.unit}</TD>
                      <TD className="tnum text-right">
                        {l.currentStock != null ? (
                          <span className={l.currentStock > 0 ? "" : "text-danger"}>{formatNumber(l.currentStock, 3)} {l.unit}</span>
                        ) : "—"}
                      </TD>
                      <TD className="tnum text-right">
                        {l.lastRate != null ? (
                          <div>
                            {formatCurrency(l.lastRate)}
                            {l.lastRateDate && <div className="text-caption text-muted-foreground">{formatDate(l.lastRateDate)}</div>}
                          </div>
                        ) : "—"}
                      </TD>
                      <TD className="text-muted-foreground">
                        {l.preferredSupplier ? (
                          <div>
                            <div className="text-foreground">{l.preferredSupplier.name}</div>
                            {l.preferredSupplier.phone && <div className="text-caption">{l.preferredSupplier.phone}</div>}
                          </div>
                        ) : "—"}
                      </TD>
                      <TD className="max-w-[200px] truncate text-muted-foreground">{l.notes ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="flex justify-end gap-5 text-body">
              <span className="tnum">Lines: <strong>{detail.lineCount}</strong></span>
              <span className="tnum text-base">Total Qty: <strong>{formatNumber(detail.totalQty, 3)}</strong></span>
            </div>

            {detail.notes && (
              <div className="rounded-lg bg-muted/50 p-3 text-body">
                <span className="font-medium">Notes: </span>{detail.notes}
              </div>
            )}

            {/* Approval / rejection info */}
            {detail.approvedBy && (
              <div className="rounded-lg bg-success/10 p-3 text-body text-success">
                <span className="font-medium">Approved by {detail.approvedBy.name}</span>
                {detail.approvedAt && <span className="text-muted-foreground"> on {formatDate(detail.approvedAt)}</span>}
                {detail.approvalNotes && <p className="mt-1 text-muted-foreground">{detail.approvalNotes}</p>}
              </div>
            )}
            {detail.rejectedBy && (
              <div className="rounded-lg bg-danger/10 p-3 text-body text-danger">
                <span className="font-medium">Rejected by {detail.rejectedBy.name}</span>
                {detail.rejectedAt && <span className="text-muted-foreground"> on {formatDate(detail.rejectedAt)}</span>}
                {detail.rejectReason && <p className="mt-1">{detail.rejectReason}</p>}
              </div>
            )}

            {/* LCI logistics decision */}
            {detail.lciDecision && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-body">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Logistics recommendation:</span>
                <Badge variant={detail.lciDecision.recommendedScope === "PROJECT" ? "brand" : "outline"}>
                  {detail.lciDecision.recommendedScope === "PROJECT" ? "Project scope" : "Company scope"}
                </Badge>
                <span className="text-caption text-muted-foreground">
                  LCI threshold: {detail.lciDecision.threshold}%
                </span>
              </div>
            )}

            {/* Quote summary */}
            {detail.quotes && detail.quotes.count > 0 && (
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-center gap-2 text-body">
                  <Trophy className="h-4 w-4 text-warning" />
                  <span className="font-medium">Comparative Quotes</span>
                  <Badge variant={detail.quotes.gateSatisfied ? "success" : "warning"}>
                    {detail.quotes.count}/{detail.quotes.minRequired} quotes
                  </Badge>
                  {detail.quotes.waived && (
                    <span className="text-caption text-muted-foreground">waived{detail.quotes.waivedReason ? `: ${detail.quotes.waivedReason}` : ""}</span>
                  )}
                </div>
                {detail.quotes.cheapest && (
                  <div className="flex items-center justify-between text-caption">
                    <span className="text-muted-foreground">Cheapest: <span className="text-foreground">{detail.quotes.cheapest.supplierName}</span></span>
                    <span className="tnum">{formatCurrency(detail.quotes.cheapest.landedTotal)}</span>
                  </div>
                )}
                {detail.quotes.selected && (
                  <div className="flex items-center justify-between text-caption">
                    <span className="text-muted-foreground">Selected: <span className="text-foreground font-medium">{detail.quotes.selected.supplierName}</span></span>
                    <span className="tnum font-medium">{formatCurrency(detail.quotes.selected.landedTotal)}</span>
                  </div>
                )}
              </div>
            )}

            <AttachmentList entityType="MaterialRequisition" entityId={detail.id} />

            <AuditTrail entityType="MaterialRequisition" entityId={detail.id} />
          </div>
        ) : (
          <p className="py-10 text-center text-body text-muted-foreground">Failed to load indent.</p>
        )}
      </Dialog>

      {detail && (
        <ConvertToPoDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          requisition={detail}
          suppliers={suppliers}
          locations={locations}
        />
      )}
    </>
  );
}
