"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Hammer, Plus, Trash2, ChevronDown, ChevronRight, Play, CheckCircle2, XCircle, TrendingUp, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/page";

export type RenovationRow = {
  id: string;
  renovationNumber: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  builtUnitId: string | null;
  builtUnitNumber: string | null;
  builtUnitType: string | null;
  landParcelId: string | null;
  landParcelNumber: string | null;
  projectId: string;
  projectName: string | null;
  budget: number;
  actualCost: number;
  originalValuation: number;
  newValuation: number | null;
  startDate: string | null;
  completedAt: string | null;
  createdAt: string;
  costCount: number;
  costs: {
    id: string;
    costType: string;
    amount: number;
    vendor: string | null;
    notes: string | null;
    date: string;
  }[];
};

const TYPE_LABELS: Record<string, string> = {
  RENOVATION: "Renovation",
  ADDITION: "Addition",
  VALUE_ADD: "Value-Add",
  REPAIR: "Repair",
};

const COST_TYPES = ["LABOUR", "OVERHEAD", "EQUIPMENT", "CONTRACTOR", "PERMIT", "OTHER"];

export function RenovationsView({
  renovations,
  projects,
  builtUnits,
  landParcels,
  permissions,
}: {
  renovations: RenovationRow[];
  projects: { id: string; name: string }[];
  builtUnits: { id: string; unitNumber: string; unitType: string; projectId: string }[];
  landParcels: { id: string; number: string }[];
  permissions?: { canManage?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? false;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [costFormOpen, setCostFormOpen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<RenovationRow | null>(null);
  const [editTarget, setEditTarget] = useState<RenovationRow | null>(null);
  const [costDeleteTarget, setCostDeleteTarget] = useState<{ renovationId: string; costId: string; label: string } | null>(null);

  // Create form state
  const [fType, setFType] = useState("RENOVATION");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fProject, setFProject] = useState("");
  const [fUnit, setFUnit] = useState("");
  const [fParcel, setFParcel] = useState("");
  const [fBudget, setFBudget] = useState("");
  const [fStartDate, setFStartDate] = useState("");

  // Cost form state
  const [cCostType, setCCostType] = useState("LABOUR");
  const [cAmount, setCAmount] = useState("");
  const [cVendor, setCVendor] = useState("");
  const [cNotes, setCNotes] = useState("");

  // Edit form state
  const [eTitle, setETitle] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eBudget, setEBudget] = useState("");
  const [eStartDate, setEStartDate] = useState("");

  // Filtered units based on selected project
  const filteredUnits = useMemo(() => {
    if (!fProject) return [];
    return builtUnits.filter((u) => u.projectId === fProject);
  }, [fProject, builtUnits]);

  async function submit() {
    if (!fTitle) return toast.error("Title is required");
    if (!fProject) return toast.error("Select a project");
    if (!fUnit && !fParcel) return toast.error("Select a built unit or land parcel");
    if (fUnit && fParcel) return toast.error("Select only one asset (unit or parcel)");

    setSubmitting(true);
    try {
      const res = await fetch("/api/renovations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: fProject,
          type: fType,
          title: fTitle,
          description: fDesc || null,
          builtUnitId: fUnit || null,
          landParcelId: fParcel || null,
          budget: fBudget ? Number(fBudget) : 0,
          startDate: fStartDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create renovation");
      toast.success(`Renovation ${data.renovationNumber} created`);
      setFormOpen(false);
      setFTitle(""); setFDesc(""); setFProject(""); setFUnit(""); setFParcel(""); setFBudget(""); setFStartDate("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function doAction(renovation: RenovationRow, action: "start" | "complete" | "cancel") {
    if (action === "cancel") {
      setCancelTarget(renovation);
      setConfirmCancelOpen(true);
      return;
    }
    const body: { action: string; newValuation?: number } = { action };
    if (action === "complete") {
      // Prompt for new valuation (optional)
      const input = prompt(
        `Enter new valuation (leave blank for auto = original + cost = ${formatCurrency(renovation.originalValuation + renovation.actualCost)}):`,
      );
      if (input === null) return; // cancelled
      if (input.trim()) body.newValuation = Number(input);
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/renovations/${renovation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(action === "start" ? "Renovation started" : action === "complete" ? `Renovation completed (ROI: ${data.roi ?? "N/A"}%)` : "Renovation cancelled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCancelRenovation() {
    if (!cancelTarget) return;
    const renovation = cancelTarget;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/renovations/${renovation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Renovation cancelled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
      setCancelTarget(null);
    }
  }

  async function addCost(renovationId: string) {
    if (!cAmount || Number(cAmount) <= 0) return toast.error("Amount must be > 0");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/renovations/${renovationId}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costType: cCostType,
          amount: Number(cAmount),
          vendor: cVendor || null,
          notes: cNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add cost");
      toast.success("Cost added");
      setCostFormOpen(null);
      setCCostType("LABOUR"); setCAmount(""); setCVendor(""); setCNotes("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteCost(renovationId: string, costId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/renovations/${renovationId}/costs/${costId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete cost");
      toast.success("Cost deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(renovation: RenovationRow) {
    setEditTarget(renovation);
    setETitle(renovation.title);
    setEDesc(renovation.description ?? "");
    setEBudget(renovation.budget ? String(renovation.budget) : "");
    setEStartDate(renovation.startDate ? renovation.startDate.slice(0, 10) : "");
  }

  async function submitEdit() {
    if (!editTarget) return;
    if (!eTitle) return toast.error("Title is required");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/renovations/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eTitle,
          description: eDesc || null,
          budget: eBudget ? Number(eBudget) : 0,
          startDate: eStartDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update renovation");
      toast.success("Renovation updated");
      setEditTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  function getCostColumns(renovation: RenovationRow): Column<RenovationRow["costs"][number]>[] {
    const cols: Column<RenovationRow["costs"][number]>[] = [
      { key: "costType", label: "Cost Type", render: (c) => <span className="font-medium text-foreground">{c.costType}</span>, sortValue: (c) => c.costType },
      { key: "amount", label: "Amount", align: "right", render: (c) => formatCurrency(c.amount), sortValue: (c) => c.amount },
      { key: "vendor", label: "Vendor", render: (c) => <span className="text-muted-foreground">{c.vendor ?? "—"}</span> },
      { key: "notes", label: "Notes", render: (c) => <span className="text-muted-foreground">{c.notes ?? "—"}</span> },
      { key: "date", label: "Date", render: (c) => <span className="text-muted-foreground">{formatDate(c.date)}</span>, sortValue: (c) => c.date },
    ];
    if (canManage && renovation.status !== "COMPLETED") {
      cols.push({
        key: "actions",
        label: "",
        align: "right",
        render: (c) => (
          <Button size="sm" variant="ghost" onClick={() => setCostDeleteTarget({ renovationId: renovation.id, costId: c.id, label: c.costType })} disabled={submitting}>
            <Trash2 className="h-3 w-3 text-danger" />
          </Button>
        ),
      });
    }
    return cols;
  }

  const totalActual = renovations.filter((r) => r.status !== "CANCELLED").reduce((s, r) => s + r.actualCost, 0);
  const completed = renovations.filter((r) => r.status === "COMPLETED").length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">
          {renovations.length} renovation{renovations.length !== 1 ? "s" : ""} · {completed} completed · {formatCurrency(totalActual)} actual cost
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Renovation
          </Button>
        )}
      </div>

      {/* List */}
      {renovations.length === 0 ? (
        <EmptyState
          icon={<Hammer className="h-5 w-5" />}
          title="No renovations"
          description="Track renovation, addition, value-add, or repair work on existing units and parcels. Costs are capitalised into the asset on completion."
          action={canManage ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Renovation
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {renovations.map((r) => {
            const roi = r.status === "COMPLETED" && r.newValuation && r.actualCost > 0
              ? ((r.newValuation - r.originalValuation - r.actualCost) / r.actualCost) * 100
              : null;
            const budgetVariance = r.budget > 0 ? ((r.actualCost - r.budget) / r.budget) * 100 : null;

            return (
              <div key={r.id} className="rounded-lg border border-border bg-card">
                <button
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/20"
                >
                  {expanded === r.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <div className="flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{r.title}</span>
                      <Badge variant="outline">{r.renovationNumber}</Badge>
                      <StatusPill status={r.status} />
                      <Badge variant="default">{TYPE_LABELS[r.type] ?? r.type}</Badge>
                      {r.builtUnitNumber && <Badge variant="outline">Unit {r.builtUnitNumber}</Badge>}
                      {r.landParcelNumber && <Badge variant="outline">Parcel {r.landParcelNumber}</Badge>}
                    </div>
                    <div className="text-meta text-muted-foreground">
                      {r.projectName} · {r.costCount} cost{r.costCount !== 1 ? "s" : ""} · {formatDate(r.createdAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-body font-medium text-foreground">{formatCurrency(r.actualCost)}</div>
                    <div className="text-caption text-muted-foreground">
                      budget: {formatCurrency(r.budget)}
                      {budgetVariance !== null && (
                        <span className={budgetVariance > 0 ? "ml-1 text-danger" : "ml-1 text-success"}>
                          ({budgetVariance > 0 ? "+" : ""}{budgetVariance.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {expanded === r.id && (
                  <div className="border-t border-border p-3 space-y-3">
                    {/* Description */}
                    {r.description && <div className="text-body text-muted-foreground">&quot;{r.description}&quot;</div>}

                    {/* Summary grid */}
                    <div className="grid grid-cols-2 gap-3 text-meta sm:grid-cols-4">
                      <div><div className="text-muted-foreground">Original Valuation</div><div className="text-foreground">{formatCurrency(r.originalValuation)}</div></div>
                      <div><div className="text-muted-foreground">Actual Cost</div><div className="text-foreground">{formatCurrency(r.actualCost)}</div></div>
                      <div><div className="text-muted-foreground">New Valuation</div><div className="text-foreground">{r.newValuation ? formatCurrency(r.newValuation) : "—"}</div></div>
                      <div>
                        <div className="text-muted-foreground">ROI</div>
                        <div className={roi === null ? "text-muted-foreground" : roi >= 0 ? "text-success" : "text-danger"}>
                          {roi !== null ? `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%` : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Costs table */}
                    <DataTable
                      columns={getCostColumns(r)}
                      data={r.costs}
                      showTotals={r.costs.length > 0}
                      sumColumns={["amount"]}
                      totalFormat={(_key, sum) => formatCurrency(sum)}
                      emptyState={<div className="px-3 py-3 text-center text-meta text-muted-foreground">No costs recorded yet</div>}
                      className="rounded-md border border-border"
                    />

                    {/* Actions */}
                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        {r.status === "PLANNED" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEdit(r)} disabled={submitting}>
                              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => doAction(r, "start")} disabled={submitting}>
                              <Play className="mr-1 h-3.5 w-3.5" /> Start
                            </Button>
                          </>
                        )}
                        {r.status === "IN_PROGRESS" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setCostFormOpen(r.id)} disabled={submitting}>
                              <Plus className="mr-1 h-3.5 w-3.5" /> Add Cost
                            </Button>
                            <Button size="sm" onClick={() => doAction(r, "complete")} disabled={submitting}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => doAction(r, "cancel")} disabled={submitting}>
                              <XCircle className="mr-1 h-3.5 w-3.5 text-danger" /> Cancel
                            </Button>
                          </>
                        )}
                        {r.status === "COMPLETED" && r.newValuation && (
                          <div className="flex items-center gap-1 text-meta text-success">
                            <TrendingUp className="h-3.5 w-3.5" />
                            Valuation updated: {formatCurrency(r.originalValuation)} → {formatCurrency(r.newValuation)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline cost form */}
                    {costFormOpen === r.id && (
                      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                        <div className="text-body font-medium">Add Cost</div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Select value={cCostType} onChange={(e) => setCCostType(e.target.value)}>
                            {COST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </Select>
                          <Input type="number" placeholder="Amount" value={cAmount} onChange={(e) => setCAmount(e.target.value)} />
                          <Input placeholder="Vendor" value={cVendor} onChange={(e) => setCVendor(e.target.value)} />
                          <Input placeholder="Notes" value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setCostFormOpen(null)}>Cancel</Button>
                          <Button size="sm" onClick={() => addCost(r.id)} disabled={submitting}>Add</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="New Renovation / Value-Add"
        description="Track enhancement work on an existing unit or parcel. Capitalised costs update the asset's valuation on completion."
      >
        <div className="space-y-3">
          <div>
            <Label>Type *</Label>
            <Select value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="RENOVATION">Renovation (structural/cosmetic upgrade)</option>
              <option value="ADDITION">Addition (floor/room/extension)</option>
              <option value="VALUE_ADD">Value-Add (landscaping, amenities, fixtures)</option>
              <option value="REPAIR">Repair (expensed, not capitalised)</option>
            </Select>
          </div>
          <div>
            <Label>Title *</Label>
            <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="e.g. Kitchen renovation, 2nd floor addition" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} placeholder="Scope of work, materials, timeline…" />
          </div>
          <div>
            <Label>Project *</Label>
            <Select value={fProject} onChange={(e) => { setFProject(e.target.value); setFUnit(""); setFParcel(""); }}>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          {fProject && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Built Unit</Label>
                <Select value={fUnit} onChange={(e) => { setFUnit(e.target.value); if (e.target.value) setFParcel(""); }}>
                  <option value="">None</option>
                  {filteredUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNumber} ({u.unitType})</option>)}
                </Select>
              </div>
              <div>
                <Label>Land Parcel</Label>
                <Select value={fParcel} onChange={(e) => { setFParcel(e.target.value); if (e.target.value) setFUnit(""); }}>
                  <option value="">None</option>
                  {landParcels.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}
                </Select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Budget</Label>
              <Input type="number" value={fBudget} onChange={(e) => setFBudget(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Start date</Label>
              <Input type="date" value={fStartDate} onChange={(e) => setFStartDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Creating…" : "Create Renovation"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title={`Cancel renovation "${cancelTarget?.title ?? ""}"?`}
        description="This will cancel the renovation. This action cannot be undone."
        confirmLabel="Cancel Renovation"
        onConfirm={confirmCancelRenovation}
      />

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title="Edit Renovation"
        description="Update the title, description, budget, or start date. Only available while the renovation is in PLANNED status."
      >
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="e.g. Kitchen renovation, 2nd floor addition" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={eDesc} onChange={(e) => setEDesc(e.target.value)} rows={2} placeholder="Scope of work, materials, timeline…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Budget</Label>
              <Input type="number" value={eBudget} onChange={(e) => setEBudget(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Start date</Label>
              <Input type="date" value={eStartDate} onChange={(e) => setEStartDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={costDeleteTarget !== null}
        onOpenChange={(o) => { if (!o) setCostDeleteTarget(null); }}
        title="Delete this cost?"
        description="The associated GL entry will be reversed. This action cannot be undone."
        confirmLabel="Delete Cost"
        onConfirm={() => {
          if (costDeleteTarget) deleteCost(costDeleteTarget.renovationId, costDeleteTarget.costId);
          setCostDeleteTarget(null);
        }}
      />
    </div>
  );
}
