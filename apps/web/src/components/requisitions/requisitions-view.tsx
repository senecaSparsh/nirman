"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ClipboardList, ArrowRight, X, Check, RotateCcw, ShoppingCart, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { formatDate, formatNumber } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import type { RequisitionRow, RequisitionStatus } from "@/lib/types";

type ProjectOption = { id: string; name: string };
type PhaseOption = { id: string; name: string; projectId: string };
type MaterialOption = { id: string; code: string; name: string; unit: string };
type SupplierOption = { id: string; name: string };
type LocationOption = { id: string; name: string; type: "COMPANY_WAREHOUSE" | "PROJECT_SITE" };

const STATUS_VARIANT: Record<RequisitionStatus, "default" | "success" | "warning" | "muted" | "danger"> = {
  DRAFT: "muted",
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CONVERTED: "default",
};

export function RequisitionsView({
  requisitions,
  projects,
  phases,
  materials,
  suppliers,
  locations,
  permissions,
}: {
  requisitions: RequisitionRow[];
  projects: ProjectOption[];
  phases: PhaseOption[];
  materials: MaterialOption[];
  suppliers: SupplierOption[];
  locations: LocationOption[];
  permissions?: { canCreate?: boolean; canApprove?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? true;
  const canApprove = permissions?.canApprove ?? true;
  const [formOpen, setFormOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<RequisitionRow | null>(null);
  const [deleting, setDeleting] = useState<RequisitionRow | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const router = useRouter();

  const filtered = statusFilter ? requisitions.filter((r) => r.status === statusFilter) : requisitions;
  const draftCount = requisitions.filter((r) => r.status === "DRAFT").length;
  const submittedCount = requisitions.filter((r) => r.status === "SUBMITTED").length;
  const approvedCount = requisitions.filter((r) => r.status === "APPROVED").length;

  async function action(reqId: string, action: string) {
    try {
      const res = await fetch(`/api/requisitions/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${action} successful`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Action failed");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Material Requisitions"
        description="Request materials for projects, get approval, then convert to purchase orders."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total" value={String(requisitions.length)} />
        <KpiCard label="Drafts" value={String(draftCount)} accent="muted" />
        <KpiCard label="Pending Approval" value={String(submittedCount)} accent="warning" />
        <KpiCard label="Approved" value={String(approvedCount)} accent="success" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[180px]">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CONVERTED">Converted</option>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCSV(`requisitions-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "reqNumber", label: "Req Number" },
            { key: "projectName", label: "Project" },
            { key: "phaseName", label: "Phase" },
            { key: "status", label: "Status" },
            { key: "totalQty", label: "Total Qty" },
            { key: "requestDate", label: "Request Date", format: (v) => v ? formatDate(String(v)) : "" },
            { key: "neededByDate", label: "Needed By", format: (v) => v ? formatDate(String(v)) : "" },
          ])} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)} disabled={projects.length === 0}>
              <Plus className="h-4 w-4" /> New Requisition
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No requisitions" description="Create a material requisition to request materials for a project." />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Req #</TH>
                  <TH>Project</TH>
                  <TH>Lines</TH>
                  <TH>Needed By</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-caption font-medium">{r.reqNumber}</TD>
                    <TD className="text-body font-medium">
                      {r.projectName}
                      {r.phaseName && <span className="block text-caption text-muted-foreground">{r.phaseName}</span>}
                    </TD>
                    <TD className="text-caption text-muted-foreground">
                      {r.lineCount} item{r.lineCount !== 1 ? "s" : ""}
                    </TD>
                    <TD className="text-caption text-muted-foreground">{r.neededByDate ? formatDate(r.neededByDate) : "—"}</TD>
                    <TD><Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge></TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {r.status === "DRAFT" && (
                          <Button size="sm" variant="outline" onClick={() => action(r.id, "submit")}>Submit</Button>
                        )}
                        {r.status === "SUBMITTED" && canApprove && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => action(r.id, "approve")}><Check className="h-3.5 w-3.5" /> Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => action(r.id, "reject")}><X className="h-3.5 w-3.5" /> Reject</Button>
                          </>
                        )}
                        {r.status === "APPROVED" && (
                          <Button size="sm" onClick={() => setConvertTarget(r)}>
                            <ShoppingCart className="h-3.5 w-3.5" /> Convert to PO
                          </Button>
                        )}
                        {r.status === "CONVERTED" && r.convertedPoId && (
                          <span className="text-caption text-muted-foreground">PO created</span>
                        )}
                        {(r.status === "DRAFT" || r.status === "REJECTED") && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(r)} title="Delete" className="text-muted-foreground hover:text-danger">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {formOpen && (
        <RequisitionFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          projects={projects}
          phases={phases}
          materials={materials}
        />
      )}
      {convertTarget && (
        <ConvertDialog
          requisition={convertTarget}
          suppliers={suppliers}
          locations={locations}
          onOpenChange={(o) => !o && setConvertTarget(null)}
        />
      )}
      {deleting && (
        <DeleteConfirmDialog
          open={deleting !== null}
          onOpenChange={(o) => !o && setDeleting(null)}
          endpoint={`/api/requisitions/${deleting.id}`}
          title="Delete requisition"
          description={`Delete requisition ${deleting.reqNumber}? Only draft or rejected requisitions can be deleted.`}
          successMessage="Requisition deleted"
        />
      )}
    </div>
  );
}

function RequisitionFormDialog({
  open,
  onOpenChange,
  projects,
  phases,
  materials,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: ProjectOption[];
  phases: PhaseOption[];
  materials: MaterialOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    phaseId: "",
    neededByDate: "",
    notes: "",
  });
  const [lines, setLines] = useState<{ id: string; materialId: string; qty: string; notes: string }[]>([{ id: crypto.randomUUID(), materialId: "", qty: "", notes: "" }]);

  const filteredPhases = form.projectId ? phases.filter((p) => p.projectId === form.projectId) : [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId) return toast.error("Project is required");
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) return toast.error("At least one valid line is required");
    setSaving(true);
    try {
      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          phaseId: form.phaseId || null,
          neededByDate: form.neededByDate || null,
          notes: form.notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qtyRequested: Number(l.qty),
            notes: l.notes.trim() || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Requisition created");
      onOpenChange(false);
      setForm({ projectId: "", phaseId: "", neededByDate: "", notes: "" });
      setLines([{ id: crypto.randomUUID(), materialId: "", qty: "", notes: "" }]);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">New Material Requisition</h2>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <Select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value, phaseId: "" }))} required>
                <option value="">Select…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phase</Label>
              <Select value={form.phaseId} onChange={(e) => setForm((f) => ({ ...f, phaseId: e.target.value }))} disabled={filteredPhases.length === 0}>
                <option value="">None</option>
                {filteredPhases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Needed By Date</Label>
            <Input type="date" value={form.neededByDate} onChange={(e) => setForm((f) => ({ ...f, neededByDate: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>Lines</Label>
            {lines.map((line, i) => (
              <div key={line.id} className="flex gap-2">
                <Select value={line.materialId} onChange={(e) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, materialId: e.target.value } : l))} className="flex-1">
                  <option value="">Select material…</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name} ({m.unit})</option>)}
                </Select>
                <Input type="number" placeholder="Qty" value={line.qty} onChange={(e) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, qty: e.target.value } : l))} className="w-24" />
                <Button type="button" variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", qty: "", notes: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add Line
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConvertDialog({
  requisition,
  suppliers,
  locations,
  onOpenChange,
}: {
  requisition: RequisitionRow;
  suppliers: SupplierOption[];
  locations: LocationOption[];
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<{ lines: { id: string; materialId: string; materialCode: string; materialName: string; unit: string; qtyRequested: number; notes: string | null }[] } | null>(null);
  const [form, setForm] = useState({
    supplierId: "",
    procurementScope: "PROJECT" as "COMPANY" | "PROJECT",
    destinationLocationId: "",
    expectedDate: "",
    notes: "",
  });
  const [lineCosts, setLineCosts] = useState<Record<string, string>>({});

  // Fetch detail (with lines) on mount
  useEffect(() => {
    fetch(`/api/requisitions/${requisition.id}`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => {});
  }, [requisition.id]);

  async function convert(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierId) return toast.error("Supplier is required");
    if (!form.destinationLocationId) return toast.error("Destination location is required");
    if (!detail) return toast.error("Loading requisition details…");
    const costs: Record<string, number> = {};
    for (const line of detail.lines) {
      const cost = Number(lineCosts[line.materialId] ?? 0);
      if (cost < 0) return toast.error(`Cost for ${line.materialName} must be >= 0`);
      costs[line.materialId] = cost;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/requisitions/${requisition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "convert",
          supplierId: form.supplierId,
          procurementScope: form.procurementScope,
          destinationLocationId: form.destinationLocationId,
          lineCosts: costs,
          expectedDate: form.expectedDate || null,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`PO created: ${data.poNumber}`);
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold">Convert Requisition to PO</h2>
        <p className="mb-4 text-body text-muted-foreground">{requisition.reqNumber} · {requisition.projectName}</p>
        <form onSubmit={convert} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <Select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} required>
                <option value="">Select…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Procurement Scope</Label>
              <Select value={form.procurementScope} onChange={(e) => setForm((f) => ({ ...f, procurementScope: e.target.value as any }))}>
                <option value="PROJECT">Project</option>
                <option value="COMPANY">Company</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Destination Location *</Label>
              <Select value={form.destinationLocationId} onChange={(e) => setForm((f) => ({ ...f, destinationLocationId: e.target.value }))} required>
                <option value="">Select…</option>
                {locations
                  .filter((l) => form.procurementScope === "COMPANY" ? l.type === "COMPANY_WAREHOUSE" : l.type === "PROJECT_SITE")
                  .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Expected Date</Label>
              <Input type="date" value={form.expectedDate} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Line Costs (unit cost per material)</Label>
            {!detail ? (
              <p className="text-body text-muted-foreground">Loading lines…</p>
            ) : (
              detail.lines.map((line) => (
                <div key={line.id} className="flex items-center gap-2">
                  <span className="flex-1 text-body">{line.materialName} ({line.materialCode})</span>
                  <span className="tnum text-body text-muted-foreground">{formatNumber(line.qtyRequested, 3)} {line.unit}</span>
                  <Input
                    type="number"
                    placeholder="Unit cost"
                    value={lineCosts[line.materialId] ?? ""}
                    onChange={(e) => setLineCosts((c) => ({ ...c, [line.materialId]: e.target.value }))}
                    className="w-32"
                  />
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Converting…" : "Convert to PO"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
