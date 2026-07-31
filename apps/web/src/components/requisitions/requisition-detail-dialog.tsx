"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, X, ShoppingCart, FileText } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatNumber, formatDate } from "@/lib/utils";
import { ConvertToPoDialog } from "./convert-to-po-dialog";
import type { RequisitionDetail, RequisitionRow } from "@/lib/types";

type SupplierOption = { id: string; name: string };
type LocationOption = {
  id: string;
  name: string;
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  projectId: string | null;
};

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  DRAFT: "muted",
  SUBMITTED: "warning",
  APPROVED: "success",
  CONVERTED: "default",
  REJECTED: "danger",
};

export function RequisitionDetailDialog({
  open,
  onOpenChange,
  requisition,
  suppliers,
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requisition: RequisitionRow | null;
  suppliers: SupplierOption[];
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<RequisitionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (open && requisition) {
      setLoading(true);
      setDetail(null);
      fetch(`/api/requisitions/${requisition.id}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setDetail(d); })
        .finally(() => setLoading(false));
    }
  }, [open, requisition]);

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
      toast.success(`Requisition ${action}ted`);
      // Re-fetch detail
      const r2 = await fetch(`/api/requisitions/${requisition.id}`);
      const d2 = await r2.json();
      if (!d2.error) setDetail(d2);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  if (!requisition) return null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={requisition.reqNumber}
        description={`${requisition.projectName}${requisition.phaseName ? ` · Phase: ${requisition.phaseName}` : ""}`}
        className="max-w-3xl"
      >
        {loading ? (
          <p className="py-10 text-center text-body text-muted-foreground">Loading…</p>
        ) : detail ? (
          <div className="space-y-3">
            {/* Status + meta */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={STATUS_VARIANT[detail.status] ?? "muted"}>{detail.status}</Badge>
              <span className="text-meta text-muted-foreground">
                Requested: {formatDate(detail.requestDate)}
              </span>
              {detail.neededByDate && (
                <span className="text-meta text-muted-foreground">
                  Needed by: {formatDate(detail.neededByDate)}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {detail.status === "DRAFT" && (
                <Button size="sm" onClick={() => doAction("submit")} disabled={acting}>
                  <ArrowRight className="h-4 w-4" /> Submit
                </Button>
              )}
              {detail.status === "SUBMITTED" && (
                <>
                  <Button size="sm" onClick={() => doAction("approve")} disabled={acting}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => doAction("reject")} disabled={acting} className="text-muted-foreground hover:text-danger">
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </>
              )}
              {detail.status === "APPROVED" && (
                <Button size="sm" onClick={() => setConvertOpen(true)}>
                  <ShoppingCart className="h-4 w-4" /> Convert to PO
                </Button>
              )}
              {detail.status === "CONVERTED" && detail.convertedPoId && (
                <a href={`/procurement`} className="inline-flex">
                  <Button size="sm" variant="outline">
                    <FileText className="h-4 w-4" /> View PO
                  </Button>
                </a>
              )}
            </div>

            {/* Line items */}
            <div className="rounded-lg border border-border/60">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Material</TH>
                    <TH className="text-right">Qty Requested</TH>
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
          </div>
        ) : (
          <p className="py-10 text-center text-body text-muted-foreground">Failed to load requisition.</p>
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
