"use client";

import { useMemo } from "react";
import { Phone, Mail, MapPin, FileText, Building2, ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AssetSaleRow, CustomerRow } from "@/lib/types";

/**
 * Customer detail dialog — shows the customer's contact info, all their
 * sales (with BBA/payment status), and total outstanding. Clicking a sale
 * opens the sale detail dialog.
 */
export function CustomerDetailDialog({
  customer,
  sales,
  open,
  onOpenChange,
  onSelectSale,
}: {
  customer: CustomerRow | null;
  sales: AssetSaleRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectSale?: (sale: AssetSaleRow) => void;
}) {
  const customerSales = useMemo(
    () => sales.filter((s) => s.customerId === customer?.id && s.status !== "CANCELLED"),
    [sales, customer],
  );

  const totals = useMemo(() => {
    const totalValue = customerSales.reduce((s, x) => s + x.salePrice + x.gstAmount, 0);
    const totalPaid = customerSales.reduce((s, x) => s + x.totalPaid, 0);
    const outstanding = customerSales.reduce((s, x) => s + x.balanceDue, 0);
    const bbaDone = customerSales.filter((s) => s.bbaNo).length;
    const bbaPending = customerSales.filter((s) => !s.bbaNo).length;
    return { totalValue, totalPaid, outstanding, bbaDone, bbaPending };
  }, [customerSales]);

  if (!customer) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer.name}
      description={`${customer.activeSales} active sale${customer.activeSales !== 1 ? "s" : ""} · ${formatCurrency(totals.totalValue)} total value`}
      size="lg"
    >
      {/* Contact info */}
      <div className="grid grid-cols-2 gap-3 text-caption">
        {customer.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <a href={`tel:${customer.phone}`} className="text-foreground hover:underline">{customer.phone}</a>
          </div>
        )}
        {customer.email && (
          <div className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <a href={`mailto:${customer.email}`} className="text-foreground hover:underline truncate">{customer.email}</a>
          </div>
        )}
        {customer.gstin && (
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-foreground">{customer.gstin}</span>
          </div>
        )}
        {customer.address && (
          <div className="flex items-center gap-1.5 col-span-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-foreground">{customer.address}</span>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-micro text-muted-foreground">Total Value</div>
          <div className="text-body font-semibold tnum text-foreground">{formatCurrency(totals.totalValue)}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-micro text-muted-foreground">Collected</div>
          <div className="text-body font-semibold tnum text-success">{formatCurrency(totals.totalPaid)}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-micro text-muted-foreground">Outstanding</div>
          <div className={`text-body font-semibold tnum ${totals.outstanding > 0 ? "text-warning" : "text-foreground"}`}>
            {formatCurrency(totals.outstanding)}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-micro text-muted-foreground">BBA</div>
          <div className="text-body font-semibold tnum text-foreground">
            <span className="text-success">{totals.bbaDone}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-warning">{totals.bbaPending}</span>
            <span className="text-muted-foreground text-micro"> done</span>
          </div>
        </div>
      </div>

      {/* Sales list */}
      <div className="space-y-2">
        <h4 className="text-label font-semibold text-foreground">Sales ({customerSales.length})</h4>
        {customerSales.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-caption text-muted-foreground">
            No active sales for this customer.
          </p>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {customerSales.map((sale) => {
              const grandTotal = sale.salePrice + sale.gstAmount;
              const paidPct = grandTotal > 0 ? Math.round((sale.totalPaid / grandTotal) * 100) : 0;
              const assetLabel = sale.builtUnitNumber
                ? `Unit ${sale.builtUnitNumber}`
                : sale.landParcelNumber
                  ? `Parcel ${sale.landParcelNumber}`
                  : sale.assetType;
              return (
                <button
                  key={sale.id}
                  onClick={() => {
                    if (onSelectSale) onSelectSale(sale);
                    onOpenChange(false);
                  }}
                  className="group flex w-full items-center gap-3 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/30"
                >
                  {/* Asset + sale number */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate text-body font-medium text-foreground">{assetLabel}</span>
                      <span className="text-micro text-muted-foreground">· {sale.projectName ?? "No project"}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-micro text-muted-foreground">
                      <span className="font-mono">{sale.saleNumber}</span>
                      <span>· {formatDate(sale.saleDate)}</span>
                    </div>
                  </div>

                  {/* BBA badge */}
                  {sale.bbaNo ? (
                    <Badge variant="success" className="shrink-0 text-micro">BBA</Badge>
                  ) : (
                    <Badge variant="warning" className="shrink-0 text-micro">BBA pending</Badge>
                  )}

                  {/* Amount + paid % */}
                  <div className="shrink-0 text-right">
                    <div className="text-body font-semibold tnum text-foreground">{formatCurrency(grandTotal)}</div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${paidPct === 100 ? "bg-success" : paidPct > 0 ? "bg-brand" : "bg-muted-foreground/20"}`}
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                      <span className="text-micro tnum text-muted-foreground">{paidPct}%</span>
                    </div>
                  </div>

                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
