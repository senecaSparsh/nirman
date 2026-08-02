"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, X, Eye } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { PaymentDialog } from "./payment-dialog";
import type { AssetSaleDetail, AssetSaleRow } from "@/lib/types";

const SALE_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  ACTIVE: "success",
  CANCELLED: "danger",
};

const PAYMENT_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PENDING: "muted",
  PARTIAL: "warning",
  PAID: "success",
};

export function SaleDetailDialog({
  open,
  onOpenChange,
  sale,
  permissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: AssetSaleRow | null;
  permissions?: { canCreateSale?: boolean; canManage?: boolean };
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AssetSaleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (open && sale) {
      setLoading(true);
      setDetail(null);
      fetch(`/api/sales/${sale.id}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setDetail(d); })
        .catch(() => toast.error("Failed to load sale details"))
        .finally(() => setLoading(false));
    }
  }, [open, sale]);

  async function cancelSale() {
    if (!sale) return;
    setActing(true);
    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Cancel failed");
      toast.success("Sale cancelled");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  if (!sale) return null;

  // Use detail if loaded, otherwise fall back to the row passed in
  const d: AssetSaleDetail | null = detail;
  const payments = d?.payments ?? [];
  const assetLabel = sale.assetType === "LAND"
    ? `Plot ${sale.landParcelNumber ?? "—"}`
    : `Unit ${sale.builtUnitNumber ?? "—"}${sale.builtUnitType ? ` (${sale.builtUnitType.replace("_", " ")})` : ""}`;
  const canCancel = sale.status === "ACTIVE" && sale.paymentCount === 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={sale.saleNumber}
        description={`${assetLabel} · ${sale.customerName}`}
        className="max-w-2xl"
      >
        {loading ? (
          <p className="py-10 text-center text-body text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            {/* Status badges */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={SALE_STATUS_VARIANT[sale.status] ?? "muted"}>{sale.status}</Badge>
              <Badge variant={PAYMENT_STATUS_VARIANT[sale.paymentStatus] ?? "muted"}>
                {sale.paymentStatus}
              </Badge>
              <span className="text-meta text-muted-foreground">{formatDate(sale.saleDate)}</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {sale.status === "ACTIVE" && sale.balanceDue > 0 && (permissions?.canManage ?? true) && (
                <Button size="sm" onClick={() => setPayOpen(true)}>
                  <Banknote className="h-4 w-4" /> Record Payment
                </Button>
              )}
              {canCancel && (permissions?.canManage ?? true) && (
                <Button size="sm" variant="outline" onClick={cancelSale} disabled={acting} className="text-muted-foreground hover:text-danger">
                  <X className="h-4 w-4" /> Cancel Sale
                </Button>
              )}
            </div>

            {/* Sale summary */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-4 text-body sm:grid-cols-4">
              <div>
                <p className="text-caption text-muted-foreground">Sale Price</p>
                <p className="tnum font-medium">{formatCurrency(sale.salePrice)}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Cost Basis</p>
                <p className="tnum font-medium">{formatCurrency(sale.costBasis)}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Profit</p>
                <p className={`tnum font-medium ${sale.profit >= 0 ? "text-success" : "text-danger"}`}>
                  {formatCurrency(sale.profit)}
                </p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Balance Due</p>
                <p className="tnum font-medium text-warning">{formatCurrency(sale.balanceDue)}</p>
              </div>
            </div>

            {/* Asset + customer info */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 p-3 text-body">
                <p className="mb-1 text-caption font-medium text-muted-foreground">Asset</p>
                <p className="font-medium">{assetLabel}</p>
                {sale.assetArea != null && (
                  <p className="tnum text-muted-foreground">{formatNumber(sale.assetArea)} {sale.assetAreaUnit ?? ""}</p>
                )}
                <p className="text-muted-foreground">{sale.projectName}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 text-body">
                <p className="mb-1 text-caption font-medium text-muted-foreground">Customer</p>
                <p className="font-medium">{sale.customerName}</p>
                {sale.customerPhone && <p className="text-muted-foreground">{sale.customerPhone}</p>}
                {sale.paymentMode && <p className="text-muted-foreground">Mode: {sale.paymentMode.replace("_", " ")}</p>}
              </div>
            </div>

            {/* Payment history */}
            <div className="space-y-2">
              <p className="text-body font-medium">Payment History</p>
              {payments.length > 0 ? (
                <div className="rounded-lg border border-border/60">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Date</TH>
                        <TH className="text-right">Amount</TH>
                        <TH>Mode</TH>
                        <TH>Reference</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {payments.map((p) => (
                        <TR key={p.id}>
                          <TD>{formatDate(p.paymentDate)}</TD>
                          <TD className="tnum text-right font-medium">{formatCurrency(p.amount)}</TD>
                          <TD>{p.mode.replace("_", " ")}</TD>
                          <TD className="text-muted-foreground">{p.reference ?? "—"}</TD>
                          <TD>
                            <Badge variant={p.status === "RECEIVED" ? "success" : "muted"} className="px-1.5 py-0">
                              {p.status}
                            </Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-body text-muted-foreground">
                  No payments recorded yet.
                </p>
              )}
            </div>

            {/* Notes */}
            {sale.notes && (
              <div className="rounded-lg bg-muted/50 p-3 text-body">
                <span className="font-medium">Notes: </span>{sale.notes}
              </div>
            )}
          </div>
        )}
      </Dialog>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} sale={sale} />
    </>
  );
}
