"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  NodeResizer,
  EdgeLabelRenderer,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  Plus, Save, Trash2, Eye, Workflow, Layers, Search,
  Crown, GitBranch, CheckCircle2, AlertCircle,
  Info, HelpCircle, Users, X, UserPlus,
  Paperclip, Link2, FileText,
  Tag, Upload, Download,
  RefreshCw, Copy, AlertTriangle, Pencil, Loader2,
  Calendar, Clock, Flag, StickyNote, ChevronDown,
  Filter, LayoutDashboard, BarChart3, TrendingUp, GanttChart,
  MoreHorizontal, Printer,
  Package, Boxes, Truck, Wallet, ArrowRightLeft, ClipboardList,
  LandPlot, Home, Wrench, Building2,
} from "lucide-react";

import {
  MODULES,
  MODULE_GROUPS,
  MODULE_LIST,
  GROUP_COLORS,
  NODE_KINDS,
  NODE_KIND_LIST,
  PRIORITIES,
  PRIORITY_LIST,
  relationsBetween,
  type Attachment,
  type CustomField,
  type LiveGraph,
  type ModelKey,
  type ModuleGroup,
  type NodeKind,
  type NodeNote,
  type Priority,
  type RelationDef,
  type WorkspaceGraph,
} from "@/lib/modules/registry";
import { validateGraph } from "@/lib/modules/validation";
import { TEMPLATES } from "@/lib/modules/templates";
import { useReferenceData } from "@/components/playground/node-actions";
import { NodePopup } from "@/components/playground/node-popup";
import { MaterialFormDialog } from "@/components/materials/material-form-dialog";
import { CategoryFormDialog } from "@/components/materials/category-form-dialog";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { SupplierFormDialog } from "@/components/procurement/supplier-form-dialog";
import { PurchaseOrderFormDialog } from "@/components/procurement/purchase-order-form-dialog";
import { TransferFormDialog } from "@/components/procurement/transfer-form-dialog";
import { IssueFormDialog } from "@/components/procurement/issue-form-dialog";
import { LandPurchaseFormDialog } from "@/components/land/land-purchase-form-dialog";
import { BuiltUnitFormDialog } from "@/components/built-units/built-unit-form-dialog";
import { CustomerFormDialog } from "@/components/sales/customer-form-dialog";
import { ProjectCostFormDialog } from "@/components/finance/project-cost-form-dialog";
import { ExpenseFormDialog } from "@/components/finance/expense-form-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { RequisitionFormDialog } from "@/components/requisitions/requisition-form-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { AssignTaskDialog } from "@/components/tasks/assign-task-dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";

// ── Group colors (used for nodes, palette dots, minimap) ─────
// GROUP_COLORS is now imported from @/lib/modules/registry

// ── Employee context (lets nodes look up assignee names + handle drops) ──

interface EmployeeInfo { id: string; name: string; trade?: string | null; active?: boolean; }

interface CanvasContextValue {
  employees: EmployeeInfo[];
  today: Date | null;
  onAssignEmployee: (nodeId: string, employeeId: string) => void;
  onUnassign: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
}
const CanvasContext = createContext<CanvasContextValue>({
  employees: [],
  today: null,
  onAssignEmployee: () => {},
  onUnassign: () => {},
  onDeleteNode: () => {},
});

// ── Today hook: returns null during SSR/prerender, real date after mount ──
// Next.js 16 PPR: `new Date()` in a Client Component's render/useMemo makes
// the output time-dependent and breaks prerendering. This hook defers the
// date to a useEffect so it's never called during the server render pass.
function useToday(): Date | null {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setToday(d);
  }, []);
  return today;
}

// Non-hook variant for helper functions that receive `now` as a parameter
function dueDateStatusWithNow(dueDate: string | null, now: Date | null): { label: string; color: string; icon: typeof Clock } {
  if (!dueDate) return { label: "", color: "", icon: Clock };
  if (!now) return { label: "…", color: "#64748b", icon: Clock };
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: "#ef4444", icon: AlertCircle };
  if (diffDays === 0) return { label: "Due today", color: "#f59e0b", icon: Clock };
  if (diffDays <= 3) return { label: `${diffDays}d left`, color: "#f59e0b", icon: Clock };
  return { label: `${diffDays}d left`, color: "#64748b", icon: Clock };
}

// ── Custom node ──────────────────────────────────────────────

type ModuleNodeData = {
  model: ModelKey;
  isRoot?: boolean;
  kind?: NodeKind;
  assigneeId?: string | null;
  attachments?: Attachment[];
  dueDate?: string | null;
  priority?: Priority;
  notes?: NodeNote[];
  customFields?: CustomField[];
  /** When linked to a real DB record, stores the record ID + display label. */
  recordId?: string | null;
  recordLabel?: string | null;
  /** Cached record summary — fetched when the node is linked, so the node
   *  can show the record's status + key metric without re-fetching on every
   *  render. Refreshed after scoped actions create/update related records. */
  recordStatus?: string | null;
  recordMetric?: { label: string; value: string; type: "currency" | "number" | "text" } | null;
};

/** Status badge color — maps common business statuses to semantic colors. */
function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (["ACTIVE", "APPROVED", "RECEIVED", "COMPLETED", "SOLD", "PAID", "IN_STOCK", "AVAILABLE"].includes(s)) return "#16a34a";
  if (["DRAFT", "PLANNED", "PENDING", "SUBMITTED", "OPEN", "ORDERED"].includes(s)) return "#6366f1";
  if (["ON_HOLD", "PARTIAL", "PARTIALLY_RECEIVED", "IN_PROGRESS", "UNDER_CONSTRUCTION"].includes(s)) return "#f59e0b";
  if (["CANCELLED", "REJECTED", "OVERDUE", "BLOCKED", "DEFECTIVE"].includes(s)) return "#ef4444";
  return "#64748b";
}

interface EdgeData {
  relationLabel: string;
  hops: RelationDef["hops"];
  toModel: ModelKey;
  label?: string | null;
  [key: string]: unknown;
}
function ModuleNode({ id, data, selected }: NodeProps) {
  const { model, isRoot, kind, assigneeId, attachments, dueDate, priority, notes, recordId, recordLabel, recordStatus, recordMetric } = data as ModuleNodeData;
  const { employees, today, onAssignEmployee, onUnassign, onDeleteNode } = useContext(CanvasContext);
  const mod = MODULES[model as ModelKey];
  const [dragOver, setDragOver] = useState(false);
  if (!mod) return null;
  const Icon = mod.icon;
  const color = GROUP_COLORS[mod.group];
  const kindDef = kind ? NODE_KINDS[kind] : null;
  const assignee = assigneeId ? employees.find((e) => e.id === assigneeId) : null;
  const priorityDef = priority ? PRIORITIES[priority] : null;
  const ddStatus = dueDateStatusWithNow(dueDate ?? null, today);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const empId = e.dataTransfer.getData("application/nirman-employee");
    if (!empId) return;
    if (kind && NODE_KINDS[kind].canAssign) {
      onAssignEmployee(id, empId);
    } else {
      toast.error(`Set this node to "Active Work" or "Assumption" before assigning a person.`);
    }
  };

  // Overdue check — only for active/assumption nodes with a past due date
  const isOverdue = dueDate && ddStatus.label.includes("overdue") && kind !== "finished";

  return (
    <div
      className={cn(
        "relative h-full w-full min-w-[150px] rounded-xl border-2 bg-card px-2.5 py-2 shadow-md transition-all",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        isRoot && "border-primary/50",
        dragOver && "ring-2 ring-blue-500/40 border-blue-500/60",
        // Kind-based pulse animations — active blinks green, assumption blinks amber,
        // finished gets a steady green border, overdue gets a red pulse
        kind === "active" && !isOverdue && "node-kind-active",
        kind === "assumption" && !isOverdue && "node-kind-assumption",
        kind === "finished" && "node-kind-finished",
        isOverdue && "node-kind-overdue",
      )}
      style={{
        // Kind-based border color is handled by CSS classes above for animation,
        // but we keep the root glow for root nodes
        ...(isRoot && !kind ? { boxShadow: `0 0 0 1px ${color}40, 0 4px 12px ${color}25` } : undefined),
      }}
      onDrop={onDrop}
      onDragOver={(e) => {
        const hasEmp = e.dataTransfer.types.includes("application/nirman-employee");
        if (hasEmp) { e.preventDefault(); e.stopPropagation(); setDragOver(true); }
      }}
      onDragLeave={() => setDragOver(false)}
    >
      {/* Resize handles — only visible when the node is selected.
          Inline styles bypass any CSS specificity issues with xyflow's
          built-in handle styles. */}
      <NodeResizer
        isVisible={!!selected}
        minWidth={150}
        maxWidth={420}
        minHeight={60}
        lineClassName="react-flow-resize-line"
        handleClassName="react-flow-resize-handle"
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: 3,
          border: '2px solid var(--color-primary, #6366f1)',
          backgroundColor: 'var(--color-card, #fff)',
          zIndex: 20,
        }}
        lineStyle={{
          borderColor: 'color-mix(in oklab, var(--color-primary, #6366f1) 40%, transparent)',
          zIndex: 15,
        }}
      />

      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-card" style={{ background: color }} />

      {/* Floating delete button — visible when selected */}
      {selected && (
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteNode(id); }}
          onDoubleClick={(e) => e.stopPropagation()}
          title="Delete node"
          className="nodrag nopan absolute -right-2 -top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-danger/50 bg-card text-danger shadow-md transition-colors hover:bg-danger hover:text-white"
          style={{ pointerEvents: 'all' }}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {isRoot && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Crown className="h-3 w-3" />
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${color}18`, color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12px] font-semibold text-foreground">{mod.label}</p>
          <div className="flex items-center gap-1">
            <p className="truncate text-[10px] text-muted-foreground">{mod.group}</p>
            {kindDef && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1 py-px text-[9px] font-medium"
                style={{ background: `${kindDef.color}18`, color: kindDef.color }}
              >
                <kindDef.icon className="h-2 w-2" />
                {kindDef.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Linked record badge — shows when this node is linked to a real DB record.
          Includes the record's status (colored badge) + key metric (compact),
          so the node is a living summary, not just a dead label. */}
      {recordId && recordLabel && (
        <div className="mt-1 space-y-0.5">
          <div className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5">
            <Link2 className="h-2.5 w-2.5 shrink-0 text-primary" />
            <span className="truncate text-[10px] font-medium text-primary">{recordLabel}</span>
            {recordStatus && (
              <span
                className="ml-auto shrink-0 rounded-full px-1 py-px text-[8px] font-bold uppercase text-white"
                style={{ background: statusColor(recordStatus) }}
                title={`Status: ${recordStatus}`}
              >
                {recordStatus.length > 8 ? recordStatus.slice(0, 6) + "…" : recordStatus}
              </span>
            )}
          </div>
          {recordMetric && recordMetric.value && recordMetric.value !== "—" && (
            <div className="flex items-center gap-1 px-1.5 text-[9px] text-muted-foreground">
              <span className="opacity-60">{recordMetric.label}:</span>
              <span className="font-semibold text-foreground">
                {recordMetric.type === "currency"
                  ? formatCurrency(Number(recordMetric.value))
                  : recordMetric.type === "number"
                    ? formatNumber(Number(recordMetric.value))
                    : recordMetric.value}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Assignee row inside the node — with unassign button */}
      {assignee && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-muted/60 px-1.5 py-1">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-semibold">
            {assignee.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-[11px] font-medium text-foreground">{assignee.name}</span>
          {assignee.trade && <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">{assignee.trade}</span>}
          <button
            onClick={(e) => { e.stopPropagation(); onUnassign(id); }}
            className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-danger"
            title="Unassign"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      {attachments && attachments.length > 0 && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Paperclip className="h-2.5 w-2.5" />
          <span>{attachments.length} attachment{attachments.length !== 1 ? "s" : ""}</span>
          {(() => {
            const allTags = new Set<string>();
            attachments.forEach((a) => a.tags?.forEach((t) => allTags.add(t)));
            return allTags.size > 0 ? (
              <span className="ml-auto flex items-center gap-0.5">
                <Tag className="h-2.5 w-2.5" />
                {allTags.size}
              </span>
            ) : null;
          })()}
        </div>
      )}

      {/* Due date + priority + notes indicators */}
      {(dueDate || priorityDef || (notes && notes.length > 0)) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {dueDate && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-medium"
              style={{ background: `${ddStatus.color}18`, color: ddStatus.color }}
              title={`Due: ${formatDate(dueDate)}`}
            >
              <ddStatus.icon className="h-2 w-2" />
              {formatDate(dueDate).split(",")[0]}
            </span>
          )}
          {priorityDef && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-medium text-white"
              style={{ background: priorityDef.color }}
              title={`${priorityDef.label} priority`}
            >
              <Flag className="h-2 w-2" />
              {priorityDef.label}
            </span>
          )}
          {notes && notes.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-px text-[9px] font-medium text-muted-foreground"
              title={`${notes.length} note${notes.length !== 1 ? "s" : ""}`}
            >
              <StickyNote className="h-2 w-2" />
              {notes.length}
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-card" style={{ background: color }} />
    </div>
  );
}

// ── Custom edge (animated, colored, with editable label) ────

function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  data?: EdgeData;
  selected?: boolean;
}) {
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const { setEdges } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLive = data?.isLive === true;
  const displayLabel = (data?.label ?? data?.relationLabel) || "";

  // In live mode, only show the label pill when hovered or selected.
  // This eliminates the visual noise of dozens of overlapping label pills.
  const showLabel = !isLive || hovered || selected || editing;

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(displayLabel);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    const newLabel = trimmed === "" ? null : trimmed;
    // Only update if changed
    if (newLabel !== (data?.label ?? null)) {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id ? { ...e, data: { ...e.data, label: newLabel }, label: newLabel ?? data?.relationLabel } : e,
        ),
      );
    }
  };

  const removeEdge = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEdges((eds) => eds.filter((ed) => ed.id !== id));
  };

  const edgePath = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;

  return (
    <>
      {/* Wide invisible hit-area so the edge is easy to click/select/hover */}
      <path
        d={edgePath}
        stroke="transparent"
        strokeWidth={24}
        fill="none"
        className="react-flow__edge-interaction"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <path
        id={id}
        className={cn("react-flow__edge-path", selected && "react-flow__edge-path--selected")}
        d={edgePath}
        stroke={selected ? "#6366f1" : isLive ? "#cbd5e1" : "#94a3b8"}
        strokeWidth={selected ? 2.5 : isLive ? 1.5 : 2}
        fill="none"
        markerEnd={showLabel || !isLive ? "url(#arrow)" : undefined}
        opacity={isLive && !hovered && !selected ? 0.6 : 1}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          {editing ? (
            <div
              className="nodrag nopan absolute flex items-center"
              style={{ transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`, pointerEvents: 'all' }}
            >
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditing(false);
                }}
                placeholder={data?.relationLabel ?? "label"}
                className="w-28 rounded-full border border-primary bg-card px-2 py-0.5 text-center text-caption font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ) : (
            <div
              className="nodrag nopan absolute flex items-center gap-1"
              style={{ transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`, pointerEvents: 'all' }}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              <span
                onDoubleClick={startEdit}
                title="Double-click to edit label · Drag endpoints to rewire · Delete to remove"
                className={cn(
                  "cursor-text rounded-full bg-card px-2 py-0.5 text-caption font-medium shadow-sm border transition-colors hover:border-primary/40",
                  data?.label ? "text-primary border-primary/30" : "text-muted-foreground border-border",
                  isLive && !hovered && !selected && "opacity-70",
                )}
              >
                {displayLabel || "—"}
              </span>
              {selected && (
                <button
                  onClick={removeEdge}
                  onDoubleClick={(e) => e.stopPropagation()}
                  title="Delete connection"
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-danger/40 bg-card text-danger shadow-sm transition-colors hover:bg-danger hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = { module: ModuleNode };
const edgeTypes: EdgeTypes = { relation: RelationEdge };

// ── Palette item ─────────────────────────────────────────────

function PaletteItem({ model, onClick }: { model: ModelKey; onClick?: () => void }) {
  const mod = MODULES[model];
  const Icon = mod.icon;
  const color = GROUP_COLORS[mod.group];
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/nirman-module", model);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-meta transition-colors hover:border-border hover:bg-accent",
        onClick ? "cursor-pointer active:bg-accent/60" : "cursor-grab active:cursor-grabbing",
      )}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${color}1f`, color }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="truncate">{mod.label}</span>
      {onClick && (
        <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
      )}
    </div>
  );
}

/** Renders the grouped module list with optional search filter. */
function PaletteList({
  onPick,
  search,
}: {
  onPick?: (model: ModelKey) => void;
  search?: string;
}) {
  const filtered = search
    ? MODULE_LIST.filter((m) =>
        m.label.toLowerCase().includes(search.toLowerCase()) ||
        m.key.toLowerCase().includes(search.toLowerCase()) ||
        m.group.toLowerCase().includes(search.toLowerCase()),
      )
    : MODULE_LIST;

  if (search && filtered.length === 0) {
    return <p className="px-2 py-3 text-caption text-muted-foreground">No modules match "{search}".</p>;
  }

  const groups: { group?: ModuleGroup; items: typeof filtered }[] = search
    ? [{ items: filtered }]
    : MODULE_GROUPS.map((g) => ({ group: g, items: filtered.filter((m) => m.group === g) }));

  return (
    <>
      {groups.map((grp, i) => (
        <div key={grp.group ?? i} className="mb-2">
          {grp.group && (
            <div
              className="mb-1 flex items-center gap-2 rounded-md px-1.5 py-1"
              style={{ background: `${GROUP_COLORS[grp.group]}0f` }}
            >
              <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: GROUP_COLORS[grp.group] }} />
              <span className="text-caption font-semibold" style={{ color: GROUP_COLORS[grp.group] }}>
                {grp.group}
              </span>
              <span className="ml-auto text-micro text-muted-foreground/70">{grp.items.length}</span>
            </div>
          )}
          <div className="space-y-0.5">
            {grp.items.map((m) => (
              <PaletteItem key={m.key} model={m.key} onClick={onPick ? () => onPick(m.key) : undefined} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Employee sidebar item (draggable) ───────────────────────

function EmployeeItem({ employee }: { employee: EmployeeInfo }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/nirman-employee", employee.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const inactive = employee.active === false;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-meta transition-colors hover:border-border hover:bg-accent cursor-grab active:cursor-grabbing",
        inactive && "opacity-50",
      )}
    >
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold", inactive ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
        {employee.name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-medium">{employee.name}{inactive && <span className="ml-1 text-micro text-muted-foreground">(inactive)</span>}</p>
        {employee.trade && <p className="truncate text-micro text-muted-foreground">{employee.trade}</p>}
      </div>
      <UserPlus className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
    </div>
  );
}

// ── Filter chip (used by the node filter bar) ────────────────

function FilterChip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-micro font-medium text-primary">
      <span className="opacity-60">{label}:</span>
      <span className="capitalize">{value}</span>
      <button onClick={onClear} className="ml-0.5 rounded-full hover:bg-primary/20">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

// ── Auto-layout: tree from root, BFS by depth levels ─────────

/** BFS reachability over the current edges — used to prevent cycles when connecting. */
function canReach(start: string, goal: string, edges: Edge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.source);
    if (arr) arr.push(e.target);
    else adj.set(e.source, [e.target]);
  }
  const seen = new Set<string>([start]);
  const q: string[] = [start];
  while (q.length) {
    const u = q.shift();
    if (!u) continue;
    if (u === goal) return true;
    for (const v of adj.get(u) ?? []) {
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
      }
    }
  }
  return false;
}

// ── Live data graph (read-only) ──────────────────────────────

type LiveNodeData = {
  model: ModelKey;
  label: string;
  secondary: string | null;
  shared: boolean;
  isRoot?: boolean;
};

type LiveClusterData = {
  label: string;
  model: ModelKey;
  count: number;
  color: string;
};

// A visual cluster box — a subtle dashed background that groups
// siblings of the same module type together. Non-interactive.
type ClusterBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  model: ModelKey;
  color: string;
  count: number;
};

// ── Clustered top-down tree layout.
//    Children are grouped by module type. Each group becomes a vertical
//    column of stacked nodes with a subtle cluster box around them.
//    This prevents wide branches from spreading infinitely — instead,
//    same-type siblings stack compactly in labeled clusters.
function buildLiveLayout(graph: LiveGraph) {
  const incoming = new Map<string, string[]>();
  for (const n of graph.nodes) incoming.set(n.id, []);
  for (const e of graph.edges) incoming.get(e.to)?.push(e.from);
  const primaryParent = new Map<string, string>();
  for (const n of graph.nodes) {
    const parents = incoming.get(n.id) ?? [];
    if (parents.length > 0) primaryParent.set(n.id, parents[0]!);
  }
  const children = new Map<string, string[]>();
  for (const n of graph.nodes) children.set(n.id, []);
  for (const n of graph.nodes) {
    const p = primaryParent.get(n.id);
    if (p) children.get(p)?.push(n.id);
  }
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // Group children by model type, sorted by module group order
  function groupedChildren(id: string): { model: ModelKey; label: string; color: string; ids: string[] }[] {
    const kids = children.get(id) ?? [];
    const groups = new Map<string, string[]>();
    for (const k of kids) {
      const n = nodeById.get(k)!;
      if (!groups.has(n.model)) groups.set(n.model, []);
      groups.get(n.model)!.push(k);
    }
    // Sort children within each group by label
    for (const [, ids] of groups) {
      ids.sort((a, b) => {
        const na = nodeById.get(a)!;
        const nb = nodeById.get(b)!;
        return na.label.localeCompare(nb.label);
      });
    }
    // Sort groups by module group order, then by module label
    return Array.from(groups.entries())
      .map(([model, ids]) => ({
        model: model as ModelKey,
        label: MODULES[model as ModelKey]?.label ?? model,
        color: GROUP_COLORS[MODULES[model as ModelKey]?.group ?? "Core"],
        ids,
      }))
      .sort((a, b) => {
        const ga = MODULES[a.model]?.group ?? "Core";
        const gb = MODULES[b.model]?.group ?? "Core";
        if (ga !== gb) return MODULE_GROUPS.indexOf(ga) - MODULE_GROUPS.indexOf(gb);
        return a.label.localeCompare(b.label);
      });
  }

  const LEVEL_GAP = 160;    // vertical gap between parent and child
  const NODE_GAP = 240;     // horizontal gap between cluster columns
  const STACK_GAP = 64;     // vertical gap between stacked siblings in a cluster
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 48;   // approximate node height for cluster box calculation
  const CLUSTER_PAD = 16;   // padding inside cluster boxes

  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  const clusterBoxes: ClusterBox[] = [];

  // Compute how many columns a subtree needs (one column per child group)
  const subtreeCols = new Map<string, number>();
  function computeCols(id: string): number {
    if (subtreeCols.has(id)) return subtreeCols.get(id)!;
    const groups = groupedChildren(id);
    if (groups.length === 0) { subtreeCols.set(id, 1); return 1; }
    let total = 0;
    for (const g of groups) {
      // Each group needs at least 1 column, but could need more if
      // children in the group have their own wide subtrees
      let maxChildCols = 1;
      for (const childId of g.ids) {
        maxChildCols = Math.max(maxChildCols, computeCols(childId));
      }
      total += maxChildCols;
    }
    subtreeCols.set(id, Math.max(total, 1));
    return total;
  }
  computeCols(graph.rootId);

  // Recursively layout: group children by model, stack each group vertically
  function layout(id: string, y: number, leftEdge: number): number {
    visited.add(id);
    const groups = groupedChildren(id);
    const myCols = subtreeCols.get(id) ?? 1;
    const totalWidth = myCols * NODE_GAP;
    const centerX = leftEdge + totalWidth / 2;
    positions.set(id, { x: centerX - NODE_WIDTH / 2, y });

    let colLeft = leftEdge;
    for (const g of groups) {
      // Determine the column width for this group
      let groupCols = 1;
      for (const childId of g.ids) {
        groupCols = Math.max(groupCols, subtreeCols.get(childId) ?? 1);
      }
      const groupWidth = groupCols * NODE_GAP;
      const groupCenterX = colLeft + groupWidth / 2;

      // Stack children vertically within this group
      const childYStart = y + LEVEL_GAP;
      let childY = childYStart;
      const childPositions: { id: string; x: number; y: number }[] = [];

      for (const childId of g.ids) {
        if (visited.has(childId)) { childY += STACK_GAP + NODE_HEIGHT; continue; }
        const childCols = subtreeCols.get(childId) ?? 1;
        const childLeft = colLeft + (groupCols - childCols) * NODE_GAP / 2;
        const childEndY = layout(childId, childY, childLeft);
        childPositions.push({
          id: childId,
          x: positions.get(childId)!.x,
          y: positions.get(childId)!.y,
        });
        childY = childEndY + STACK_GAP;
      }

      // If this group has more than 1 child, draw a cluster box around them
      if (g.ids.length > 1 && childPositions.length > 0) {
        const minY = Math.min(...childPositions.map((p) => p.y)) - CLUSTER_PAD - 20;
        const maxY = Math.max(...childPositions.map((p) => p.y)) + NODE_HEIGHT + CLUSTER_PAD;
        const minX = Math.min(...childPositions.map((p) => p.x)) - CLUSTER_PAD;
        const maxX = Math.max(...childPositions.map((p) => p.x)) + NODE_WIDTH + CLUSTER_PAD;
        clusterBoxes.push({
          id: `cluster:${id}:${g.model}`,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          label: g.label,
          model: g.model,
          color: g.color,
          count: g.ids.length,
        });
      }

      colLeft += groupWidth;
    }

    // Return the bottom-most Y of this subtree (for stacking calculation)
    const myPos = positions.get(id)!;
    let bottomY = myPos.y + NODE_HEIGHT;
    for (const [, pos] of positions) {
      if (pos.x >= leftEdge && pos.x < leftEdge + totalWidth && pos.y > myPos.y) {
        bottomY = Math.max(bottomY, pos.y + NODE_HEIGHT);
      }
    }
    return bottomY;
  }
  layout(graph.rootId, 40, 0);

  // Any unreachable nodes — stack them in a row below the tree
  const maxY = Math.max(...Array.from(positions.values()).map((p) => p.y), 0);
  let extraX = 0;
  const extraY = maxY + LEVEL_GAP;
  for (const n of graph.nodes) {
    if (!visited.has(n.id)) {
      positions.set(n.id, { x: extraX, y: extraY });
      extraX += NODE_GAP;
    }
  }

  return { positions, primaryParent, incoming, clusterBoxes };
}

function LiveModuleNode({ data, selected }: NodeProps) {
  const { model, label, secondary, shared, isRoot } = data as LiveNodeData;
  const mod = MODULES[model as ModelKey];
  if (!mod) return null;
  const Icon = mod.icon;
  const color = GROUP_COLORS[mod.group];
  return (
    <div
      className={cn(
        "relative flex w-[200px] items-center gap-2 rounded-lg border bg-card py-1.5 pl-3 pr-2 shadow-sm transition-shadow",
        selected ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-border",
        isRoot && "border-primary/40 shadow-md",
        shared && "border-amber-500/50",
      )}
    >
      <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg" style={{ background: color }} />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-card" style={{ background: color }} />
      {isRoot && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Crown className="h-2.5 w-2.5" />
        </span>
      )}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${color}18`, color }}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-semibold text-foreground">{label}</p>
        <p className="truncate text-micro text-muted-foreground">
          {mod.label}{secondary ? ` · ${secondary}` : ""}
        </p>
      </div>
      {shared && (
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
          title="Shared — reachable from more than one parent"
        />
      )}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-2 !border-card" style={{ background: color }} />
    </div>
  );
}

function LiveRelationEdge({ id, sourceX, sourceY, targetX, targetY, data, selected }: any) {
  const isShared = !!data?.isSharedLink;
  // Top-down smooth bezier — same style as the editor canvas, but
  // shared (secondary) links are dashed amber to distinguish them.
  const stroke = selected ? "#6366f1" : isShared ? "#f59e0b" : "#cbd5e1";
  const sw = selected ? 2.5 : isShared ? 1.5 : 2;
  const op = selected ? 1 : isShared ? 0.5 : 0.8;
  const midY = (sourceY + targetY) / 2;
  const d = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;
  return (
    <g>
      <path
        id={id}
        className={cn("react-flow__edge-path", selected && "react-flow__edge-path--selected")}
        d={d}
        stroke={stroke}
        strokeWidth={sw}
        strokeOpacity={op}
        strokeDasharray={isShared ? "5 4" : undefined}
        fill="none"
        markerEnd="url(#arrow)"
      />
    </g>
  );
}

// Visual cluster box — a subtle dashed background that groups same-type siblings.
// Rendered behind the record nodes, non-interactive (pointer-events: none).
function LiveClusterNode({ data }: NodeProps) {
  const { label, model, color, count } = data as LiveClusterData;
  const mod = MODULES[model as ModelKey];
  const Icon = mod?.icon;
  return (
    <div
      className="pointer-events-none flex h-full w-full flex-col rounded-xl border-2 border-dashed"
      style={{ borderColor: `${color}30`, background: `${color}06` }}
    >
      <div
        className="flex items-center gap-1 rounded-t-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color, background: `${color}12` }}
      >
        {Icon && <Icon className="h-2.5 w-2.5" />}
        {label}
        <span className="ml-auto rounded-full px-1.5 text-[9px] font-normal" style={{ background: `${color}18` }}>
          {count}
        </span>
      </div>
    </div>
  );
}

const liveNodeTypes: NodeTypes = { liveModule: LiveModuleNode, liveCluster: LiveClusterNode };
const liveEdgeTypes: EdgeTypes = { liveRelation: LiveRelationEdge };

// ── Inspect panel (read-only) — a record's parents + children ──

function LiveCanvas({
  onBackToEditor,
  onCopy,
}: {
  onBackToEditor: () => void;
  onCopy: (graph: LiveGraph) => void;
}) {
  const [graph, setGraph] = useState<LiveGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/modules/live-graph")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load live data");
        return j as LiveGraph;
      })
      .then((g) => { setGraph(g); setLoading(false); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Failed to load"); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const layout = useMemo(() => (graph ? buildLiveLayout(graph) : null), [graph]);
  const sharedSet = useMemo(() => new Set(graph?.sharedIds ?? []), [graph]);
  const nodeById = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);

  const { nodes, edges } = useMemo(() => {
    if (!graph || !layout) return { nodes: [], edges: [] };
    // Cluster box nodes — rendered first (lower z-index) so record nodes paint on top
    const clusterNodes = layout.clusterBoxes.map((box) => ({
      id: box.id,
      type: "liveCluster",
      position: { x: box.x, y: box.y },
      data: {
        label: box.label,
        model: box.model,
        color: box.color,
        count: box.count,
      } as LiveClusterData,
      style: { width: box.width, height: box.height },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: -1,
    }));
    const recordNodes = graph.nodes.map((n) => {
      const pos = layout.positions.get(n.id) ?? { x: 0, y: 0 };
      const isRoot = n.id === graph.rootId;
      return {
        id: n.id,
        type: "liveModule",
        position: pos,
        data: {
          model: n.model,
          label: n.label,
          secondary: n.secondary,
          shared: sharedSet.has(n.id),
          isRoot,
        } as LiveNodeData,
      };
    });
    const edges = graph.edges.map((e) => ({
      id: `${e.from}->${e.to}:${e.label}`,
      source: e.from,
      target: e.to,
      type: "liveRelation",
      data: { isSharedLink: sharedSet.has(e.to) && layout.primaryParent.get(e.to) !== e.from },
    }));
    return { nodes: [...clusterNodes, ...recordNodes], edges };
  }, [graph, layout, sharedSet, nodeById]);

  return (
    <ReactFlowProvider>
      <div className="flex h-[calc(100vh-9rem)] flex-col rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted" className="gap-1">
              <Eye className="h-3 w-3" /> Live data
            </Badge>
            {graph && (
              <span className="text-caption text-muted-foreground">
                {graph.nodes.length} records · {graph.edges.length} links
                {graph.sharedIds.length ? ` · ${graph.sharedIds.length} shared` : ""}
              </span>
            )}
            {graph?.truncated && (
              <span className="flex items-center gap-1 text-caption font-medium text-amber-600" title="Partial snapshot — traversal was capped.">
                <AlertTriangle className="h-3 w-3" /> Capped
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} title="Re-fetch live data">
              <RefreshCw className={loading ? "animate-spin" : undefined} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={onBackToEditor}>
              <Pencil /> Editor
            </Button>
            <Button size="sm" onClick={() => graph && onCopy(graph)} disabled={!graph || graph.nodes.length === 0 || loading}>
              <Copy /> Copy to editor
            </Button>
          </div>
        </div>

        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={liveNodeTypes}
            edgeTypes={liveEdgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            proOptions={{ hideAttribution: true }}
            className="bg-muted/20"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              className="!bg-card !border !border-border"
              nodeColor={(n) => {
                const d = n.data as LiveNodeData;
                return GROUP_COLORS[MODULES[d.model as ModelKey]?.group ?? "Core"];
              }}
              maskColor="rgba(0,0,0,0.05)"
            />
          </ReactFlow>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/60 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-meta">Loading live data…</span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="max-w-sm rounded-xl border border-border bg-card px-6 py-5 text-center">
                <AlertCircle className="mx-auto mb-2 h-7 w-7 text-danger" />
                <p className="text-body font-medium">Couldn’t load live data</p>
                <p className="mt-1 text-meta text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={load}>
                  <RefreshCw /> Retry
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && graph && graph.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <div className="max-w-sm rounded-xl border-2 border-dashed border-border bg-card/80 px-8 py-6 text-center backdrop-blur-sm">
                <Workflow className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-body font-medium">No records yet</p>
                <p className="mt-1 text-meta text-muted-foreground">
                  Add some data (a company, projects, stock locations…) and refresh.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-3 py-1.5 text-micro text-muted-foreground/70">
          Read-only snapshot of your live records, arranged as a hierarchy. Amber dot = shared record (reachable from more than one parent).
        </div>
      </div>
    </ReactFlowProvider>
  );
}

function autoLayout(nodes: Node[], edges: Edge[], canvasWidth?: number): Node[] {
  if (nodes.length === 0) return nodes;
  const childrenMap = new Map<string, string[]>();
  nodes.forEach((n) => childrenMap.set(n.id, []));
  edges.forEach((e) => {
    const arr = childrenMap.get(e.source);
    if (arr) arr.push(e.target);
  });
  const incoming = new Map<string, number>();
  nodes.forEach((n) => incoming.set(n.id, 0));
  edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));
  const rootId = nodes.find((n) => (incoming.get(n.id) ?? 0) === 0)?.id;
  if (!rootId) return nodes;

  const LEVEL_GAP = 300;
  const NODE_GAP = 240;
  const positions = new Map<string, { x: number; y: number }>();
  const queue: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }];
  const visited = new Set<string>();
  const byDepth = new Map<number, string[]>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth)!.push(id);
    for (const child of childrenMap.get(id) ?? []) {
      if (!visited.has(child)) queue.push({ id: child, depth: depth + 1 });
    }
  }
  // any unvisited nodes (disconnected) — place them in their own column
  let extraDepth = byDepth.size;
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      if (!byDepth.has(extraDepth)) byDepth.set(extraDepth, []);
      byDepth.get(extraDepth)!.push(n.id);
    }
  }

  // Use canvas width if available, otherwise fall back to 400
  const centerX = Number.isFinite(canvasWidth) && (canvasWidth ?? 0) > 0 ? canvasWidth! / 2 : 400;
  byDepth.forEach((ids, depth) => {
    const totalWidth = (ids.length - 1) * NODE_GAP;
    ids.forEach((id, i) => {
      positions.set(id, {
        x: centerX - totalWidth / 2 + i * NODE_GAP,
        y: 80 + depth * LEVEL_GAP,
      });
    });
  });

  return nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position }));
}

// ── Inner canvas (needs provider) ────────────────────────────

// ── Dashboard view: aggregate KPIs across all nodes ──────────

function DashboardView({ nodes, edges, employees }: { nodes: Node[]; edges: Edge[]; employees: EmployeeInfo[] }) {
  const todayDate = useToday();
  const allData = useMemo(() => {
    const moduleCounts = new Map<string, number>();
    const kindCounts = new Map<string, number>();
    const priorityCounts = new Map<string, number>();
    let overdue = 0, upcoming = 0, today = 0, noDate = 0;
    let assigned = 0, unassigned = 0;
    let totalNotes = 0, totalAttachments = 0, totalCustomFields = 0;
    const assigneeWorkload = new Map<string, number>();

    nodes.forEach((n) => {
      const d = n.data as ModuleNodeData;
      moduleCounts.set(d.model, (moduleCounts.get(d.model) ?? 0) + 1);
      if (d.kind) kindCounts.set(d.kind, (kindCounts.get(d.kind) ?? 0) + 1);
      if (d.priority) priorityCounts.set(d.priority, (priorityCounts.get(d.priority) ?? 0) + 1);
      if (d.dueDate && todayDate) {
        const due = new Date(d.dueDate); due.setHours(0, 0, 0, 0);
        const diff = Math.round((due.getTime() - todayDate.getTime()) / 86400000);
        if (diff < 0) overdue++;
        else if (diff === 0) today++;
        else upcoming++;
      } else noDate++;
      if (d.assigneeId) {
        assigned++;
        assigneeWorkload.set(d.assigneeId, (assigneeWorkload.get(d.assigneeId) ?? 0) + 1);
      } else unassigned++;
      totalNotes += d.notes?.length ?? 0;
      totalAttachments += d.attachments?.length ?? 0;
      totalCustomFields += d.customFields?.length ?? 0;
    });

    return {
      total: nodes.length,
      totalEdges: edges.length,
      moduleCounts: Array.from(moduleCounts.entries()).sort((a, b) => b[1] - a[1]),
      kindCounts: Array.from(kindCounts.entries()),
      priorityCounts: Array.from(priorityCounts.entries()),
      overdue, upcoming, today, noDate,
      assigned, unassigned,
      totalNotes, totalAttachments, totalCustomFields,
      assigneeWorkload: Array.from(assigneeWorkload.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [nodes, edges, todayDate]);

  const kpis = [
    { label: "Total Nodes", value: allData.total, icon: Workflow, color: "#0ea5e9" },
    { label: "Connections", value: allData.totalEdges, icon: GitBranch, color: "#6366f1" },
    { label: "Overdue", value: allData.overdue, icon: AlertCircle, color: "#ef4444" },
    { label: "Due Today", value: allData.today, icon: Clock, color: "#f59e0b" },
    { label: "Upcoming", value: allData.upcoming, icon: Calendar, color: "#0ea5e9" },
    { label: "Assigned", value: allData.assigned, icon: Users, color: "#16a34a" },
    { label: "Unassigned", value: allData.unassigned, icon: UserPlus, color: "#64748b" },
    { label: "Attachments", value: allData.totalAttachments, icon: Paperclip, color: "#8b5cf6" },
    { label: "Notes", value: allData.totalNotes, icon: StickyNote, color: "#f59e0b" },
  ];

  if (allData.total === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <LayoutDashboard className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
          <p className="text-body font-medium">No data to show</p>
          <p className="text-meta text-muted-foreground">Add nodes to the canvas to see dashboard metrics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
              <span className="text-caption text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="mt-1 text-title font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Module breakdown */}
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-caption font-semibold text-muted-foreground">Modules</p>
          <div className="space-y-1">
            {allData.moduleCounts.map(([model, count]) => {
              const mod = MODULES[model as ModelKey];
              if (!mod) return null;
              const pct = (count / allData.total) * 100;
              return (
                <div key={model} className="flex items-center gap-2">
                  <mod.icon className="h-3.5 w-3.5 shrink-0" style={{ color: GROUP_COLORS[mod.group] }} />
                  <span className="w-28 truncate text-meta">{mod.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: GROUP_COLORS[mod.group] }} />
                  </div>
                  <span className="w-6 text-right text-meta font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Kind breakdown */}
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-caption font-semibold text-muted-foreground">Node Kinds</p>
          <div className="flex flex-wrap gap-2">
            {allData.kindCounts.map(([kind, count]) => {
              const def = NODE_KINDS[kind as NodeKind];
              if (!def) return null;
              return (
                <div key={kind} className="flex items-center gap-1.5 rounded-lg border border-border p-2" style={{ borderColor: `${def.color}40` }}>
                  <def.icon className="h-4 w-4" style={{ color: def.color }} />
                  <span className="text-meta font-medium">{def.label}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-micro font-bold" style={{ background: `${def.color}18`, color: def.color }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority breakdown */}
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-caption font-semibold text-muted-foreground">Priority Distribution</p>
          <div className="space-y-1">
            {PRIORITY_LIST.map((p) => {
              const count = allData.priorityCounts.find(([k]) => k === p.key)?.[1] ?? 0;
              const pct = allData.total > 0 ? (count / allData.total) * 100 : 0;
              return (
                <div key={p.key} className="flex items-center gap-2">
                  <Flag className="h-3.5 w-3.5" style={{ color: p.color }} />
                  <span className="w-16 text-meta">{p.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                  <span className="w-6 text-right text-meta font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Assignee workload */}
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-caption font-semibold text-muted-foreground">Assignee Workload</p>
          {allData.assigneeWorkload.length === 0 ? (
            <p className="text-meta text-muted-foreground">No assignments yet.</p>
          ) : (
            <div className="space-y-1">
              {allData.assigneeWorkload.map(([empId, count]) => {
                const emp = employees.find((e) => e.id === empId);
                if (!emp) return null;
                const maxCount = allData.assigneeWorkload[0]?.[1] ?? 1;
                const pct = (count / maxCount) * 100;
                return (
                  <div key={empId} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{emp.name.charAt(0)}</span>
                    <span className="w-20 truncate text-meta">{emp.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-meta font-medium">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Timeline/Gantt view ──────────────────────────────────────

function TimelineView({ nodes, employees, onNodeClick }: { nodes: Node[]; employees: EmployeeInfo[]; onNodeClick: (id: string) => void }) {
  const todayDate = useToday();
  const datedNodes = useMemo(() => {
    return nodes
      .filter((n) => (n.data as ModuleNodeData).dueDate)
      .map((n) => {
        const d = n.data as ModuleNodeData;
        const due = new Date(d.dueDate!);
        return { node: n, dueDate: due, data: d };
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [nodes]);

  if (datedNodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <Calendar className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
          <p className="text-body font-medium">No scheduled nodes</p>
          <p className="text-meta text-muted-foreground">Set due dates on nodes to see them in the timeline.</p>
        </div>
      </div>
    );
  }

  // Compute date range
  const dates = datedNodes.map((d) => d.dueDate.getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  minDate.setHours(0, 0, 0, 0);
  maxDate.setHours(23, 59, 59, 999);
  // Pad range by 1 day on each side
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 1);
  const totalMs = maxDate.getTime() - minDate.getTime();

  // Group by day
  const dayBuckets = new Map<string, typeof datedNodes>();
  datedNodes.forEach((d) => {
    const dayKey = d.dueDate.toISOString().split("T")[0]!;
    if (!dayBuckets.has(dayKey)) dayBuckets.set(dayKey, []);
    dayBuckets.get(dayKey)!.push(d);
  });

  const sortedDays = Array.from(dayBuckets.keys()).sort();

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      {/* Today indicator */}
      <div className="mb-3 flex items-center gap-2 text-caption text-muted-foreground">
        <div className="h-3 w-3 rounded-full bg-primary" /> Today
        <div className="h-3 w-3 rounded-full bg-danger" /> Overdue
        <div className="h-3 w-3 rounded-full bg-amber-500" /> Due soon (≤3 days)
        <div className="h-3 w-3 rounded-full bg-muted-foreground" /> Upcoming
      </div>

      <div className="space-y-3">
        {sortedDays.map((dayKey) => {
          const dayItems = dayBuckets.get(dayKey)!;
          const dayDate = new Date(dayKey);
          const diffDays = todayDate ? Math.round((dayDate.getTime() - todayDate.getTime()) / 86400000) : 0;
          const isToday = diffDays === 0;
          const isOverdue = diffDays < 0;
          const isSoon = diffDays > 0 && diffDays <= 3;
          const color = isOverdue ? "#ef4444" : isToday ? "#0ea5e9" : isSoon ? "#f59e0b" : "#64748b";

          return (
            <div key={dayKey} className="flex gap-3">
              {/* Date column */}
              <div className="w-20 shrink-0">
                <div className="sticky top-0">
                  <p className="text-body font-bold" style={{ color }}>{dayDate.toLocaleDateString("en", { day: "numeric", month: "short" })}</p>
                  <p className="text-micro text-muted-foreground">
                    {isOverdue ? `${Math.abs(diffDays)}d ago` : isToday ? "Today" : diffDays === 1 ? "Tomorrow" : `in ${diffDays}d`}
                  </p>
                </div>
              </div>

              {/* Items */}
              <div className="flex-1 space-y-1.5">
                {dayItems.map(({ node, data }) => {
                  const mod = MODULES[data.model as ModelKey];
                  const assignee = data.assigneeId ? employees.find((e) => e.id === data.assigneeId) : null;
                  const priorityDef = data.priority ? PRIORITIES[data.priority] : null;
                  const kindDef = data.kind ? NODE_KINDS[data.kind] : null;
                  return (
                    <button
                      key={node.id}
                      onClick={() => onNodeClick(node.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-left transition-all hover:border-primary hover:shadow-sm"
                      style={{ borderLeftWidth: 3, borderLeftColor: color }}
                    >
                      {mod && (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: `${GROUP_COLORS[mod.group]}18`, color: GROUP_COLORS[mod.group] }}>
                          <mod.icon className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium">{mod?.label ?? "Unknown"}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {kindDef && (
                            <span className="inline-flex items-center gap-0.5 text-micro" style={{ color: kindDef.color }}>
                              <kindDef.icon className="h-2.5 w-2.5" /> {kindDef.label}
                            </span>
                          )}
                          {assignee && (
                            <span className="inline-flex items-center gap-1 text-micro text-muted-foreground">
                              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/15 text-[9px] text-primary">{assignee.name.charAt(0)}</span>
                              {assignee.name}
                            </span>
                          )}
                          {priorityDef && (
                            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-micro font-medium text-white" style={{ background: priorityDef.color }}>
                              <Flag className="h-2.5 w-2.5" /> {priorityDef.label}
                            </span>
                          )}
                          {data.attachments && data.attachments.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-micro text-muted-foreground">
                              <Paperclip className="h-2.5 w-2.5" /> {data.attachments.length}
                            </span>
                          )}
                          {data.notes && data.notes.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-micro text-muted-foreground">
                              <StickyNote className="h-2.5 w-2.5" /> {data.notes.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DRAFT_KEY = "nirman-playground-draft";

function CanvasInner({
  initialGraph,
  workspaceId,
  mode,
  initialName,
  initialDescription,
  initialIcon,
  onGoLive,
  onExitLive,
  liveMode = false,
  liveLoading = false,
}: {
  initialGraph?: WorkspaceGraph;
  workspaceId?: string;
  mode: "create" | "edit";
  initialName?: string;
  initialDescription?: string;
  initialIcon?: string;
  onGoLive?: () => void;
  onExitLive?: () => void;
  liveMode?: boolean;
  liveLoading?: boolean;
}) {
  const router = useRouter();
  const flow = useReactFlow();
  const idCounter = useRef(0);
  const today = useToday();

  // ── Role gate for live mode ──────────────────────────────────
  // Only OWNER / MANAGER may edit the canvas while viewing live data;
  // everyone else (SUPERVISOR / SALES / ACCOUNTANT) gets a read-only canvas.
  // Role is fetched client-side to avoid PPR prerender issues.
  const [role, setRole] = useState("MANAGER");
  useEffect(() => {
    fetch("/api/auth/get-session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        const userRole = (s?.user as { role?: string } | undefined)?.role;
        if (userRole) setRole(userRole);
      })
      .catch(() => {});
  }, []);
  const canEditLive = role === "OWNER" || role === "MANAGER";
  const liveReadOnly = liveMode && !canEditLive;

  // Load from initialGraph (server-provided, safe for SSR) — localStorage
  // draft is loaded in a useEffect below to avoid hydration mismatch.
  const loadInitial = useCallback((): { nodes: Node[]; edges: Edge[] } => {
    if (initialGraph) {
      return {
        nodes: initialGraph.nodes.map((n) => ({
          id: n.id, type: "module", position: { x: n.x, y: n.y }, style: { width: 180 },
          data: {
            model: n.model as ModelKey,
            kind: n.kind,
            assigneeId: n.assigneeId ?? null,
            attachments: n.attachments ?? [],
            dueDate: n.dueDate ?? null,
            priority: n.priority,
            notes: n.notes ?? [],
            customFields: n.customFields ?? [],
            recordId: n.recordId ?? null,
            recordLabel: n.recordLabel ?? null,
          } as ModuleNodeData,
        })),
        edges: initialGraph.edges.map((e) => ({
          id: `${e.from}->${e.to}`, source: e.from, target: e.to, type: "relation", reconnectable: true,
          label: e.label ?? e.relationLabel,
          data: { relationLabel: e.relationLabel, hops: e.hops, toModel: e.toModel, label: e.label ?? null, isLive: liveMode },
        })),
      };
    }
    return { nodes: [], edges: [] };
  }, [initialGraph, liveMode]);

  const initData = useMemo(() => loadInitial(), [loadInitial]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initData.edges);

  // Load localStorage draft on mount (create mode only) — client-side,
  // avoids SSR hydration mismatch.
  useEffect(() => {
    if (mode !== "create" || initialGraph) return;
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        const parsed = JSON.parse(draft) as { nodes: Node[]; edges: Edge[] };
        if (parsed.nodes?.length || parsed.edges?.length) {
          setNodes(parsed.nodes);
          setEdges(parsed.edges);
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Batch-fetch record summaries for all pre-linked nodes.
  // This runs once after the initial nodes are settled (from draft or
  // initialGraph) and populates status + metric on every linked node
  // in a single round-trip, so the canvas shows living pointers on load.
  useEffect(() => {
    const linked = nodes.filter((n) => {
      const d = n.data as ModuleNodeData;
      return d.recordId && !d.recordStatus && !d.recordMetric;
    });
    if (linked.length === 0) return;
    const payload = {
      nodes: linked.map((n) => {
        const d = n.data as ModuleNodeData;
        return { model: d.model, id: d.recordId };
      }),
    };
    let cancelled = false;
    fetch("/api/modules/node-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled || !res?.summaries) return;
        const byKey = new Map<string, { status: string | null; metric: any }>();
        for (const s of res.summaries) byKey.set(`${s.model}:${s.recordId}`, { status: s.status, metric: s.metric });
        setNodes((nds) =>
          nds.map((n) => {
            const d = n.data as ModuleNodeData;
            if (!d.recordId) return n;
            const s = byKey.get(`${d.model}:${d.recordId}`);
            if (!s) return n;
            return {
              ...n,
              data: { ...d, recordStatus: s.status, recordMetric: s.metric } as ModuleNodeData,
            };
          }),
        );
      })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length > 0]);
  // The remount (editorKey change) creates fresh nodes from the live graph;
  // this effect waits for React Flow to measure them, then fits the view.
  useEffect(() => {
    if (!liveMode || nodes.length === 0) return;
    const t = setTimeout(() => flow.fitView({ padding: 0.15, duration: 500 }), 200);
    return () => clearTimeout(t);
  }, [liveMode, nodes.length, flow]);
  const [pendingConnect, setPendingConnect] = useState<{
    source: string; target: string; options: RelationDef[]; oldEdgeId?: string;
  } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateDialog, setQuickCreateDialog] = useState<string | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [icon, setIcon] = useState(initialIcon ?? "Workflow");
  const [search, setSearch] = useState("");

  // ── Playground extension state ──
  const [employees, setEmployees] = useState<EmployeeInfo[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const ICON_OPTIONS = [
    "Workflow", "LayoutDashboard", "Building2", "Package", "Truck",
    "LandPlot", "Home", "ShoppingCart", "Wallet", "Settings",
    "TrendingUp", "ClipboardList", "Wrench", "Boxes", "Layers",
  ];

  const nextId = () => `n${Date.now().toString(36)}${(idCounter.current++).toString(36)}`;

  // ── Autosave draft to localStorage (create mode only) ───────
  useEffect(() => {
    if (mode !== "create" || initialGraph) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ nodes, edges }));
    } catch (err) {
      console.warn("Failed to autosave workspace draft:", err);
      toast.error("Could not save draft — localStorage may be full.");
    }
  }, [nodes, edges, mode, initialGraph]);

  // ── Fetch employees for the people sidebar ──────────────────
  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setEmployees(data); })
      .catch(() => { /* ignore — sidebar just shows empty */ });
  }, []);

  // ── Reference data for Quick Create (fetched lazily when dropdown opens) ──
  const { data: toolbarRefData, refresh: refreshToolbarRef } = useReferenceData(quickCreateOpen || quickCreateDialog !== null);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.toLowerCase();
    const matches = empSearch
      ? employees.filter(
          (e) => e.name.toLowerCase().includes(q) || (e.trade ?? "").toLowerCase().includes(q),
        )
      : employees;
    // Sort: active first, then inactive — so inactive employees don't clutter the list
    return [...matches].sort((a, b) => {
      const aActive = a.active !== false;
      const bActive = b.active !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [employees, empSearch]);

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const previewNode = previewNodeId ? nodes.find((n) => n.id === previewNodeId) ?? null : null;

  // Compute the preview node's screen position for popover anchoring.
  // React Flow's flowToScreenPosition converts canvas coords → screen coords.
  const previewNodePosition = useMemo(() => {
    if (!previewNode?.position) return undefined;
    try {
      const screen = flow.flowToScreenPosition(previewNode.position);
      return { x: screen.x, y: screen.y };
    } catch {
      return undefined;
    }
  }, [previewNode, flow]);

  // Close the preview panel on Escape — there's no other way to dismiss it
  // when focus is inside the canvas (e.g. after clicking a node).
  useEffect(() => {
    if (!previewNodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewNodeId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewNodeId]);

  // ── Compute root + validation status in real-time ──────────
  const graphState = useMemo(() => {
    if (nodes.length === 0) return { status: "empty" as const, rootId: null, issues: [] };
    const incoming = new Map<string, number>();
    nodes.forEach((n) => incoming.set(n.id, 0));
    edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));
    const roots = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0);
    const rootId = roots.length === 1 ? roots[0]!.id : null;
    const graph: WorkspaceGraph = {
      rootId: rootId ?? "",
      nodes: nodes.map((n) => {
        const d = n.data as ModuleNodeData;
        return {
          id: n.id, model: d.model,
          x: Math.round(n.position.x), y: Math.round(n.position.y),
          ...(d.kind ? { kind: d.kind } : {}),
          ...(d.assigneeId ? { assigneeId: d.assigneeId } : {}),
          ...(d.attachments && d.attachments.length > 0 ? { attachments: d.attachments } : {}),
          ...(d.dueDate ? { dueDate: d.dueDate } : {}),
          ...(d.priority ? { priority: d.priority } : {}),
          ...(d.notes && d.notes.length > 0 ? { notes: d.notes } : {}),
          ...(d.customFields && d.customFields.length > 0 ? { customFields: d.customFields } : {}),
          ...(d.recordId ? { recordId: d.recordId, recordLabel: d.recordLabel, recordStatus: d.recordStatus ?? null, recordMetric: d.recordMetric ?? null } : {}),
        };
      }),
      edges: edges.map((e) => ({
        from: e.source, to: e.target,
        relationLabel: (e.data as unknown as EdgeData).relationLabel,
        hops: (e.data as unknown as EdgeData).hops, toModel: (e.data as unknown as EdgeData).toModel,
        label: (e.data as unknown as EdgeData).label ?? null,
      })),
    };
    const issues = validateGraph(graph);
    if (roots.length === 0) return { status: "invalid" as const, rootId, issues: [{ message: "Every node has a parent — no root found." }] };
    if (roots.length > 1) return { status: "invalid" as const, rootId, issues: [{ message: `Multiple roots (${roots.length}) — only one node should have no incoming connection.` }] };
    if (issues.length > 0) return { status: "invalid" as const, rootId, issues };
    return { status: "valid" as const, rootId, issues: [] };
  }, [nodes, edges]);

  // ── Mark root node visually ─────────────────────────────────
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, isRoot: n.id === graphState.rootId } as ModuleNodeData,
      })),
    );
  }, [graphState.rootId, setNodes]);

  // ── Add module ──────────────────────────────────────────────
  const addModuleAtCenter = useCallback(
    (model: ModelKey) => {
      if (!MODULES[model]) return;
      const center = flow.screenToFlowPosition({
        x: window.innerWidth / 2, y: window.innerHeight / 2,
      });
      setNodes((nds) => [...nds, { id: nextId(), type: "module", position: center, style: { width: 180 }, data: { model } }]);
    },
    [flow, setNodes],
  );

  const onPickFromPalette = (model: ModelKey) => {
    addModuleAtCenter(model);
    setPaletteOpen(false);
  };

  // ── Drag & drop (on the wrapper div — most reliable) ────────
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const model = e.dataTransfer.getData("application/nirman-module") as ModelKey;
      if (!model || !MODULES[model]) return;
      const bounds = e.currentTarget.getBoundingClientRect();
      const position = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Fallback: if screenToFlowPosition returns NaN, use relative coords
      const safePos = Number.isFinite(position.x) && Number.isFinite(position.y)
        ? position
        : { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
      setNodes((nds) => [...nds, { id: nextId(), type: "module", position: safePos, style: { width: 180 }, data: { model } }]);
    },
    [flow, setNodes],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  // ── Connect nodes ───────────────────────────────────────────
  const nodeById = (id: string) => nodes.find((n) => n.id === id);

  const addConnection = useCallback(
    (source: string, target: string, rel: RelationDef) => {
      const newEdge: Edge = {
        id: `${source}->${target}`, source, target, type: "relation", label: rel.label,
        reconnectable: true,
        data: { relationLabel: rel.label, hops: rel.hops, toModel: rel.toModel },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) { toast.error("A module can't connect to itself."); return; }
      if (edges.some((e) => e.source === connection.source && e.target === connection.target)) {
        toast.error("These modules are already connected."); return;
      }
      // A node may have several parents (shared node), but the graph must
      // stay acyclic — refuse a connection that would close a loop.
      if (canReach(connection.target, connection.source, edges)) {
        toast.error("That would create a loop — choose the other direction."); return;
      }
      const src = nodeById(connection.source);
      const tgt = nodeById(connection.target);
      if (!src || !tgt) return;
      const options = relationsBetween(src.data.model as ModelKey, tgt.data.model as ModelKey);
      if (options.length === 0) {
        toast.error(`No valid relation from ${MODULES[src.data.model as ModelKey].label} to ${MODULES[tgt.data.model as ModelKey].label}.`);
        return;
      }
      if (options.length === 1) {
        const rel = options[0]!;
        addConnection(connection.source, connection.target, rel);
        toast.success(`Connected via "${rel.label}".`);
      } else {
        setPendingConnect({ source: connection.source, target: connection.target, options });
      }
    },
    [edges, nodes, addConnection],
  );

  // ── Rewire an existing edge by dragging one of its endpoints ──
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target) return;
      if (newConnection.source === newConnection.target) { toast.error("A module can't connect to itself."); return; }
      // Same source+target as before → nothing to do
      if (oldEdge.source === newConnection.source && oldEdge.target === newConnection.target) return;
      // Duplicate check (ignoring the edge being rewired)
      if (edges.some((e) => e.id !== oldEdge.id && e.source === newConnection.source && e.target === newConnection.target)) {
        toast.error("Those modules are already connected."); return;
      }
      // Acyclic check (ignoring the edge being rewired)
      const remaining = edges.filter((e) => e.id !== oldEdge.id);
      if (canReach(newConnection.target, newConnection.source, remaining)) {
        toast.error("That would create a loop — choose the other direction."); return;
      }
      const src = nodeById(newConnection.source);
      const tgt = nodeById(newConnection.target);
      if (!src || !tgt) return;
      const options = relationsBetween(src.data.model as ModelKey, tgt.data.model as ModelKey);
      if (options.length === 0) {
        toast.error(`No valid relation from ${MODULES[src.data.model as ModelKey].label} to ${MODULES[tgt.data.model as ModelKey].label}.`);
        return;
      }
      if (options.length === 1) {
        const rel = options[0]!;
        setEdges((eds) => eds.filter((e) => e.id !== oldEdge.id));
        addConnection(newConnection.source, newConnection.target, rel);
        toast.success(`Rewired to "${rel.label}".`);
      } else {
        setPendingConnect({ source: newConnection.source, target: newConnection.target, options, oldEdgeId: oldEdge.id });
      }
    },
    [edges, nodes, addConnection],
  );

  const confirmPending = (rel: RelationDef) => {
    if (!pendingConnect) return;
    // When rewiring, drop the old edge first so the new one can take its place.
    if (pendingConnect.oldEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== pendingConnect.oldEdgeId));
    }
    addConnection(pendingConnect.source, pendingConnect.target, rel);
    setPendingConnect(null);
    toast.success(`Connected via "${rel.label}".`);
  };

  // ── Build graph for save ────────────────────────────────────
  const buildGraph = (): WorkspaceGraph | null => {
    if (nodes.length === 0 || !graphState.rootId) return null;
    return {
      rootId: graphState.rootId,
      nodes: nodes.map((n) => {
        const d = n.data as ModuleNodeData;
        return {
          id: n.id, model: d.model,
          x: Math.round(n.position.x), y: Math.round(n.position.y),
          ...(d.kind ? { kind: d.kind } : {}),
          ...(d.assigneeId ? { assigneeId: d.assigneeId } : {}),
          ...(d.attachments && d.attachments.length > 0 ? { attachments: d.attachments } : {}),
          ...(d.dueDate ? { dueDate: d.dueDate } : {}),
          ...(d.priority ? { priority: d.priority } : {}),
          ...(d.notes && d.notes.length > 0 ? { notes: d.notes } : {}),
          ...(d.customFields && d.customFields.length > 0 ? { customFields: d.customFields } : {}),
          ...(d.recordId ? { recordId: d.recordId, recordLabel: d.recordLabel, recordStatus: d.recordStatus ?? null, recordMetric: d.recordMetric ?? null } : {}),
        };
      }),
      edges: edges.map((e) => ({
        from: e.source, to: e.target,
        relationLabel: (e.data as unknown as EdgeData).relationLabel,
        hops: (e.data as unknown as EdgeData).hops, toModel: (e.data as unknown as EdgeData).toModel,
        label: (e.data as unknown as EdgeData).label ?? null,
      })),
    };
  };

  // ── Node kind + assignee handlers ───────────────────────────
  const setNodeKind = useCallback((nodeId: string, kind: NodeKind | null) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        // If switching to a non-assignable kind, clear assignee
        const newAssignee = kind && !NODE_KINDS[kind].canAssign ? null : d.assigneeId;
        return { ...n, data: { ...d, kind: kind ?? undefined, assigneeId: newAssignee } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const onAssignEmployee = useCallback((nodeId: string, employeeId: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        // Auto-set kind to "active" if no kind or non-assignable kind
        const kind = d.kind && NODE_KINDS[d.kind].canAssign ? d.kind : "active";
        const emp = employees.find((e) => e.id === employeeId);
        toast.success(`Assigned ${emp?.name ?? "employee"} to this node.`);
        return { ...n, data: { ...d, kind, assigneeId: employeeId } as ModuleNodeData };
      }),
    );
  }, [setNodes, employees]);

  const onUnassign = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        return { ...n, data: { ...d, assigneeId: null } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  // Delete a node and all its connections — used by the floating X button
  const onDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
    setPreviewNodeId(null);
  }, [setNodes, setEdges]);

  const onNodeClick = useCallback((_evt: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setPreviewNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setPreviewNodeId(null);
  }, []);

  // Close preview + clear selection when a node is deleted
  const onNodesDelete = useCallback((deletedNodes: Node[]) => {
    const deletedIds = new Set(deletedNodes.map((n) => n.id));
    if (selectedNodeId && deletedIds.has(selectedNodeId)) setSelectedNodeId(null);
    if (previewNodeId && deletedIds.has(previewNodeId)) setPreviewNodeId(null);
  }, [selectedNodeId, previewNodeId]);

  // Duplicate a node (copies model, kind, attachments — not edges)
  const duplicateNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const d = node.data as ModuleNodeData;
    const newId = nextId();
    setNodes((nds) => [
      ...nds,
      {
        ...node,
        id: newId,
        position: { x: node.position.x + 60, y: node.position.y + 60 },
        selected: false,
        data: { ...d, isRoot: false } as ModuleNodeData,
      },
    ]);
    toast.success(`Duplicated ${MODULES[d.model]?.label ?? "node"}`);
  }, [nodes, setNodes]);

  // ── Node detail handlers (due date, priority, notes, custom fields) ──
  const updateNodeData = useCallback((nodeId: string, updates: Partial<ModuleNodeData>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, data: { ...(n.data as ModuleNodeData), ...updates } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const setNodeDueDate = useCallback((nodeId: string, dueDate: string | null) => {
    updateNodeData(nodeId, { dueDate });
  }, [updateNodeData]);

  const setNodePriority = useCallback((nodeId: string, priority: Priority | null) => {
    updateNodeData(nodeId, { priority: priority ?? undefined });
  }, [updateNodeData]);

  const addNote = useCallback((nodeId: string, text: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        const note: NodeNote = {
          id: `note_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          text,
          createdAt: new Date().toISOString(),
        };
        return { ...n, data: { ...d, notes: [...(d.notes ?? []), note] } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const deleteNote = useCallback((nodeId: string, noteId: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        return { ...n, data: { ...d, notes: (d.notes ?? []).filter((nt) => nt.id !== noteId) } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const addCustomField = useCallback((nodeId: string, label: string, value: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        const field: CustomField = {
          id: `cf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          label,
          value,
        };
        return { ...n, data: { ...d, customFields: [...(d.customFields ?? []), field] } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const updateCustomField = useCallback((nodeId: string, fieldId: string, updates: Partial<CustomField>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        const customFields = (d.customFields ?? []).map((f) =>
          f.id === fieldId ? { ...f, ...updates } : f,
        );
        return { ...n, data: { ...d, customFields } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const deleteCustomField = useCallback((nodeId: string, fieldId: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        return { ...n, data: { ...d, customFields: (d.customFields ?? []).filter((f) => f.id !== fieldId) } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  // ── Record linking ──────────────────────────────────────────
  // Link a node to an existing DB record. The record's display label
  // is shown on the node and in the preview panel. We also fetch a
  // lightweight summary (status + key metric) so the node becomes a
  // living pointer to the record, not just a dead label.
  const linkRecord = useCallback((nodeId: string, recordId: string, recordLabel: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        return { ...n, data: { ...d, recordId, recordLabel, recordStatus: null, recordMetric: null } as ModuleNodeData };
      }),
    );
    // Fire-and-forget summary fetch — updates the node in-place when it arrives.
    const model = (nodes.find((n) => n.id === nodeId)?.data as ModuleNodeData | undefined)?.model;
    if (model) {
      fetch(`/api/modules/node-summary?model=${encodeURIComponent(model)}&id=${encodeURIComponent(recordId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((summary) => {
          if (!summary || summary.error) return;
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== nodeId) return n;
              const d = n.data as ModuleNodeData;
              if (d.recordId !== recordId) return n; // guard against race with unlink
              return {
                ...n,
                data: {
                  ...d,
                  recordStatus: summary.status ?? null,
                  recordMetric: summary.metric ?? null,
                } as ModuleNodeData,
              };
            }),
          );
        })
        .catch(() => { /* non-critical — node still shows label */ });
    }
    toast.success(`Linked to "${recordLabel}"`);
  }, [nodes, setNodes]);

  const unlinkRecord = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        return { ...n, data: { ...d, recordId: null, recordLabel: null, recordStatus: null, recordMetric: null } as ModuleNodeData };
      }),
    );
    toast.info("Record unlinked");
  }, [setNodes]);

  // ── Spawn child node ─────────────────────────────────────────
  // Creates a new node on the canvas connected to a parent via an edge.
  // If childRecordId is non-empty, the child is linked to that DB record
  // and we fetch its summary for the status + metric display.
  const spawnChildNode = useCallback((
    parentId: string,
    childModel: ModelKey,
    childRecordId: string,
    childLabel: string,
    relation: RelationDef,
  ) => {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) return;
    const childId = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const childMod = MODULES[childModel];
    const childColor = childMod ? GROUP_COLORS[childMod.group] : "#6366f1";

    // Position the child below-right of the parent
    const childX = (parent.position?.x ?? 0) + 260;
    const childY = (parent.position?.y ?? 0) + 160;

    const newNode: Node = {
      id: childId,
      type: "module",
      position: { x: childX, y: childY },
      data: {
        model: childModel,
        recordId: childRecordId || null,
        recordLabel: childLabel || null,
        recordStatus: null,
        recordMetric: null,
      } as ModuleNodeData,
    };

    const newEdge: Edge = {
      id: `e_${parentId}_${childId}`,
      source: parentId,
      target: childId,
      type: "relation",
      data: {
        relationLabel: relation.label,
        hops: relation.hops,
        toModel: relation.toModel,
        label: relation.label,
        isLive: false,
      } as unknown as EdgeData,
      style: { stroke: childColor, strokeWidth: 2 },
    };

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, newEdge]);

    // If the child is linked, fetch its summary for status + metric display
    if (childRecordId) {
      fetch(`/api/modules/node-summary?model=${encodeURIComponent(childModel)}&id=${encodeURIComponent(childRecordId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((summary) => {
          if (!summary || summary.error) return;
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== childId) return n;
              const d = n.data as ModuleNodeData;
              return {
                ...n,
                data: {
                  ...d,
                  recordStatus: summary.status ?? null,
                  recordMetric: summary.metric ?? null,
                } as ModuleNodeData,
              };
            }),
          );
        })
        .catch(() => {});
    }
  }, [nodes, setNodes, setEdges]);

  // ── Connected nodes ──────────────────────────────────────────
  // Build a list of nodes connected to the given node (incoming + outgoing),
  // with their relation label and direction. Used by the Connections tab.
  const getConnectedNodes = useCallback((nodeId: string): {
    id: string; model: ModelKey; label: string; relationLabel: string; direction: "in" | "out";
  }[] => {
    const result: { id: string; model: ModelKey; label: string; relationLabel: string; direction: "in" | "out" }[] = [];
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const edgeData = e.data as EdgeData | undefined;
      const relLabel = (edgeData?.label ?? edgeData?.relationLabel ?? "connects to") as string;
      if (e.source === nodeId && e.target !== nodeId) {
        const target = nodeMap.get(e.target);
        if (target) {
          const td = target.data as ModuleNodeData;
          result.push({
            id: target.id,
            model: td.model,
            label: td.recordLabel ?? MODULES[td.model]?.label ?? td.model,
            relationLabel: relLabel,
            direction: "out",
          });
        }
      } else if (e.target === nodeId && e.source !== nodeId) {
        const source = nodeMap.get(e.source);
        if (source) {
          const sd = source.data as ModuleNodeData;
          result.push({
            id: source.id,
            model: sd.model,
            label: sd.recordLabel ?? MODULES[sd.model]?.label ?? sd.model,
            relationLabel: relLabel,
            direction: "in",
          });
        }
      }
    }
    return result;
  }, [nodes, edges]);

  // ── Attachment handlers ─────────────────────────────────────
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // ── View mode + node filters ────────────────────────────────
  const [viewMode, setViewMode] = useState<"canvas" | "dashboard" | "timeline">("canvas");
  const [nodeSearch, setNodeSearch] = useState("");
  const [filterKind, setFilterKind] = useState<NodeKind | null>(null);
  const [filterPriority, setFilterPriority] = useState<Priority | null>(null);
  const [filterDueDate, setFilterDueDate] = useState<"all" | "overdue" | "today" | "upcoming" | "none">("all");
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null); // employee id or "unassigned"
  const [filterModel, setFilterModel] = useState<ModelKey | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // Compute which nodes match the active filters
  const filteredNodeIds = useMemo(() => {
    if (!nodeSearch && !filterKind && !filterPriority && filterDueDate === "all" && !filterAssignee && !filterModel) return null;
    const matches = new Set<string>();
    nodes.forEach((n) => {
      const d = n.data as ModuleNodeData;
      let ok = true;
      if (nodeSearch) {
        const q = nodeSearch.toLowerCase();
        const label = MODULES[d.model]?.label ?? "";
        const notesText = (d.notes ?? []).map((nt) => nt.text).join(" ");
        const fieldsText = (d.customFields ?? []).map((f) => `${f.label} ${f.value}`).join(" ");
        if (!label.toLowerCase().includes(q) && !notesText.toLowerCase().includes(q) && !fieldsText.toLowerCase().includes(q)) ok = false;
      }
      if (ok && filterKind && d.kind !== filterKind) ok = false;
      if (ok && filterPriority && d.priority !== filterPriority) ok = false;
      if (ok && filterAssignee) {
        if (filterAssignee === "unassigned" && d.assigneeId) ok = false;
        else if (filterAssignee !== "unassigned" && d.assigneeId !== filterAssignee) ok = false;
      }
      if (ok && filterModel && d.model !== filterModel) ok = false;
      if (ok && filterDueDate !== "all") {
        if (!d.dueDate) {
          if (filterDueDate !== "none") ok = false;
        } else if (today) {
          const due = new Date(d.dueDate); due.setHours(0, 0, 0, 0);
          const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
          if (filterDueDate === "overdue" && diff >= 0) ok = false;
          if (filterDueDate === "today" && diff !== 0) ok = false;
          if (filterDueDate === "upcoming" && diff <= 0) ok = false;
          if (filterDueDate === "none") ok = false;
        }
      }
      if (ok) matches.add(n.id);
    });
    return matches;
  }, [nodes, nodeSearch, filterKind, filterPriority, filterDueDate, filterAssignee, filterModel, today]);

  const activeFilterCount = (filterKind ? 1 : 0) + (filterPriority ? 1 : 0) + (filterDueDate !== "all" ? 1 : 0) + (filterAssignee ? 1 : 0) + (filterModel ? 1 : 0);

  const clearFilters = () => {
    setNodeSearch("");
    setFilterKind(null);
    setFilterPriority(null);
    setFilterDueDate("all");
    setFilterAssignee(null);
    setFilterModel(null);
  };

  // All tags across all nodes (for the filter bar)
  const allTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    nodes.forEach((n) => {
      const d = n.data as ModuleNodeData;
      d.attachments?.forEach((a) => {
        a.tags?.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
      });
    });
    return Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const addAttachment = useCallback((nodeId: string, attachment: Attachment) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        return { ...n, data: { ...d, attachments: [...(d.attachments ?? []), attachment] } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const updateAttachment = useCallback((nodeId: string, attachmentId: string, updates: Partial<Attachment>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        const attachments = (d.attachments ?? []).map((a) =>
          a.id === attachmentId ? { ...a, ...updates } : a,
        );
        return { ...n, data: { ...d, attachments } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const removeAttachment = useCallback((nodeId: string, attachmentId: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const d = n.data as ModuleNodeData;
        const attachments = (d.attachments ?? []).filter((a) => a.id !== attachmentId);
        return { ...n, data: { ...d, attachments } as ModuleNodeData };
      }),
    );
  }, [setNodes]);

  const uploadFiles = useCallback(async (nodeId: string, files: FileList) => {
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/uploads", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error ?? `Failed to upload ${file.name}`); continue; }
        const attachment: Attachment = {
          id: `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          type: "file",
          url: data.url,
          fileName: data.fileName,
          mimeType: data.mimeType,
          size: data.size,
          title: file.name,
          tags: [],
          createdAt: new Date().toISOString(),
        };
        addAttachment(nodeId, attachment);
        toast.success(`Uploaded ${file.name}`);
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  }, [addAttachment]);

  const addLink = useCallback((nodeId: string, url: string, title: string) => {
    const attachment: Attachment = {
      id: `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      type: "link",
      url,
      title: title || url,
      tags: [],
      createdAt: new Date().toISOString(),
    };
    addAttachment(nodeId, attachment);
    toast.success("Link added");
  }, [addAttachment]);

  const deleteAttachmentFile = useCallback(async (attachment: Attachment) => {
    if (attachment.type === "file" && attachment.url?.startsWith("/uploads/")) {
      try {
        await fetch(`/api/uploads?url=${encodeURIComponent(attachment.url)}`, { method: "DELETE" });
      } catch { /* ignore — file may already be gone */ }
    }
  }, []);

  const openSave = () => {
    if (graphState.status !== "valid") {
      toast.error(graphState.issues[0]?.message ?? "Graph is not valid.");
      return;
    }
    setSaveOpen(true);
  };

  const onSave = async () => {
    const graph = buildGraph();
    if (!graph) return;
    setSaving(true);
    try {
      const isEdit = mode === "edit" && workspaceId;
      const res = await fetch(isEdit ? `/api/workspaces/${workspaceId}` : "/api/workspaces", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, icon, graph }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to save workspace"); return; }
      toast.success(isEdit ? "Workspace updated." : "Workspace saved — added to navigation.");
      setSaveOpen(false);
      if (mode === "create") { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
      router.refresh();
      router.push(`/workspaces/${data.id}`);
    } catch {
      toast.error("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  const onClear = () => {
    if (nodes.length === 0) return;
    if (!window.confirm("Clear the entire canvas? This removes all modules and connections.")) return;
    setNodes([]);
    setEdges([]);
    if (mode === "create") { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
  };

  // ── Template loading ────────────────────────────────────────
  const loadTemplate = (templateKey: string) => {
    const tpl = TEMPLATES.find((t) => t.key === templateKey);
    if (!tpl) return;
    const newNodes = tpl.graph.nodes.map((n) => ({
      id: nextId(),
      type: "module" as const,
      position: { x: n.x, y: n.y },
      style: { width: 180 },
      data: { model: n.model as ModelKey } as ModuleNodeData,
    }));
    // Map old ids to new ids
    const idMap = new Map<string, string>();
    tpl.graph.nodes.forEach((n, i) => idMap.set(n.id, newNodes[i]!.id));
    const newEdges = tpl.graph.edges.map((e) => ({
      id: `${idMap.get(e.from)}->${idMap.get(e.to)}`,
      source: idMap.get(e.from)!,
      target: idMap.get(e.to)!,
      type: "relation" as const,
      reconnectable: true,
      label: e.relationLabel,
      data: { relationLabel: e.relationLabel, hops: e.hops, toModel: e.toModel as ModelKey } as EdgeData,
    }));
    setNodes(newNodes);
    setEdges(newEdges);
    setTemplateOpen(false);
    toast.success(`Loaded "${tpl.label}" template`);
    setTimeout(() => flow.fitView({ padding: 0.2, duration: 300 }), 100);
  };

  // ── Export / Import ─────────────────────────────────────────
  const exportGraph = () => {
    const graph = buildGraph() ?? {
      rootId: "",
      nodes: nodes.map((n) => {
        const d = n.data as ModuleNodeData;
        return { id: n.id, model: d.model, x: Math.round(n.position.x), y: Math.round(n.position.y) };
      }),
      edges: edges.map((e) => ({
        from: e.source, to: e.target,
        relationLabel: (e.data as unknown as EdgeData)?.relationLabel ?? "",
        hops: (e.data as unknown as EdgeData)?.hops ?? [],
        toModel: (e.data as unknown as EdgeData)?.toModel ?? "Company",
        label: (e.data as unknown as EdgeData)?.label ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workspace-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Graph exported");
  };

  const importGraph = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const graph = JSON.parse(ev.target?.result as string) as WorkspaceGraph;
        if (!graph.nodes || !graph.edges) throw new Error("Invalid graph format");
        const newNodes = graph.nodes.map((n) => ({
          id: n.id,
          type: "module" as const,
          position: { x: n.x, y: n.y },
          style: { width: 180 },
          data: {
            model: n.model as ModelKey,
            kind: n.kind,
            assigneeId: n.assigneeId ?? null,
            attachments: n.attachments ?? [],
            dueDate: n.dueDate ?? null,
            priority: n.priority,
            notes: n.notes ?? [],
            customFields: n.customFields ?? [],
          } as ModuleNodeData,
        }));
        const newEdges = graph.edges.map((ed) => ({
          id: `${ed.from}->${ed.to}`,
          source: ed.from,
          target: ed.to,
          type: "relation" as const,
          reconnectable: true,
          label: ed.label ?? ed.relationLabel,
          data: { relationLabel: ed.relationLabel, hops: ed.hops, toModel: ed.toModel as ModelKey, label: ed.label ?? null } as EdgeData,
        }));
        setNodes(newNodes);
        setEdges(newEdges);
        toast.success(`Imported ${graph.nodes.length} nodes`);
        setTimeout(() => flow.fitView({ padding: 0.2, duration: 300 }), 100);
      } catch {
        toast.error("Failed to import — invalid file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const printGraph = () => {
    window.print();
  };

  const canvasRef = useRef<HTMLDivElement>(null);

  const onAutoLayout = () => {
    const w = canvasRef.current?.clientWidth ?? undefined;
    setNodes((nds) => autoLayout(nds, edges, w));
    setTimeout(() => flow.fitView({ padding: 0.2, duration: 300 }), 50);
  };

  // ── Jump to a node: center the canvas on it + select + open preview ──
  const jumpToNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const w = node.measured?.width ?? node.width ?? 180;
    const h = node.measured?.height ?? node.height ?? 80;
    flow.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: 1.2, duration: 400 });
    setSelectedNodeId(nodeId);
    setPreviewNodeId(nodeId);
  }, [nodes, flow]);

  // ── Tag jump selector state ──
  const [tagJumpOpen, setTagJumpOpen] = useState(false);
  const [tagJumpTag, setTagJumpTag] = useState<string | null>(null);

  // Nodes that have a given tag (for the tag jump dropdown)
  const nodesForTag = useMemo(() => {
    if (!tagJumpTag) return [];
    return nodes
      .filter((n) => {
        const d = n.data as ModuleNodeData;
        return d.attachments?.some((a) => a.tags?.includes(tagJumpTag));
      })
      .map((n) => {
        const d = n.data as ModuleNodeData;
        const mod = MODULES[d.model as ModelKey];
        return { id: n.id, label: mod?.label ?? d.model, kind: d.kind, assigneeId: d.assigneeId };
      });
  }, [nodes, tagJumpTag]);

  // ── Quick stats: live counts across all nodes ──
  const quickStats = useMemo(() => {
    let active = 0, finished = 0, assumption = 0, inform = 0;
    let overdue = 0, assigned = 0, total = nodes.length;
    nodes.forEach((n) => {
      const d = n.data as ModuleNodeData;
      if (d.kind === "active") active++;
      else if (d.kind === "finished") finished++;
      else if (d.kind === "assumption") assumption++;
      else if (d.kind === "inform") inform++;
      if (d.assigneeId) assigned++;
      if (d.dueDate && d.kind !== "finished" && today) {
        const due = new Date(d.dueDate); due.setHours(0, 0, 0, 0);
        if (due.getTime() < today.getTime()) overdue++;
      }
    });
    return { active, finished, assumption, inform, overdue, assigned, total };
  }, [nodes, today]);

  // ── Validation badge for toolbar ───────────────────────────
  const ValidationBadge = () => {
    if (graphState.status === "empty") {
      return <span className="flex items-center gap-1.5 text-caption text-muted-foreground"><AlertCircle className="h-3.5 w-3.5" /> Empty canvas</span>;
    }
    if (graphState.status === "valid") {
      return <span className="flex items-center gap-1.5 text-caption font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Ready to save</span>;
    }
    return (
      <span className="flex items-center gap-1.5 text-caption font-medium text-danger" title={graphState.issues[0]?.message}>
        <AlertCircle className="h-3.5 w-3.5" /> {graphState.issues[0]?.message ?? "Invalid"}
      </span>
    );
  };

  return (
    <CanvasContext.Provider value={{ employees, today, onAssignEmployee, onUnassign, onDeleteNode }}>
      <div className="relative flex h-[calc(100vh-9rem)] flex-col gap-3 md:flex-row">
        {/* Palette — desktop sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col rounded-lg border border-border bg-card md:flex">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search modules…"
                className="h-8 pl-8 text-meta"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            <p className="px-2 pb-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
              Drag or click + to add
            </p>
            <PaletteList onPick={addModuleAtCenter} search={search} />
          </div>
        </aside>

        {/* Canvas + toolbar */}
        <div className="flex flex-1 flex-col rounded-lg border border-border bg-card">
          {/* ── Row 1: Header bar — view tabs + validation + save ── */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            {/* Left: view mode tabs */}
            <div className="flex items-center rounded-md border border-border bg-card p-0.5">
              {(["canvas", "dashboard", "timeline"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "flex items-center gap-1 rounded px-2.5 py-1 text-caption font-medium transition-colors",
                    viewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "canvas" && <Workflow className="h-3 w-3" />}
                  {mode === "dashboard" && <LayoutDashboard className="h-3 w-3" />}
                  {mode === "timeline" && <Calendar className="h-3 w-3" />}
                  <span className="capitalize">{mode}</span>
                </button>
              ))}
            </div>

            {/* Center: LIVE indicator (only when viewing live data) */}
            {liveMode && (
              <div className="flex items-center gap-2">
                <Badge
                  variant="muted"
                  className="gap-1.5 border border-rose-500/40 bg-rose-500/10 text-rose-600"
                  title="You are viewing live records from the database"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                  </span>
                  LIVE
                </Badge>
                {liveReadOnly && (
                  <Badge variant="muted" className="gap-1 text-muted-foreground" title={`Your role (${role}) cannot edit live data`}>
                    <Eye className="h-3 w-3" /> Read-only
                  </Badge>
                )}
              </div>
            )}

            {/* Right: validation + save */}
            <div className="flex items-center gap-2">
              <ValidationBadge />
              <div className="h-4 w-px bg-border" />
              {workspaceId && (
                <Button variant="outline" size="sm" asChild title="Open saved workspace">
                  <a href={`/workspaces/${workspaceId}`}><Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Open</span></a>
                </Button>
              )}
              <Button size="sm" onClick={openSave} disabled={liveReadOnly || graphState.status !== "valid"}>
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </div>

          {/* ── Quick stats bar (canvas mode only) ── */}
          {viewMode === "canvas" && nodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-1.5">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted-foreground/70">Status:</span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: "#16a34a18", color: "#16a34a" }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#16a34a" }} />
                Active {quickStats.active}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: "#16a34a18", color: "#16a34a" }}>
                <CheckCircle2 className="h-2.5 w-2.5" />
                Done {quickStats.finished}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: "#d9770618", color: "#d97706" }}>
                <HelpCircle className="h-2.5 w-2.5" />
                Assumption {quickStats.assumption}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: "#64748b18", color: "#64748b" }}>
                <Info className="h-2.5 w-2.5" />
                Info {quickStats.inform}
              </span>
              {quickStats.overdue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: "#ef444418", color: "#ef4444" }}>
                  <AlertCircle className="h-2.5 w-2.5 animate-pulse" />
                  Overdue {quickStats.overdue}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-muted-foreground">
                <Users className="h-2.5 w-2.5" />
                Assigned {quickStats.assigned}
              </span>
              <span className="ml-auto text-micro text-muted-foreground/60">{quickStats.total} nodes total</span>
            </div>
          )}

          {/* ── Row 2: Action bar (canvas mode only) ── */}
          {viewMode === "canvas" && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5">
              {/* Left: search + filter */}
              <div className="flex items-center gap-2">
                {/* Mobile: open palette/people */}
                <Button variant="outline" size="sm" className="md:hidden" onClick={() => setPaletteOpen(true)}>
                  <Layers className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="md:hidden" onClick={() => setPeopleOpen(true)}>
                  <Users className="h-3.5 w-3.5" />
                </Button>

                {/* Node search */}
                <div className="relative min-w-[140px] flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={nodeSearch}
                    onChange={(e) => setNodeSearch(e.target.value)}
                    placeholder="Search nodes…"
                    className="h-8 pl-8 text-meta"
                  />
                  {nodeSearch && (
                    <button onClick={() => setNodeSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter dropdown trigger */}
                <Button variant="outline" size="sm" onClick={() => setFilterOpen(!filterOpen)} className="h-8">
                  <Filter className="h-3.5 w-3.5" />
                  {activeFilterCount > 0 && (
                    <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>

                {/* Tag jump selector — pick a tag, see nodes, click to jump */}
                {allTags.length > 0 && (
                  <div className="relative">
                    <Button variant="outline" size="sm" onClick={() => { setTagJumpOpen(!tagJumpOpen); setTagJumpTag(null); }} className="h-8" title="Jump to a node by tag">
                      <Tag className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Jump to tag</span>
                    </Button>
                    {tagJumpOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => { setTagJumpOpen(false); setTagJumpTag(null); }} />
                        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg">
                          {!tagJumpTag ? (
                            <>
                              <p className="border-b border-border px-3 py-1.5 text-micro font-semibold uppercase tracking-wide text-muted-foreground">Select a tag</p>
                              <div className="max-h-60 overflow-y-auto p-1.5 scrollbar-thin">
                                {allTags.map(([tag, count]) => (
                                  <button
                                    key={tag}
                                    onClick={() => setTagJumpTag(tag)}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-caption hover:bg-accent"
                                  >
                                    <Tag className="h-3 w-3 text-muted-foreground" />
                                    <span className="truncate font-medium">{tag}</span>
                                    <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">{count}</span>
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                                <button onClick={() => setTagJumpTag(null)} className="text-muted-foreground hover:text-foreground">
                                  <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                                </button>
                                <span className="inline-flex items-center gap-1 text-caption font-semibold">
                                  <Tag className="h-3 w-3 text-primary" />
                                  {tagJumpTag}
                                </span>
                                <span className="ml-auto text-micro text-muted-foreground">{nodesForTag.length} nodes</span>
                              </div>
                              <div className="max-h-60 overflow-y-auto p-1.5 scrollbar-thin">
                                {nodesForTag.length === 0 ? (
                                  <p className="px-2 py-3 text-center text-caption text-muted-foreground">No nodes with this tag.</p>
                                ) : (
                                  nodesForTag.map((n) => {
                                    const kindDef = n.kind ? NODE_KINDS[n.kind] : null;
                                    const assignee = n.assigneeId ? employees.find((e) => e.id === n.assigneeId) : null;
                                    return (
                                      <button
                                        key={n.id}
                                        onClick={() => { jumpToNode(n.id); setTagJumpOpen(false); setTagJumpTag(null); }}
                                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-caption hover:bg-accent"
                                      >
                                        {kindDef ? (
                                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: kindDef.color }} />
                                        ) : (
                                          <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                                        )}
                                        <span className="truncate font-medium">{n.label}</span>
                                        {kindDef && (
                                          <span className="shrink-0 text-micro text-muted-foreground">{kindDef.label}</span>
                                        )}
                                        {assignee && (
                                          <span className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary" title={assignee.name}>
                                            {assignee.name.charAt(0).toUpperCase()}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Active filter chips (inline, no separate row) */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {filterKind && (
                    <FilterChip label="Kind" value={NODE_KINDS[filterKind].label} onClear={() => setFilterKind(null)} />
                  )}
                  {filterPriority && (
                    <FilterChip label="Priority" value={PRIORITIES[filterPriority].label} onClear={() => setFilterPriority(null)} />
                  )}
                  {filterDueDate !== "all" && (
                    <FilterChip label="Due" value={filterDueDate} onClear={() => setFilterDueDate("all")} />
                  )}
                  {filterAssignee && (
                    <FilterChip
                      label="Assignee"
                      value={filterAssignee === "unassigned" ? "Unassigned" : employees.find((e) => e.id === filterAssignee)?.name ?? "?"}
                      onClear={() => setFilterAssignee(null)}
                    />
                  )}
                  <button onClick={clearFilters} className="text-micro text-muted-foreground hover:text-foreground">
                    Clear all
                  </button>
                </div>
              )}

              {/* Right: canvas actions */}
              <div className="ml-auto flex items-center gap-1">
                {liveMode ? (
                  onExitLive && (
                    <Button variant="outline" size="sm" onClick={onExitLive} title="Exit live view and restore your workspace">
                      <Pencil className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Exit Live</span>
                    </Button>
                  )
                ) : onGoLive && (
                  <Button variant="outline" size="sm" onClick={onGoLive} disabled={liveLoading} title="Load your live records onto the canvas">
                    {liveLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    <span className="hidden lg:inline">{liveLoading ? "Loading…" : "Live data"}</span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onAutoLayout} disabled={nodes.length === 0} title="Auto-arrange as tree">
                  <GitBranch className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Layout</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setTemplateOpen(true)} disabled={liveReadOnly} title="Load a pre-built template">
                  <LayoutDashboard className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Templates</span>
                </Button>
                {/* Quick Create dropdown */}
                <div className="relative">
                  <Button variant="default" size="sm" onClick={() => setQuickCreateOpen(!quickCreateOpen)} disabled={liveReadOnly} title={liveReadOnly ? "Read-only — your role cannot create records in live view" : "Create new records"}>
                    <Plus className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Create</span>
                  </Button>
                  {quickCreateOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setQuickCreateOpen(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-card py-1 shadow-lg max-h-[60vh] overflow-y-auto scrollbar-thin">
                        <p className="px-3 py-1 text-micro font-semibold uppercase tracking-wide text-muted-foreground">Inventory</p>
                        <button onClick={() => { setQuickCreateDialog("material"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Package className="h-3.5 w-3.5" /> New Material</button>
                        <button onClick={() => { setQuickCreateDialog("category"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Layers className="h-3.5 w-3.5" /> New Category</button>
                        <button onClick={() => { setQuickCreateDialog("location"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Boxes className="h-3.5 w-3.5" /> New Location</button>
                        <button onClick={() => { setQuickCreateDialog("supplier"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Truck className="h-3.5 w-3.5" /> New Supplier</button>
                        <div className="my-1 h-px bg-border" />
                        <p className="px-3 py-1 text-micro font-semibold uppercase tracking-wide text-muted-foreground">Procurement</p>
                        <button onClick={() => { setQuickCreateDialog("po"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Wallet className="h-3.5 w-3.5" /> New Purchase Order</button>
                        <button onClick={() => { setQuickCreateDialog("transfer"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><ArrowRightLeft className="h-3.5 w-3.5" /> New Transfer</button>
                        <button onClick={() => { setQuickCreateDialog("issue"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Package className="h-3.5 w-3.5" /> Issue Materials</button>
                        <button onClick={() => { setQuickCreateDialog("requisition"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><ClipboardList className="h-3.5 w-3.5" /> New Requisition</button>
                        <div className="my-1 h-px bg-border" />
                        <p className="px-3 py-1 text-micro font-semibold uppercase tracking-wide text-muted-foreground">Assets</p>
                        <button onClick={() => { setQuickCreateDialog("land"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><LandPlot className="h-3.5 w-3.5" /> New Land Purchase</button>
                        <button onClick={() => { setQuickCreateDialog("unit"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Home className="h-3.5 w-3.5" /> New Built Unit</button>
                        <button onClick={() => { setQuickCreateDialog("equipment"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Wrench className="h-3.5 w-3.5" /> New Equipment</button>
                        <div className="my-1 h-px bg-border" />
                        <p className="px-3 py-1 text-micro font-semibold uppercase tracking-wide text-muted-foreground">Sales</p>
                        <button onClick={() => { setQuickCreateDialog("customer"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Users className="h-3.5 w-3.5" /> New Customer</button>
                        <div className="my-1 h-px bg-border" />
                        <p className="px-3 py-1 text-micro font-semibold uppercase tracking-wide text-muted-foreground">Finance</p>
                        <button onClick={() => { setQuickCreateDialog("cost"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Wallet className="h-3.5 w-3.5" /> Add Project Cost</button>
                        <button onClick={() => { setQuickCreateDialog("expense"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><FileText className="h-3.5 w-3.5" /> Add Expense</button>
                        <div className="my-1 h-px bg-border" />
                        <p className="px-3 py-1 text-micro font-semibold uppercase tracking-wide text-muted-foreground">Projects</p>
                        <button onClick={() => { setQuickCreateDialog("project"); setQuickCreateOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent"><Building2 className="h-3.5 w-3.5" /> New Project</button>
                      </div>
                    </>
                  )}
                </div>
                {/* More menu */}
                <div className="relative">
                  <Button variant="ghost" size="sm" onClick={() => setMoreOpen(!moreOpen)} title="Export, import, print">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                  {moreOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-lg">
                        <button onClick={() => { exportGraph(); setMoreOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent">
                          <Download className="h-3.5 w-3.5" /> Export as JSON
                        </button>
                        <button onClick={() => { fileImportRef.current?.click(); setMoreOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent">
                          <Upload className="h-3.5 w-3.5" /> Import JSON
                        </button>
                        <button onClick={() => { printGraph(); setMoreOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption hover:bg-accent">
                          <Printer className="h-3.5 w-3.5" /> Print
                        </button>
                        <div className="my-1 h-px bg-border" />
                        <button onClick={() => { setClearOpen(true); setMoreOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-caption text-danger hover:bg-accent">
                          <Trash2 className="h-3.5 w-3.5" /> Clear canvas
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Row 3: Filter dropdown panel (canvas mode, expandable) ── */}
          {viewMode === "canvas" && filterOpen && (
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-3 py-2">
              {/* Kind filter */}
              <div className="flex items-center gap-1">
                <span className="text-micro font-medium text-muted-foreground">Kind:</span>
                <button
                  onClick={() => setFilterKind(null)}
                  className={cn("rounded px-1.5 py-0.5 text-micro", !filterKind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                >All</button>
                {NODE_KIND_LIST.map((k) => (
                  <button
                    key={k.key}
                    onClick={() => setFilterKind(filterKind === k.key ? null : k.key)}
                    className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-micro font-medium", filterKind === k.key ? "text-white" : "text-muted-foreground hover:bg-accent")}
                    style={filterKind === k.key ? { background: k.color } : undefined}
                  >
                    <k.icon className="h-2.5 w-2.5" /> {k.label}
                  </button>
                ))}
              </div>

              {/* Priority filter */}
              <div className="flex items-center gap-1">
                <span className="text-micro font-medium text-muted-foreground">Priority:</span>
                <button
                  onClick={() => setFilterPriority(null)}
                  className={cn("rounded px-1.5 py-0.5 text-micro", !filterPriority ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                >All</button>
                {PRIORITY_LIST.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setFilterPriority(filterPriority === p.key ? null : p.key)}
                    className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-micro font-medium", filterPriority === p.key ? "text-white" : "text-muted-foreground hover:bg-accent")}
                    style={filterPriority === p.key ? { background: p.color } : undefined}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Due date filter */}
              <div className="flex items-center gap-1">
                <span className="text-micro font-medium text-muted-foreground">Due:</span>
                {(["all", "overdue", "today", "upcoming", "none"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFilterDueDate(opt)}
                    className={cn("rounded px-1.5 py-0.5 text-micro capitalize", filterDueDate === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                  >{opt}</button>
                ))}
              </div>

              {/* Assignee filter */}
              <div className="flex items-center gap-1">
                <span className="text-micro font-medium text-muted-foreground">Assignee:</span>
                <button
                  onClick={() => setFilterAssignee(null)}
                  className={cn("rounded px-1.5 py-0.5 text-micro", !filterAssignee ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                >All</button>
                <button
                  onClick={() => setFilterAssignee("unassigned")}
                  className={cn("rounded px-1.5 py-0.5 text-micro", filterAssignee === "unassigned" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                >Unassigned</button>
                {employees.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => setFilterAssignee(filterAssignee === emp.id ? null : emp.id)}
                    className={cn("rounded px-1.5 py-0.5 text-micro", filterAssignee === emp.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                  >{emp.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* ── Tag filter bar (only when tags exist) ── */}
          {allTags.length > 0 && viewMode === "canvas" && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-3 py-1.5">
              <span className="flex items-center gap-1 text-micro font-medium text-muted-foreground">
                <Tag className="h-3 w-3" /> Tags:
              </span>
              {allTags.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium transition-colors",
                    tagFilter === tag
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {tag}
                  <span className={cn("text-micro", tagFilter === tag ? "text-primary-foreground/70" : "text-muted-foreground/50")}>{count}</span>
                </button>
              ))}
              {tagFilter && (
                <button
                  onClick={() => setTagFilter(null)}
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-micro text-muted-foreground hover:text-foreground"
                >
                  <X className="h-2.5 w-2.5" /> clear
                </button>
              )}
            </div>
          )}

          {/* Kind selector — appears when a node is selected */}
          {selectedNode && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
              <span className="text-caption font-medium text-muted-foreground">
                {MODULES[(selectedNode.data as ModuleNodeData).model]?.label}:
              </span>
              <div className="flex items-center gap-1">
                {NODE_KIND_LIST.map((k) => {
                  const active = (selectedNode.data as ModuleNodeData).kind === k.key;
                  return (
                    <button
                      key={k.key}
                      onClick={() => setNodeKind(selectedNode.id, active ? null : k.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-caption font-medium transition-colors",
                        active
                          ? "border-transparent text-white shadow-sm"
                          : "border-border bg-card text-muted-foreground hover:bg-accent",
                      )}
                      style={active ? { background: k.color } : undefined}
                      title={k.canAssign ? "Assignable to a person" : "Reference only"}
                    >
                      <k.icon className="h-3 w-3" />
                      {k.label}
                    </button>
                  );
                })}
              </div>
              {(selectedNode.data as ModuleNodeData).assigneeId && (
                <button
                  onClick={() => onUnassign(selectedNode.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-caption text-muted-foreground hover:border-danger/40 hover:text-danger"
                >
                  <X className="h-3 w-3" /> Unassign
                </button>
              )}
              <div className="ml-auto flex items-center gap-1">
                <span className="hidden text-micro text-muted-foreground/60 sm:inline">
                  Tip: drag a person from the right sidebar onto a node
                </span>
                <button
                  onClick={() => duplicateNode(selectedNode.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-caption text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Duplicate this node"
                >
                  <Copy className="h-3 w-3" /> Duplicate
                </button>
                <button
                  onClick={() => {
                    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
                    setSelectedNodeId(null);
                    setPreviewNodeId(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-caption text-muted-foreground hover:border-danger/40 hover:text-danger"
                  title="Delete this node"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          )}

          {/* Quick Create form dialogs (toolbar-level) */}
          {toolbarRefData && (
            <>
              <MaterialFormDialog open={quickCreateDialog === "material"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} categories={toolbarRefData.categories} material={null} />
              <CategoryFormDialog open={quickCreateDialog === "category"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} category={null} />
              <LocationFormDialog open={quickCreateDialog === "location"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} projects={toolbarRefData.projects} location={null} />
              <SupplierFormDialog open={quickCreateDialog === "supplier"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} supplier={null} />
              <PurchaseOrderFormDialog open={quickCreateDialog === "po"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} suppliers={toolbarRefData.suppliers} materials={toolbarRefData.materials} locations={toolbarRefData.locations} projects={toolbarRefData.projects} />
              <TransferFormDialog open={quickCreateDialog === "transfer"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} locations={toolbarRefData.locations} />
              <IssueFormDialog open={quickCreateDialog === "issue"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} projects={toolbarRefData.projects} locations={toolbarRefData.locationOptions} materials={toolbarRefData.materialOptions} departments={toolbarRefData.departments} />
              <LandPurchaseFormDialog open={quickCreateDialog === "land"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} projects={toolbarRefData.projects} />
              <BuiltUnitFormDialog open={quickCreateDialog === "unit"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} projects={toolbarRefData.projects} phases={toolbarRefData.phases} />
              <CustomerFormDialog open={quickCreateDialog === "customer"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} customer={null} />
              <ProjectCostFormDialog open={quickCreateDialog === "cost"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} projects={toolbarRefData.projects} subcontractors={toolbarRefData.subcontractors} />
              <ExpenseFormDialog open={quickCreateDialog === "expense"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} projects={toolbarRefData.projects} />
              <EquipmentFormDialog open={quickCreateDialog === "equipment"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} />
              <RequisitionFormDialog open={quickCreateDialog === "requisition"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} projects={toolbarRefData.projects} phases={toolbarRefData.phases} materials={toolbarRefData.materialOptions} />
              <ProjectFormDialog open={quickCreateDialog === "project"} onOpenChange={(o) => { if (!o) { setQuickCreateDialog(null); refreshToolbarRef(); router.refresh(); } }} />
            </>
          )}

          {viewMode === "canvas" ? (
          <div
            ref={canvasRef}
            className="relative flex-1"
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            <ReactFlow
              nodes={(tagFilter || filteredNodeIds)
                ? nodes.map((n) => {
                    const d = n.data as ModuleNodeData;
                    let dimmed = false;
                    if (tagFilter) {
                      const hasTag = d.attachments?.some((a) => a.tags?.includes(tagFilter)) ?? false;
                      if (!hasTag) dimmed = true;
                    }
                    if (filteredNodeIds && !filteredNodeIds.has(n.id)) dimmed = true;
                    return dimmed ? { ...n, className: "opacity-20" } : n;
                  })
                : nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onNodesDelete={onNodesDelete}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              deleteKeyCode={liveReadOnly ? null : ["Backspace", "Delete"]}
              nodesDraggable={!liveReadOnly}
              nodesConnectable={!liveReadOnly}
              edgesReconnectable={!liveReadOnly}
              proOptions={{ hideAttribution: true }}
              className="bg-muted/20"
              defaultEdgeOptions={{ type: "relation", reconnectable: !liveReadOnly }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
              <Controls />
              <MiniMap
                pannable
                zoomable
                className="!bg-card !border !border-border"
                nodeColor={(n) => {
                  const d = n.data as ModuleNodeData;
                  return d.kind ? NODE_KINDS[d.kind].color : GROUP_COLORS[MODULES[d.model as ModelKey]?.group ?? "Core"];
                }}
                maskColor="rgba(0,0,0,0.05)"
              />
            </ReactFlow>

            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                <div className="max-w-sm rounded-xl border-2 border-dashed border-border bg-card/80 px-8 py-6 text-center backdrop-blur-sm">
                  <Workflow className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-body font-medium">Empty canvas</p>
                  <p className="mt-1 text-meta text-muted-foreground">
                    <span className="md:hidden">Tap "Modules" above to add a node.</span>
                    <span className="hidden md:inline">Drag a module from the left to start building a hierarchy.</span>
                  </p>
                  <p className="mt-2 text-caption text-muted-foreground/60">
                    Your work auto-saves as a draft.
                  </p>
                </div>
              </div>
            )}
          </div>
          ) : viewMode === "dashboard" ? (
            <DashboardView nodes={nodes} edges={edges} employees={employees} />
          ) : (
            <TimelineView nodes={nodes} employees={employees} onNodeClick={(id) => { setSelectedNodeId(id); setPreviewNodeId(id); setViewMode("canvas"); }} />
          )}
        </div>

        {/* People sidebar — desktop */}
        <aside className="hidden w-56 shrink-0 flex-col rounded-lg border border-border bg-card md:flex">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="flex items-center gap-1.5 text-caption font-semibold">
              <Users className="h-3.5 w-3.5" /> People
            </span>
            <Badge variant="muted">{employees.length}</Badge>
          </div>
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder="Search people…"
                className="h-8 pl-8 text-meta"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            <p className="px-2 pb-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
              Drag onto a task node
            </p>
            {filteredEmployees.length === 0 ? (
              <div className="px-2 py-3 text-caption text-muted-foreground">
                {employees.length === 0 ? (
                  <div className="space-y-2">
                    <p>No employees yet.</p>
                    <a href="/settings" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      <UserPlus className="h-3 w-3" /> Add in Settings
                    </a>
                  </div>
                ) : (
                  <p>No match for "{empSearch}".</p>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredEmployees.map((emp) => (
                  <EmployeeItem key={emp.id} employee={emp} />
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-border p-2">
            <p className="px-1 text-micro text-muted-foreground/70">
              Assignable to <span className="font-medium text-blue-600">Active</span> & <span className="font-medium text-amber-600">Assumption</span> nodes
            </p>
          </div>
        </aside>

        {/* Node popup — popover/aside with planning, KPIs, actions, tabs */}
        {previewNode && (
          <NodePopup
            nodeId={previewNode.id}
            model={(previewNode.data as ModuleNodeData).model}
            kind={(previewNode.data as ModuleNodeData).kind}
            assigneeId={(previewNode.data as ModuleNodeData).assigneeId ?? null}
            attachments={(previewNode.data as ModuleNodeData).attachments ?? []}
            dueDate={(previewNode.data as ModuleNodeData).dueDate ?? null}
            priority={(previewNode.data as ModuleNodeData).priority}
            notes={(previewNode.data as ModuleNodeData).notes ?? []}
            customFields={(previewNode.data as ModuleNodeData).customFields ?? []}
            recordId={(previewNode.data as ModuleNodeData).recordId ?? null}
            recordLabel={(previewNode.data as ModuleNodeData).recordLabel ?? null}
            connectedNodes={getConnectedNodes(previewNode.id)}
            employees={employees}
            today={today}
            workspaceId={workspaceId}
            nodePosition={previewNodePosition}
            onClose={() => setPreviewNodeId(null)}
            onUploadFiles={uploadFiles}
            onAddLink={addLink}
            onUpdateAttachment={updateAttachment}
            onRemoveAttachment={removeAttachment}
            onDeleteFile={deleteAttachmentFile}
            onSetDueDate={setNodeDueDate}
            onSetPriority={setNodePriority}
            onAddNote={addNote}
            onDeleteNote={deleteNote}
            onAddCustomField={addCustomField}
            onUpdateCustomField={updateCustomField}
            onDeleteCustomField={deleteCustomField}
            onLinkRecord={linkRecord}
            onUnlinkRecord={unlinkRecord}
            onJumpToNode={(id) => { setPreviewNodeId(id); setSelectedNodeId(id); }}
            onSetKind={setNodeKind}
            onAssignEmployee={onAssignEmployee}
            onUnassign={onUnassign}
            onSpawnChild={spawnChildNode}
          />
        )}

        {/* Mobile palette drawer */}
        <Dialog open={paletteOpen} onOpenChange={setPaletteOpen} title="Modules" description="Tap a module to add it to the canvas.">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search modules…" className="h-8 pl-8 text-meta" />
            </div>
            <div className="max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
              <PaletteList onPick={onPickFromPalette} search={search} />
            </div>
          </div>
        </Dialog>

        {/* Mobile people drawer */}
        <Dialog open={peopleOpen} onOpenChange={setPeopleOpen} title="People" description="Drag a person onto a task node to assign them.">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search people…" className="h-8 pl-8 text-meta" />
            </div>
            <div className="max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
              {filteredEmployees.length === 0 ? (
                <p className="px-2 py-3 text-caption text-muted-foreground">
                  {employees.length === 0 ? "No employees yet. Add some in Settings." : `No match for "${empSearch}".`}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredEmployees.map((emp) => (
                    <EmployeeItem key={emp.id} employee={emp} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Dialog>

        {/* Relation picker */}
        <Dialog
          open={pendingConnect !== null}
          onOpenChange={(o) => !o && setPendingConnect(null)}
          title="Choose a relation"
          description="Multiple paths connect these modules. Pick the one to drill through."
        >
          <div className="space-y-1.5">
            {pendingConnect?.options.map((rel) => (
              <button
                key={rel.label}
                onClick={() => confirmPending(rel)}
                className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2.5 text-left text-meta transition-colors hover:border-primary hover:bg-accent"
              >
                <span className="font-medium">{rel.label}</span>
                <span className="text-caption text-muted-foreground">
                  {rel.hops.map((h) => h.field).join(" → ")}
                </span>
              </button>
            ))}
          </div>
        </Dialog>

        {/* Hidden file input for import */}
        <input ref={fileImportRef} type="file" accept="application/json" onChange={importGraph} className="hidden" />

        {/* Templates dialog */}
        <Dialog open={templateOpen} onOpenChange={setTemplateOpen} title="Workspace templates" description="Load a pre-built graph. This replaces the current canvas.">
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                onClick={() => loadTemplate(tpl.key)}
                className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-primary hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <LayoutDashboard className="h-4 w-4" />
                  </span>
                  <p className="text-body font-semibold">{tpl.label}</p>
                </div>
                <p className="text-meta text-muted-foreground">{tpl.description}</p>
                <p className="text-micro text-muted-foreground/60">{tpl.graph.nodes.length} nodes · {tpl.graph.edges.length} connections</p>
              </button>
            ))}
          </div>
        </Dialog>

        {/* Clear confirmation dialog */}
        <Dialog open={clearOpen} onOpenChange={setClearOpen} title="Clear canvas?" description="This removes all nodes, edges, and their attachments from the canvas. This cannot be undone.">
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setClearOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => { onClear(); setClearOpen(false); }}>
              <Trash2 className="h-3.5 w-3.5" /> Clear everything
            </Button>
          </div>
        </Dialog>

        {/* Save dialog */}
        <Dialog open={saveOpen} onOpenChange={setSaveOpen} title="Save workspace" description="This becomes a new navigation tab with a live drill-down view.">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Name</Label>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Procurement Explorer" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-desc">Description (optional)</Label>
              <Input id="ws-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this hierarchy is for" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-icon">Nav tab icon</Label>
              <Select id="ws-icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
                {ICON_OPTIONS.map((ic) => (<option key={ic} value={ic}>{ic}</option>))}
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={onSave} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save & open"}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </CanvasContext.Provider>
  );
}

// ── Exported wrapper with provider ───────────────────────────

/**
 * Layout live records as a **branching tree** — children spread out below
 * their parent like tree branches, not flattened into depth-based rows.
 *
 * Algorithm (recursive tidy-tree with child wrapping):
 *
 *   1. BFS from root → assign each node to its **first-seen parent**.
 *      This breaks cycles and shared-node ambiguity: every node belongs
 *      to exactly one parent, forming a clean tree.
 *
 *   2. Sort each node's children by (module group, label) so similar
 *      record types cluster together within a branch.
 *
 *   3. `computeSubtreeWidth(node)` — recursive, with cycle guard via a
 *      `visiting` set. Children are **wrapped into rows of MAX_PER_ROW**.
 *      The subtree width = width of the widest row (NOT sum of all
 *      children). This caps the width at MAX_PER_ROW × NODE_GAP per
 *      level, so the tree stays compact no matter how many children
 *      a node has.
 *
 *   4. `layout(node, y, leftEdge)` — place the node centered above its
 *      children. Children are laid out in wrapped rows, each row
 *      centered under the parent. Subtree widths prevent horizontal
 *      overlap between sibling branches.
 *
 *   5. **X-rank cascade** (post-layout): within each depth level,
 *      nodes are sorted by x position and given a y-offset based on
 *      their rank (15px × rank, capped at 300px). This guarantees
 *      every node at the same depth has a unique y — no horizontal
 *      lines can form.
 *
 * Spacing accounts for actual node dimensions:
 *   - Nodes are 180px wide, ~100px tall (with badges/assignee/due date)
 *   - Assignee badge floats ~80px to the right → NODE_GAP=260 (80px clear)
 *   - LEVEL_GAP=280 between depth levels (clear hierarchy separation)
 *   - ROW_GAP=140 between wrapped child rows (40px clear vertical gap)
 *   - Cascade: 80px per rank within depth (full node-height) — no horizontal lines
 *
 * With MAX_PER_ROW=4 and max depth=3, worst-case width ≈ 4³×260 = 16,640px
 * but real data (200 node cap, 25 per relation) is far smaller. `fitView`
 * auto-zooms to show the full tree on load.
 */
function layoutLiveAsHierarchy(graph: LiveGraph): WorkspaceGraph {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // Build adjacency — each node's children (outgoing edges), deduped
  const childrenMap = new Map<string, string[]>();
  for (const n of graph.nodes) childrenMap.set(n.id, []);
  for (const e of graph.edges) {
    if (e.from === e.to) continue; // skip self-loops
    const arr = childrenMap.get(e.from);
    if (arr && !arr.includes(e.to)) arr.push(e.to);
  }

  // BFS from root — assign each node to its **first-seen parent**.
  // This forms a clean tree: every node has exactly one parent, no cycles.
  const firstParent = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [graph.rootId];
  firstParent.set(graph.rootId, "");
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const child of childrenMap.get(id) ?? []) {
      if (!visited.has(child)) {
        if (!firstParent.has(child)) firstParent.set(child, id);
        queue.push(child);
      }
    }
  }

  // Build a clean tree: each node's children = only those whose firstParent
  // is this node. Sorted by module group then label for visual clustering.
  const treeChildren = new Map<string, string[]>();
  for (const n of graph.nodes) treeChildren.set(n.id, []);
  for (const [child, parent] of firstParent) {
    if (parent) {
      treeChildren.get(parent)?.push(child);
    }
  }
  treeChildren.forEach((kids) => {
    kids.sort((a, b) => {
      const na = nodeById.get(a)!;
      const nb = nodeById.get(b)!;
      const ga = MODULES[na.model as ModelKey]?.group ?? "Core";
      const gb = MODULES[nb.model as ModelKey]?.group ?? "Core";
      if (ga !== gb) return MODULE_GROUPS.indexOf(ga) - MODULE_GROUPS.indexOf(gb);
      return na.label.localeCompare(nb.label);
    });
  });

  // ── Layout constants ──
  const MAX_PER_ROW = 4;      // wrap children into rows of 4 max
  const LEVEL_GAP = 280;      // vertical gap between parent → child level
  const ROW_GAP = 140;        // vertical gap between wrapped child rows
  const NODE_GAP = 260;       // horizontal center-to-center (accounts for badge)
  const NODE_WIDTH = 180;
  const START_Y = 80;

  // Chunk an array into rows of MAX_PER_ROW
  function chunk<T>(arr: T[], size: number): T[][] {
    const rows: T[][] = [];
    for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
    return rows;
  }

  // Compute subtree width — recursive with cycle guard.
  // Width = widest row of children (wrapping caps this), not sum of all.
  const subtreeWidth = new Map<string, number>();
  const visiting = new Set<string>();
  function computeWidth(id: string): number {
    if (subtreeWidth.has(id)) return subtreeWidth.get(id)!;
    if (visiting.has(id)) return NODE_WIDTH; // cycle guard
    visiting.add(id);
    const kids = treeChildren.get(id) ?? [];
    if (kids.length === 0) {
      subtreeWidth.set(id, NODE_WIDTH);
      visiting.delete(id);
      return NODE_WIDTH;
    }
    const rows = chunk(kids, MAX_PER_ROW);
    let maxWidth = NODE_WIDTH;
    for (const row of rows) {
      // Row width = sum of child subtree widths + gaps between them
      let rowW = 0;
      for (const childId of row) rowW += computeWidth(childId);
      rowW += (row.length - 1) * NODE_GAP;
      if (rowW > maxWidth) maxWidth = rowW;
    }
    subtreeWidth.set(id, maxWidth);
    visiting.delete(id);
    return maxWidth;
  }

  // Recursive layout: place node centered above its children.
  // Children are laid out in wrapped rows, each row centered under parent.
  //
  // **Post-layout x-rank cascade**: after computing all x/y positions,
  // nodes at the same depth are sorted by x and given a y-offset based
  // on their rank. This guarantees every node at the same depth has a
  // unique y — no two nodes can form a horizontal line.
  //
  // The cascade per rank is STAGGER_PER_RANK, capped at STAGGER_CAP.
  // With ~20 nodes per depth, the spread is 20×15=300px — clearly
  // visible against LEVEL_GAP=280. The cap prevents excessive stretching
  // for very wide levels.
  const STAGGER_PER_RANK = 80;  // full node-height per rank — no horizontal lines possible

  const positions = new Map<string, { x: number; y: number }>();
  function layout(id: string, y: number, leftEdge: number): void {
    const myWidth = subtreeWidth.get(id) ?? NODE_WIDTH;
    const centerX = leftEdge + myWidth / 2;
    positions.set(id, { x: Math.round(centerX - NODE_WIDTH / 2), y: Math.round(y) });

    const kids = treeChildren.get(id) ?? [];
    if (kids.length === 0) return;

    const rows = chunk(kids, MAX_PER_ROW);
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri]!;
      const rowY = y + LEVEL_GAP + ri * ROW_GAP;
      // Total width of this row
      let rowWidth = 0;
      for (const childId of row) rowWidth += subtreeWidth.get(childId) ?? NODE_WIDTH;
      rowWidth += (row.length - 1) * NODE_GAP;
      // Center the row under the parent
      let cursor = centerX - rowWidth / 2;
      for (let ci = 0; ci < row.length; ci++) {
        const childId = row[ci]!;
        const childW = subtreeWidth.get(childId) ?? NODE_WIDTH;
        layout(childId, rowY, cursor);
        cursor += childW + NODE_GAP;
      }
    }
  }

  // Post-layout: compute depth of each node, then within each depth
  // sort by x and apply a y-offset based on rank. This guarantees
  // no two nodes at the same depth share the same y.
  //
  // STAGGER_PER_RANK=80px → each node is a full node-height lower than
  // the previous. With 8 nodes at a depth, the spread is 560px — clearly
  // breaking any horizontal alignment. No cap: let the tree stretch
  // vertically as needed. fitView will zoom out to show everything.
  const depthOf = new Map<string, number>();
  function computeDepth(id: string, d: number): void {
    if (depthOf.has(id)) return;
    depthOf.set(id, d);
    for (const childId of treeChildren.get(id) ?? []) computeDepth(childId, d + 1);
  }
  computeDepth(graph.rootId, 0);

  // Group positions by depth, sort by x, apply rank-based y-offset
  const byDepth = new Map<number, string[]>();
  for (const [id, depth] of depthOf) {
    if (!byDepth.has(depth)) byDepth.set(depth, []);
    byDepth.get(depth)!.push(id);
  }
  for (const [depth, ids] of byDepth) {
    if (depth === 0) continue; // don't shift root
    ids.sort((a, b) => (positions.get(a)?.x ?? 0) - (positions.get(b)?.x ?? 0));
    ids.forEach((id, rank) => {
      const pos = positions.get(id);
      if (!pos) return;
      pos.y = Math.round(pos.y + rank * STAGGER_PER_RANK);
    });
  }

  // Compute all subtree widths first, then layout from root
  computeWidth(graph.rootId);
  layout(graph.rootId, START_Y, 0);

  // Any unvisited nodes (disconnected from root) — place them in a
  // separate block to the right, sorted by depth then label
  const disconnected: string[] = [];
  for (const n of graph.nodes) {
    if (!positions.has(n.id)) disconnected.push(n.id);
  }
  if (disconnected.length > 0) {
    disconnected.sort((a, b) => (nodeById.get(a)?.label ?? "").localeCompare(nodeById.get(b)?.label ?? ""));
    const maxX = Math.max(...Array.from(positions.values()).map((p) => p.x + NODE_WIDTH), 0);
    disconnected.forEach((id, i) => {
      positions.set(id, { x: Math.round(maxX + NODE_GAP + i * NODE_GAP), y: START_Y });
    });
  }

  // Only keep tree edges (parent → child where parent is the child's
  // firstParent). Cross-reference edges (to nodes already placed under a
  // different parent) are dropped — they create visual noise with lines
  // crossing the entire tree. The tree structure already shows the
  // primary relationship; cross-refs can be explored by clicking nodes.
  const treeEdgeSet = new Set<string>();
  for (const [child, parent] of firstParent) {
    if (parent) treeEdgeSet.add(`${parent}->${child}`);
  }

  return {
    rootId: graph.rootId,
    nodes: graph.nodes.map((n) => {
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      return { id: n.id, model: n.model, x: p.x, y: p.y };
    }),
    edges: graph.edges
      .filter((e) => treeEdgeSet.has(`${e.from}->${e.to}`))
      .map((e) => ({
        from: e.from,
        to: e.to,
        relationLabel: e.relationLabel,
        hops: e.hops,
        toModel: e.toModel,
        label: e.label,
      })),
  };
}

export function PlaygroundCanvas({
  initialGraph, workspaceId, mode = "create",
  initialName, initialDescription, initialIcon,
}: {
  initialGraph?: WorkspaceGraph;
  workspaceId?: string;
  mode?: "create" | "edit";
  initialName?: string;
  initialDescription?: string;
  initialIcon?: string;
}) {
  const [liveMode, setLiveMode] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [editorGraph, setEditorGraph] = useState<WorkspaceGraph | undefined>(initialGraph);
  const [editorKey, setEditorKey] = useState(0);

  // Fetch the live record graph, lay it out, and load it onto the editable
  // canvas (same editor, just with a LIVE indicator + role gates). No separate
  // read-only page anymore.
  const goLive = useCallback(() => {
    setLiveLoading(true);
    fetch("/api/modules/live-graph")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load live data");
        return j as LiveGraph;
      })
      .then((g) => {
        const wg = layoutLiveAsHierarchy(g);
        setEditorGraph(wg);
        setEditorKey((k) => k + 1);
        setLiveMode(true);
        toast.success(`Loaded ${g.nodes.length} live records onto the canvas.`);
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Failed to load live data");
      })
      .finally(() => setLiveLoading(false));
  }, []);

  // Exit live mode → restore the original (server / draft) graph by remounting
  // the inner canvas. In create mode, initialGraph is undefined and the
  // localStorage draft is reloaded by the remount's useEffect.
  const exitLive = useCallback(() => {
    setLiveMode(false);
    setEditorGraph(initialGraph);
    setEditorKey((k) => k + 1);
  }, [initialGraph]);

  return (
    <ReactFlowProvider>
      <CanvasInner
        key={editorKey}
        initialGraph={editorGraph}
        workspaceId={workspaceId}
        mode={mode}
        initialName={initialName}
        initialDescription={initialDescription}
        initialIcon={initialIcon}
        liveMode={liveMode}
        liveLoading={liveLoading}
        onGoLive={goLive}
        onExitLive={exitLive}
      />
    </ReactFlowProvider>
  );
}
