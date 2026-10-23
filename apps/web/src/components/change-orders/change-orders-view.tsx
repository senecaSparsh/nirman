"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {Plus, GitBranch, Trash2} from "lucide-react";
import { EmptyState } from "@/components/empty-state";

type ChangeOrderType = "ADDITION" | "DELETION" | "MODIFICATION" | "ACCELERATION" | "DECELERATION" | "VARIATION";
type ChangeOrderReason = "CLIENT_REQUEST" | "SITE_CONDITION" | "DESIGN_CHANGE" | "ERROR_OMISSION" | "REGULATORY" | "VALUE_ENGINEERING" | "OTHER";

interface ChangeOrderItem {
  id: string;
  changeOrderNo: string;
  title: string;
  type: string;
  reason: string;
  status: string;
  projectName: string;
  phaseName: string | null;
  lineCount: number;
  costDelta: number;
  scheduleDeltaDays: number;
  createdAt: string;
}

type Project = { id: string; name: string; type: string; status: string };

const TYPE_LABELS: Record<string, string> = {
  ADDITION: "Addition",
  DELETION: "Deletion",
  MODIFICATION: "Modification",
  ACCELERATION: "Acceleration",
  DECELERATION: "Deceleration",
  VARIATION: "Variation",
};

export function ChangeOrdersView({
  changeOrders,
  projects,
  canManage,
}: {
  changeOrders: ChangeOrderItem[];
  projects: Project[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return changeOrders;
    return changeOrders.filter((c) => c.status === statusFilter);
  }, [changeOrders, statusFilter]);

  const columns: Column<ChangeOrderItem>[] = [
    {
      key: "changeOrderNo",
      label: "CO Number",
      sortable: true,
      render: (c) => <span className="font-mono text-caption font-semibold text-foreground">{c.changeOrderNo}</span>,
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (c) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{c.title}</div>
          <div className="truncate text-caption text-muted-foreground">
            {c.phaseName ? `${c.phaseName} · ` : ""}
            {c.lineCount} lines
            {c.scheduleDeltaDays !== 0 ? ` · ${c.scheduleDeltaDays > 0 ? "+" : ""}${c.scheduleDeltaDays}d` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      render: (c) => <span className="text-muted-foreground">{c.projectName}</span>,
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (c) => <Badge variant="outline">{TYPE_LABELS[c.type] ?? c.type}</Badge>,
    },
    {
      key: "costDelta",
      label: "Cost Δ",
      align: "right",
      sortable: true,
      render: (c) => (
        <span className={cn("tnum font-medium", c.costDelta > 0 ? "text-danger" : c.costDelta < 0 ? "text-success" : "text-muted-foreground")}>
          {c.costDelta > 0 ? "+" : ""}{formatCurrency(c.costDelta)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (c) => <StatusPill status={c.status} />,
    },
    {
      key: "createdAt",
      label: "Created",
      align: "right",
      sortable: true,
      sortValue: (c) => new Date(c.createdAt),
      render: (c) => <span className="tnum text-caption text-muted-foreground">{formatDate(c.createdAt)}</span>,
    },
  ];

  const statusSelect = (
    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-7 w-[140px] text-caption" aria-label="Status filter">
      <option value="ALL">All Status</option>
      <option value="DRAFT">Draft</option>
      <option value="SUBMITTED">Submitted</option>
      <option value="APPROVED">Approved</option>
      <option value="IMPLEMENTED">Implemented</option>
      <option value="REJECTED">Rejected</option>
      <option value="CANCELLED">Cancelled</option>
    </Select>
  );

  return (
    <div className="space-y-4">
      {changeOrders.length === 0 ? (
        <EmptyState
          icon={<GitBranch />}
          title="No change orders yet"
          description="Create one to track formal modifications to project scope, BOQ, budget, and schedule."
          action={
            canManage && projects.length > 0 ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" /> New Change Order
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(c) => c.id}
            storageKey="change-orders"
            searchable
            searchPlaceholder="Search CO number, title, project…"
            hideable
            exportFileName="change-orders"
            initialSort={{ key: "createdAt", direction: "desc" }}
            showTotals
            sumColumns={["costDelta"]}
            totalFormat={(_k, sum) => `${sum > 0 ? "+" : ""}${formatCurrency(sum)}`}
            onRowClick={(c) => router.push(`/change-orders/${c.id}`)}
            onAddRow={canManage && projects.length > 0 ? () => setDialogOpen(true) : undefined}
            addRowLabel="New Change Order"
            toolbarLeading={statusSelect}
            toolbarTrailing={
              canManage && projects.length > 0 ? (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="size-3.5" /> New Change Order
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Create dialog */}
      {dialogOpen && (
        <NewChangeOrderDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projects={projects}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

// ── New Change Order Dialog ──

interface Line {
  id: string;
  description: string;
  originalQty: string;
  revisedQty: string;
  unit: string;
  rate: string;
}

function makeLineId() {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function NewChangeOrderDialog({
  open,
  onOpenChange,
  projects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects.find((p) => p.status !== "CANCELLED" && p.status !== "COMPLETED")?.id ?? projects[0]?.id ?? "",
    title: "",
    description: "",
    type: "MODIFICATION" as ChangeOrderType,
    reason: "OTHER" as ChangeOrderReason,
    scheduleDeltaDays: "0",
    initiatedBy: "",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([
    { id: makeLineId(), description: "", originalQty: "0", revisedQty: "0", unit: "", rate: "0" },
  ]);

  const costDelta = lines.reduce((sum, l) => {
    const oq = parseFloat(l.originalQty) || 0;
    const rq = parseFloat(l.revisedQty) || 0;
    const rate = parseFloat(l.rate) || 0;
    return sum + (rq - oq) * rate;
  }, 0);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { id: makeLineId(), description: "", originalQty: "0", revisedQty: "0", unit: "", rate: "0" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    if (lines.length === 0) {
      toast.error("At least one line item is required");
      return;
    }
    for (const l of lines) {
      if (!l.description.trim() || !l.unit.trim()) {
        toast.error("Each line needs a description and unit");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/change-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          title: form.title.trim(),
          description: form.description.trim(),
          type: form.type,
          reason: form.reason,
          scheduleDeltaDays: parseInt(form.scheduleDeltaDays) || 0,
          initiatedBy: form.initiatedBy || null,
          notes: form.notes || null,
          lines: lines.map((l) => ({
            description: l.description.trim(),
            originalQty: parseFloat(l.originalQty) || 0,
            revisedQty: parseFloat(l.revisedQty) || 0,
            unit: l.unit.trim(),
            rate: parseFloat(l.rate) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      if (data.submitted) {
        toast.success("Change order submitted for approval", {
          action: { label: "View Change Order", onClick: () => router.push(`/change-orders/${data.id}`) },
        });
      } else {
        toast.warning("Change order saved as draft", {
          description: data.submitError
            ? `Auto-submit failed: ${data.submitError}`
            : "You can submit it for approval from the change order detail page.",
          action: { label: "View Change Order", onClick: () => router.push(`/change-orders/${data.id}`) },
        });
      }
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Change Order"
      description="Track a formal modification to project scope, budget, or schedule."
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project" required>
            <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
              {projects
                .filter((p) => p.status !== "CANCELLED" && p.status !== "COMPLETED")
                .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Schedule Δ (days)">
            <Input type="number" value={form.scheduleDeltaDays} onChange={(e) => set("scheduleDeltaDays", e.target.value)} placeholder="0" />
          </Field>
        </div>
        <Field label="Title" required>
          <Input aria-label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Additional waterproofing for basement" required />
        </Field>
        <Field label="Description" required>
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Detailed description of the change…" required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <Select value={form.type} onChange={(e) => set("type", e.target.value as ChangeOrderType)}>
              <option value="ADDITION">Addition</option>
              <option value="DELETION">Deletion</option>
              <option value="MODIFICATION">Modification</option>
              <option value="ACCELERATION">Acceleration</option>
              <option value="DECELERATION">Deceleration</option>
              <option value="VARIATION">Variation</option>
            </Select>
          </Field>
          <Field label="Reason">
            <Select value={form.reason} onChange={(e) => set("reason", e.target.value as ChangeOrderReason)}>
              <option value="CLIENT_REQUEST">Client Request</option>
              <option value="SITE_CONDITION">Site Condition</option>
              <option value="DESIGN_CHANGE">Design Change</option>
              <option value="ERROR_OMISSION">Error / Omission</option>
              <option value="REGULATORY">Regulatory</option>
              <option value="VALUE_ENGINEERING">Value Engineering</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Initiated By">
            <Input aria-label="Client / Architect /" value={form.initiatedBy} onChange={(e) => set("initiatedBy", e.target.value)} placeholder="Client / Architect / …" />
          </Field>
        </div>

        {/* Lines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Line Items</label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={l.id} className="grid grid-cols-[1fr_80px_80px_60px_100px_32px] gap-2 items-center">
                <Input aria-label="Description"
                  value={l.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="Description"
                  className="h-8 text-xs"
                />
                <Input aria-label="Old Qty"
                  type="number"
                  value={l.originalQty}
                  onChange={(e) => updateLine(i, { originalQty: e.target.value })}
                  placeholder="Old Qty"
                  className="h-8 text-xs tabular-nums"
                />
                <Input aria-label="New Qty"
                  type="number"
                  value={l.revisedQty}
                  onChange={(e) => updateLine(i, { revisedQty: e.target.value })}
                  placeholder="New Qty"
                  className="h-8 text-xs tabular-nums"
                />
                <Input aria-label="Unit"
                  value={l.unit}
                  onChange={(e) => updateLine(i, { unit: e.target.value })}
                  placeholder="Unit"
                  className="h-8 text-xs"
                />
                <Input aria-label="Rate"
                  type="number"
                  value={l.rate}
                  onChange={(e) => updateLine(i, { rate: e.target.value })}
                  placeholder="Rate ₹"
                  className="h-8 text-xs tabular-nums"
                />
                {lines.length > 1 && (
                  <button aria-label="Delete" type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <div className="text-sm">
              <span className="text-muted-foreground">Cost Delta: </span>
              <span className={cn("font-bold tabular-nums", costDelta > 0 ? "text-destructive" : costDelta < 0 ? "text-green-600" : "")}>
                {costDelta > 0 ? "+" : ""}{formatCurrency(costDelta)}
              </span>
            </div>
          </div>
        </div>

        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional notes" />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create Change Order"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}