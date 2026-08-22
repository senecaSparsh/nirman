"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import { Plus, GitBranch, ArrowUpRight, ArrowDownRight, Clock, Search, Trash2, Send, Check, X, Play, Ban } from "lucide-react";

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

const STATUS_TONES: Record<string, "default" | "warning" | "success" | "danger"> = {
  DRAFT: "default",
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  IMPLEMENTED: "success",
  CANCELLED: "default",
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = changeOrders;
    if (statusFilter !== "ALL") result = result.filter((c) => c.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) => c.title.toLowerCase().includes(q) || c.changeOrderNo.toLowerCase().includes(q) || c.projectName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [changeOrders, query, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search change orders…"
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[140px]">
          <option value="ALL">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="IMPLEMENTED">Implemented</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        {canManage && projects.length > 0 && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Change Order
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border p-12 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {changeOrders.length === 0 ? "No change orders yet. Create one to track scope changes." : "No change orders match your filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[120px_1fr_120px_100px_120px_100px_80px] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div>CO Number</div>
            <div>Title</div>
            <div>Project</div>
            <div>Type</div>
            <div className="text-right">Cost Δ</div>
            <div>Status</div>
            <div className="text-right">Created</div>
          </div>
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/change-orders/${c.id}`)}
              className="grid w-full grid-cols-[120px_1fr_120px_100px_120px_100px_80px] gap-2 border-b border-border/50 px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors"
            >
              <div className="font-mono text-xs text-muted-foreground self-center">{c.changeOrderNo}</div>
              <div className="min-w-0 self-center">
                <div className="truncate font-medium">{c.title}</div>
                <div className="truncate text-xs text-muted-foreground">{c.phaseName ? `${c.phaseName} · ` : ""}{c.lineCount} lines{c.scheduleDeltaDays !== 0 ? ` · ${c.scheduleDeltaDays > 0 ? "+" : ""}${c.scheduleDeltaDays}d` : ""}</div>
              </div>
              <div className="text-xs text-muted-foreground self-center truncate">{c.projectName}</div>
              <div className="text-xs self-center">{TYPE_LABELS[c.type] ?? c.type}</div>
              <div className={cn("text-right font-medium tabular-nums self-center", c.costDelta > 0 ? "text-destructive" : c.costDelta < 0 ? "text-green-600" : "")}>
                {c.costDelta > 0 ? "+" : ""}{formatCurrency(c.costDelta)}
              </div>
              <div className="self-center"><Badge variant={STATUS_TONES[c.status] ?? "default"}>{c.status}</Badge></div>
              <div className="text-right text-xs text-muted-foreground self-center tabular-nums">{formatDate(c.createdAt)}</div>
            </button>
          ))}
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
  description: string;
  originalQty: string;
  revisedQty: string;
  unit: string;
  rate: string;
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
    projectId: projects[0]?.id ?? "",
    title: "",
    description: "",
    type: "MODIFICATION" as ChangeOrderType,
    reason: "OTHER" as ChangeOrderReason,
    scheduleDeltaDays: "0",
    initiatedBy: "",
    notes: "",
  });
  const [lines, setLines] = useState<Line[]>([
    { description: "", originalQty: "0", revisedQty: "0", unit: "", rate: "0" },
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
    setLines((prev) => [...prev, { description: "", originalQty: "0", revisedQty: "0", unit: "", rate: "0" }]);
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
      toast.success("Change order created");
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
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Schedule Δ (days)">
            <Input type="number" value={form.scheduleDeltaDays} onChange={(e) => set("scheduleDeltaDays", e.target.value)} placeholder="0" />
          </Field>
        </div>
        <Field label="Title" required>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Additional waterproofing for basement" required />
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
            <Input value={form.initiatedBy} onChange={(e) => set("initiatedBy", e.target.value)} placeholder="Client / Architect / …" />
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
              <div key={i} className="grid grid-cols-[1fr_80px_80px_60px_100px_32px] gap-2 items-center">
                <Input
                  value={l.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="Description"
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  value={l.originalQty}
                  onChange={(e) => updateLine(i, { originalQty: e.target.value })}
                  placeholder="Old Qty"
                  className="h-8 text-xs tabular-nums"
                />
                <Input
                  type="number"
                  value={l.revisedQty}
                  onChange={(e) => updateLine(i, { revisedQty: e.target.value })}
                  placeholder="New Qty"
                  className="h-8 text-xs tabular-nums"
                />
                <Input
                  value={l.unit}
                  onChange={(e) => updateLine(i, { unit: e.target.value })}
                  placeholder="Unit"
                  className="h-8 text-xs"
                />
                <Input
                  type="number"
                  value={l.rate}
                  onChange={(e) => updateLine(i, { rate: e.target.value })}
                  placeholder="Rate ₹"
                  className="h-8 text-xs tabular-nums"
                />
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive">
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
