"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Play, Square, Banknote, ChevronDown, ChevronRight, Pencil, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

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
  const canManage = permissions?.canManage ?? true;
  const canTerminate = permissions?.canTerminate ?? true;
  const [formOpen, setFormOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<TenancyRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">
          {tenancies.length} tenanc{tenancies.length !== 1 ? "ies" : "y"}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadCSV("rentals.csv", tenancies as unknown as Record<string, unknown>[], [
              { key: "tenantName", label: "Tenant" },
              { key: "assetType", label: "Asset Type" },
              { key: "projectName", label: "Project" },
              { key: "startDate", label: "Start Date", format: (v) => formatDate(v as string) },
              { key: "endDate", label: "End Date", format: (v) => formatDate(v as string) },
              { key: "monthlyRent", label: "Monthly Rent", format: (v) => formatCurrency(v as number) },
              { key: "securityDeposit", label: "Security Deposit", format: (v) => formatCurrency(v as number) },
              { key: "status", label: "Status" },
              { key: "totalReceived", label: "Total Received", format: (v) => formatCurrency(v as number) },
            ])
          }
          title="Export CSV"
        >
          <Download className="mr-1 h-3.5 w-3.5" /> Export
        </Button>
        {canManage && tenancies.length > 0 && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Tenancy
          </Button>
        )}
      </div>

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
        <div className="space-y-2">
          {tenancies.map((t) => (
            <div key={t.id} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/20"
              >
                {expanded === t.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{t.tenantName}</span>
                    <Badge variant="outline">{t.assetType === "LAND" ? "Land" : "Unit"}</Badge>
                    {tenancyStatusPill(t.status)}
                    {t.rentAgreementNo && <Badge variant="muted">#{t.rentAgreementNo}</Badge>}
                  </div>
                  <div className="text-meta text-muted-foreground">
                    {formatDate(t.startDate)} → {formatDate(t.endDate)} · {formatCurrency(t.monthlyRent)}/mo
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-body font-medium text-foreground">{formatCurrency(t.totalReceived)}</div>
                  <div className="text-caption text-muted-foreground">received · {t.paymentCount} payment{t.paymentCount !== 1 ? "s" : ""}</div>
                </div>
              </button>

              {expanded === t.id && (
                <div className="border-t border-border p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-meta sm:grid-cols-4">
                    <div><div className="text-muted-foreground">Tenant phone</div><div className="text-foreground">{t.tenantPhone ?? "—"}</div></div>
                    <div><div className="text-muted-foreground">Customer</div><div className="text-foreground">{t.customerName ?? "—"}</div></div>
                    <div><div className="text-muted-foreground">Security deposit</div><div className="text-foreground">{formatCurrency(t.securityDeposit)}</div></div>
                    <div><div className="text-muted-foreground">Project</div><div className="text-foreground">{t.projectName ?? "—"}</div></div>
                  </div>
                  {t.notes && <div className="text-body text-muted-foreground">“{t.notes}”</div>}

                  {/* Payments */}
                  <div className="space-y-2">
                    <div className="text-caption font-medium text-muted-foreground">Payment history</div>
                    {t.payments.length === 0 ? (
                      <div className="rounded-lg border border-border px-3 py-3 text-meta text-muted-foreground">No payments recorded yet.</div>
                    ) : (
                      <div className="rounded-lg border border-border overflow-hidden">
                        <DataTable data={t.payments} columns={paymentColumns} getRowId={(p) => p.id} />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                      {t.status === "PENDING" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEdit(t)} disabled={submitting}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" onClick={() => activateTenancy(t.id)} disabled={submitting}>
                            <Play className="mr-1 h-3.5 w-3.5" /> Activate
                          </Button>
                        </>
                      )}
                      {t.status === "ACTIVE" && (
                        <>
                          <Button size="sm" onClick={() => { setPayTarget(t); setPAmount(String(t.monthlyRent)); setPDate(""); setPRef(""); }}>
                            <Banknote className="mr-1 h-3.5 w-3.5" /> Record Payment
                          </Button>
                          {canTerminate && (
                            <Button size="sm" variant="outline" onClick={() => requestTerminate(t)} disabled={submitting}>
                              <Square className="mr-1 h-3.5 w-3.5" /> Terminate
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
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
            <Select value={fCustomer} onChange={(e) => setFCustomer(e.target.value)}>
              <option value="">None</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
              ))}
            </Select>
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
            <Select value={eCustomer} onChange={(e) => setECustomer(e.target.value)}>
              <option value="">None</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
              ))}
            </Select>
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
