"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { cn, formatDate } from "@/lib/utils";
import { ListChecks, Plus, Pencil, Trash2, ChevronRight, ChevronDown, AlertCircle } from "lucide-react";

type Project = { id: string; name: string };
type BoqItem = { id: string; serialNo: string; description: string };

type WbsNode = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  type: "PROJECT_NODE" | "PHASE_NODE" | "ACTIVITY" | "SUB_ACTIVITY" | "MILESTONE";
  description: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progressPct: number;
  isCritical: boolean;
  totalFloat: number | null;
  sortOrder: number;
  boqItem: { id: string; serialNo: string; description: string; estimatedAmount: number | null } | null;
  children: WbsNode[];
  _count?: { mbEntries: number; children: number };
};

const TYPE_LABELS: Record<string, string> = {
  PROJECT_NODE: "Project",
  PHASE_NODE: "Phase",
  ACTIVITY: "Activity",
  SUB_ACTIVITY: "Sub-Activity",
  MILESTONE: "Milestone",
};

export function WbsView({
  projects,
  canEdit,
}: {
  projects: Project[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [tree, setTree] = useState<WbsNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<WbsNode | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/wbs/tree?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setTree(data ?? []);
        // Auto-expand all
        const all = new Set<string>();
        function collect(ns: WbsNode[]) {
          for (const n of ns) {
            if (n.children.length > 0) all.add(n.id);
            collect(n.children);
          }
        }
        collect(data ?? []);
        setExpanded(all);
      })
      .catch(() => toast.error("Failed to load WBS"))
      .finally(() => setLoading(false));

    fetch(`/api/boq/tree?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const items: BoqItem[] = [];
        function collect(nodes: any[]) {
          for (const n of nodes) {
            if (n.type === "LINE_ITEM") items.push({ id: n.id, serialNo: n.serialNo, description: n.description });
            if (n.children) collect(n.children);
          }
        }
        collect(data.tree ?? []);
        setBoqItems(items);
      });
  }, [projectId]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onAdd(pid: string | null) {
    setEditingNode(null);
    setParentId(pid);
    setDialogOpen(true);
  }

  function onEdit(node: WbsNode) {
    setEditingNode(node);
    setParentId(node.parentId ?? null);
    setDialogOpen(true);
  }

  async function onDelete(node: WbsNode) {
    if (!confirm(`Delete "${node.name}"? This will also delete all child nodes.`)) return;
    try {
      const res = await fetch(`/api/wbs/nodes/${node.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("WBS node deleted");
      router.refresh();
      fetch(`/api/wbs/tree?projectId=${projectId}`).then((r) => r.json()).then(setTree);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (projects.length === 0) {
    return <EmptyState icon={<ListChecks />} title="No projects" description="Create a project to start building its WBS." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <Field label="Project">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="max-w-sm">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        {canEdit && tree.length > 0 && (
          <Button size="sm" onClick={() => onAdd(null)}>
            <Plus className="mr-1 h-4 w-4" /> Add Node
          </Button>
        )}
      </div>

      {loading ? (
        <PageLoading label="Loading WBS…" variant="default" />
      ) : tree.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="No WBS nodes yet"
          description="Build the work breakdown structure: project → phases → activities → sub-activities. Link activities to BOQ items for cost tracking."
          action={canEdit ? (
            <Button size="sm" onClick={() => onAdd(null)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Node
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div>Activity / Node</div>
            <div>Type</div>
            <div>Schedule</div>
            <div>Progress</div>
            <div className="w-20"></div>
          </div>
          <WbsTree
            nodes={tree}
            expanded={expanded}
            toggle={toggle}
            canEdit={canEdit}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
            depth={0}
          />
        </div>
      )}

      <WbsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        boqItems={boqItems}
        node={editingNode}
        parentId={parentId}
      />
    </div>
  );
}

function WbsTree({
  nodes,
  expanded,
  toggle,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
  depth,
}: {
  nodes: WbsNode[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  canEdit: boolean;
  onAdd: (pid: string | null) => void;
  onEdit: (n: WbsNode) => void;
  onDelete: (n: WbsNode) => void;
  depth: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expanded.has(node.id);
        const hasChildren = node.children.length > 0;
        return (
          <div key={node.id}>
            <div
              className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 border-b border-border/50 px-3 py-2 text-sm hover:bg-muted/30"
              style={{ paddingLeft: `${12 + depth * 20}px` }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {hasChildren ? (
                  <button onClick={() => toggle(node.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="text-xs text-muted-foreground font-mono">{node.code}</span>
                <span className="truncate">{node.name}</span>
                {node.isCritical && (
                  <Badge variant="danger" className="shrink-0 text-xs">Critical</Badge>
                )}
                {node.boqItem && (
                  <Badge variant="muted" className="shrink-0 text-xs">{node.boqItem.serialNo}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground self-center">{TYPE_LABELS[node.type]}</div>
              <div className="text-xs self-center">
                {node.plannedStart ? `${formatDate(node.plannedStart)} → ${node.plannedEnd ? formatDate(node.plannedEnd) : "?"}` : "—"}
              </div>
              <div className="self-center">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full", node.progressPct >= 100 ? "bg-emerald-500" : "bg-primary")}
                      style={{ width: `${Math.min(node.progressPct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{node.progressPct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="flex items-center gap-1 w-20">
                {canEdit && (
                  <>
                    <button onClick={() => onAdd(node.id)} className="text-muted-foreground hover:text-primary" title="Add child">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onEdit(node)} className="text-muted-foreground hover:text-primary" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onDelete(node)} className="text-muted-foreground hover:text-destructive" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
            {hasChildren && isExpanded && (
              <WbsTree
                nodes={node.children}
                expanded={expanded}
                toggle={toggle}
                canEdit={canEdit}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function WbsFormDialog({
  open,
  onOpenChange,
  projectId,
  boqItems,
  node,
  parentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  boqItems: BoqItem[];
  node: WbsNode | null;
  parentId: string | null;
}) {
  const router = useRouter();
  const isEdit = node != null;
  const [form, setForm] = useState({
    code: node?.code ?? "",
    name: node?.name ?? "",
    type: node?.type ?? "ACTIVITY",
    description: node?.description ?? "",
    boqItemId: node?.boqItem?.id ?? "",
    plannedStart: node?.plannedStart?.slice(0, 10) ?? "",
    plannedEnd: node?.plannedEnd?.slice(0, 10) ?? "",
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        projectId,
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        description: form.description || null,
        boqItemId: form.boqItemId || null,
        plannedStart: form.plannedStart ? new Date(form.plannedStart).toISOString() : null,
        plannedEnd: form.plannedEnd ? new Date(form.plannedEnd).toISOString() : null,
      };
      if (parentId) payload.parentId = parentId;
      const res = await fetch(
        isEdit ? `/api/wbs/nodes/${node!.id}` : "/api/wbs/nodes",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(isEdit ? "WBS node updated" : "WBS node created");
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
      title={isEdit ? "Edit WBS Node" : "New WBS Node"}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="WBS Code" required>
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="A1.2.3" required />
          </Field>
          <Field label="Type" required>
            <Select value={form.type} onChange={(e) => set("type", e.target.value as typeof form.type)}>
              <option value="PROJECT_NODE">Project Node</option>
              <option value="PHASE_NODE">Phase Node</option>
              <option value="ACTIVITY">Activity</option>
              <option value="SUB_ACTIVITY">Sub-Activity</option>
              <option value="MILESTONE">Milestone</option>
            </Select>
          </Field>
        </div>
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Excavation" required />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Planned Start">
            <Input type="date" value={form.plannedStart} onChange={(e) => set("plannedStart", e.target.value)} />
          </Field>
          <Field label="Planned End">
            <Input type="date" value={form.plannedEnd} onChange={(e) => set("plannedEnd", e.target.value)} />
          </Field>
          <Field label="Linked BOQ Item">
            <Select value={form.boqItemId} onChange={(e) => set("boqItemId", e.target.value)}>
              <option value="">— None —</option>
              {boqItems.map((b) => <option key={b.id} value={b.id}>{b.serialNo} — {b.description}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
