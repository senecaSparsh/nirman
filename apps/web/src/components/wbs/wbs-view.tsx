"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { cn, formatDate, formatCurrency, formatNumber } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import {
  ListChecks,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Diamond,
  Search,
  X,
  Info,
} from "lucide-react";

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
  boqItem: { id: string; serialNo: string; description: string; estimatedAmount: number | null; estimatedQty: number | null; unit: string | null; rate: number | null } | null;
  children: WbsNode[];
  _count?: { mbEntries: number; children: number };
};

const TYPE_LABELS: Record<WbsNode["type"], string> = {
  PROJECT_NODE: "Project",
  PHASE_NODE: "Phase",
  ACTIVITY: "Activity",
  SUB_ACTIVITY: "Sub-Activity",
  MILESTONE: "Milestone",
};

// Allowed child types per parent type
const CHILD_TYPES: Record<WbsNode["type"] | "ROOT", WbsNode["type"][]> = {
  ROOT: ["PROJECT_NODE", "PHASE_NODE"],
  PROJECT_NODE: ["PHASE_NODE"],
  PHASE_NODE: ["ACTIVITY", "MILESTONE"],
  ACTIVITY: ["SUB_ACTIVITY", "MILESTONE"],
  SUB_ACTIVITY: ["MILESTONE"],
  MILESTONE: [],
};

// ── Date helpers ──
function parseDate(s: string | null): number | null {
  if (!s) return null;
  return new Date(s).getTime();
}
function daysBetween(start: string | null, end: string | null): number | null {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s == null || e == null) return null;
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}
function formatDuration(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "0d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  return remDays === 0 ? `${months}mo` : `${months}mo ${remDays}d`;
}

// ── Status computation ──
type Status = "not-started" | "in-progress" | "completed" | "overdue" | "no-schedule";
function getStatus(n: WbsNode): Status {
  if (!n.plannedStart || !n.plannedEnd) return "no-schedule";
  if (n.progressPct >= 100) return "completed";
  const now = Date.now();
  const end = parseDate(n.plannedEnd)!;
  if (now > end && n.progressPct < 100) return "overdue";
  const start = parseDate(n.plannedStart)!;
  if (now >= start) return "in-progress";
  return "not-started";
}

const STATUS_CONFIG: Record<Status, { label: string; dot: string; text: string }> = {
  "not-started": { label: "Not Started", dot: "bg-slate-400", text: "text-slate-500" },
  "in-progress": { label: "In Progress", dot: "bg-blue-500", text: "text-blue-600" },
  completed: { label: "Completed", dot: "bg-emerald-500", text: "text-emerald-600" },
  overdue: { label: "Overdue", dot: "bg-red-500", text: "text-red-600" },
  "no-schedule": { label: "No Schedule", dot: "bg-slate-300", text: "text-slate-400" },
};

// ── Rollup: compute aggregated progress + date range + budget from children ──
function rollup(node: WbsNode): { progress: number; minStart: number | null; maxEnd: number | null; duration: number | null; budget: number | null } {
  if (node.children.length === 0) {
    return {
      progress: node.progressPct,
      minStart: parseDate(node.plannedStart),
      maxEnd: parseDate(node.plannedEnd),
      duration: daysBetween(node.plannedStart, node.plannedEnd),
      budget: node.boqItem?.estimatedAmount ?? null,
    };
  }
  let progressSum = 0;
  let count = 0;
  let minStart: number | null = null;
  let maxEnd: number | null = null;
  let budgetSum = 0;
  let hasBudget = false;
  for (const child of node.children) {
    const r = rollup(child);
    progressSum += r.progress;
    count++;
    if (r.minStart != null && (minStart == null || r.minStart < minStart)) minStart = r.minStart;
    if (r.maxEnd != null && (maxEnd == null || r.maxEnd > maxEnd)) maxEnd = r.maxEnd;
    if (r.budget != null) { budgetSum += r.budget; hasBudget = true; }
  }
  const progress = count > 0 ? progressSum / count : node.progressPct;
  const duration = minStart != null && maxEnd != null ? Math.round((maxEnd - minStart) / (1000 * 60 * 60 * 24)) : null;
  return { progress, minStart, maxEnd, duration, budget: hasBudget ? budgetSum : (node.boqItem?.estimatedAmount ?? null) };
}

// ── Smart code generator ──
function computeNextCode(parent: WbsNode | null, fullTree: WbsNode[]): string {
  if (parent) {
    const siblings = parent.children;
    const prefix = parent.code + ".";
    let max = 0;
    for (const s of siblings) {
      if (s.code.startsWith(prefix)) {
        const lastSeg = s.code.slice(prefix.length);
        const n = parseInt(lastSeg, 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    return `${parent.code}.${max + 1}`;
  } else {
    let max = 0;
    for (const n of fullTree) {
      const parsed = parseInt(n.code, 10);
      if (!isNaN(parsed) && parsed > max) max = parsed;
    }
    return String(max + 1);
  }
}

// ── Compute overall project date range for Gantt timeline ──
function computeDateRange(nodes: WbsNode[]): { start: number; end: number } | null {
  let minStart: number | null = null;
  let maxEnd: number | null = null;
  function walk(ns: WbsNode[]) {
    for (const n of ns) {
      const s = parseDate(n.plannedStart);
      const e = parseDate(n.plannedEnd);
      if (s != null && (minStart == null || s < minStart)) minStart = s;
      if (e != null && (maxEnd == null || e > maxEnd)) maxEnd = e;
      walk(n.children);
    }
  }
  walk(nodes);
  if (minStart == null || maxEnd == null) return null;
  // Add 5% padding on each side
  const span = maxEnd - minStart;
  const pad = span * 0.05;
  return { start: minStart - pad, end: maxEnd + pad };
}

// ── Generate time markers for the Gantt header ──
// Adapts granularity based on span: monthly < 12mo, bi-monthly < 24mo, quarterly < 48mo, half-yearly otherwise
function generateMonthMarkers(range: { start: number; end: number }): { label: string; pos: number; major: boolean }[] {
  const markers: { label: string; pos: number; major: boolean }[] = [];
  const span = range.end - range.start;
  const spanDays = span / (1000 * 60 * 60 * 24);
  const spanMonths = spanDays / 30;

  // Choose interval: how many months between markers
  let intervalMonths: number;
  if (spanMonths <= 8) intervalMonths = 1;
  else if (spanMonths <= 16) intervalMonths = 2;
  else if (spanMonths <= 36) intervalMonths = 3; // quarterly
  else intervalMonths = 6; // half-yearly

  const start = new Date(range.start);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  const cur = new Date(start);

  while (cur <= end) {
    const pos = (cur.getTime() - range.start) / span;
    if (pos >= 0 && pos <= 1) {
      const isJan = cur.getMonth() === 0;
      const label = isJan
        ? cur.toLocaleDateString("en-IN", { year: "numeric" })
        : cur.toLocaleDateString("en-IN", { month: "short" });
      markers.push({
        label,
        pos: pos * 100,
        major: isJan,
      });
    }
    cur.setMonth(cur.getMonth() + intervalMonths);
  }
  return markers;
}

// ════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════
export function WbsView({ projects, canEdit }: { projects: Project[]; canEdit: boolean }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [tree, setTree] = useState<WbsNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<WbsNode | null>(null);
  const [parentNode, setParentNode] = useState<WbsNode | null>(null);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [search, setSearch] = useState("");
  const [detailNode, setDetailNode] = useState<WbsNode | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const fetchTree = useCallback(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/wbs/tree?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setTree(data ?? []);
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
  }, [projectId]);

  useEffect(() => {
    fetchTree();
    fetch(`/api/boq/tree?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const items: BoqItem[] = [];
        function collect(nodes: { type: string; id: string; serialNo: string; description: string; children?: unknown[] }[]) {
          for (const n of nodes) {
            if (n.type === "LINE_ITEM") items.push({ id: n.id, serialNo: n.serialNo, description: n.description });
            if (n.children) collect(n.children as typeof nodes);
          }
        }
        collect(data.tree ?? []);
        setBoqItems(items);
      });
  }, [fetchTree, projectId]);

  // Flat lookup for syncing editingNode after refetch
  const nodeMap = useMemo(() => {
    const map = new Map<string, WbsNode>();
    function collect(nodes: WbsNode[]) {
      for (const n of nodes) {
        map.set(n.id, n);
        collect(n.children);
      }
    }
    collect(tree);
    return map;
  }, [tree]);

  // Sync editingNode with fresh tree data after refetch
  useEffect(() => {
    if (editingNode) {
      const fresh = nodeMap.get(editingNode.id);
      if (fresh && fresh !== editingNode) {
        setEditingNode(fresh);
        setParentNode(fresh.parentId ? nodeMap.get(fresh.parentId) ?? null : null);
      }
    }
  }, [nodeMap, editingNode]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    const all = new Set<string>();
    function collect(ns: WbsNode[]) {
      for (const n of ns) {
        if (n.children.length > 0) all.add(n.id);
        collect(n.children);
      }
    }
    collect(tree);
    setExpanded(all);
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function onAdd(parent: WbsNode | null) {
    setEditingNode(null);
    setParentNode(parent);
    setDialogOpen(true);
  }

  function onEdit(node: WbsNode) {
    setEditingNode(node);
    setParentNode(node.parentId ? nodeMap.get(node.parentId) ?? null : null);
    setDialogOpen(true);
  }

  async function onDelete(node: WbsNode) {
    // Count MB entries in this node + all descendants
    let mbCount = node._count?.mbEntries ?? 0;
    let childCount = 0;
    function walk(ns: WbsNode[]) {
      for (const n of ns) {
        childCount++;
        mbCount += n._count?.mbEntries ?? 0;
        walk(n.children);
      }
    }
    walk(node.children);

    const parts = [`Delete "${node.name}"?`];
    if (childCount > 0) parts.push(`This will also delete ${childCount} child node${childCount > 1 ? "s" : ""}.`);
    if (mbCount > 0) parts.push(`⚠ ${mbCount} Measurement Book entr${mbCount > 1 ? "ies are" : "y is"} linked and will be unlinked (not deleted).`);
    const ok = await confirm({
      title: `Delete "${node.name}"?`,
      description: parts.slice(1).join("\n"),
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/wbs/nodes/${node.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("WBS node deleted");
      fetchTree();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  // ── Summary stats ──
  const stats = useMemo(() => {
    let total = 0, activities = 0, milestones = 0, critical = 0, completed = 0, overdue = 0;
    let progressSum = 0;
    let budgetSum = 0;
    let hasBudget = false;
    function walk(ns: WbsNode[]) {
      for (const n of ns) {
        total++;
        if (n.type === "MILESTONE") milestones++;
        else activities++;
        if (n.isCritical) critical++;
        if (n.progressPct >= 100) completed++;
        if (getStatus(n) === "overdue") overdue++;
        progressSum += n.progressPct;
        if (n.boqItem?.estimatedAmount != null) { budgetSum += n.boqItem.estimatedAmount; hasBudget = true; }
        walk(n.children);
      }
    }
    walk(tree);
    return {
      total,
      activities,
      milestones,
      critical,
      completed,
      overdue,
      avgProgress: total > 0 ? Math.round(progressSum / total) : 0,
      budget: hasBudget ? budgetSum : null,
    };
  }, [tree]);

  const dateRange = useMemo(() => computeDateRange(tree), [tree]);
  const monthMarkers = useMemo(() => (dateRange ? generateMonthMarkers(dateRange) : []), [dateRange]);
  const todayPct = useMemo(() => {
    if (!dateRange) return null;
    const span = dateRange.end - dateRange.start;
    const pct = ((Date.now() - dateRange.start) / span) * 100;
    return pct >= 0 && pct <= 100 ? pct : null;
  }, [dateRange]);

  // ── Search filter: keep matching nodes + their ancestors ──
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    function filterNodes(ns: WbsNode[]): WbsNode[] {
      const result: WbsNode[] = [];
      for (const n of ns) {
        const children = filterNodes(n.children);
        const match = n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q);
        if (match || children.length > 0) {
          result.push({ ...n, children });
        }
      }
      return result;
    }
    return filterNodes(tree);
  }, [tree, search]);

  // When searching, auto-expand all visible nodes
  const visibleTree = search.trim() ? filteredTree : tree;
  const effectiveExpanded = useMemo(() => {
    if (!search.trim()) return expanded;
    const all = new Set<string>();
    function collect(ns: WbsNode[]) {
      for (const n of ns) {
        if (n.children.length > 0) all.add(n.id);
        collect(n.children);
      }
    }
    collect(filteredTree);
    return all;
  }, [filteredTree, search, expanded]);

  if (projects.length === 0) {
    return <EmptyState icon={<ListChecks />} title="No projects" description="Create a project to start building its WBS." />;
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-title text-foreground">Work Breakdown Structure</h1>
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-7 w-auto min-w-[180px] text-caption"
          >
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {tree.length > 0 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or name…"
                className="h-7 w-48 pl-7 pr-7 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {tree.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => (expanded.size > 0 ? collapseAll() : expandAll())}>
              <ChevronsUpDown className="mr-1 h-3.5 w-3.5" />
              {expanded.size > 0 ? "Collapse All" : "Expand All"}
            </Button>
          )}
          {canEdit && tree.length > 0 && (
            <Button size="sm" onClick={() => onAdd(null)}>
              <Plus className="mr-1 h-4 w-4" /> Add Node
            </Button>
          )}
        </div>
      </header>

      {/* ── Summary stats bar ── */}
      {tree.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground border-b border-border pb-2">
          <span><strong className="text-foreground tabular-nums">{stats.total}</strong> nodes</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{stats.completed}</strong> done</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{stats.activities}</strong> activities</span>
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{stats.milestones}</strong> milestones</span>
          {stats.critical > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-red-600"><strong className="tabular-nums">{stats.critical}</strong> critical</span>
            </>
          )}
          {stats.overdue > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="text-red-600"><strong className="tabular-nums">{stats.overdue}</strong> overdue</span>
            </>
          )}
          <span className="text-border">·</span>
          <span><strong className="text-foreground tabular-nums">{stats.avgProgress}%</strong> avg</span>
          {stats.budget != null && (
            <>
              <span className="text-border">·</span>
              <span><strong className="text-foreground tabular-nums">{formatCurrency(stats.budget)}</strong> budget</span>
            </>
          )}
          {dateRange && (
            <>
              <span className="text-border">·</span>
              <span><strong className="text-foreground">{formatDate(new Date(dateRange.start))}</strong> → <strong className="text-foreground">{formatDate(new Date(dateRange.end))}</strong></span>
            </>
          )}
          <span className="ml-auto flex items-center gap-2.5 text-[10px]">
            <span className="flex items-center gap-1"><span className="h-2 w-2.5 rounded-sm bg-blue-500" /> Activity</span>
            <span className="flex items-center gap-1"><span className="relative h-2.5 w-2.5 flex items-center"><span className="absolute left-0 top-1/2 -translate-y-1/2 h-2.5 w-px bg-indigo-500" /><span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-indigo-400" /><span className="absolute right-0 top-1/2 -translate-y-1/2 h-2.5 w-px bg-indigo-500" /></span> Summary</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rotate-45 bg-amber-400 border border-amber-600" /> Milestone</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2.5 rounded-sm bg-red-500" /> Critical</span>
            {todayPct != null && <span className="flex items-center gap-1"><span className="h-3 w-px bg-red-500" /> Today</span>}
          </span>
        </div>
      )}

      {/* ── Main content ── */}
      {loading && tree.length === 0 ? (
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
      ) : search.trim() && visibleTree.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          No nodes match "<strong className="text-foreground">{search}</strong>". Try a different search.
        </div>
      ) : (
        <div className={cn("rounded-lg border border-border overflow-hidden", loading && "pointer-events-none opacity-60 transition-opacity")}>
          <div className="overflow-x-auto">
            <div className="min-w-[1200px]">
              {/* ── Column headers ── */}
              <div className="grid grid-cols-[minmax(280px,2.5fr)_70px_55px_95px_85px_90px_2fr] gap-0 border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                <div className="px-3 py-2">Activity</div>
                <div className="px-2 py-2">Type</div>
                <div className="px-2 py-2 text-right">Dur</div>
                <div className="px-2 py-2">Progress</div>
                <div className="px-2 py-2">Status</div>
                <div className="px-2 py-2 text-right">Budget</div>
                {/* Gantt header */}
                <div className="relative border-l border-border h-11 overflow-hidden">
                  {monthMarkers.length > 0 && (
                    <div className="absolute inset-0">
                      {monthMarkers.map((m, i) => (
                        <div
                          key={i}
                          className={cn(
                            "absolute top-0 bottom-0 pl-1 pt-1.5 whitespace-nowrap",
                            m.major
                              ? "border-l border-border text-[10px] font-semibold text-foreground/60"
                              : "border-l border-border/30 text-[9px] text-muted-foreground/50",
                          )}
                          style={{ left: `${m.pos}%` }}
                        >
                          {m.label}
                        </div>
                      ))}
                    </div>
                  )}
                  {todayPct != null && (
                    <div className="absolute top-0 bottom-0 w-px bg-red-500/70 z-10" style={{ left: `${todayPct}%` }}>
                      <div className="absolute top-0 -translate-x-1/2 text-[8px] font-semibold text-red-600 whitespace-nowrap">
                        ▼
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Tree rows ── */}
              <WbsTree
                nodes={visibleTree}
                expanded={effectiveExpanded}
                toggle={toggle}
                canEdit={canEdit}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
                onDetail={setDetailNode}
                depth={0}
                dateRange={dateRange}
                todayPct={todayPct}
                monthMarkers={monthMarkers}
              />
            </div>
          </div>
        </div>
      )}

      <WbsFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        boqItems={boqItems}
        node={editingNode}
        parentNode={parentNode}
        tree={tree}
        onSaved={fetchTree}
      />

      <WbsDetailDialog
        node={detailNode}
        onClose={() => setDetailNode(null)}
      />
      {confirmDialog}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// WBS Tree (recursive)
// ════════════════════════════════════════════════════════════
function WbsTree({
  nodes,
  expanded,
  toggle,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
  onDetail,
  depth,
  dateRange,
  todayPct,
  monthMarkers,
}: {
  nodes: WbsNode[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  canEdit: boolean;
  onAdd: (parent: WbsNode | null) => void;
  onEdit: (n: WbsNode) => void;
  onDelete: (n: WbsNode) => void;
  onDetail: (n: WbsNode) => void;
  depth: number;
  dateRange: { start: number; end: number } | null;
  todayPct: number | null;
  monthMarkers: { label: string; pos: number; major: boolean }[];
}) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expanded.has(node.id);
        const hasChildren = node.children.length > 0;
        const isMilestone = node.type === "MILESTONE";
        const isSummary = hasChildren || node.type === "PROJECT_NODE" || node.type === "PHASE_NODE";
        const status = getStatus(node);
        const statusCfg = STATUS_CONFIG[status];
        const dur = isMilestone ? 0 : daysBetween(node.plannedStart, node.plannedEnd);
        const r = rollup(node);
        const displayProgress = isSummary ? r.progress : node.progressPct;

        return (
          <div key={node.id}>
            <div
              className={cn(
                "group grid grid-cols-[minmax(280px,2.5fr)_70px_55px_95px_85px_90px_2fr] gap-0 border-b border-border/30 text-sm hover:bg-muted/30 transition-colors",
                node.isCritical && "bg-red-500/5",
                isSummary
                  ? "bg-muted/10 font-medium border-b border-border/50"
                  : depth % 2 === 1 && "bg-muted/5",
              )}
              style={{ minHeight: "40px" }}
            >
              {/* ── Name + code + actions ── */}
              <div
                className={cn("flex items-center gap-1.5 px-3 py-1.5 min-w-0", hasChildren && "cursor-pointer")}
                style={{ paddingLeft: `${12 + depth * 18}px` }}
                onClick={hasChildren ? () => toggle(node.id) : undefined}
              >
                {hasChildren ? (
                  <span className="shrink-0 text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="shrink-0 text-[11px] text-muted-foreground font-mono tabular-nums">{node.code}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {isMilestone && <Diamond className="h-3 w-3 shrink-0 fill-amber-500 text-amber-600" />}
                    <span className={cn("truncate", isMilestone && "font-medium")}>{node.name}</span>
                    {node.isCritical && (
                      <span className="shrink-0 text-[9px] font-medium text-red-600 uppercase tracking-wide">Crit</span>
                    )}
                    {node.boqItem && (
                      <span className="shrink-0 text-[9px] text-muted-foreground font-mono" title={node.boqItem.description}>
                        {node.boqItem.serialNo}
                      </span>
                    )}
                    {node._count?.mbEntries ? (
                      <span
                        className="shrink-0 text-[9px] text-blue-600 dark:text-blue-400 cursor-help"
                        title={`${node._count.mbEntries} Measurement Book entr${node._count.mbEntries === 1 ? "y" : "ies"} linked · Progress = (Σ approved qty ÷ BOQ est qty) × 100`}
                      >
                        {node._count.mbEntries} MB
                      </span>
                    ) : null}
                  </div>
                  {node.description && (
                    <p className="truncate text-[10px] text-muted-foreground/60 mt-0.5">{node.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onDetail(node)} className="p-1 text-muted-foreground hover:text-primary rounded" title="Details">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                  {canEdit && (
                    <>
                      <button onClick={() => onAdd(node)} className="p-1 text-muted-foreground hover:text-primary rounded" title="Add child">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onEdit(node)} className="p-1 text-muted-foreground hover:text-primary rounded" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onDelete(node)} className="p-1 text-muted-foreground hover:text-destructive rounded" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Type ── */}
              <div className="px-2 py-1.5 self-center text-[11px] text-muted-foreground">
                {TYPE_LABELS[node.type]}
              </div>

              {/* ── Duration ── */}
              <div className="px-2 py-1.5 self-center text-right text-[11px] text-muted-foreground tabular-nums">
                {isMilestone ? "—" : formatDuration(dur)}
              </div>

              {/* ── Progress ── */}
              <div className="px-2 py-1.5 self-center">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[45px]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        displayProgress >= 100 ? "bg-emerald-500" : node.isCritical ? "bg-red-500" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(displayProgress, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">
                    {Math.round(displayProgress)}%
                  </span>
                  {node._count?.mbEntries ? (
                    <span className="text-[8px] text-blue-600/70 dark:text-blue-400/70 shrink-0 cursor-help" title="Auto-tracked: progress = (Σ approved MB qty ÷ BOQ est qty) × 100">●</span>
                  ) : null}
                </div>
              </div>

              {/* ── Status ── */}
              <div className="px-2 py-1.5 self-center">
                <div className="flex items-center gap-1">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", statusCfg.dot)} />
                  <span className={cn("text-[10px]", statusCfg.text)}>{statusCfg.label}</span>
                </div>
              </div>

              {/* ── Budget ── */}
              <div className="px-2 py-1.5 self-center text-right text-[11px] tabular-nums text-muted-foreground">
                {isSummary && r.budget != null ? (
                  <span className="font-medium text-foreground/70">{formatCurrency(r.budget)}</span>
                ) : node.boqItem?.estimatedAmount != null ? (
                  formatCurrency(node.boqItem.estimatedAmount)
                ) : "—"}
              </div>

              {/* ── Gantt bar ── */}
              <div className="relative border-l border-border/30 self-stretch flex items-center">
                <GanttBar node={node} dateRange={dateRange} isSummary={isSummary} rolledProgress={r.progress} todayPct={todayPct} monthMarkers={monthMarkers} />
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
                onDetail={onDetail}
                depth={depth + 1}
                dateRange={dateRange}
                todayPct={todayPct}
                monthMarkers={monthMarkers}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// ════════════════════════════════════════════════════════════
// Gantt bar — positioned within the timeline column
// ════════════════════════════════════════════════════════════
function GanttBar({
  node,
  dateRange,
  isSummary,
  rolledProgress,
  todayPct,
  monthMarkers,
}: {
  node: WbsNode;
  dateRange: { start: number; end: number } | null;
  isSummary: boolean;
  rolledProgress: number;
  todayPct: number | null;
  monthMarkers: { label: string; pos: number; major: boolean }[];
}) {
  if (!dateRange) return <div className="px-2 text-[10px] text-muted-foreground/40">No schedule</div>;

  const start = parseDate(node.plannedStart);
  const end = parseDate(node.plannedEnd);

  // Gridlines from month markers
  const gridlines = (
    <>
      {monthMarkers.map((m, i) => (
        <div
          key={i}
          className={cn(
            "absolute top-0 bottom-0",
            m.major ? "border-l border-border/40" : "border-l border-border/15",
          )}
          style={{ left: `${m.pos}%` }}
        />
      ))}
    </>
  );

  if (start == null || end == null) {
    return (
      <div className="relative w-full h-full">
        {gridlines}
        {todayPct != null && (
          <div className="absolute top-0 bottom-0 w-px bg-red-500/50 z-20" style={{ left: `${todayPct}%` }} />
        )}
      </div>
    );
  }

  const span = dateRange.end - dateRange.start;
  const leftPct = Math.max(((start - dateRange.start) / span) * 100, 0);
  const widthPct = Math.max(((end - start) / span) * 100, 0.5);
  const progress = isSummary ? rolledProgress : node.progressPct;
  const isMilestone = node.type === "MILESTONE";

  if (isMilestone) {
    return (
      <div className="relative w-full h-full">
        {gridlines}
        {todayPct != null && (
          <div className="absolute top-0 bottom-0 w-px bg-red-500/50 z-20" style={{ left: `${todayPct}%` }} />
        )}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-30"
          style={{ left: `${leftPct}%` }}
          title={`${node.name} — ${formatDate(node.plannedStart)}`}
        >
          <div className={cn(
            "h-3 w-3 rotate-45 border-2",
            node.isCritical ? "bg-red-500 border-red-600" : "bg-amber-400 border-amber-600",
          )} />
        </div>
      </div>
    );
  }

  if (isSummary) {
    // Summary: thin bar with end caps (MS Project style)
    return (
      <div className="relative w-full h-full">
        {gridlines}
        {todayPct != null && (
          <div className="absolute top-0 bottom-0 w-px bg-red-500/50 z-20" style={{ left: `${todayPct}%` }} />
        )}
        <div
          className="absolute top-1/2 -translate-y-1/2 z-30"
          style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.8)}%` }}
          title={`${formatDate(node.plannedStart)} → ${formatDate(node.plannedEnd)} (${formatDuration(daysBetween(node.plannedStart, node.plannedEnd))})`}
        >
          {/* Horizontal line */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-px bg-indigo-400" />
          {/* End cap left */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-3 w-px bg-indigo-500" />
          {/* End cap right */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-px bg-indigo-500" />
          {/* Progress fill */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1 bg-indigo-500/50 rounded-full"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {gridlines}
      {todayPct != null && (
        <div className="absolute top-0 bottom-0 w-px bg-red-500/50 z-20" style={{ left: `${todayPct}%` }} />
      )}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 h-3.5 rounded-sm overflow-hidden flex items-center z-30",
          node.isCritical && "ring-1 ring-red-500",
          node.isCritical
            ? "bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600"
            : "bg-blue-100 dark:bg-blue-900/30 border border-blue-400 dark:border-blue-600",
        )}
        style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.8)}%` }}
        title={`${formatDate(node.plannedStart)} → ${formatDate(node.plannedEnd)} (${formatDuration(daysBetween(node.plannedStart, node.plannedEnd))})`}
      >
        <div
          className={cn(
            "h-full",
            node.isCritical
              ? "bg-red-500"
              : progress >= 100 ? "bg-emerald-500" : "bg-blue-500",
          )}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
        {widthPct > 10 && (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-foreground/80 z-10">
            {Math.round(progress)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Form Dialog
// ════════════════════════════════════════════════════════════
function WbsFormDialog({
  open,
  onOpenChange,
  projectId,
  boqItems,
  node,
  parentNode,
  tree,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  boqItems: BoqItem[];
  node: WbsNode | null;
  parentNode: WbsNode | null;
  tree: WbsNode[];
  onSaved?: () => void;
}) {
  const isEdit = node != null;
  const parentId = parentNode?.id ?? null;

  const allowedTypes = CHILD_TYPES[parentNode ? parentNode.type : "ROOT"] ?? ["ACTIVITY"];
  const defaultType = allowedTypes[0];
  const nextCode = isEdit ? (node?.code ?? "") : computeNextCode(parentNode, tree);

  // Map of BOQ item ID → WBS node ID that already links to it
  const { linkedBoqMap, flatNodes } = useMemo(() => {
    const boqMap = new Map<string, string>();
    const nodeMap = new Map<string, WbsNode>();
    function walk(ns: WbsNode[]) {
      for (const n of ns) {
        nodeMap.set(n.id, n);
        if (n.boqItem?.id) boqMap.set(n.boqItem.id, n.id);
        walk(n.children);
      }
    }
    walk(tree);
    return { linkedBoqMap: boqMap, flatNodes: nodeMap };
  }, [tree]);

  const [form, setForm] = useState({
    code: node?.code ?? nextCode,
    name: node?.name ?? "",
    type: node?.type ?? defaultType,
    description: node?.description ?? "",
    boqItemId: node?.boqItem?.id ?? "",
    plannedStart: node?.plannedStart?.slice(0, 10) ?? "",
    plannedEnd: node?.plannedEnd?.slice(0, 10) ?? "",
    actualStart: node?.actualStart?.slice(0, 10) ?? "",
    actualEnd: node?.actualEnd?.slice(0, 10) ?? "",
    progressPct: node?.progressPct ?? 0,
    isCritical: node?.isCritical ?? false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const c = isEdit ? (node?.code ?? "") : computeNextCode(parentNode, tree);
      setForm({
        code: c,
        name: node?.name ?? "",
        type: node?.type ?? defaultType,
        description: node?.description ?? "",
        boqItemId: node?.boqItem?.id ?? "",
        plannedStart: node?.plannedStart?.slice(0, 10) ?? "",
        plannedEnd: node?.plannedEnd?.slice(0, 10) ?? "",
        actualStart: node?.actualStart?.slice(0, 10) ?? "",
        actualEnd: node?.actualEnd?.slice(0, 10) ?? "",
        progressPct: node?.progressPct ?? 0,
        isCritical: node?.isCritical ?? false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, node, parentNode, tree, defaultType]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    if (form.plannedStart && form.plannedEnd && form.plannedStart > form.plannedEnd) {
      toast.error("Planned end must be after planned start");
      return;
    }
    if (form.actualStart && form.actualEnd && form.actualStart > form.actualEnd) {
      toast.error("Actual end must be after actual start");
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
        actualStart: form.actualStart ? new Date(form.actualStart).toISOString() : null,
        actualEnd: form.actualEnd ? new Date(form.actualEnd).toISOString() : null,
        progressPct: form.progressPct,
        isCritical: form.isCritical,
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
      if (onSaved) onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  const contextLabel = parentNode
    ? `Under: ${parentNode.code} — ${parentNode.name}`
    : "Top-level node";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit WBS Node" : "New WBS Node"}
      description={isEdit ? "Update the WBS node details." : contextLabel}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Identity */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="WBS Code" required>
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="1.2.3" required className="font-mono" />
          </Field>
          <Field label="Type" required>
            <Select
              value={form.type}
              onChange={(e) => set("type", e.target.value as typeof form.type)}
              disabled={allowedTypes.length === 1}
            >
              {allowedTypes.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Excavation" required />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
        </Field>

        {/* Schedule */}
        <div className="border-t border-border pt-3">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Schedule</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Planned Start">
              <Input type="date" value={form.plannedStart} onChange={(e) => set("plannedStart", e.target.value)} />
            </Field>
            <Field label="Planned End">
              <Input type="date" value={form.plannedEnd} onChange={(e) => set("plannedEnd", e.target.value)} />
            </Field>
          </div>
          {form.plannedStart && form.plannedEnd && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Duration: <strong className="text-foreground tabular-nums">{formatDuration(daysBetween(form.plannedStart, form.plannedEnd))}</strong>
            </p>
          )}
        </div>

        {/* Actuals (edit only) */}
        {isEdit && (
          <div className="border-t border-border pt-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Actuals</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Actual Start">
                <Input type="date" value={form.actualStart} onChange={(e) => set("actualStart", e.target.value)} />
              </Field>
              <Field label="Actual End">
                <Input type="date" value={form.actualEnd} onChange={(e) => set("actualEnd", e.target.value)} />
              </Field>
              <Field label="Progress %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progressPct}
                  onChange={(e) => set("progressPct", Math.max(0, Math.min(100, Number(e.target.value))))}
                  disabled={!!node?._count?.mbEntries}
                />
              </Field>
            </div>
            {node?._count?.mbEntries ? (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Progress is auto-calculated from <strong className="text-foreground">{node._count.mbEntries}</strong> approved Measurement Book
                {node._count.mbEntries === 1 ? " entry" : " entries"}. Manual override is disabled.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Link a BOQ item and create Measurement Book entries to auto-track progress from site measurements.
              </p>
            )}
          </div>
        )}

        {/* Linking + flags */}
        <div className="border-t border-border pt-3 grid gap-3 sm:grid-cols-2 items-end">
          <Field label="Linked BOQ Item" hint="Links this activity to a BOQ line item for auto-progress from Measurement Book entries">
            <Select value={form.boqItemId} onChange={(e) => set("boqItemId", e.target.value)}>
              <option value="">— None —</option>
              {boqItems.map((b) => {
                const linkedTo = linkedBoqMap.get(b.id);
                const isLinkedToOther = linkedTo && linkedTo !== node?.id;
                return (
                  <option key={b.id} value={b.id}>
                    {b.serialNo} — {b.description}{isLinkedToOther ? " (already linked)" : ""}
                  </option>
                );
              })}
            </Select>
            {form.boqItemId && (() => {
              const linkedTo = linkedBoqMap.get(form.boqItemId);
              if (linkedTo && linkedTo !== node?.id) {
                const otherNode = flatNodes.get(linkedTo);
                return (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    ⚠ This BOQ item is already linked to {otherNode?.code ?? "another node"} — {otherNode?.name ?? ""}. Linking here will not reassign it.
                  </p>
                );
              }
              return null;
            })()}
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none h-9">
            <input
              type="checkbox"
              checked={form.isCritical}
              onChange={(e) => set("isCritical", e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span>Critical path activity</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════
// WBS Node Detail Dialog — shows MB entries + progress breakdown
// ════════════════════════════════════════════════════════════
type MbEntry = {
  id: string;
  mbNumber: string;
  measuredQty: number;
  cumulativeQty: number;
  description: string;
  measureDate: string;
  status: "DRAFT" | "VERIFIED" | "APPROVED" | "REJECTED";
  measuredBy: { name: string } | null;
};

function WbsDetailDialog({ node, onClose }: { node: WbsNode | null; onClose: () => void }) {
  const [entries, setEntries] = useState<MbEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!node) return;
    setLoading(true);
    fetch(`/api/mb-entries?wbsNodeId=${node.id}`)
      .then((r) => r.json())
      .then((data) => setEntries(data ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [node]);

  if (!node) return null;

  const isMilestone = node.type === "MILESTONE";
  const approvedEntries = entries.filter((e) => e.status === "APPROVED");
  const totalApproved = approvedEntries.reduce((sum, e) => sum + e.measuredQty, 0);
  const hasBoq = !!node.boqItem;
  const r = rollup(node);
  const displayProgress = node.children.length > 0 ? r.progress : node.progressPct;
  const status = getStatus(node);
  const statusCfg = STATUS_CONFIG[status];

  return (
    <Dialog
      open={!!node}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`${node.code} — ${node.name}`}
      description={`${TYPE_LABELS[node.type]}${node.isCritical ? " · Critical path" : ""}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* ── Schedule + Progress ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Planned</div>
            <div className="text-sm tabular-nums">
              {node.plannedStart ? formatDate(node.plannedStart) : "—"}
              {node.plannedEnd && <span className="text-muted-foreground"> → {formatDate(node.plannedEnd)}</span>}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Actual</div>
            <div className="text-sm tabular-nums">
              {node.actualStart ? formatDate(node.actualStart) : "—"}
              {node.actualEnd && <span className="text-muted-foreground"> → {formatDate(node.actualEnd)}</span>}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Progress</div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tabular-nums">{Math.round(displayProgress)}%</span>
              {hasBoq && <span className="text-[9px] text-blue-600 dark:text-blue-400" title="Auto-computed from MB entries">●</span>}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Status</div>
            <div className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", statusCfg.dot)} />
              <span className={cn("text-xs", statusCfg.text)}>{statusCfg.label}</span>
            </div>
          </div>
        </div>

        {/* ── BOQ Link ── */}
        {node.boqItem && (
          <div className="border-t border-border pt-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Linked BOQ Item</div>
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="font-mono text-muted-foreground">{node.boqItem.serialNo}</span>
                <span className="ml-2">{node.boqItem.description}</span>
              </div>
              {node.boqItem.estimatedAmount != null && (
                <span className="tabular-nums font-medium">{formatCurrency(node.boqItem.estimatedAmount)}</span>
              )}
            </div>
            {node.boqItem.estimatedQty != null && (
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>Est. qty: <span className="tabular-nums text-foreground">{formatNumber(node.boqItem.estimatedQty, 3)} {node.boqItem.unit ?? ""}</span></span>
                {node.boqItem.rate != null && <span>Rate: <span className="tabular-nums text-foreground">{formatCurrency(node.boqItem.rate)}/{node.boqItem.unit ?? "unit"}</span></span>}
              </div>
            )}
          </div>
        )}

        {/* ── Progress Breakdown ── */}
        {hasBoq && (
          <div className="border-t border-border pt-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Progress Calculation</div>
            {node.boqItem?.estimatedQty != null ? (
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved measured qty</span>
                  <span className="tabular-nums font-medium">{formatNumber(totalApproved, 3)} {node.boqItem.unit ?? ""}</span>
                </div>
                {entries.some((e) => e.status === "VERIFIED") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pending verification</span>
                    <span className="tabular-nums text-amber-600 dark:text-amber-400">
                      {formatNumber(entries.filter((e) => e.status === "VERIFIED").reduce((s, e) => s + e.measuredQty, 0), 3)} {node.boqItem.unit ?? ""}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">BOQ estimated qty</span>
                  <span className="tabular-nums">{formatNumber(node.boqItem.estimatedQty, 3)} {node.boqItem.unit ?? ""}</span>
                </div>
                <div className="flex justify-between border-t border-border/50 pt-1">
                  <span className="text-muted-foreground text-xs">Formula</span>
                  <span className="tabular-nums text-xs text-muted-foreground">({formatNumber(totalApproved, 0)} ÷ {formatNumber(node.boqItem.estimatedQty, 0)}) × 100</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Current progress</span>
                  <span className="tabular-nums font-bold text-primary">{Math.round(displayProgress)}%</span>
                </div>
                {entries.some((e) => e.status === "VERIFIED") && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                    {formatNumber(entries.filter((e) => e.status === "VERIFIED").reduce((s, e) => s + e.measuredQty, 0), 3)} {node.boqItem.unit ?? ""} awaiting approval — will increase progress once approved.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">BOQ item has no estimated quantity — cannot auto-compute progress.</p>
            )}
          </div>
        )}

        {/* ── MB Entries ── */}
        <div className="border-t border-border pt-3">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Measurement Book Entries ({entries.length})
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No MB entries linked. {hasBoq ? "Create entries in the Measurement Book page — select this activity's BOQ item." : "Link a BOQ item to start tracking progress from site measurements."}
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">MB No.</th>
                    <th className="px-2 py-1.5 text-left">Description</th>
                    <th className="px-2 py-1.5 text-right">Qty</th>
                    <th className="px-2 py-1.5 text-right">Cumul.</th>
                    <th className="px-2 py-1.5 text-left">Date</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-border/30">
                      <td className="px-2 py-1.5 font-mono text-xs">{e.mbNumber}</td>
                      <td className="px-2 py-1.5 truncate max-w-[200px]">{e.description}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(e.measuredQty, 3)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{formatNumber(e.cumulativeQty, 3)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{formatDate(e.measureDate)}</td>
                      <td className="px-2 py-1.5">
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full",
                          e.status === "APPROVED" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                          e.status === "VERIFIED" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                          e.status === "DRAFT" && "bg-muted text-muted-foreground",
                          e.status === "REJECTED" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                        )}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Children summary ── */}
        {node.children.length > 0 && (
          <div className="border-t border-border pt-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Children ({node.children.length})
            </div>
            <div className="space-y-1">
              {node.children.map((c) => {
                const cStatus = getStatus(c);
                const cCfg = STATUS_CONFIG[cStatus];
                return (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cCfg.dot)} />
                    <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                    <span className="truncate flex-1">{c.name}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{Math.round(c.progressPct)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}
