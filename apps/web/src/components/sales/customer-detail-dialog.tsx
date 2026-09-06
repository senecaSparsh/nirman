"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, Mail, MapPin, FileText, Building2, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AttachmentList } from "@/components/attachments/attachment-list";
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
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

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

  async function handleDelete() {
    if (!customer) return;
    if (!window.confirm(`Delete customer "${customer.name}"?`)) return;
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to delete customer");
      toast.success("Customer deleted");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete customer");
    }
  }

  if (!customer) return null;

  return (
    <>
      <Dialog
        open={open && !editOpen}
        onOpenChange={onOpenChange}
        title={customer.name}
        description={`${customer.activeSales} active sale${customer.activeSales !== 1 ? "s" : ""} · ${formatCurrency(totals.totalValue)} total value`}
        size="lg"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={handleDelete}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
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

        <AttachmentList entityType="Customer" entityId={customer.id} />
      </Dialog>

      {editOpen && customer && (
        <EditCustomerDialog
          customer={customer}
          open={editOpen}
          onOpenChange={setEditOpen}
          onDone={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function EditCustomerDialog({
  customer,
  open,
  onOpenChange,
  onDone,
}: {
  customer: CustomerRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    gstin: customer.gstin ?? "",
    address: customer.address ?? "",
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          gstin: form.gstin.trim() || null,
          address: form.address.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to update customer");
      toast.success("Customer updated");
      onOpenChange(false);
      onDone();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update customer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${customer.name}`}
      description="Update customer contact details."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="customer-name">Name *</Label>
          <Input
            id="customer-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customer-phone">Phone</Label>
            <Input
              id="customer-phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@example.com"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-gstin">GSTIN</Label>
          <Input
            id="customer-gstin"
            value={form.gstin}
            onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
            placeholder="22AAAAA0000A1Z5"
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-address">Address</Label>
          <Input
            id="customer-address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Billing address"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
