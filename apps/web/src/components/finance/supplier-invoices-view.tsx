"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, FileText, RefreshCw, Check, X, AlertTriangle, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface SupplierInvoiceRow {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: string;
  gstAmount: string;
  totalAmount: string;
  status: string;
  matchStatus: string | null;
  matchNotes: string | null;
  receivedByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface PoOption {
  id: string;
  poNumber: string;
  supplierId: string;
}

interface MatchVariance {
  line: number;
  field: "quantity" | "unitPrice" | "lineTotal";
  expected: string;
  actual: string;
  variance: string;
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  supplier: { id: string; name: string; gstin: string | null; phone: string | null; email: string | null };
  purchaseOrder: {
    id: string;
    poNumber: string;
    status: string;
    subtotal: string;
    gstTotal: string;
    total: string;
    lines: {
      id: string;
      materialId: string;
      materialName: string;
      materialCode: string;
      unit: string;
      qtyOrdered: string;
      unitCost: string;
      gstRate: string;
      lineTotal: string;
    }[];
    goodsReceipts: {
      id: string;
      receiptDate: string;
      lines: { id: string; materialId: string; materialName: string; qtyReceived: string; unitCost: string }[];
    }[];
  } | null;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: string;
  gstAmount: string;
  totalAmount: string;
  status: string;
  matchStatus: string | null;
  matchNotes: string | null;
  receivedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  matchDetails: { matched: boolean; matchType: string; variances: MatchVariance[] } | null;
}

// ── Match Status Badge ─────────────────────────────────────────────

function MatchStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  switch (status) {
    case "THREE_WAY_MATCH":
      return <Badge variant="success">3-Way Match</Badge>;
    case "TWO_WAY_MATCH":
      return <Badge variant="warning">2-Way Match</Badge>;
    case "MANUAL":
      return <Badge variant="info">Manual</Badge>;
    case "UNMATCHED":
      return <Badge variant="danger">Unmatched</Badge>;
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PENDING":
      return <Badge variant="warning">Pending</Badge>;
    case "MATCHED":
      return <Badge variant="info">Matched</Badge>;
    case "DISPUTED":
      return <Badge variant="danger">Disputed</Badge>;
    case "APPROVED":
      return <Badge variant="success">Approved</Badge>;
    case "PAID":
      return <Badge variant="success">Paid</Badge>;
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}

// ── Main View ──────────────────────────────────────────────────────

export function SupplierInvoicesView({
  suppliers,
  purchaseOrders,
  permissions,
}: {
  suppliers: SupplierOption[];
  purchaseOrders: PoOption[];
  permissions: { canManage: boolean };
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<SupplierInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supplier-invoices");
      const data = await res.json();
      if (res.ok) setInvoices(data);
    } catch {
      toast.error("Failed to load supplier invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  async function openDetail(invoice: SupplierInvoiceRow) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoice.id}`);
      const data = await res.json();
      if (res.ok) setDetail(data);
      else toast.error(data.error ?? "Failed to load invoice details");
    } catch {
      toast.error("Failed to load invoice details");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAction(action: "approve" | "reject") {
    if (!detail) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/supplier-invoices/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(action === "approve" ? "Invoice approved" : "Invoice disputed");
      setDetail(null);
      fetchInvoices();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setActionLoading(false);
    }
  }

  const invoiceColumns: Column<SupplierInvoiceRow>[] = [
    {
      key: "invoiceNumber",
      label: "Invoice #",
      sortable: true,
      render: (r) => <span className="font-medium text-foreground">{r.invoiceNumber}</span>,
      exportValue: (r) => r.invoiceNumber,
    },
    {
      key: "invoiceDate",
      label: "Date",
      sortable: true,
      sortValue: (r) => new Date(r.invoiceDate).getTime(),
      render: (r) => <span className="text-muted-foreground">{formatDate(r.invoiceDate)}</span>,
      exportValue: (r) => formatDate(r.invoiceDate),
    },
    {
      key: "supplierName",
      label: "Supplier",
      sortable: true,
      filterable: true,
      render: (r) => <span className="text-foreground">{r.supplierName}</span>,
      filterValue: (r) => r.supplierName,
      exportValue: (r) => r.supplierName,
    },
    {
      key: "poNumber",
      label: "PO #",
      sortable: true,
      render: (r) =>
        r.poNumber ? <span className="text-muted-foreground">{r.poNumber}</span> : <span className="text-muted-foreground/50">—</span>,
      exportValue: (r) => r.poNumber ?? "",
    },
    {
      key: "totalAmount",
      label: "Amount",
      align: "right",
      sortable: true,
      sortValue: (r) => Number(r.totalAmount),
      render: (r) => <span className="tnum font-medium text-foreground">{formatCurrency(Number(r.totalAmount))}</span>,
      exportValue: (r) => Number(r.totalAmount),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (r) => <StatusBadge status={r.status} />,
      filterValue: (r) => r.status,
      exportValue: (r) => r.status,
    },
    {
      key: "matchStatus",
      label: "Match",
      sortable: true,
      filterable: true,
      render: (r) => <MatchStatusBadge status={r.matchStatus} />,
      filterValue: (r) => r.matchStatus ?? "—",
      exportValue: (r) => r.matchStatus ?? "",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-meta text-muted-foreground">
          Three-way matching: verify invoices against POs and goods receipts before payment.
        </p>
        <Button variant="outline" size="icon" onClick={fetchInvoices} title="Refresh" disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {invoices.length === 0 && !loading ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No supplier invoices"
          description="Create a supplier invoice to run three-way matching against purchase orders and goods receipts."
          action={
            permissions.canManage ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New Invoice
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={invoices}
            columns={invoiceColumns}
            storageKey="supplier-invoices"
            hideable
            exportFileName="supplier-invoices"
            onRowClick={openDetail}
            searchable
            searchPlaceholder="Search by invoice #, supplier, PO #…"
            initialSort={{ key: "invoiceDate", direction: "desc" }}
            toolbarTrailing={
              permissions.canManage ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> New Invoice
                </Button>
              ) : null
            }
            rowTone={(r) => {
              if (r.status === "DISPUTED") return "danger";
              if (r.status === "PENDING") return "warning";
              if (r.matchStatus === "UNMATCHED") return "danger";
              return null;
            }}
            emptyState={
              <EmptyState
                size="compact"
                icon={<SearchX />}
                title="No invoices match"
                description="Adjust the search or column filters to see all invoices."
              />
            }
            pageSize={50}
          />
        </div>
      )}

      {/* ── New Invoice Form Dialog ── */}
      <SupplierInvoiceFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) fetchInvoices();
        }}
        suppliers={suppliers}
        purchaseOrders={purchaseOrders}
      />

      {/* ── Detail Dialog ── */}
      <Dialog
        open={detail !== null || detailLoading}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail ? `Invoice ${detail.invoiceNumber}` : "Loading…"}
        description={detail ? `${detail.supplier.name} · ${formatDate(detail.invoiceDate)}` : undefined}
        className="max-w-2xl"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
        ) : detail ? (
          <InvoiceDetailContent
            detail={detail}
            canManage={permissions.canManage}
            actionLoading={actionLoading}
            onAction={handleAction}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

// ── Invoice Detail Content (match results) ─────────────────────────

function InvoiceDetailContent({
  detail,
  canManage,
  actionLoading,
  onAction,
}: {
  detail: InvoiceDetail;
  canManage: boolean;
  actionLoading: boolean;
  onAction: (action: "approve" | "reject") => void;
}) {
  const canApprove = detail.status === "PENDING" || detail.status === "MATCHED" || detail.status === "DISPUTED";
  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DetailStat label="Subtotal" value={formatCurrency(Number(detail.subtotal))} />
        <DetailStat label="GST" value={formatCurrency(Number(detail.gstAmount))} />
        <DetailStat label="Total" value={formatCurrency(Number(detail.totalAmount))} accent="brand" />
        <div className="space-y-1">
          <p className="text-micro text-muted-foreground">Status</p>
          <StatusBadge status={detail.status} />
        </div>
      </div>

      {/* Match result */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-label font-medium text-foreground">Three-Way Match</span>
          <MatchStatusBadge status={detail.matchStatus} />
        </div>
        {detail.matchDetails && (
          <>
            {detail.matchDetails.matched ? (
              <p className="text-meta text-success flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />
                All lines matched — invoice agrees with PO and goods receipt.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-meta text-danger flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {detail.matchDetails.variances.length} variance(s) found:
                </p>
                <div className="rounded-md bg-muted/40 p-2 space-y-1">
                  {detail.matchDetails.variances.map((v, i) => (
                    <div key={i} className="text-micro text-muted-foreground">
                      <span className="font-medium text-foreground">Line {v.line}</span> · {v.field}: expected{" "}
                      <span className="tnum">{v.expected}</span>, actual <span className="tnum">{v.actual}</span>{" "}
                      (variance <span className="tnum text-danger">{v.variance}</span>)
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {!detail.matchDetails && (
          <p className="text-meta text-muted-foreground">
            No purchase order linked — match not run. This invoice requires manual review.
          </p>
        )}
        {detail.matchNotes && (
          <p className="text-micro text-muted-foreground border-t border-border pt-2">{detail.matchNotes}</p>
        )}
      </div>

      {/* PO + GRN details */}
      {detail.purchaseOrder && (
        <div className="space-y-2">
          <p className="text-label font-medium text-foreground">
            PO {detail.purchaseOrder.poNumber}{" "}
            <Badge variant="muted" className="ml-1">{detail.purchaseOrder.status}</Badge>
          </p>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-meta">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Material</th>
                  <th className="px-2 py-1.5 text-right font-medium">Ordered</th>
                  <th className="px-2 py-1.5 text-right font-medium">Received</th>
                  <th className="px-2 py-1.5 text-right font-medium">Unit Cost</th>
                </tr>
              </thead>
              <tbody>
                {detail.purchaseOrder.lines.map((l) => {
                  const received = detail.purchaseOrder!.goodsReceipts
                    .flatMap((gr) => gr.lines)
                    .filter((gl) => gl.materialId === l.materialId)
                    .reduce((s, gl) => s + Number(gl.qtyReceived), 0);
                  return (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-2 py-1.5 text-foreground">{l.materialName}</td>
                      <td className="px-2 py-1.5 text-right tnum">{l.qtyOrdered}</td>
                      <td className="px-2 py-1.5 text-right tnum">{received.toFixed(3)}</td>
                      <td className="px-2 py-1.5 text-right tnum">{formatCurrency(Number(l.unitCost))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval info */}
      {detail.approvedBy && (
        <p className="text-micro text-muted-foreground">
          Approved by {detail.approvedBy.name}
          {detail.approvedAt ? ` on ${formatDate(detail.approvedAt)}` : ""}
        </p>
      )}

      {/* Actions */}
      {canManage && canApprove && (
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAction("reject")}
            disabled={actionLoading}
          >
            <X className="h-3.5 w-3.5" /> Dispute
          </Button>
          <Button size="sm" onClick={() => onAction("approve")} disabled={actionLoading}>
            <Check className="h-3.5 w-3.5" /> Approve
          </Button>
        </div>
      )}
    </div>
  );
}

function DetailStat({ label, value, accent }: { label: string; value: string; accent?: "brand" }) {
  return (
    <div className="space-y-1">
      <p className="text-micro text-muted-foreground">{label}</p>
      <p className={`text-body font-semibold tnum ${accent === "brand" ? "text-brand" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

// ── New Invoice Form Dialog ────────────────────────────────────────

function SupplierInvoiceFormDialog({
  open,
  onOpenChange,
  suppliers,
  purchaseOrders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierOption[];
  purchaseOrders: PoOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    invoiceNumber: "",
    supplierId: "",
    purchaseOrderId: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    subtotal: "",
    gstAmount: "",
    totalAmount: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        invoiceNumber: "",
        supplierId: "",
        purchaseOrderId: "",
        invoiceDate: new Date().toISOString().slice(0, 10),
        dueDate: "",
        subtotal: "",
        gstAmount: "",
        totalAmount: "",
      });
    }
  }, [open]);

  // Filter POs by selected supplier
  const filteredPos = form.supplierId
    ? purchaseOrders.filter((p) => p.supplierId === form.supplierId)
    : purchaseOrders;

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.invoiceNumber.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    if (!form.supplierId) {
      toast.error("Supplier is required");
      return;
    }
    const subtotal = Number(form.subtotal);
    const totalAmount = Number(form.totalAmount || form.subtotal);
    if (Number.isNaN(subtotal) || subtotal < 0) {
      toast.error("Subtotal must be a valid number >= 0");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        invoiceNumber: form.invoiceNumber.trim(),
        supplierId: form.supplierId,
        invoiceDate: form.invoiceDate,
        subtotal,
        totalAmount,
      };
      if (form.purchaseOrderId) payload.purchaseOrderId = form.purchaseOrderId;
      if (form.dueDate) payload.dueDate = form.dueDate;
      if (form.gstAmount) payload.gstAmount = Number(form.gstAmount);

      const res = await fetch("/api/supplier-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create invoice");
      toast.success("Supplier invoice created");
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Supplier Invoice"
      description="Record a supplier invoice and run three-way matching against the linked purchase order."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="si-number">Invoice # *</Label>
            <Input
              id="si-number"
              value={form.invoiceNumber}
              onChange={(e) => set("invoiceNumber", e.target.value)}
              placeholder="e.g. INV-2024-001"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-date">Invoice Date *</Label>
            <Input
              id="si-date"
              type="date"
              value={form.invoiceDate}
              onChange={(e) => set("invoiceDate", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="si-supplier">Supplier *</Label>
          <Select
            id="si-supplier"
            value={form.supplierId}
            onChange={(e) => {
              set("supplierId", e.target.value);
              set("purchaseOrderId", ""); // reset PO when supplier changes
            }}
            required
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="si-po">Purchase Order (optional)</Label>
          <Select
            id="si-po"
            value={form.purchaseOrderId}
            onChange={(e) => set("purchaseOrderId", e.target.value)}
            disabled={!form.supplierId}
          >
            <option value="">No PO (manual match)</option>
            {filteredPos.map((p) => (
              <option key={p.id} value={p.id}>{p.poNumber}</option>
            ))}
          </Select>
          {form.supplierId && filteredPos.length === 0 && (
            <p className="text-micro text-muted-foreground">No purchase orders for this supplier.</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="si-subtotal">Subtotal *</Label>
            <Input
              id="si-subtotal"
              type="number"
              min="0"
              step="0.01"
              value={form.subtotal}
              onChange={(e) => set("subtotal", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-gst">GST Amount</Label>
            <Input
              id="si-gst"
              type="number"
              min="0"
              step="0.01"
              value={form.gstAmount}
              onChange={(e) => set("gstAmount", e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-total">Total *</Label>
            <Input
              id="si-total"
              type="number"
              min="0"
              step="0.01"
              value={form.totalAmount}
              onChange={(e) => set("totalAmount", e.target.value)}
              placeholder={form.subtotal || "0"}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="si-due">Due Date</Label>
          <Input
            id="si-due"
            type="date"
            value={form.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create Invoice"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
