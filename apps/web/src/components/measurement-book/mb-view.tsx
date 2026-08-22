"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { formatCurrency, formatNumber, formatDate, cn } from "@/lib/utils";
import type { ProjectOption } from "@/lib/types";
import { Ruler, Plus, CheckCircle, XCircle, ShieldCheck } from "lucide-react";

type BoqItem = { id: string; serialNo: string; description: string; unit: string | null; rate: number | null; estimatedQty: number | null };
type WbsNode = { id: string; code: string; name: string; boqItemId: string | null };

type MbEntry = {
  id: string;
  mbNumber: string;
  boqItemId: string;
  wbsNodeId: string | null;
  measuredQty: number;
  cumulativeQty: number;
  description: string;
  locationRef: string | null;
  measureDate: string;
  status: "DRAFT" | "VERIFIED" | "APPROVED" | "REJECTED";
  boqItem: { serialNo: string; description: string; unit: string | null; rate: number | null };
  wbsNode: { code: string; name: string } | null;
  measuredBy: { name: string } | null;
  verifiedBy: { name: string } | null;
  approvedBy: { name: string } | null;
  rejectReason: string | null;
};

const STATUS_CONFIG = {
  DRAFT: { label: "Draft", variant: "muted" },
  VERIFIED: { label: "Verified", variant: "default" },
  APPROVED: { label: "Approved", variant: "default" },
  REJECTED: { label: "Rejected", variant: "danger" },
} as const;

/** Column definitions for the measurement book DataTable. */
const mbColumns: Column<MbEntry>[] = [
  {
    key: "mbNumber",
    label: "MB No.",
    sortable: true,
    render: (e) => <span className="font-mono text-caption font-semibold text-foreground">{e.mbNumber}</span>,
  },
  {
    key: "boqItem",
    label: "BOQ Item",
    sortable: true,
    sortValue: (e) => e.boqItem.serialNo,
    render: (e) => <span className="text-caption text-muted-foreground">{e.boqItem.serialNo}</span>,
  },
  {
    key: "description",
    label: "Description",
    sortable: true,
    render: (e) => <span className="truncate">{e.description}</span>,
  },
  {
    key: "wbsNode",
    label: "WBS",
    sortable: true,
    sortValue: (e) => e.wbsNode?.code ?? "",
    render: (e) => e.wbsNode ? <span className="text-caption">{e.wbsNode.code}</span> : <span className="text-muted-foreground">—</span>,
  },
  {
    key: "measuredQty",
    label: "Qty",
    align: "right",
    sortable: true,
    render: (e) => <span className="tnum font-medium">{formatNumber(e.measuredQty, 3)}</span>,
  },
  {
    key: "cumulativeQty",
    label: "Cumulative",
    align: "right",
    sortable: true,
    render: (e) => <span className="tnum text-muted-foreground">{formatNumber(e.cumulativeQty, 3)}</span>,
  },
  {
    key: "measureDate",
    label: "Date",
    sortable: true,
    sortValue: (e) => new Date(e.measureDate),
    render: (e) => <span className="tnum text-muted-foreground">{formatDate(e.measureDate)}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (e) => <StatusPill status={e.status} />,
  },
];

/** Columns with verify/approve/reject actions appended. */
function mbColumnsWithActions(onAction: (id: string, action: "verify" | "approve" | "reject") => void): Column<MbEntry>[] {
  return [
    ...mbColumns,
    {
      key: "actions",
      label: "",
      align: "right",
      render: (e) => (
        <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
          {e.status === "DRAFT" && (
            <button onClick={() => onAction(e.id, "verify")} className="text-muted-foreground hover:text-primary" title="Verify">
              <CheckCircle className="h-4 w-4" />
            </button>
          )}
          {e.status === "VERIFIED" && (
            <button onClick={() => onAction(e.id, "approve")} className="text-muted-foreground hover:text-emerald-600" title="Approve">
              <ShieldCheck className="h-4 w-4" />
            </button>
          )}
          {(e.status === "DRAFT" || e.status === "VERIFIED") && (
            <button onClick={() => onAction(e.id, "reject")} className="text-muted-foreground hover:text-destructive" title="Reject">
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];
}

export function MeasurementBookView({
  projects,
  canCreate,
}: {
  projects: ProjectOption[];
  canCreate: boolean;
}) {
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  useEffect(() => { setLocalProjects(projects); }, [projects]);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [entries, setEntries] = useState<MbEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [wbsNodes, setWbsNodes] = useState<WbsNode[]>([]);
  // Rejection dialog state — replaces native prompt() for rejection reason input
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/mb-entries?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => setEntries(data ?? []))
      .catch(() => toast.error("Failed to load MB entries"))
      .finally(() => setLoading(false));

    // Load BOQ line items + WBS nodes for the dialog
    Promise.all([
      fetch(`/api/boq/tree?projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/wbs/tree?projectId=${projectId}`).then((r) => r.json()),
    ]).then(([boq, wbs]) => {
      const items: BoqItem[] = [];
      function collect(nodes: any[]) {
        for (const n of nodes) {
          if (n.type === "LINE_ITEM") {
            items.push({ id: n.id, serialNo: n.serialNo, description: n.description, unit: n.unit, rate: n.rate, estimatedQty: n.estimatedQty });
          }
          if (n.children) collect(n.children);
        }
      }
      collect(boq.tree ?? []);
      setBoqItems(items);

      const nodes: WbsNode[] = [];
      function collectWbs(ns: any[]) {
        for (const n of ns) {
          nodes.push({ id: n.id, code: n.code, name: n.name, boqItemId: n.boqItem?.id ?? null });
          if (n.children) collectWbs(n.children);
        }
      }
      collectWbs(wbs ?? []);
      setWbsNodes(nodes);
    });
  }, [projectId]);

  async function onAction(id: string, action: "verify" | "approve" | "reject") {
    if (action === "reject") {
      // Open the rejection dialog instead of using native prompt()
      setRejectReason("");
      setRejectTarget(id);
      return;
    }
    try {
      const res = await fetch(`/api/mb-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Entry ${action}ed`);
      if (action === "approve") {
        toast.info("WBS progress auto-updated", { description: "Linked activity progress recalculated from approved quantities." });
      }
      // Refresh entries
      fetch(`/api/mb-entries?projectId=${projectId}`).then((r) => r.json()).then((d) => setEntries(d ?? []));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function submitReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    try {
      const res = await fetch(`/api/mb-entries/${rejectTarget}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Entry rejected");
      setRejectTarget(null);
      fetch(`/api/mb-entries?projectId=${projectId}`).then((r) => r.json()).then((d) => setEntries(d ?? []));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (localProjects.length === 0) {
    return <EmptyState icon={<Ruler />} title="No projects" description="Create a project to start recording measurements." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <Field label="Project">
          <SelectWithCreate
            value={projectId}
            onChange={setProjectId}
            placeholder="Select…"
            createLabel="project"
            className="max-w-sm"
            options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
            renderCreateDialog={({ open: o, onCreated, onClose }) => (
              <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]); onCreated(e); }} />
            )}
          />
        </Field>
      </div>

      {loading ? (
        <PageLoading label="Loading measurements…" variant="default" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Ruler />}
          title="No measurements recorded"
          description="Record actual quantities executed on site. Entries go through Draft → Verified → Approved before they can be billed."
          action={canCreate ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Entry
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={entries}
            initialSort={{ key: "measureDate", direction: "desc" }}
            columns={canCreate ? mbColumnsWithActions(onAction) : mbColumns}
            searchable
            searchPlaceholder="Search by MB no, description, BOQ item…"
            showTotals
            sumColumns={["measuredQty", "cumulativeQty"]}
            totalFormat={(_key, sum) => formatNumber(sum, 3)}
            hideable
            pageSize={50}
            onAddRow={canCreate ? () => setDialogOpen(true) : undefined}
            addRowLabel="New Entry"
          />
        </div>
      )}

      <MbEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        boqItems={boqItems}
        wbsNodes={wbsNodes}
        onCreated={() => fetch(`/api/mb-entries?projectId=${projectId}`).then((r) => r.json()).then((d) => setEntries(d ?? []))}
      />

      {/* Rejection reason dialog — replaces native prompt() */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => { if (!open) setRejectTarget(null); }}
        title="Reject Measurement Book Entry"
        description="Provide a reason for rejecting this entry. The reason will be visible to the submitter."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitReject}>Reject Entry</Button>
          </>
        }
      >
        <Field label="Rejection reason">
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Measured quantity exceeds BOQ scope. Please re-measure and resubmit."
            rows={3}
            autoFocus
          />
        </Field>
      </Dialog>
    </div>
  );
}

function MbEntryDialog({
  open,
  onOpenChange,
  projectId,
  boqItems,
  wbsNodes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  boqItems: BoqItem[];
  wbsNodes: WbsNode[];
  onCreated?: () => void;
}) {
  const [form, setForm] = useState({
    boqItemId: "",
    wbsNodeId: "",
    measuredQty: "",
    description: "",
    locationRef: "",
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Auto-suggest WBS node when BOQ item is selected
  function onBoqItemChange(boqItemId: string) {
    const linkedNode = wbsNodes.find((w) => w.boqItemId === boqItemId);
    setForm((f) => ({ ...f, boqItemId, wbsNodeId: linkedNode?.id ?? f.wbsNodeId }));
  }

  // Filter WBS nodes to show: the auto-suggested one first, then all activities
  const selectedBoq = boqItems.find((b) => b.id === form.boqItemId);
  const suggestedWbsNode = wbsNodes.find((w) => w.boqItemId === form.boqItemId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.boqItemId || !form.measuredQty || !form.description.trim()) {
      toast.error("BOQ item, quantity, and description are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/mb-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          boqItemId: form.boqItemId,
          wbsNodeId: form.wbsNodeId || null,
          measuredQty: parseFloat(form.measuredQty),
          description: form.description.trim(),
          locationRef: form.locationRef || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("MB entry created");
      onOpenChange(false);
      setForm({ boqItemId: "", wbsNodeId: "", measuredQty: "", description: "", locationRef: "" });
      onCreated?.();
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
      title="New Measurement Book Entry"
      description="Record actual quantities executed on site. Entries start as Draft and must be verified and approved before billing."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="BOQ Line Item" required>
          <Select value={form.boqItemId} onChange={(e) => onBoqItemChange(e.target.value)} required>
            <option value="">— Select BOQ item —</option>
            {boqItems.map((b) => (
              <option key={b.id} value={b.id}>{b.serialNo} — {b.description} ({b.unit ?? "—"}) · {formatCurrency(b.rate ?? 0)}/{b.unit ?? "unit"}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="WBS Activity">
            <Select value={form.wbsNodeId} onChange={(e) => set("wbsNodeId", e.target.value)}>
              <option value="">— None —</option>
              {wbsNodes.map((w) => (
                <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
              ))}
            </Select>
            {suggestedWbsNode && form.wbsNodeId === suggestedWbsNode.id && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                Auto-linked from BOQ item. Progress will update on approval.
              </p>
            )}
            {!suggestedWbsNode && form.boqItemId && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                This BOQ item isn't linked to any WBS activity. Link it in the WBS page for auto-progress.
              </p>
            )}
          </Field>
          <Field label={`Measured Quantity${selectedBoq ? ` (${selectedBoq.unit ?? "units"})` : ""}`} required>
            <Input type="number" step="0.001" value={form.measuredQty} onChange={(e) => set("measuredQty", e.target.value)} placeholder="0.000" required />
            {selectedBoq && selectedBoq.estimatedQty != null && form.measuredQty && (
              <p className="text-[11px] text-muted-foreground mt-1">
                BOQ est: {formatNumber(selectedBoq.estimatedQty, 3)} {selectedBoq.unit ?? ""}
                {parseFloat(form.measuredQty) > 0 && (
                  <> · This entry: {((parseFloat(form.measuredQty) / selectedBoq.estimatedQty) * 100).toFixed(1)}% of BOQ</>
                )}
              </p>
            )}
          </Field>
        </div>
        <Field label="Description of Work" required>
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="e.g. Excavation for foundation, Unit 101" required />
        </Field>
        <Field label="Location Reference">
          <Input value={form.locationRef} onChange={(e) => set("locationRef", e.target.value)} placeholder="e.g. Unit 101, Floor 2, Wing A" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create Entry"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
