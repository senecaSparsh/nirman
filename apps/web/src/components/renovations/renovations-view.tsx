"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Hammer, Plus, Trash2, Play, CheckCircle2, XCircle, TrendingUp, Pencil, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { IdentityCell, MoneyCell } from "@/components/ui/cells";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
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

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
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
  const [selected, setSelected] = useState<RenovationRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [costFormOpen, setCostFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<RenovationRow | null>(null);
  const [editTarget, setEditTarget] = useState<RenovationRow | null>(null);
  const [costDeleteTarget, setCostDeleteTarget] = useState<{ renovationId: string; costId: string; label: string } | null>(null);
  const [completeTarget, setCompleteTarget] = useState<RenovationRow | null>(null);
  const [completeValuation, setCompleteValuation] = useState("");

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

  // Keep selected in sync with server data after refresh
  const current = selected ? renovations.find((r) => r.id === selected.id) ?? null : null;

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
    if (action === "complete") {
      setCompleteTarget(renovation);
      setCompleteValuation("");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/renovations/${renovation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(action === "start" ? "Renovation started" : "Renovation completed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmComplete() {
    if (!completeTarget) return;
    const body: { action: string; newValuation?: number } = { action: "complete" };
    if (completeValuation.trim()) body.newValuation = Number(completeValuation);

    setSubmitting(true);
    try {
      const res = await fetch(`/api/renovations/${completeTarget.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Renovation completed (ROI: ${data.roi ?? "N/A"}%)`);
      setCompleteTarget(null);
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
      setCostFormOpen(false);
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
      { key: "costType", label: "Cost Type", sortable: true, filterable: true, render: (c) => <span className="font-medium text-foreground">{c.costType}</span>, sortValue: (c) => c.costType, filterValue: (c) => c.costType },
      { key: "amount", label: "Amount", align: "right", sortable: true, render: (c) => <MoneyCell value={c.amount} formatted={formatCurrency(c.amount)} />, sortValue: (c) => c.amount, exportValue: (c) => c.amount },
      { key: "vendor", label: "Vendor", sortable: true, filterable: true, render: (c) => <span className="text-muted-foreground">{c.vendor ?? "—"}</span>, filterValue: (c) => c.vendor ?? "—" },
      { key: "notes", label: "Notes", render: (c) => <span className="text-muted-foreground">{c.notes ?? "—"}</span> },
      { key: "date", label: "Date", sortable: true, render: (c) => <span className="text-muted-foreground">{formatDate(c.date)}</span>, sortValue: (c) => c.date },
    ];
    if (canManage && renovation.status !== "COMPLETED") {
      cols.push({
        key: "actions",
        label: "",
        align: "right",
        noExport: true,
        render: (c) => (
          <Button size="sm" variant="ghost" onClick={() => setCostDeleteTarget({ renovationId: renovation.id, costId: c.id, label: c.costType })} disabled={submitting}>
            <Trash2 className="h-3 w-3 text-danger" />
          </Button>
        ),
      });
    }
    return cols;
  }

  const columns: Column<RenovationRow>[] = [
    {
      key: "title",
      label: "Renovation",
      sortable: true,
      width: "260px",
      sortValue: (r) => r.title,
      render: (r) => (
        <IdentityCell
          name={r.title}
          sub={[r.renovationNumber, TYPE_LABELS[r.type] ?? r.type].join(" · ")}
        />
      ),
      exportValue: (r) => r.title,
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      filterable: true,
      width: "160px",
      render: (r) => r.projectName ?? <span className="text-faint">—</span>,
      filterValue: (r) => r.projectName ?? "—",
      exportValue: (r) => r.projectName ?? "",
    },
    {
      key: "asset",
      label: "Asset",
      sortable: true,
      filterable: true,
      width: "140px",
      sortValue: (r) => r.builtUnitNumber ?? r.landParcelNumber ?? "",
      render: (r) => {
        if (r.builtUnitNumber) return <span className="text-foreground">Unit {r.builtUnitNumber}</span>;
        if (r.landParcelNumber) return <span className="text-foreground">Parcel {r.landParcelNumber}</span>;
        return <span className="text-faint">—</span>;
      },
      filterValue: (r) => r.builtUnitNumber ? `Unit ${r.builtUnitNumber}` : r.landParcelNumber ? `Parcel ${r.landParcelNumber}` : "—",
      exportValue: (r) => r.builtUnitNumber ?? r.landParcelNumber ?? "",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (r) => <StatusPill status={r.status} />,
      filterValue: (r) => STATUS_LABELS[r.status] ?? r.status,
      exportValue: (r) => r.status,
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      filterable: true,
      defaultHidden: true,
      render: (r) => TYPE_LABELS[r.type] ?? r.type,
      filterValue: (r) => TYPE_LABELS[r.type] ?? r.type,
      exportValue: (r) => r.type,
    },
    {
      key: "budget",
      label: "Budget",
      align: "right",
      sortable: true,
      render: (r) => r.budget > 0 ? <MoneyCell value={r.budget} formatted={formatCurrency(r.budget)} neutral /> : <span className="text-faint">—</span>,
      exportValue: (r) => r.budget,
    },
    {
      key: "actualCost",
      label: "Actual cost",
      align: "right",
      sortable: true,
      render: (r) => <MoneyCell value={r.actualCost} formatted={formatCurrency(r.actualCost)} />,
      exportValue: (r) => r.actualCost,
    },
    {
      key: "variance",
      label: "Budget variance",
      align: "right",
      sortable: true,
      hint: "How far actual cost has deviated from the approved budget.",
      sortValue: (r) => r.budget > 0 ? ((r.actualCost - r.budget) / r.budget) * 100 : 0,
      render: (r) => {
        if (r.budget <= 0) return <span className="text-faint">—</span>;
        const pct = ((r.actualCost - r.budget) / r.budget) * 100;
        return (
          <span className={cn("font-medium tnum", pct > 0 ? "text-danger" : "text-success")}>
            {pct > 0 ? "+" : ""}{pct.toFixed(0)}%
          </span>
        );
      },
      exportValue: (r) => r.budget > 0 ? ((r.actualCost - r.budget) / r.budget) * 100 : 0,
    },
    {
      key: "roi",
      label: "ROI",
      align: "right",
      sortable: true,
      hint: "Return on renovation investment — only available after completion with a new valuation.",
      sortValue: (r) => {
        if (r.status !== "COMPLETED" || !r.newValuation || r.actualCost <= 0) return -Infinity;
        return ((r.newValuation - r.originalValuation - r.actualCost) / r.actualCost) * 100;
      },
      render: (r) => {
        if (r.status !== "COMPLETED" || !r.newValuation || r.actualCost <= 0) return <span className="text-faint">—</span>;
        const roi = ((r.newValuation - r.originalValuation - r.actualCost) / r.actualCost) * 100;
        return (
          <span className={cn("font-medium tnum", roi >= 0 ? "text-success" : "text-danger")}>
            {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
          </span>
        );
      },
      exportValue: (r) => {
        if (r.status !== "COMPLETED" || !r.newValuation || r.actualCost <= 0) return "";
        return ((r.newValuation - r.originalValuation - r.actualCost) / r.actualCost) * 100;
      },
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      defaultHidden: true,
      render: (r) => <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>,
      sortValue: (r) => r.createdAt,
      exportValue: (r) => r.createdAt,
    },
  ];

  function rowActions(r: RenovationRow) {
    return (
      <>
        {canManage && r.status === "PLANNED" && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} disabled={submitting} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => doAction(r, "start")} disabled={submitting} title="Start">
              <Play className="h-3.5 w-3.5" /> Start
            </Button>
          </>
        )}
        {canManage && r.status === "IN_PROGRESS" && (
          <>
            <Button variant="ghost" size="sm" className="h-7" onClick={() => { setCostFormOpen(true); }} disabled={submitting} title="Add cost">
              <Plus className="h-3.5 w-3.5" /> Cost
            </Button>
            <Button variant="brand" size="sm" className="h-7" onClick={() => doAction(r, "complete")} disabled={submitting} title="Complete">
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={() => doAction(r, "cancel")} disabled={submitting} title="Cancel">
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </>
    );
  }

  const trailingButtons = (
    <>
      {canManage && (
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> New renovation
        </Button>
      )}
    </>
  );

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No renovations match"
      description="Adjust the search or column filters to see the renovation register."
    />
  );

  return (
    <div className="space-y-4">
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
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={renovations}
            columns={columns}
            storageKey="renovations"
            hideable
            exportFileName="renovations"
            initialSort={{ key: "createdAt", direction: "desc" }}
            onRowClick={(r) => setSelected(r)}
            searchable
            searchPlaceholder="Search title, number, asset…"
            toolbarTrailing={trailingButtons}
            showTotals
            sumColumns={["budget", "actualCost"]}
            totalFormat={(_key, sum) => formatCurrency(sum)}
            rowTone={(r) => {
              if (r.status === "CANCELLED") return "danger";
              if (r.budget > 0 && r.actualCost > r.budget * 1.2) return "warning";
              if (r.status === "COMPLETED" && r.newValuation && r.actualCost > 0) {
                const roi = ((r.newValuation - r.originalValuation - r.actualCost) / r.actualCost) * 100;
                if (roi < 0) return "danger";
              }
              return null;
            }}
            rowActions={rowActions}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* ── Detail dialog ─────────────────────────────────────────── */}
      {current && (
        <Dialog
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null); }}
          title={current.title}
          description={`${current.renovationNumber} · ${TYPE_LABELS[current.type] ?? current.type}${current.builtUnitNumber ? ` · Unit ${current.builtUnitNumber}` : ""}${current.landParcelNumber ? ` · Parcel ${current.landParcelNumber}` : ""}`}
          size="xl"
        >
          <div className="space-y-4">
            {/* Status + badges */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={current.status} />
              <Badge variant="outline">{current.renovationNumber}</Badge>
              <Badge variant="default">{TYPE_LABELS[current.type] ?? current.type}</Badge>
              {current.builtUnitNumber && <Badge variant="outline">Unit {current.builtUnitNumber}</Badge>}
              {current.landParcelNumber && <Badge variant="outline">Parcel {current.landParcelNumber}</Badge>}
            </div>
            {/* Description */}
            {current.description && (
              <div className="text-body text-muted-foreground">&quot;{current.description}&quot;</div>
            )}

            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-3 text-meta sm:grid-cols-4">
              <div><div className="text-muted-foreground">Project</div><div className="text-foreground">{current.projectName ?? "—"}</div></div>
              <div><div className="text-muted-foreground">Original valuation</div><div className="text-foreground">{formatCurrency(current.originalValuation)}</div></div>
              <div><div className="text-muted-foreground">Budget</div><div className="text-foreground">{formatCurrency(current.budget)}</div></div>
              <div><div className="text-muted-foreground">Actual cost</div><div className="text-foreground">{formatCurrency(current.actualCost)}</div></div>
              <div><div className="text-muted-foreground">New valuation</div><div className="text-foreground">{current.newValuation ? formatCurrency(current.newValuation) : "—"}</div></div>
              <div>
                <div className="text-muted-foreground">Budget variance</div>
                <div className={cn(
                  "text-foreground",
                  current.budget > 0 && current.actualCost > current.budget ? "text-danger" : "text-success",
                )}>
                  {current.budget > 0
                    ? `${current.actualCost > current.budget ? "+" : ""}${(((current.actualCost - current.budget) / current.budget) * 100).toFixed(0)}%`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">ROI</div>
                <div className={
                  current.status === "COMPLETED" && current.newValuation && current.actualCost > 0
                    ? ((current.newValuation - current.originalValuation - current.actualCost) / current.actualCost) * 100 >= 0 ? "text-success" : "text-danger"
                    : "text-muted-foreground"
                }>
                  {current.status === "COMPLETED" && current.newValuation && current.actualCost > 0
                    ? `${((current.newValuation - current.originalValuation - current.actualCost) / current.actualCost) >= 0 ? "+" : ""}${(((current.newValuation - current.originalValuation - current.actualCost) / current.actualCost) * 100).toFixed(1)}%`
                    : "—"}
                </div>
              </div>
              <div><div className="text-muted-foreground">Started</div><div className="text-foreground">{current.startDate ? formatDate(current.startDate) : "—"}</div></div>
            </div>

            {/* Costs table */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-body font-semibold text-foreground">Costs ({current.costs.length})</h3>
                {canManage && current.status === "IN_PROGRESS" && (
                  <Button size="sm" variant="outline" onClick={() => setCostFormOpen(true)} disabled={submitting}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Cost
                  </Button>
                )}
              </div>
              <DataTable
                columns={getCostColumns(current)}
                data={current.costs}
                showTotals={current.costs.length > 0}
                sumColumns={["amount"]}
                totalFormat={(_key, sum) => formatCurrency(sum)}
                emptyState={<div className="px-3 py-3 text-center text-meta text-muted-foreground">No costs recorded yet</div>}
                className="rounded-md border border-border"
              />
            </div>

            {/* Inline cost form */}
            {costFormOpen && (
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
                  <Button size="sm" variant="ghost" onClick={() => setCostFormOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => addCost(current.id)} disabled={submitting}>Add</Button>
                </div>
              </div>
            )}

            {/* Actions */}
            {canManage && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {current.status === "PLANNED" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openEdit(current)} disabled={submitting}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => doAction(current, "start")} disabled={submitting}>
                      <Play className="mr-1 h-3.5 w-3.5" /> Start
                    </Button>
                  </>
                )}
                {current.status === "IN_PROGRESS" && (
                  <>
                    <Button size="sm" onClick={() => doAction(current, "complete")} disabled={submitting}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => doAction(current, "cancel")} disabled={submitting}>
                      <XCircle className="mr-1 h-3.5 w-3.5 text-danger" /> Cancel
                    </Button>
                  </>
                )}
                {current.status === "COMPLETED" && current.newValuation && (
                  <div className="flex items-center gap-1 text-meta text-success">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Valuation updated: {formatCurrency(current.originalValuation)} → {formatCurrency(current.newValuation)}
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog>
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

      {/* Complete dialog (replaces prompt) */}
      <Dialog
        open={!!completeTarget}
        onOpenChange={(o) => { if (!o) setCompleteTarget(null); }}
        title="Complete renovation"
        description={
          completeTarget
            ? `Enter the new valuation for "${completeTarget.title}". Leave blank to auto-calculate as original + actual cost (${formatCurrency(completeTarget.originalValuation + completeTarget.actualCost)}).`
            : ""
        }
      >
        <div className="space-y-3">
          <div>
            <Label>New valuation (optional)</Label>
            <Input
              type="number"
              value={completeValuation}
              onChange={(e) => setCompleteValuation(e.target.value)}
              placeholder={`Auto: ${completeTarget ? formatCurrency(completeTarget.originalValuation + completeTarget.actualCost) : ""}`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCompleteTarget(null)}>Cancel</Button>
            <Button onClick={confirmComplete} disabled={submitting}>
              {submitting ? "Completing…" : "Complete Renovation"}
            </Button>
          </div>
        </div>
      </Dialog>

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
