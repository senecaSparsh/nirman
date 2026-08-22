"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2, Printer, CreditCard, SearchX, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { CustomerFormDialog } from "@/components/sales/customer-form-dialog";
import { MaterialFormDialog } from "@/components/materials/material-form-dialog";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { IdentityCell, MoneyCell, DateCell } from "@/components/ui/cells";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { ProjectOption } from "@/lib/types";
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

/** Column definitions for the material sale payment history DataTable. */
const paymentColumns: Column<MaterialSalePaymentRow>[] = [
  {
    key: "amount",
    label: "Amount",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum font-medium text-foreground">{formatCurrency(p.amount)}</span>,
  },
  {
    key: "paymentMode",
    label: "Mode",
    sortable: true,
    render: (p) => <Badge variant="outline">{p.paymentMode}</Badge>,
  },
  {
    key: "paymentDate",
    label: "Date",
    sortable: true,
    sortValue: (p) => new Date(p.paymentDate),
    render: (p) => <span className="tnum text-muted-foreground">{formatDate(p.paymentDate)}</span>,
  },
  {
    key: "referenceNo",
    label: "Reference",
    render: (p) => p.referenceNo ? <span className="text-muted-foreground">{p.referenceNo}</span> : <span className="text-faint">—</span>,
  },
  {
    key: "createdByName",
    label: "By",
    render: (p) => p.createdByName ? <span className="text-muted-foreground">{p.createdByName}</span> : <span className="text-faint">—</span>,
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
  categories,
  projects,
  stockMap,
  permissions,
}: {
  sales: MaterialSaleRow[];
  customers: { id: string; name: string; phone: string | null }[];
  locations: { id: string; name: string; type: string }[];
  materials: { id: string; name: string; unit: string | null }[];
  categories: { id: string; name: string; unit: string }[];
  projects: ProjectOption[];
  stockMap: Record<string, { qty: number; mac: number }>;
  permissions?: { canCreate?: boolean; canCancel?: boolean; canRecordPayment?: boolean };
}) {
  const router = useRouter();
  const canCreate = permissions?.canCreate ?? false;
  const canCancel = permissions?.canCancel ?? false;
  const canRecordPayment = permissions?.canRecordPayment ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MaterialSaleRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<MaterialSaleRow | null>(null);
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
  // Local copies so freshly created masters appear in their dropdowns without
  // waiting for router.refresh.
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [localMaterials, setLocalMaterials] = useState(materials);
  const [localLocations, setLocalLocations] = useState(locations);
  useEffect(() => { setLocalCustomers(customers); }, [customers]);
  useEffect(() => { setLocalMaterials(materials); }, [materials]);
  useEffect(() => { setLocalLocations(locations); }, [locations]);
  const [materialCreateOpen, setMaterialCreateOpen] = useState(false);
  const [locationCreateOpen, setLocationCreateOpen] = useState(false);

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

  // Load payments for a sale when it's opened (only if not already available from server)
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

  function openDetail(sale: MaterialSaleRow) {
    setDetailTarget(sale);
    loadPayments(sale);
  }

  // EditableGrid column definitions for the sale line items
  const materialOptions = useMemo(
    () => localMaterials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit ?? ""})` })),
    [localMaterials],
  );
  const locationOptions = useMemo(
    () => localLocations.map((l) => ({ value: l.id, label: l.name })),
    [localLocations],
  );

  const saleColumns: EditableColumn<LineForm>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: materialOptions,
      placeholder: "Select…",
      width: "1fr",
      createLabel: "material",
    },
    {
      key: "locationId",
      label: "Location",
      type: "select",
      options: locationOptions,
      placeholder: "Select…",
      width: "140px",
      createLabel: "location",
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
          requireGatePass: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create material sale");
      if (data.pending) {
        toast.success(`Gate pass created — awaiting approval`, {
          description: data.message ?? "Items cannot leave the gate until the gate pass is approved.",
          action: { label: "View Gate Passes", onClick: () => router.push("/gate-passes") },
        });
      } else {
        toast.success(`Material sale ${data.saleNumber} created`);
      }
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

  const tableColumns: Column<MaterialSaleRow>[] = [
    {
      key: "saleNumber",
      label: "Sale No.",
      sortable: true,
      width: "140px",
      sortValue: (s) => s.saleNumber,
      render: (s) => (
        <IdentityCell
          name={<span className="font-mono">{s.saleNumber}</span>}
          sub={[
            s.customerName ?? "Unknown",
            `${s.lineCount} item${s.lineCount !== 1 ? "s" : ""}`,
          ].join(" · ")}
        />
      ),
      exportValue: (s) => s.saleNumber,
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
      filterable: true,
      width: "160px",
      render: (s) => s.customerName ?? <span className="text-faint">Unknown</span>,
      filterValue: (s) => s.customerName ?? "Unknown",
      exportValue: (s) => s.customerName ?? "",
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      filterable: true,
      width: "140px",
      render: (s) => s.projectName ?? <span className="text-faint">—</span>,
      filterValue: (s) => s.projectName ?? "—",
      exportValue: (s) => s.projectName ?? "",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (s) => <StatusPill status={s.status} />,
      filterValue: (s) => s.status,
      exportValue: (s) => s.status,
    },
    {
      key: "paymentStatus",
      label: "Payment",
      sortable: true,
      filterable: true,
      render: (s) => (
        <Badge variant={s.paymentStatus === "PAID" ? "success" : s.paymentStatus === "PARTIAL" ? "warning" : "muted"}>
          {s.paymentStatus}
        </Badge>
      ),
      filterValue: (s) => s.paymentStatus,
      exportValue: (s) => s.paymentStatus,
    },
    {
      key: "totalAmount",
      label: "Total",
      align: "right",
      sortable: true,
      render: (s) => <MoneyCell value={s.totalAmount} formatted={formatCurrency(s.totalAmount)} neutral />,
      exportValue: (s) => s.totalAmount,
    },
    {
      key: "grossProfit",
      label: "Profit",
      align: "right",
      sortable: true,
      render: (s) => (
        <MoneyCell
          value={s.grossProfit}
          formatted={`${s.grossProfit >= 0 ? "+" : ""}${formatCurrency(s.grossProfit)}`}
        />
      ),
      exportValue: (s) => s.grossProfit,
    },
    {
      key: "saleDate",
      label: "Date",
      sortable: true,
      render: (s) => <DateCell date={s.saleDate} formatted={formatDate(s.saleDate)} />,
      sortValue: (s) => new Date(s.saleDate),
      exportValue: (s) => s.saleDate,
    },
  ];

  function rowActions(s: MaterialSaleRow) {
    return (
      <>
        {s.status === "PENDING" && (
          <a
            href="/gate-passes"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-1 text-micro font-medium text-warning hover:bg-warning/25"
            title="Awaiting gate pass approval"
          >
            <ShieldCheck className="h-3 w-3" /> Gate Pass
          </a>
        )}
        {s.status === "ACTIVE" && (
          <a
            href={`/print/material-sale/${s.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Print invoice"
            onClick={(e) => e.stopPropagation()}
          >
            <Printer className="h-3.5 w-3.5" />
          </a>
        )}
        {canRecordPayment && s.status === "ACTIVE" && s.paymentStatus !== "PAID" && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setPaymentDialogSale(s); }} title="Record payment">
            <CreditCard className="h-3.5 w-3.5" />
          </Button>
        )}
        {canCancel && s.status === "ACTIVE" && (
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={(e) => { e.stopPropagation(); requestCancelSale(s); }} disabled={submitting} title="Cancel sale">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </>
    );
  }

  const trailingButtons = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus className="h-4 w-4" /> New sale
    </Button>
  ) : null;

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No sales match"
      description="Adjust the search or column filters to see all material sales."
    />
  );

  return (
    <div className="space-y-4">
      {sales.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="No material sales"
          description="Sales will appear here once recorded."
          action={canCreate ? <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New Material Sale</Button> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={sales}
            columns={tableColumns}
            storageKey="material-sales"
            hideable
            exportFileName="material-sales"
            initialSort={{ key: "saleDate", direction: "desc" }}
            onRowClick={(s) => openDetail(s)}
            searchable
            searchPlaceholder="Search sale no, customer, project…"
            toolbarTrailing={trailingButtons}
            showTotals
            sumColumns={["totalAmount", "grossProfit"]}
            totalFormat={(_key, sum) => formatCurrency(sum)}
            rowTone={(s) => {
              if (s.status === "CANCELLED") return "warning";
              if (s.status === "PENDING") return "warning";
              return null;
            }}
            rowActions={rowActions}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Detail dialog */}
      {detailTarget && (
        <MaterialSaleDetailDialog
          sale={detailTarget}
          payments={paymentsBySale[detailTarget.id] ?? detailTarget.payments ?? []}
          paymentsLoading={paymentsLoading === detailTarget.id}
          totalPaid={totalPaid(detailTarget)}
          outstanding={outstandingBalance(detailTarget)}
          onClose={() => setDetailTarget(null)}
          onPrint={() => {}}
          onRecordPayment={() => { setPaymentDialogSale(detailTarget); setDetailTarget(null); }}
          onCancel={() => { requestCancelSale(detailTarget); setDetailTarget(null); }}
          canCancel={canCancel}
          canRecordPayment={canRecordPayment}
          submitting={submitting}
        />
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
            <SelectWithCreate
              value={fCustomer}
              onChange={setFCustomer}
              placeholder="Select customer…"
              createLabel="customer"
              options={localCustomers.map((c) => ({ value: c.id, label: c.phone ? `${c.name} · ${c.phone}` : c.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <CustomerFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalCustomers((p) => [...p, { id: e.id, name: e.label ?? "", phone: null }]); onCreated(e); }} customer={null} />
              )}
            />
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
                onCreateOption={(colKey) => {
                  if (colKey === "materialId") setMaterialCreateOpen(true);
                  else if (colKey === "locationId") setLocationCreateOpen(true);
                }}
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

      {/* Inline material / location creators — opened from a line item's
          "+ Create new …" option. */}
      <MaterialFormDialog
        open={materialCreateOpen}
        onOpenChange={setMaterialCreateOpen}
        categories={categories}
        material={null}
        onCreated={(e) => {
          setLocalMaterials((p) => [...p, { id: e.id, name: e.label ?? "", unit: null }]);
        }}
      />
      <LocationFormDialog
        open={locationCreateOpen}
        onOpenChange={setLocationCreateOpen}
        projects={projects}
        location={null}
        onCreated={(e) => {
          setLocalLocations((p) => [...p, { id: e.id, name: e.label ?? "", type: "COMPANY_WAREHOUSE" }]);
        }}
      />

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

// ───────────────────────────────────────────────────────────
//  Material Sale Detail Dialog
// ───────────────────────────────────────────────────────────

function MaterialSaleDetailDialog({
  sale,
  payments,
  paymentsLoading,
  totalPaid,
  outstanding,
  onClose,
  onPrint,
  onRecordPayment,
  onCancel,
  canCancel,
  canRecordPayment,
  submitting,
}: {
  sale: MaterialSaleRow;
  payments: MaterialSalePaymentRow[];
  paymentsLoading: boolean;
  totalPaid: number;
  outstanding: number;
  onClose: () => void;
  onPrint: () => void;
  onRecordPayment: () => void;
  onCancel: () => void;
  canCancel: boolean;
  canRecordPayment: boolean;
  submitting: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={sale.saleNumber}
      description={`${sale.customerName ?? "Unknown"} · ${formatDate(sale.saleDate)}`}
      className="max-w-2xl"
      action={
        sale.status === "ACTIVE" ? (
          <a
            href={`/print/material-sale/${sale.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </a>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Status + key facts */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={sale.status} />
          <Badge variant={sale.paymentStatus === "PAID" ? "success" : sale.paymentStatus === "PARTIAL" ? "warning" : "muted"}>
            {sale.paymentStatus}
          </Badge>
          <Badge variant="muted">{sale.lineCount} item{sale.lineCount !== 1 ? "s" : ""}</Badge>
        </div>

        {/* Summary card */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-4">
          <div>
            <div className="text-label text-muted-foreground">Subtotal</div>
            <div className="text-body font-semibold tnum">{formatCurrency(sale.subtotal)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">GST</div>
            <div className="text-body font-semibold tnum">{formatCurrency(sale.gstTotal)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">Cost (MAC)</div>
            <div className="text-body font-semibold tnum">{formatCurrency(sale.totalCost)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">Gross Profit</div>
            <div className={cn("text-body font-semibold tnum", sale.grossProfit >= 0 ? "text-success" : "text-danger")}>
              {formatCurrency(sale.grossProfit)}
            </div>
          </div>
        </div>

        {/* Line items table */}
        <div className="space-y-2">
          <div className="text-caption font-medium text-muted-foreground">Line items</div>
          <div className="rounded-lg border border-border overflow-hidden">
            <DataTable data={sale.lines} columns={saleLineColumns} getRowId={(l) => l.id} hideToolbar />
          </div>
        </div>

        {/* Notes */}
        {sale.notes && (
          <div>
            <div className="text-label text-muted-foreground">Notes</div>
            <p className="mt-1 text-body leading-relaxed whitespace-pre-wrap">{sale.notes}</p>
          </div>
        )}

        {/* Payment summary + history */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-body font-medium">Payments</span>
            <div className="text-meta text-muted-foreground">
              Total: <span className="tnum font-medium text-foreground">{formatCurrency(sale.totalAmount)}</span>
              {" · "}
              Paid: <span className="tnum font-medium text-success">{formatCurrency(totalPaid)}</span>
              {" · "}
              Outstanding: <span className="tnum font-medium text-warning">{formatCurrency(outstanding)}</span>
            </div>
          </div>

          {paymentsLoading ? (
            <div className="text-meta text-muted-foreground">Loading payments…</div>
          ) : payments.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <DataTable data={payments} columns={paymentColumns} getRowId={(p) => p.id} hideToolbar />
            </div>
          ) : (
            <div className="text-meta text-muted-foreground">No payments recorded yet.</div>
          )}
        </div>

        {/* Actions */}
        {sale.status === "ACTIVE" && (canRecordPayment || canCancel) && (
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            {canRecordPayment && sale.paymentStatus !== "PAID" && (
              <Button size="sm" variant="outline" onClick={onRecordPayment} disabled={submitting}>
                <CreditCard className="h-3.5 w-3.5" /> Record Payment
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" className="text-danger" onClick={onCancel} disabled={submitting}>
                <Trash2 className="h-3.5 w-3.5" /> Cancel Sale
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
