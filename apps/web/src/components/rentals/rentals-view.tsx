"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Play, Square, Banknote, Pencil, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { IdentityCell, MoneyCell, DateCell } from "@/components/ui/cells";
import { StatusPill } from "@/components/page";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { CustomerFormDialog } from "@/components/sales/customer-form-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

/** Column definitions for the rental payment history DataTable. */
const paymentColumns: Column<TenancyRow["payments"][number]>[] = [
  {
    key: "amount",
    label: "Amount",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum font-medium text-foreground">{formatCurrency(p.amount)}</span>,
  },
  {
    key: "mode",
    label: "Mode",
    sortable: true,
    render: (p) => (
      <span className="text-muted-foreground">{p.mode}{p.reference ? ` · ${p.reference}` : ""}</span>
    ),
  },
  {
    key: "paymentDate",
    label: "Date",
    sortable: true,
    sortValue: (p) => new Date(p.paymentDate),
    render: (p) => <span className="tnum text-muted-foreground">{formatDate(p.paymentDate)}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (p) => <StatusPill status={p.status} />,
  },
];

export type TenancyRow = {
  id: string;
  assetType: string;
  landParcelId: string | null;
  builtUnitId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  projectId: string | null;
  projectName: string | null;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  securityDeposit: number;
  rentAgreementNo: string | null;
  status: string;
  notes: string | null;
  totalReceived: number;
  paymentCount: number;
  payments: {
    id: string;
    amount: number;
    paymentDate: string;
    dueDate: string;
    mode: string;
    reference: string | null;
    status: string;
  }[];
};

function tenancyStatusPill(status: string) {
  // TERMINATED isn't in the shared status map; map it to CANCELLED (bad/red)
  // to preserve the original danger styling.
  return <StatusPill status={status === "TERMINATED" ? "CANCELLED" : status} />;
}

export function RentalsView({
  tenancies,
  landParcels,
  builtUnits,
  customers,
  permissions,
}: {
  tenancies: TenancyRow[];
  landParcels: { id: string; label: string; projectId: string | null }[];
  builtUnits: { id: string; label: string; projectId: string | null }[];
  customers: { id: string; name: string; phone: string | null }[];
  projects?: { id: string; name: string }[];
  permissions?: { canManage?: boolean; canTerminate?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? false;
  const canTerminate = permissions?.canTerminate ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<TenancyRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<TenancyRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmTerminateOpen, setConfirmTerminateOpen] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState<TenancyRow | null>(null);
  const [editTarget, setEditTarget] = useState<TenancyRow | null>(null);

  // Edit form state
  const [eTenantName, setETenantName] = useState("");
  const [eTenantPhone, setETenantPhone] = useState("");
  const [eCustomer, setECustomer] = useState("");
  const [eStart, setEStart] = useState("");
  const [eEnd, setEEnd] = useState("");
  const [eRent, setERent] = useState("");
  const [eDeposit, setEDeposit] = useState("");
  const [eAgreementNo, setEAgreementNo] = useState("");
  const [eNotes, setENotes] = useState("");

  // Form state
  const [fAssetType, setFAssetType] = useState<"LAND" | "BUILT_UNIT">("BUILT_UNIT");
  const [fAssetId, setFAssetId] = useState("");
  const [fCustomer, setFCustomer] = useState("");
  const [fTenantName, setFTenantName] = useState("");
  const [fTenantPhone, setFTenantPhone] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fRent, setFRent] = useState("");
  const [fDeposit, setFDeposit] = useState("");
  const [fAgreementNo, setFAgreementNo] = useState("");
  const [fNotes, setFNotes] = useState("");

  // Payment form
  const [pAmount, setPAmount] = useState("");
  const [pMode, setPMode] = useState("BANK");
  const [pDate, setPDate] = useState("");
  const [pRef, setPRef] = useState("");

  // Local copy of customers so freshly created ones appear without a refresh
  const [localCustomers, setLocalCustomers] = useState(customers);
  useEffect(() => { setLocalCustomers(customers); }, [customers]);

  const assets = fAssetType === "LAND" ? landParcels : builtUnits;

  async function submitTenancy() {
    if (!fAssetId) return toast.error("Select an asset to rent");
    if (!fTenantName.trim()) return toast.error("Tenant name is required");
    if (!fStart || !fEnd) return toast.error("Start and end dates are required");
    if (!fRent || Number(fRent) <= 0) return toast.error("Monthly rent must be > 0");
    setSubmitting(true);
    try {
      const res = await fetch("/api/tenancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType: fAssetType,
          landParcelId: fAssetType === "LAND" ? fAssetId : null,
          builtUnitId: fAssetType === "BUILT_UNIT" ? fAssetId : null,
          customerId: fCustomer || null,
          tenantName: fTenantName,
          tenantPhone: fTenantPhone || null,
          startDate: fStart,
          endDate: fEnd,
          monthlyRent: Number(fRent),
          securityDeposit: Number(fDeposit) || 0,
          rentAgreementNo: fAgreementNo || null,
          notes: fNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create tenancy");
      toast.success("Tenancy created");
      setFormOpen(false);
      setFAssetId(""); setFTenantName(""); setFTenantPhone(""); setFStart(""); setFEnd(""); setFRent(""); setFDeposit(""); setFAgreementNo(""); setFNotes("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function activateTenancy(id: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenancies/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to activate");
      toast.success("Tenancy activated");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function requestTerminate(t: TenancyRow) {
    setTerminateTarget(t);
    setConfirmTerminateOpen(true);
  }

  async function confirmTerminateTenancy() {
    if (!terminateTarget) return;
    const id = terminateTarget.id;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenancies/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "terminate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to terminate");
      toast.success("Tenancy terminated");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
      setTerminateTarget(null);
    }
  }

  function openEdit(t: TenancyRow) {
    setEditTarget(t);
    setETenantName(t.tenantName);
    setETenantPhone(t.tenantPhone ?? "");
    setECustomer(t.customerId ?? "");
    setEStart(t.startDate.slice(0, 10));
    setEEnd(t.endDate.slice(0, 10));
    setERent(String(t.monthlyRent));
    setEDeposit(String(t.securityDeposit));
    setEAgreementNo(t.rentAgreementNo ?? "");
    setENotes(t.notes ?? "");
  }

  async function submitEdit() {
    if (!editTarget) return;
    if (!eTenantName.trim()) return toast.error("Tenant name is required");
    if (!eStart || !eEnd) return toast.error("Start and end dates are required");
    if (!eRent || Number(eRent) <= 0) return toast.error("Monthly rent must be > 0");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenancies/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: eTenantName,
          tenantPhone: eTenantPhone || null,
          customerId: eCustomer || null,
          startDate: eStart,
          endDate: eEnd,
          monthlyRent: Number(eRent),
          securityDeposit: Number(eDeposit) || 0,
          rentAgreementNo: eAgreementNo || null,
          notes: eNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to edit tenancy");
      toast.success("Tenancy updated");
      setEditTarget(null);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function recordPayment() {
    if (!payTarget) return;
    if (!pAmount || Number(pAmount) <= 0) return toast.error("Amount must be > 0");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenancies/${payTarget.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(pAmount),
          mode: pMode,
          paymentDate: pDate || undefined,
          reference: pRef || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      toast.success("Rent payment recorded");
      setPayTarget(null);
      setPAmount(""); setPDate(""); setPRef("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: Column<TenancyRow>[] = [
    {
      key: "tenantName",
      label: "Tenant",
      sortable: true,
      width: "240px",
      sortValue: (t) => t.tenantName,
      render: (t) => (
        <IdentityCell
          name={t.tenantName}
          sub={[
            t.assetType === "LAND" ? "Land parcel" : "Built unit",
            t.rentAgreementNo ? `#${t.rentAgreementNo}` : null,
          ].filter(Boolean).join(" · ")}
        />
      ),
      exportValue: (t) => t.tenantName,
    },
    {
      key: "assetType",
      label: "Asset",
      sortable: true,
      filterable: true,
      width: "100px",
      render: (t) => <Badge variant="outline">{t.assetType === "LAND" ? "Land" : "Unit"}</Badge>,
      filterValue: (t) => (t.assetType === "LAND" ? "Land" : "Unit"),
      exportValue: (t) => t.assetType,
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      filterable: true,
      width: "160px",
      render: (t) => t.projectName ?? <span className="text-faint">—</span>,
      filterValue: (t) => t.projectName ?? "—",
      exportValue: (t) => t.projectName ?? "",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (t) => tenancyStatusPill(t.status),
      filterValue: (t) => t.status,
      exportValue: (t) => t.status,
    },
    {
      key: "monthlyRent",
      label: "Monthly rent",
      align: "right",
      sortable: true,
      render: (t) => <MoneyCell value={t.monthlyRent} formatted={formatCurrency(t.monthlyRent)} neutral />,
      exportValue: (t) => t.monthlyRent,
    },
    {
      key: "securityDeposit",
      label: "Deposit",
      align: "right",
      sortable: true,
      defaultHidden: true,
      render: (t) => <MoneyCell value={t.securityDeposit} formatted={formatCurrency(t.securityDeposit)} neutral />,
      exportValue: (t) => t.securityDeposit,
    },
    {
      key: "startDate",
      label: "Start",
      sortable: true,
      render: (t) => <DateCell date={t.startDate} formatted={formatDate(t.startDate)} />,
      sortValue: (t) => new Date(t.startDate),
      exportValue: (t) => t.startDate,
    },
    {
      key: "endDate",
      label: "End",
      sortable: true,
      render: (t) => <DateCell date={t.endDate} formatted={formatDate(t.endDate)} />,
      sortValue: (t) => new Date(t.endDate),
      exportValue: (t) => t.endDate,
    },
    {
      key: "totalReceived",
      label: "Received",
      align: "right",
      sortable: true,
      render: (t) => (
        <MoneyCell
          value={t.totalReceived}
          formatted={formatCurrency(t.totalReceived)}
          sub={`${t.paymentCount} payment${t.paymentCount !== 1 ? "s" : ""}`}
        />
      ),
      exportValue: (t) => t.totalReceived,
    },
  ];

  function rowActions(t: TenancyRow) {
    return (
      <>
        {canManage && t.status === "PENDING" && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(t); }} disabled={submitting} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); activateTenancy(t.id); }} disabled={submitting} title="Activate">
              <Play className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {canManage && t.status === "ACTIVE" && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setPayTarget(t); setPAmount(String(t.monthlyRent)); setPDate(""); setPRef(""); }} title="Record payment">
              <Banknote className="h-3.5 w-3.5" />
            </Button>
            {canTerminate && (
              <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={(e) => { e.stopPropagation(); requestTerminate(t); }} disabled={submitting} title="Terminate">
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
      </>
    );
  }

  const trailingButtons = canManage ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus className="h-4 w-4" /> New tenancy
    </Button>
  ) : null;

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No tenancies match"
      description="Adjust the search or column filters to see all tenancies."
    />
  );

  return (
    <div className="space-y-4">
      {tenancies.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-5 w-5" />}
          title="No tenancies"
          description="Create a rental or lease agreement for a land parcel or built unit."
          action={canManage ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Tenancy
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={tenancies}
            columns={columns}
            storageKey="rentals"
            hideable
            exportFileName="rentals"
            initialSort={{ key: "startDate", direction: "desc" }}
            onRowClick={(t) => setDetailTarget(t)}
            searchable
            searchPlaceholder="Search tenant, project, agreement no…"
            toolbarTrailing={trailingButtons}
            showTotals
            sumColumns={["monthlyRent", "totalReceived"]}
            totalFormat={(_key, sum) => formatCurrency(sum)}
            rowTone={(t) => {
              if (t.status === "TERMINATED") return "warning";
              if (t.status === "PENDING") return null;
              return null;
            }}
            rowActions={rowActions}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Detail dialog */}
      {detailTarget && (
        <TenancyDetailDialog
          tenancy={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { openEdit(detailTarget); setDetailTarget(null); }}
          onActivate={() => { activateTenancy(detailTarget.id); setDetailTarget(null); }}
          onPay={() => { setPayTarget(detailTarget); setPAmount(String(detailTarget.monthlyRent)); setPDate(""); setPRef(""); setDetailTarget(null); }}
          onTerminate={() => { requestTerminate(detailTarget); setDetailTarget(null); }}
          canManage={canManage}
          canTerminate={canTerminate}
          submitting={submitting}
        />
      )}

      {/* Create tenancy dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New Tenancy"
        description="Rent out a land parcel or built unit to a tenant."
      >
        <div className="space-y-3">
          <div>
            <Label>Asset type</Label>
            <Select value={fAssetType} onChange={(e) => { setFAssetType(e.target.value as "BUILT_UNIT" | "LAND"); setFAssetId(""); }}>
              <option value="BUILT_UNIT">Built Unit</option>
              <option value="LAND">Land Parcel</option>
            </Select>
          </div>
          <div>
            <Label>Asset</Label>
            <Select value={fAssetId} onChange={(e) => setFAssetId(e.target.value)}>
              <option value="">Select {fAssetType === "LAND" ? "parcel" : "unit"}…</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Tenant name</Label>
              <Input value={fTenantName} onChange={(e) => setFTenantName(e.target.value)} placeholder="Tenant / company name" />
            </div>
            <div>
              <Label>Tenant phone</Label>
              <Input value={fTenantPhone} onChange={(e) => setFTenantPhone(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div>
            <Label>Link to customer (optional)</Label>
            <SelectWithCreate
              value={fCustomer}
              onChange={setFCustomer}
              placeholder="None"
              createLabel="customer"
              options={localCustomers.map((c) => ({ value: c.id, label: c.phone ? `${c.name} · ${c.phone}` : c.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <CustomerFormDialog open={o} onOpenChange={onClose} customer={null} onCreated={(e) => { setLocalCustomers((p) => [...p, { id: e.id, name: e.label ?? "", phone: null }]); onCreated(e); }} />
              )}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Monthly rent (₹)</Label>
              <Input type="number" value={fRent} onChange={(e) => setFRent(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Security deposit (₹)</Label>
              <Input type="number" value={fDeposit} onChange={(e) => setFDeposit(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Rent agreement no. (optional)</Label>
            <Input value={fAgreementNo} onChange={(e) => setFAgreementNo(e.target.value)} placeholder="e.g. RA-2026-001" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitTenancy} disabled={submitting}>
              {submitting ? "Creating…" : "Create Tenancy"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Payment dialog */}
      <Dialog
        open={!!payTarget}
        onOpenChange={(o) => { if (!o) setPayTarget(null); }}
        title="Record Rent Payment"
        description={payTarget ? `${payTarget.tenantName} · ${formatCurrency(payTarget.monthlyRent)}/mo` : ""}
      >
        <div className="space-y-3">
          <div>
            <Label>Amount (₹)</Label>
            <Input type="number" value={pAmount} onChange={(e) => setPAmount(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Payment mode</Label>
              <Select value={pMode} onChange={(e) => setPMode(e.target.value)}>
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
              </Select>
            </div>
            <div>
              <Label>Payment date</Label>
              <Input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reference (optional)</Label>
            <Input value={pRef} onChange={(e) => setPRef(e.target.value)} placeholder="UTR / cheque no." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={recordPayment} disabled={submitting}>
              {submitting ? "Recording…" : "Record Payment"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmTerminateOpen}
        onOpenChange={setConfirmTerminateOpen}
        title="Terminate this tenancy?"
        description="The asset will be released back to AVAILABLE."
        confirmLabel="Terminate"
        onConfirm={confirmTerminateTenancy}
      />

      {/* Edit tenancy dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title="Edit Tenancy"
        description={editTarget ? `${editTarget.tenantName} · ${editTarget.assetType === "LAND" ? "Land Parcel" : "Built Unit"}` : ""}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Tenant name</Label>
              <Input value={eTenantName} onChange={(e) => setETenantName(e.target.value)} placeholder="Tenant / company name" />
            </div>
            <div>
              <Label>Tenant phone</Label>
              <Input value={eTenantPhone} onChange={(e) => setETenantPhone(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div>
            <Label>Link to customer (optional)</Label>
            <SelectWithCreate
              value={eCustomer}
              onChange={setECustomer}
              placeholder="None"
              createLabel="customer"
              options={localCustomers.map((c) => ({ value: c.id, label: c.phone ? `${c.name} · ${c.phone}` : c.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <CustomerFormDialog open={o} onOpenChange={onClose} customer={null} onCreated={(e) => { setLocalCustomers((p) => [...p, { id: e.id, name: e.label ?? "", phone: null }]); onCreated(e); }} />
              )}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input type="date" value={eStart} onChange={(e) => setEStart(e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={eEnd} onChange={(e) => setEEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Monthly rent (₹)</Label>
              <Input type="number" value={eRent} onChange={(e) => setERent(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Security deposit (₹)</Label>
              <Input type="number" value={eDeposit} onChange={(e) => setEDeposit(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Rent agreement no. (optional)</Label>
            <Input value={eAgreementNo} onChange={(e) => setEAgreementNo(e.target.value)} placeholder="e.g. RA-2026-001" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={eNotes} onChange={(e) => setENotes(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Tenancy Detail Dialog
// ───────────────────────────────────────────────────────────

function TenancyDetailDialog({
  tenancy,
  onClose,
  onEdit,
  onActivate,
  onPay,
  onTerminate,
  canManage,
  canTerminate,
  submitting,
}: {
  tenancy: TenancyRow;
  onClose: () => void;
  onEdit: () => void;
  onActivate: () => void;
  onPay: () => void;
  onTerminate: () => void;
  canManage: boolean;
  canTerminate: boolean;
  submitting: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={tenancy.tenantName}
      description={`${tenancy.assetType === "LAND" ? "Land Parcel" : "Built Unit"} · ${tenancy.projectName ?? "No project"}`}
      className="max-w-xl"
      action={
        canManage && tenancy.status === "PENDING" ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Status + agreement no */}
        <div className="flex flex-wrap items-center gap-2">
          {tenancyStatusPill(tenancy.status)}
          <Badge variant="outline">{tenancy.assetType === "LAND" ? "Land" : "Unit"}</Badge>
          {tenancy.rentAgreementNo && (
            <Badge variant="muted" className="font-mono text-micro">#{tenancy.rentAgreementNo}</Badge>
          )}
        </div>

        {/* Key facts grid */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-4">
          <div>
            <div className="text-label text-muted-foreground">Monthly Rent</div>
            <div className="text-body font-semibold tnum">{formatCurrency(tenancy.monthlyRent)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">Deposit</div>
            <div className="text-body font-semibold tnum">{formatCurrency(tenancy.securityDeposit)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">Total Received</div>
            <div className="text-body font-semibold tnum">{formatCurrency(tenancy.totalReceived)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">Payments</div>
            <div className="text-body font-semibold tnum">{tenancy.paymentCount}</div>
          </div>
        </div>

        {/* Tenancy details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-meta sm:grid-cols-3">
          <div><span className="text-muted-foreground">Start: </span>{formatDate(tenancy.startDate)}</div>
          <div><span className="text-muted-foreground">End: </span>{formatDate(tenancy.endDate)}</div>
          <div><span className="text-muted-foreground">Tenant phone: </span>{tenancy.tenantPhone ?? "—"}</div>
          <div><span className="text-muted-foreground">Customer: </span>{tenancy.customerName ?? "—"}</div>
          <div><span className="text-muted-foreground">Project: </span>{tenancy.projectName ?? "—"}</div>
        </div>

        {/* Notes */}
        {tenancy.notes && (
          <div>
            <div className="text-label text-muted-foreground">Notes</div>
            <p className="mt-1 text-body leading-relaxed whitespace-pre-wrap">{tenancy.notes}</p>
          </div>
        )}

        {/* Payment history */}
        <div className="space-y-2">
          <div className="text-caption font-medium text-muted-foreground">Payment history</div>
          {tenancy.payments.length === 0 ? (
            <div className="rounded-lg border border-border px-3 py-3 text-meta text-muted-foreground">No payments recorded yet.</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <DataTable data={tenancy.payments} columns={paymentColumns} getRowId={(p) => p.id} hideToolbar />
            </div>
          )}
        </div>

        {/* Actions */}
        {canManage && (
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            {tenancy.status === "PENDING" && (
              <Button size="sm" onClick={onActivate} disabled={submitting}>
                <Play className="h-3.5 w-3.5" /> Activate
              </Button>
            )}
            {tenancy.status === "ACTIVE" && (
              <>
                <Button size="sm" onClick={onPay}>
                  <Banknote className="h-3.5 w-3.5" /> Record Payment
                </Button>
                {canTerminate && (
                  <Button size="sm" variant="outline" className="text-danger" onClick={onTerminate} disabled={submitting}>
                    <Square className="h-3.5 w-3.5" /> Terminate
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
