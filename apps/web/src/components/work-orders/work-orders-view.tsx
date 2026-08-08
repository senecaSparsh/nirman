"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { HardHat, Plus, Send, CheckCircle, XCircle, Lock } from "lucide-react";

type WorkOrder = {
  id: string;
  workOrderNumber: string;
  workTitle: string;
  status: "DRAFT" | "ISSUED" | "ACTIVE" | "COMPLETED" | "CLOSED" | "CANCELLED";
  retentionPct: number;
  tdsPct: number;
  tdsCategory: string;
  advanceAmount: number;
  advanceRecoveryPct: number;
  totalWorkDone: number;
  totalDeductions: number;
  totalPaid: number;
  retentionBalance: number;
  startDate: string | null;
  endDate: string | null;
  subcontractor: { name: string; trade: string | null };
  project: { name: string };
  _count: { raBills: number; lines: number };
};

/** Column definitions for the work orders DataTable. */
const woColumns: Column<WorkOrder>[] = [
  {
    key: "workOrderNumber",
    label: "WO No.",
    sortable: true,
    render: (wo) => <span className="font-mono text-caption font-semibold text-foreground">{wo.workOrderNumber}</span>,
  },
  {
    key: "workTitle",
    label: "Title",
    sortable: true,
    render: (wo) => <span className="truncate">{wo.workTitle}</span>,
  },
  {
    key: "subcontractor",
    label: "Subcontractor",
    sortable: true,
    sortValue: (wo) => wo.subcontractor.name,
    render: (wo) => (
      <div>
        <div>{wo.subcontractor.name}</div>
        {wo.subcontractor.trade && <div className="text-caption text-muted-foreground">{wo.subcontractor.trade}</div>}
      </div>
    ),
  },
  {
    key: "project",
    label: "Project",
    sortable: true,
    sortValue: (wo) => wo.project.name,
    render: (wo) => <span className="text-muted-foreground">{wo.project.name}</span>,
  },
  {
    key: "totalWorkDone",
    label: "Work Done",
    align: "right",
    sortable: true,
    render: (wo) => <span className="tnum font-medium">{formatCurrency(wo.totalWorkDone)}</span>,
  },
  {
    key: "retentionBalance",
    label: "Retention Held",
    align: "right",
    sortable: true,
    render: (wo) => <span className="tnum text-muted-foreground">{formatCurrency(wo.retentionBalance)}</span>,
  },
  {
    key: "raBills",
    label: "RA Bills",
    align: "right",
    sortable: true,
    sortValue: (wo) => wo._count.raBills,
    render: (wo) => <span className="tnum text-muted-foreground">{wo._count.raBills}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (wo) => <StatusPill status={wo.status} />,
  },
];

/** Columns with action buttons appended. */
function woColumnsWithActions(onAction: (id: string, action: string) => void): Column<WorkOrder>[] {
  return [
    ...woColumns,
    {
      key: "actions",
      label: "",
      align: "right",
      render: (wo) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {wo.status === "DRAFT" && (
            <button onClick={() => onAction(wo.id, "issue")} className="text-muted-foreground hover:text-primary" title="Issue to subcontractor">
              <Send className="h-4 w-4" />
            </button>
          )}
          {wo.status === "COMPLETED" && (
            <button onClick={() => onAction(wo.id, "release-retention")} className="text-muted-foreground hover:text-emerald-600" title="Release retention">
              <Lock className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];
}

export function WorkOrdersView({
  workOrders,
  canCreate,
}: {
  workOrders: WorkOrder[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  async function onAction(id: string, action: string) {
    try {
      const res = await fetch(`/api/work-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Work order ${action === "issue" ? "issued" : action === "release-retention" ? "retention released" : "updated"}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-4">
      {canCreate && workOrders.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Work Order
          </Button>
        </div>
      )}

      {workOrders.length === 0 ? (
        <EmptyState
          icon={<HardHat />}
          title="No work orders"
          description="Create a subcontractor work order against BOQ items to track scope, rates, retention, and TDS."
          action={canCreate ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Work Order
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={workOrders}
            initialSort={{ key: "workOrderNumber", direction: "desc" }}
            columns={canCreate ? woColumnsWithActions(onAction) : woColumns}
            searchable
            searchPlaceholder="Search by WO number, title, subcontractor…"
            showTotals
            sumColumns={["totalWorkDone", "retentionBalance"]}
            totalFormat={(key, sum) => formatCurrency(sum)}
            hideable
            pageSize={50}
          />
        </div>
      )}

      <WorkOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function WorkOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    projectId: "",
    subcontractorId: "",
    workTitle: "",
    description: "",
    retentionPct: "5",
    tdsCategory: "COMPANY",
    advanceAmount: "0",
    advanceRecoveryPct: "10",
    defectLiabilityMonths: "12",
  });
  const [lines, setLines] = useState([{ boqItemId: "", agreedRate: "" }]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [subcontractors, setSubcontractors] = useState<{ id: string; name: string; trade: string | null }[]>([]);
  const [boqItems, setBoqItems] = useState<{ id: string; serialNo: string; description: string; unit: string | null }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((d) => setProjects(d.projects ?? d ?? []));
    fetch("/api/subcontractors").then((r) => r.json()).then((d) => setSubcontractors(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.projectId) return;
    fetch(`/api/boq/tree?projectId=${form.projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const items: { id: string; serialNo: string; description: string; unit: string | null }[] = [];
        function collect(nodes: any[]) {
          for (const n of nodes) {
            if (n.type === "LINE_ITEM") items.push({ id: n.id, serialNo: n.serialNo, description: n.description, unit: n.unit });
            if (n.children) collect(n.children);
          }
        }
        collect(data.tree ?? []);
        setBoqItems(items);
      });
  }, [form.projectId]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setLine(idx: number, key: "boqItemId" | "agreedRate", value: string) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l));
  }

  function addLine() {
    setLines((prev) => [...prev, { boqItemId: "", agreedRate: "" }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId || !form.subcontractorId || !form.workTitle.trim()) {
      toast.error("Project, subcontractor, and title are required");
      return;
    }
    const validLines = lines.filter((l) => l.boqItemId && l.agreedRate);
    if (validLines.length === 0) {
      toast.error("At least one BOQ line item with an agreed rate is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          retentionPct: parseFloat(form.retentionPct),
          advanceAmount: parseFloat(form.advanceAmount),
          advanceRecoveryPct: parseFloat(form.advanceRecoveryPct),
          defectLiabilityMonths: parseInt(form.defectLiabilityMonths),
          lines: validLines.map((l) => ({
            boqItemId: l.boqItemId,
            agreedRate: parseFloat(l.agreedRate),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Work order created");
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Subcontractor Work Order"
      description="Issue a work order against BOQ items with agreed rates, retention %, and TDS category."
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project" required>
            <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} required>
              <option value="">— Select project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Subcontractor" required>
            <Select value={form.subcontractorId} onChange={(e) => set("subcontractorId", e.target.value)} required>
              <option value="">— Select subcontractor —</option>
              {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Work Title" required>
          <Input value={form.workTitle} onChange={(e) => set("workTitle", e.target.value)} placeholder="e.g. Plumbing for Tower A" required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Retention %">
            <Input type="number" step="0.01" value={form.retentionPct} onChange={(e) => set("retentionPct", e.target.value)} />
          </Field>
          <Field label="TDS Category">
            <Select value={form.tdsCategory} onChange={(e) => set("tdsCategory", e.target.value)}>
              <option value="INDIVIDUAL">Individual (1%)</option>
              <option value="COMPANY">Company (2%)</option>
              <option value="OTHER">Other (2%)</option>
            </Select>
          </Field>
          <Field label="Advance Amount">
            <Input type="number" step="0.01" value={form.advanceAmount} onChange={(e) => set("advanceAmount", e.target.value)} />
          </Field>
          <Field label="Advance Recovery %">
            <Input type="number" step="0.01" value={form.advanceRecoveryPct} onChange={(e) => set("advanceRecoveryPct", e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Scope (BOQ Items)</span>
            <Button type="button" variant="ghost" size="sm" onClick={addLine}>+ Add line</Button>
          </div>
          {lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2">
              <Select value={line.boqItemId} onChange={(e) => setLine(idx, "boqItemId", e.target.value)}>
                <option value="">— Select BOQ item —</option>
                {boqItems.map((b) => <option key={b.id} value={b.id}>{b.serialNo} — {b.description}</option>)}
              </Select>
              <Input type="number" step="0.01" placeholder="Rate ₹" value={line.agreedRate} onChange={(e) => setLine(idx, "agreedRate", e.target.value)} />
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-destructive">
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create Work Order"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
