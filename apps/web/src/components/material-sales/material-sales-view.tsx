"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2, ChevronDown, ChevronRight, Printer, CreditCard, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { MaterialSalePaymentFormDialog } from "./material-sale-payment-form-dialog";

/** Column definitions for the material sale line items DataTable. */
const saleLineColumns: Column<MaterialSaleRow["lines"][number]>[] = [
  {
    key: "materialName",
    label: "Material",
    sortable: true,
    render: (l) => (
      <span className="font-medium text-foreground">
        {l.materialName} <span className="text-muted-foreground">/{l.materialUnit}</span>
      </span>
    ),
  },
  {
    key: "locationName",
    label: "Location",
    sortable: true,
    render: (l) => <span className="text-muted-foreground">{l.locationName}</span>,
  },
  {
    key: "qty",
    label: "Qty",
    align: "right",
    sortable: true,
    render: (l) => <span className="tnum">{l.qty}</span>,
  },
  {
    key: "unitPrice",
    label: "Unit Price",
    align: "right",
    sortable: true,
    render: (l) => <span className="tnum">{formatCurrency(l.unitPrice)}</span>,
  },
  {
    key: "gstAmount",
    label: "GST",
    align: "right",
    render: (l) => (
      <span className="tnum">
        {formatCurrency(l.gstAmount)} <span className="text-muted-foreground">({l.gstRate}%)</span>
      </span>
    ),
  },
  {
    key: "lineTotal",
    label: "Line Total",
    align: "right",
    sortable: true,
    render: (l) => <span className="tnum font-medium">{formatCurrency(l.lineTotal)}</span>,
  },
];

export type MaterialSaleRow = {
  id: string;
  saleNumber: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  projectId: string | null;
  projectName: string | null;
  saleDate: string;
  subtotal: number;
  gstTotal: number;
  totalAmount: number;
  totalCost: number;
  grossProfit: number;
  status: string;
  paymentStatus: string;
  paymentMode: string | null;
  notes: string | null;
  lineCount: number;
  payments?: MaterialSalePaymentRow[];
  lines: {
    id: string;
    materialId: string;
    materialName: string | null;
    materialUnit: string | null;
    locationId: string;
    locationName: string | null;
    qty: number;
    unitPrice: number;
    unitCost: number;
    gstRate: number;
    gstAmount: number;
    lineTotal: number;
  }[];
};

export type MaterialSalePaymentRow = {
  id: string;
  saleId: string;
  amount: number;
  paymentDate: string;
  paymentMode: string;
  referenceNo: string | null;
  notes: string | null;
  createdByName: string | null;
};

type LineForm = {
  key: string;
  materialId: string;
  locationId: string;
  qty: string;
  unitPrice: string;
  gstRate: string;
};

export function MaterialSalesView({
  sales,
  customers,
  locations,
  materials,
  stockMap,
  permissions,
}: {
  sales: MaterialSaleRow[];
  customers: { id: string; name: string; phone: string | null }[];
  locations: { id: string; name: string; type: string }[];
  materials: { id: string; name: string; unit: string | null }[];
  stockMap: Record<string, { qty: number; mac: number }>;
  permissions?: { canCreate?: boolean; canCancel?: boolean; canRecordPayment?: boolean };
}) {
  const router = useRouter();
  const canCreate = permissions?.canCreate ?? true;
  const canCancel = permissions?.canCancel ?? true;
  const canRecordPayment = permissions?.canRecordPayment ?? true;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MaterialSaleRow | null>(null);
  const [paymentDialogSale, setPaymentDialogSale] = useState<MaterialSaleRow | null>(null);
  const [paymentsBySale, setPaymentsBySale] = useState<Record<string, MaterialSalePaymentRow[]>>({});
  const [paymentsLoading, setPaymentsLoading] = useState<string | null>(null);

  // Form state
  const [fCustomer, setFCustomer] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fPaymentMode, setFPaymentMode] = useState("BANK");
  const [lines, setLines] = useState<LineForm[]>([
    { key: crypto.randomUUID(), materialId: "", locationId: "", qty: "", unitPrice: "", gstRate: "0" },
  ]);

  function addLine() {
    setLines([...lines, { key: crypto.randomUUID(), materialId: "", locationId: "", qty: "", unitPrice: "", gstRate: "0" }]);
  }

  // Compute live totals for the form
  const formTotals = useMemo(() => {
    let subtotal = 0;
    let gstTotal = 0;
    for (const l of lines) {
      const qty = Number(l.qty) || 0;
      const price = Number(l.unitPrice) || 0;
      const gstRate = Number(l.gstRate) || 0;
      const lineSub = qty * price;
      const lineGst = (lineSub * gstRate) / 100;
      subtotal += lineSub;
      gstTotal += lineGst;
    }
    return { subtotal, gstTotal, total: subtotal + gstTotal };
  }, [lines]);

  // Check stock availability for a line
  function stockAvailable(materialId: string, locationId: string): number {
    if (!materialId || !locationId) return 0;
    return stockMap[`${locationId}|${materialId}`]?.qty ?? 0;
  }

  function macFor(materialId: string, locationId: string): number {
    if (!materialId || !locationId) return 0;
    return stockMap[`${locationId}|${materialId}`]?.mac ?? 0;
  }

  // Compute total paid for a sale from loaded payments (or server-provided ones)
  function totalPaid(sale: MaterialSaleRow): number {
    const payments = paymentsBySale[sale.id] ?? sale.payments ?? [];
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }

  // Outstanding balance = totalAmount - totalPaid
  function outstandingBalance(sale: MaterialSaleRow): number {
    const paid = totalPaid(sale);
    return Math.max(0, sale.totalAmount - paid);
  }

  // Load payments for a sale when it's expanded (only if not already available from server)
  async function loadPayments(sale: MaterialSaleRow) {
    if (paymentsBySale[sale.id] || paymentsLoading === sale.id) return;
    // If server already provided payments, seed them into state
    if (sale.payments && sale.payments.length > 0) {
      setPaymentsBySale((prev) => ({ ...prev, [sale.id]: sale.payments! }));
      return;
    }
    setPaymentsLoading(sale.id);
    try {
      const res = await fetch(`/api/material-sales/${sale.id}/payments`);
      if (!res.ok) return;
      const data = await res.json();
      setPaymentsBySale((prev) => ({ ...prev, [sale.id]: data }));
    } catch {
      // silently ignore — payments section just won't show
    } finally {
      setPaymentsLoading(null);
    }
  }

  // Toggle expansion and load payments on expand
  function toggleExpand(sale: MaterialSaleRow) {
    if (expanded === sale.id) {
      setExpanded(null);
    } else {
      setExpanded(sale.id);
      loadPayments(sale);
    }
  }

  // EditableGrid column definitions for the sale line items
  const materialOptions = useMemo(
    () => materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit ?? ""})` })),
    [materials],
  );
  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: l.id, label: l.name })),
    [locations],
  );

  const saleColumns: EditableColumn<LineForm>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: materialOptions,
      placeholder: "Select…",
      width: "1fr",
    },
    {
      key: "locationId",
      label: "Location",
      type: "select",
      options: locationOptions,
      placeholder: "Select…",
      width: "140px",
    },
    {
      key: "qty",
      label: "Qty",
      type: "number",
      align: "right",
      step: "any",
      min: 0,
      placeholder: "0",
      width: "90px",
      format: (v) => v ? String(v) : "",
    },
    {
      key: "unitPrice",
      label: "Unit Price (₹)",
      type: "number",
      align: "right",
      step: "0.01",
      min: 0,
      placeholder: "0",
      width: "110px",
      format: (v) => v ? formatCurrency(Number(v)) : "",
    },
    {
      key: "gstRate",
      label: "GST %",
      type: "number",
      align: "right",
      step: "0.01",
      min: 0,
      placeholder: "0",
      width: "80px",
      format: (v) => v ? `${v}%` : "",
    },
    {
      key: "lineTotal",
      label: "Amount",
      type: "computed",
      align: "right",
      compute: (r) => (Number(r.qty) || 0) * (Number(r.unitPrice) || 0),
      format: (v) => formatCurrency(v as number),
    },
  ], [materialOptions, locationOptions]);

  async function submit() {
    if (!fCustomer) return toast.error("Select a customer");
    if (lines.length === 0) return toast.error("At least one line item is required");

    // Validate lines
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.materialId) return toast.error(`Line ${i + 1}: select a material`);
      if (!l.locationId) return toast.error(`Line ${i + 1}: select a location`);
      if (!l.qty || Number(l.qty) <= 0) return toast.error(`Line ${i + 1}: quantity must be > 0`);
      if (!l.unitPrice || Number(l.unitPrice) <= 0) return toast.error(`Line ${i + 1}: unit price must be > 0`);
      const avail = stockAvailable(l.materialId, l.locationId);
      if (Number(l.qty) > avail) {
        return toast.error(`Line ${i + 1}: insufficient stock (${avail} available)`);
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/material-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: fCustomer,
          lines: lines.map((l) => ({
            materialId: l.materialId,
            locationId: l.locationId,
            qty: Number(l.qty),
            unitPrice: Number(l.unitPrice),
            gstRate: Number(l.gstRate) || 0,
          })),
          paymentMode: fPaymentMode,
          notes: fNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create material sale");
      toast.success(`Material sale ${data.saleNumber} created`);
      setFormOpen(false);
      setFCustomer(""); setFNotes(""); setFPaymentMode("BANK");
      setLines([{ key: crypto.randomUUID(), materialId: "", locationId: "", qty: "", unitPrice: "", gstRate: "0" }]);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function requestCancelSale(sale: MaterialSaleRow) {
    setCancelTarget(sale);
    setConfirmCancelOpen(true);
  }

  async function confirmCancelSale() {
    if (!cancelTarget) return;
    const sale = cancelTarget;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/material-sales/${sale.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel");
      toast.success("Material sale cancelled");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
      setCancelTarget(null);
    }
  }

  const totalRevenue = sales.filter((s) => s.status === "ACTIVE").reduce((sum, s) => sum + s.subtotal, 0);
  const totalProfit = sales.filter((s) => s.status === "ACTIVE").reduce((sum, s) => sum + s.grossProfit, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">
          {sales.length} sale{sales.length !== 1 ? "s" : ""} · {formatCurrency(totalRevenue)} revenue · {formatCurrency(totalProfit)} profit
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadCSV("material-sales.csv", sales as unknown as Record<string, unknown>[], [
              { key: "saleNumber", label: "Sale No" },
              { key: "saleDate", label: "Date", format: (v) => formatDate(v as string) },
              { key: "customerName", label: "Customer" },
              { key: "projectName", label: "Project" },
              { key: "subtotal", label: "Subtotal", format: (v) => formatCurrency(v as number) },
              { key: "gstTotal", label: "GST", format: (v) => formatCurrency(v as number) },
              { key: "totalAmount", label: "Total", format: (v) => formatCurrency(v as number) },
              { key: "totalCost", label: "Cost", format: (v) => formatCurrency(v as number) },
              { key: "grossProfit", label: "Profit", format: (v) => formatCurrency(v as number) },
              { key: "status", label: "Status" },
              { key: "paymentStatus", label: "Payment Status" },
            ])
          }
          title="Export CSV"
        >
          <Download className="mr-1 h-3.5 w-3.5" /> Export
        </Button>
        {canCreate && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Material Sale
          </Button>
        )}
      </div>

      {/* List */}
      {sales.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="No material sales"
          description="Sales will appear here once recorded."
          action={canCreate ? <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New Material Sale</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {sales.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => toggleExpand(s)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/20"
              >
                {expanded === s.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{s.saleNumber}</span>
                    <Badge variant="outline">{s.customerName ?? "Unknown"}</Badge>
                    <StatusPill status={s.status} />
                    <Badge
                      variant={s.paymentStatus === "PAID" ? "success" : s.paymentStatus === "PARTIAL" ? "warning" : "muted"}
                    >
                      {s.paymentStatus}
                    </Badge>
                    <Badge variant="muted">{s.lineCount} item{s.lineCount !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="text-meta text-muted-foreground">
                    {formatDate(s.saleDate)} · {s.lines.map((l) => l.materialName).filter(Boolean).slice(0, 3).join(", ")}
                    {s.lines.length > 3 && ` +${s.lines.length - 3} more`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-body font-medium text-foreground">{formatCurrency(s.totalAmount)}</div>
                  <div className="text-caption text-muted-foreground">
                    profit: <span className={s.grossProfit >= 0 ? "text-success" : "text-danger"}>{formatCurrency(s.grossProfit)}</span>
                  </div>
                </div>
              </button>

              {expanded === s.id && (
                <div className="border-t border-border p-3 space-y-3">
                  {/* Line items */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <DataTable data={s.lines} columns={saleLineColumns} getRowId={(l) => l.id} />
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-3 text-meta sm:grid-cols-4">
                    <div><div className="text-muted-foreground">Subtotal</div><div className="text-foreground">{formatCurrency(s.subtotal)}</div></div>
                    <div><div className="text-muted-foreground">GST</div><div className="text-foreground">{formatCurrency(s.gstTotal)}</div></div>
                    <div><div className="text-muted-foreground">Cost (MAC)</div><div className="text-foreground">{formatCurrency(s.totalCost)}</div></div>
                    <div><div className="text-muted-foreground">Gross Profit</div><div className={s.grossProfit >= 0 ? "text-success" : "text-danger"}>{formatCurrency(s.grossProfit)}</div></div>
                  </div>

                  {s.notes && <div className="text-body text-muted-foreground">&quot;{s.notes}&quot;</div>}

                  {/* Payment summary + history */}
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-body font-medium">Payments</span>
                      <div className="text-meta text-muted-foreground">
                        Total: <span className="tnum font-medium text-foreground">{formatCurrency(s.totalAmount)}</span>
                        {" · "}
                        Paid: <span className="tnum font-medium text-success">{formatCurrency(totalPaid(s))}</span>
                        {" · "}
                        Outstanding: <span className="tnum font-medium text-warning">{formatCurrency(outstandingBalance(s))}</span>
                      </div>
                    </div>

                    {paymentsLoading === s.id ? (
                      <div className="text-meta text-muted-foreground">Loading payments…</div>
                    ) : (paymentsBySale[s.id] ?? []).length > 0 ? (
                      <div className="space-y-1">
                        {(paymentsBySale[s.id] ?? []).map((p) => (
                          <div key={p.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-meta">
                            <div className="flex items-center gap-3">
                              <span className="tnum font-medium text-foreground">{formatCurrency(p.amount)}</span>
                              <Badge variant="outline">{p.paymentMode}</Badge>
                              <span className="text-muted-foreground">{formatDate(p.paymentDate)}</span>
                              {p.referenceNo && <span className="text-muted-foreground">Ref: {p.referenceNo}</span>}
                              {p.notes && <span className="text-muted-foreground italic">{p.notes}</span>}
                            </div>
                            {p.createdByName && <span className="text-muted-foreground">by {p.createdByName}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-meta text-muted-foreground">No payments recorded yet.</div>
                    )}
                  </div>

                  {s.status === "ACTIVE" && (
                    <div className="flex items-center gap-2">
                      <a
                        href={`/print/material-sale/${s.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body font-medium text-foreground transition-colors hover:bg-accent"
                        title="Print invoice"
                      >
                        <Printer className="h-3.5 w-3.5" /> Print
                      </a>
                      {canRecordPayment && s.paymentStatus !== "PAID" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPaymentDialogSale(s)}
                          disabled={submitting}
                        >
                          <CreditCard className="mr-1 h-3.5 w-3.5" /> Record Payment
                        </Button>
                      )}
                      {canCancel && (
                        <Button size="sm" variant="outline" onClick={() => requestCancelSale(s)} disabled={submitting}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Cancel Sale
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) {
            setFCustomer(""); setFNotes(""); setFPaymentMode("BANK");
            setLines([{ key: crypto.randomUUID(), materialId: "", locationId: "", qty: "", unitPrice: "", gstRate: "0" }]);
          }
        }}
        title="New Material Sale"
        description="Sell inventory items to a customer. Stock is relieved at MAC; revenue + GST are posted to the GL."
      >
        <div className="space-y-3">
          <div>
            <Label>Customer *</Label>
            <Select value={fCustomer} onChange={(e) => setFCustomer(e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
              ))}
            </Select>
          </div>

          {/* Line items — editable grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <EditableGrid
                rows={lines}
                onChange={setLines}
                columns={saleColumns}
                getRowId={(r) => r.key}
                sumColumns={["qty", "lineTotal"]}
                className="max-h-[40vh]"
              />
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-md bg-muted/30 p-3 text-meta">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(formTotals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>{formatCurrency(formTotals.gstTotal)}</span></div>
            <div className="flex justify-between font-medium"><span>Total</span><span>{formatCurrency(formTotals.total)}</span></div>
          </div>

          <div>
            <Label>Payment mode</Label>
            <Select value={fPaymentMode} onChange={(e) => setFPaymentMode(e.target.value)}>
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Creating…" : "Create Sale"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title={`Cancel material sale ${cancelTarget?.saleNumber ?? ""}?`}
        description="Stock will be returned and GL entries reversed."
        confirmLabel="Cancel Sale"
        onConfirm={confirmCancelSale}
      />

      {paymentDialogSale && (
        <MaterialSalePaymentFormDialog
          open={!!paymentDialogSale}
          onOpenChange={(o) => { if (!o) setPaymentDialogSale(null); }}
          saleId={paymentDialogSale.id}
          saleNumber={paymentDialogSale.saleNumber}
          totalAmount={paymentDialogSale.totalAmount}
          outstandingBalance={outstandingBalance(paymentDialogSale)}
        />
      )}
    </div>
  );
}
