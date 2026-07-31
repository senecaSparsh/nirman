"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  X, Link2, Unlink, ExternalLink, Maximize2, Minimize2, ChevronDown, ChevronRight,
  Workflow, GitBranch, Paperclip, Plus, Search, Info, AlertCircle, AlertTriangle,
  Calendar, Clock, Flag, StickyNote, MessageSquare, Trash2, FileText,
  Send, CheckSquare, Package, Loader2, ArrowDown, ArrowUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  MODULES, GROUP_COLORS, NODE_KINDS, NODE_KIND_LIST, PRIORITIES, PRIORITY_LIST,
  popupTabsFor,
  type Attachment, type CustomField, type ModelKey, type NodeKind, type NodeNote,
  type Priority, type RelationDef, type ScopedAction,
} from "@/lib/modules/registry";
import { getField } from "@/lib/modules/resolver";
import { NodeActions, useReferenceData, type ActionDef } from "@/components/playground/node-actions";
import { AssignTaskDialog } from "@/components/tasks/assign-task-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────

interface EmployeeInfo { id: string; name: string; trade?: string | null; active?: boolean; }

interface ConnectedNode {
  id: string;
  model: ModelKey;
  label: string;
  relationLabel: string;
  direction: "in" | "out";
}

interface PreviewData {
  model: string;
  moduleLabel: string;
  displayField: string;
  secondaryField: string | null;
  columns: { field: string; label: string; type?: string }[];
  rows: Record<string, unknown>[];
}

interface InsightStat {
  label: string;
  value: string | number;
  type?: "currency" | "number" | "date" | "badge";
  color?: string;
}
interface InsightAlert {
  severity: "info" | "warning" | "danger";
  message: string;
}
interface ModuleInsightsData {
  model: ModelKey;
  moduleLabel: string;
  stats: InsightStat[];
  alerts: InsightAlert[];
  related: { label: string; count: number; model?: ModelKey }[];
  timeline?: { date: string; label: string; value: number }[];
}

interface RecordField {
  label: string;
  value: string;
  type?: "currency" | "number" | "date" | "badge" | "text";
}
interface RelatedChild {
  id: string;
  label: string;
  secondary: string | null;
}
interface RelatedGroup {
  relation: RelationDef;
  count: number;
  children: RelatedChild[];
}
interface RecordDetail {
  model: ModelKey;
  moduleLabel: string;
  recordId: string;
  displayLabel: string;
  secondaryLabel: string | null;
  fields: RecordField[];
  related: RelatedGroup[];
}

// ── Due date helper ─────────────────────────────────────────────

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

function cellLabel(value: unknown, type?: string): string {
  if (value == null || value === "") return "—";
  if (type === "currency") return formatCurrency(Number(value));
  if (type === "number") return formatNumber(Number(value));
  if (type === "date") return formatDate(value as string);
  return String(value);
}

// ════════════════════════════════════════════════════════════════
//  Main exported component — NodePopup
//  Renders either a quick popover or a full aside, sharing state.
// ════════════════════════════════════════════════════════════════

export interface NodePopupProps {
  nodeId: string;
  model: ModelKey;
  kind?: NodeKind;
  assigneeId?: string | null;
  attachments?: Attachment[];
  dueDate?: string | null;
  priority?: Priority;
  notes?: NodeNote[];
  customFields?: CustomField[];
  recordId?: string | null;
  recordLabel?: string | null;
  connectedNodes: ConnectedNode[];
  employees: EmployeeInfo[];
  today: Date | null;
  workspaceId?: string;
  /** Node position on canvas (for popover anchoring). */
  nodePosition?: { x: number; y: number };
  onClose: () => void;
  // Planning handlers
  onSetKind: (nodeId: string, kind: NodeKind) => void;
  onAssignEmployee: (nodeId: string, employeeId: string) => void;
  onUnassign: (nodeId: string) => void;
  onSetDueDate: (nodeId: string, dueDate: string | null) => void;
  onSetPriority: (nodeId: string, priority: Priority | null) => void;
  onAddNote: (nodeId: string, text: string) => void;
  onDeleteNote: (nodeId: string, noteId: string) => void;
  onAddCustomField: (nodeId: string, label: string, value: string) => void;
  onUpdateCustomField: (nodeId: string, fieldId: string, updates: Partial<CustomField>) => void;
  onDeleteCustomField: (nodeId: string, fieldId: string) => void;
  // Link handlers
  onLinkRecord: (nodeId: string, recordId: string, recordLabel: string) => void;
  onUnlinkRecord: (nodeId: string) => void;
  // Attachment handlers
  onUploadFiles: (nodeId: string, files: FileList) => Promise<void>;
  onAddLink: (nodeId: string, url: string, title: string) => void;
  onUpdateAttachment: (nodeId: string, attachmentId: string, updates: Partial<Attachment>) => void;
  onRemoveAttachment: (nodeId: string, attachmentId: string) => void;
  onDeleteFile: (attachment: Attachment) => Promise<void>;
  // Navigation
  onJumpToNode: (nodeId: string) => void;
  /** Spawn a new linked child node on the canvas + connect with an edge. */
  onSpawnChild: (parentId: string, childModel: ModelKey, childRecordId: string, childLabel: string, relation: RelationDef) => void;
}

type PopupMode = "popover" | "aside";
type TabKey = "overview" | "related" | "records" | "connections" | "files" | "activity";

export function NodePopup(props: NodePopupProps) {
  const [mode, setMode] = useState<PopupMode>("popover");
  const [tab, setTab] = useState<TabKey>("overview");
  const [planningOpen, setPlanningOpen] = useState(false);

  const mod = MODULES[props.model];
  const popup = mod?.popup;
  const tabs = popupTabsFor(props.model);
  const isLinked = !!props.recordId;
  const isSystem = popup?.archetype === "system";
  const canLink = !popup?.noLink;
  const canFiles = !popup?.noFiles && tabs.files;

  // Determine the default tab: linked → overview, unlinked → records (if available) or overview
  useEffect(() => {
    if (isLinked && tabs.overview) setTab("overview");
    else if (!isLinked && tabs.records) setTab("records");
    else setTab("overview");
  }, [isLinked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Available tabs for this model+link state
  const availableTabs = useMemo(() => {
    const result: { key: TabKey; label: string; icon: typeof Workflow; count?: number }[] = [];
    if (tabs.overview) result.push({ key: "overview", label: "Overview", icon: Workflow });
    if (tabs.related && isLinked) result.push({ key: "related", label: "Related", icon: GitBranch });
    if (tabs.records && !isLinked) result.push({ key: "records", label: "Records", icon: FileText });
    if (tabs.connections) result.push({ key: "connections", label: "Links", icon: GitBranch, count: props.connectedNodes.length });
    if (canFiles) result.push({ key: "files", label: "Files", icon: Paperclip, count: props.attachments?.length ?? 0 });
    if (tabs.activity && isLinked) result.push({ key: "activity", label: "Activity", icon: Clock });
    return result;
  }, [tabs, isLinked, canFiles, props.connectedNodes.length, props.attachments?.length]);

  // Ensure current tab is valid
  useEffect(() => {
    if (!availableTabs.some((t) => t.key === tab) && availableTabs.length > 0) {
      setTab(availableTabs[0]!.key);
    }
  }, [availableTabs, tab]);

  const shell = (
    <PopupShell
      {...props}
      mode={mode}
      tab={tab}
      setTab={setTab}
      availableTabs={availableTabs}
      planningOpen={planningOpen}
      setPlanningOpen={setPlanningOpen}
      isLinked={isLinked}
      isSystem={isSystem}
      canLink={canLink}
      canFiles={canFiles}
      onExpand={() => setMode("aside")}
      onCollapse={() => setMode("popover")}
    />
  );

  if (mode === "popover") {
    return (
      <PopoverWrapper nodePosition={props.nodePosition} onClose={props.onClose}>
        {shell}
      </PopoverWrapper>
    );
  }
  return shell;
}

// ── Popover wrapper — anchors near the node, dismisses on outside click ──

function PopoverWrapper({
  children,
  nodePosition,
  onClose,
}: {
  children: ReactNode;
  nodePosition?: { x: number; y: number };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close (but not on the popover itself)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // Don't close if clicking on a ReactFlow node (those have their own handlers)
        const target = e.target as HTMLElement;
        if (target.closest(".react-flow__node")) return;
        onClose();
      }
    };
    // Delay to avoid the same click that opened the popover from closing it
    const timer = setTimeout(() => document.addEventListener("mousedown", onClick), 100);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", onClick); };
  }, [onClose]);

  // Position: prefer below-right of the node, clamp to viewport
  const style = useMemo(() => {
    if (!nodePosition) return { top: 80, right: 16 };
    return {
      top: Math.min(nodePosition.y + 60, window.innerHeight - 400),
      left: Math.min(nodePosition.x + 220, window.innerWidth - 340),
    };
  }, [nodePosition]);

  return (
    <div
      ref={ref}
      className="absolute z-30 w-80 rounded-xl border-2 border-border bg-card shadow-2xl"
      style={style}
    >
      {children}
    </div>
  );
}

// ── Popup Shell — shared by popover and aside ───────────────────

function PopupShell(
  props: NodePopupProps & {
    mode: PopupMode;
    tab: TabKey;
    setTab: (t: TabKey) => void;
    availableTabs: { key: TabKey; label: string; icon: typeof Workflow; count?: number }[];
    planningOpen: boolean;
    setPlanningOpen: (v: boolean) => void;
    isLinked: boolean;
    isSystem: boolean;
    canLink: boolean;
    canFiles: boolean;
    onExpand: () => void;
    onCollapse: () => void;
  },
) {
  const {
    nodeId, model, kind, assigneeId, dueDate, priority, notes, customFields,
    recordId, recordLabel, connectedNodes, employees, today, workspaceId,
    mode, tab, setTab, availableTabs, planningOpen, setPlanningOpen,
    isLinked, isSystem, canLink, canFiles, onExpand, onCollapse,
    onClose, onSetKind, onAssignEmployee, onUnassign, onSetDueDate, onSetPriority,
    onAddNote, onDeleteNote, onAddCustomField, onUpdateCustomField, onDeleteCustomField,
    onLinkRecord, onUnlinkRecord, onJumpToNode, onSpawnChild,
  } = props;

  const mod = MODULES[model];
  const popup = mod?.popup;
  const color = mod ? GROUP_COLORS[mod.group] : "#6366f1";
  const [assignTaskOpen, setAssignTaskOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);

  // Task count badge
  const [taskCount, setTaskCount] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    fetch(`/api/tasks?status=PENDING,IN_PROGRESS`)
      .then((r) => (r.ok ? r.json() : []))
      .then((tasks: { workspace?: { id: string } | null }[]) => {
        if (!cancelled) setTaskCount(tasks.filter((t) => t.workspace?.id === workspaceId).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId, assignTaskOpen]);

  const isAside = mode === "aside";

  // Build action list from popup config
  const actions = isLinked ? popup?.scopedActions : popup?.unscopedActions;
  const actionDefs: ActionDef[] | undefined = actions?.map((a) => ({
    label: a.label,
    icon: a.icon ?? Plus,
    dialog: a.dialog as ActionDef["dialog"],
  }));

  return (
    <div
      className={cn(
        "flex flex-col bg-card",
        isAside
          ? "absolute right-0 top-0 z-20 h-full w-96 rounded-lg border-l-2 border-border shadow-xl"
          : "max-h-[70vh] overflow-hidden rounded-xl",
      )}
    >
      {/* ── Identity header ── */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {mod && (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${color}18`, color }}
            >
              <mod.icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-body font-semibold">
              {recordLabel ?? mod?.label ?? model}
            </p>
            <p className="truncate text-micro text-muted-foreground">
              {mod?.label ?? model}
              {isLinked && " · linked"}
              {isSystem && " · read-only"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Link toggle */}
          {canLink && !isLinked && (
            <button
              onClick={() => setLinkPickerOpen((v) => !v)}
              title="Link to a record"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
            >
              <Link2 className="h-4 w-4" />
            </button>
          )}
          {canLink && isLinked && (
            <button
              onClick={() => { onUnlinkRecord(nodeId); setLinkPickerOpen(false); }}
              title="Unlink record"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-danger"
            >
              <Unlink className="h-4 w-4" />
            </button>
          )}
          {/* Expand / collapse toggle */}
          {isAside ? (
            <button onClick={onCollapse} title="Collapse to popover" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Minimize2 className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={onExpand} title="Expand to panel" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Maximize2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} title="Close" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Planning strip (collapsible) ── */}
      <PlanningStrip
        nodeId={nodeId}
        kind={kind}
        assigneeId={assigneeId}
        dueDate={dueDate}
        priority={priority}
        notes={notes}
        customFields={customFields}
        employees={employees}
        today={today}
        open={planningOpen}
        onToggle={() => setPlanningOpen(!planningOpen)}
        onSetKind={onSetKind}
        onAssignEmployee={onAssignEmployee}
        onUnassign={onUnassign}
        onSetDueDate={onSetDueDate}
        onSetPriority={onSetPriority}
        onAddNote={onAddNote}
        onDeleteNote={onDeleteNote}
        onAddCustomField={onAddCustomField}
        onUpdateCustomField={onUpdateCustomField}
        onDeleteCustomField={onDeleteCustomField}
      />

      {/* ── KPI strip (linked only) ── */}
      {isLinked && (
        <KpiStrip model={model} recordId={recordId!} />
      )}

      {/* ── Contextual action bar ── */}
      <ActionBar
        model={model}
        actionDefs={actionDefs}
        workspaceId={workspaceId}
        taskCount={taskCount}
        onAssignTaskOpen={() => setAssignTaskOpen(true)}
      />

      {/* ── Link picker (inline, when toggled on an unlinked node) ── */}
      {linkPickerOpen && !isLinked && canLink && (
        <div className="border-b border-border bg-muted/30">
          <LinkPickerInline
            model={model}
            onLink={(rid, rlabel) => { onLinkRecord(nodeId, rid, rlabel); setLinkPickerOpen(false); }}
            onClose={() => setLinkPickerOpen(false)}
          />
        </div>
      )}

      {/* ── Tab bar ── */}
      {isAside && availableTabs.length > 1 && (
        <div className="flex overflow-x-auto border-b border-border scrollbar-thin">
          {availableTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 px-3 py-2 text-caption font-medium transition-colors",
                tab === t.key ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="inline-flex items-center gap-1">
                <t.icon className="h-3 w-3" /> {t.label}
                {t.count !== undefined && t.count > 0 && ` (${t.count})`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Tab content (aside shows full; popover shows only overview) ── */}
      <div className={cn("overflow-y-auto scrollbar-thin", isAside ? "flex-1" : "max-h-[40vh]")}>
        {tab === "overview" ? (
          isLinked ? (
            <RecordOverview model={model} recordId={recordId!} onSpawnChild={onSpawnChild} nodeId={nodeId} />
          ) : (
            <InsightsOverview model={model} />
          )
        ) : tab === "related" && isLinked ? (
          <RelatedTab model={model} recordId={recordId!} onSpawnChild={onSpawnChild} onJumpToNode={onJumpToNode} />
        ) : tab === "records" && !isLinked ? (
          <RecordsTab
            model={model}
            onLinkRecord={(rid, rlabel) => onLinkRecord(nodeId, rid, rlabel)}
          />
        ) : tab === "connections" ? (
          <ConnectionsTab connectedNodes={connectedNodes} onJumpToNode={onJumpToNode} />
        ) : tab === "files" && canFiles ? (
          <FilesTab
            nodeId={nodeId}
            attachments={props.attachments ?? []}
            onUploadFiles={props.onUploadFiles}
            onAddLink={props.onAddLink}
            onUpdateAttachment={props.onUpdateAttachment}
            onRemoveAttachment={props.onRemoveAttachment}
            onDeleteFile={props.onDeleteFile}
          />
        ) : tab === "activity" && isLinked ? (
          <ActivityTab model={model} recordId={recordId!} />
        ) : (
          // Fallback (popover mode with a non-overview tab selected)
          isLinked ? (
            <RecordOverview model={model} recordId={recordId!} onSpawnChild={onSpawnChild} nodeId={nodeId} />
          ) : (
            <InsightsOverview model={model} />
          )
        )}
      </div>

      <AssignTaskDialog
        open={assignTaskOpen}
        onOpenChange={setAssignTaskOpen}
        defaultTitle={`${mod?.label ?? "Task"} — ${recordLabel ?? "canvas node"}`}
        nodeLabel={mod?.label ?? model}
        workspaceId={workspaceId}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Planning Strip — kind, assignee, due date, priority, notes, fields
//  Compact + collapsible. Always visible (collapsed by default).
// ════════════════════════════════════════════════════════════════

function PlanningStrip({
  nodeId, kind, assigneeId, dueDate, priority, notes, customFields,
  employees, today, open, onToggle,
  onSetKind, onAssignEmployee, onUnassign, onSetDueDate, onSetPriority,
  onAddNote, onDeleteNote, onAddCustomField, onUpdateCustomField, onDeleteCustomField,
}: {
  nodeId: string;
  kind?: NodeKind;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: Priority;
  notes?: NodeNote[];
  customFields?: CustomField[];
  employees: EmployeeInfo[];
  today: Date | null;
  open: boolean;
  onToggle: () => void;
  onSetKind: (nodeId: string, kind: NodeKind) => void;
  onAssignEmployee: (nodeId: string, employeeId: string) => void;
  onUnassign: (nodeId: string) => void;
  onSetDueDate: (nodeId: string, dueDate: string | null) => void;
  onSetPriority: (nodeId: string, priority: Priority | null) => void;
  onAddNote: (nodeId: string, text: string) => void;
  onDeleteNote: (nodeId: string, noteId: string) => void;
  onAddCustomField: (nodeId: string, label: string, value: string) => void;
  onUpdateCustomField: (nodeId: string, fieldId: string, updates: Partial<CustomField>) => void;
  onDeleteCustomField: (nodeId: string, fieldId: string) => void;
}) {
  const kindDef = kind ? NODE_KINDS[kind] : null;
  const assignee = assigneeId ? employees.find((e) => e.id === assigneeId) : null;
  const ddStatus = dueDateStatusWithNow(dueDate ?? null, today);
  const priorityDef = priority ? PRIORITIES[priority] : null;
  const [noteText, setNoteText] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");
  const [empDropdown, setEmpDropdown] = useState(false);

  const handleAddNote = () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    onAddNote(nodeId, trimmed);
    setNoteText("");
  };

  const handleAddField = () => {
    const label = newFieldLabel.trim();
    if (!label) return;
    onAddCustomField(nodeId, label, newFieldValue.trim());
    setNewFieldLabel("");
    setNewFieldValue("");
  };

  // Summary chips for collapsed state
  const chips: ReactNode[] = [];
  if (kindDef) {
    chips.push(
      <span key="kind" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: `${kindDef.color}18`, color: kindDef.color }}>
        <kindDef.icon className="h-2.5 w-2.5" /> {kindDef.label}
      </span>,
    );
  }
  if (assignee) {
    chips.push(
      <span key="assignee" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-micro font-medium text-primary">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/20 text-[9px]">
          {assignee.name.charAt(0).toUpperCase()}
        </span>
        {assignee.name}
      </span>,
    );
  }
  if (dueDate) {
    chips.push(
      <span key="due" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: `${ddStatus.color}18`, color: ddStatus.color }}>
        <ddStatus.icon className="h-2.5 w-2.5" /> {ddStatus.label}
      </span>,
    );
  }
  if (priorityDef) {
    chips.push(
      <span key="priority" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium" style={{ background: `${priorityDef.color}18`, color: priorityDef.color }}>
        <Flag className="h-2.5 w-2.5" /> {priorityDef.label}
      </span>,
    );
  }
  if ((notes?.length ?? 0) > 0) {
    chips.push(
      <span key="notes" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-muted-foreground">
        <StickyNote className="h-2.5 w-2.5" /> {notes!.length}
      </span>,
    );
  }
  if ((customFields?.length ?? 0) > 0) {
    chips.push(
      <span key="fields" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-muted-foreground">
        <MessageSquare className="h-2.5 w-2.5" /> {customFields!.length}
      </span>,
    );
  }

  return (
    <div className="border-b border-border bg-muted/20">
      {/* Collapsed summary */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        {chips.length > 0 ? (
          <div className="flex flex-1 flex-wrap items-center gap-1">{chips}</div>
        ) : (
          <span className="flex-1 text-caption text-muted-foreground">No planning tags — click to add</span>
        )}
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>

      {/* Expanded editor */}
      {open && (
        <div className="space-y-3 px-3 pb-3">
          {/* Kind selector */}
          <div className="space-y-1">
            <label className="text-micro font-semibold text-muted-foreground">Kind</label>
            <div className="flex flex-wrap gap-1">
              {NODE_KIND_LIST.map((k) => {
                const active = kind === k.key;
                return (
                  <button
                    key={k.key}
                    onClick={() => onSetKind(nodeId, k.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-caption font-medium transition-colors",
                      active ? "border-transparent text-white shadow-sm" : "border-border bg-card text-muted-foreground hover:bg-accent",
                    )}
                    style={active ? { background: k.color } : undefined}
                  >
                    <k.icon className="h-3 w-3" /> {k.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assignee */}
          <div className="space-y-1">
            <label className="text-micro font-semibold text-muted-foreground">Assignee</label>
            {assignee ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-caption font-medium text-primary">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px]">
                    {assignee.name.charAt(0).toUpperCase()}
                  </span>
                  {assignee.name}
                </span>
                <button onClick={() => onUnassign(nodeId)} className="rounded p-1 text-muted-foreground hover:text-danger" title="Unassign">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setEmpDropdown((v) => !v)}
                  className="flex w-full items-center justify-between rounded-md border border-input bg-card px-2 py-1.5 text-caption text-muted-foreground hover:bg-accent"
                >
                  Assign person… {empDropdown ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                {empDropdown && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg scrollbar-thin">
                    {employees.length === 0 ? (
                      <p className="px-2 py-1.5 text-micro text-muted-foreground">No employees. Add in Settings.</p>
                    ) : (
                      employees.map((emp) => (
                        <button
                          key={emp.id}
                          onClick={() => { onAssignEmployee(nodeId, emp.id); setEmpDropdown(false); }}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-caption hover:bg-accent"
                        >
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                            {emp.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 truncate">{emp.name}</span>
                          {emp.trade && <span className="text-micro text-muted-foreground">{emp.trade}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Due date + Priority row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-micro font-semibold text-muted-foreground">Due date</label>
              <input
                type="date"
                value={dueDate ? dueDate.split("T")[0] : ""}
                onChange={(e) => onSetDueDate(nodeId, e.target.value || null)}
                className="h-8 w-full rounded-md border border-input bg-card px-2 text-meta shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {dueDate && (
                <p className="flex items-center gap-1 text-micro font-medium" style={{ color: ddStatus.color }}>
                  <ddStatus.icon className="h-3 w-3" /> {ddStatus.label}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-micro font-semibold text-muted-foreground">Priority</label>
              <div className="flex flex-wrap gap-1">
                {PRIORITY_LIST.map((p) => {
                  const active = priority === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => onSetPriority(nodeId, active ? null : p.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-micro font-medium transition-colors",
                        active ? "border-transparent text-white shadow-sm" : "border-border bg-card text-muted-foreground hover:bg-accent",
                      )}
                      style={active ? { background: p.color } : undefined}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", !active && "border border-border")} style={{ background: active ? "white" : p.color }} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-micro font-semibold text-muted-foreground">Notes ({notes?.length ?? 0})</label>
            <div className="flex gap-1.5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
                placeholder="Add a note… (Cmd+Enter)"
                rows={2}
                className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-meta shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <Button size="sm" variant="outline" onClick={handleAddNote} disabled={!noteText.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {notes && notes.length > 0 && (
              <div className="space-y-1">
                {notes.map((note) => (
                  <div key={note.id} className="group rounded-md border border-border bg-muted/30 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="whitespace-pre-wrap break-words text-meta">{note.text}</p>
                      <button
                        onClick={() => onDeleteNote(nodeId, note.id)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="mt-1 text-micro text-muted-foreground/60">{formatDate(note.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom fields */}
          <div className="space-y-1">
            <label className="text-micro font-semibold text-muted-foreground">Custom fields ({customFields?.length ?? 0})</label>
            {customFields && customFields.length > 0 && (
              <div className="space-y-1">
                {customFields.map((field) => (
                  <div key={field.id} className="group flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                    <span className="w-20 shrink-0 text-micro font-medium text-muted-foreground">{field.label}</span>
                    <span className="flex-1 truncate text-micro text-foreground">{field.value || "—"}</span>
                    <button
                      onClick={() => onDeleteCustomField(nodeId, field.id)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="Field name"
                className="h-7 w-24 rounded-md border border-input bg-card px-2 text-micro shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <input
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
                placeholder="Value"
                className="h-7 flex-1 rounded-md border border-input bg-card px-2 text-micro shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddField(); }}
              />
              <Button size="sm" variant="outline" onClick={handleAddField} disabled={!newFieldLabel.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  KPI Strip — status + stats + alerts + deep link (linked only)
// ════════════════════════════════════════════════════════════════

function KpiStrip({ model, recordId }: { model: ModelKey; recordId: string }) {
  const [data, setData] = useState<ModuleInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const mod = MODULES[model];
  const popup = mod?.popup;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/modules/insights?model=${encodeURIComponent(model)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { if (d.error) setData(null); else setData(d); } })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [model]);

  const deepLink = popup?.deepLink ? popup.deepLink(recordId) : null;
  const alertColors = { info: "#0ea5e9", warning: "#f59e0b", danger: "#ef4444" };
  const alertIcons = { info: Info, warning: AlertCircle, danger: AlertTriangle };

  // Show top 4 stats + top 2 alerts
  const topStats = data?.stats.slice(0, 4) ?? [];
  const topAlerts = data?.alerts.slice(0, 2) ?? [];

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-meta text-muted-foreground">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-primary" /> Loading KPIs…
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b border-border bg-muted/20 px-3 py-2.5">
      {/* Deep link button */}
      {deepLink && (
        <a
          href={deepLink}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-caption font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open {mod?.label}
        </a>
      )}

      {/* Stats grid */}
      {topStats.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {topStats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-2">
              <p className="text-micro text-muted-foreground">{stat.label}</p>
              <p className="text-body font-semibold" style={stat.color ? { color: stat.color } : undefined}>
                {stat.type === "currency" && typeof stat.value === "number"
                  ? formatCurrency(stat.value)
                  : stat.type === "number" && typeof stat.value === "number"
                    ? formatNumber(stat.value)
                    : String(stat.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {topAlerts.length > 0 && (
        <div className="space-y-1">
          {topAlerts.map((alert, i) => {
            const Icon = alertIcons[alert.severity];
            const color = alertColors[alert.severity];
            return (
              <div
                key={alert.message + i}
                className="flex items-start gap-2 rounded-md border border-border p-2"
                style={{ background: `${color}08`, borderColor: `${color}30` }}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} />
                <p className="text-meta" style={{ color }}>{alert.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Action Bar — model + link-specific primary actions
// ════════════════════════════════════════════════════════════════

function ActionBar({
  model, actionDefs, workspaceId, taskCount, onAssignTaskOpen,
}: {
  model: ModelKey;
  actionDefs?: ActionDef[];
  workspaceId?: string;
  taskCount: number;
  onAssignTaskOpen: () => void;
}) {
  const { data: referenceData, refresh } = useReferenceData((actionDefs?.length ?? 0) > 0);
  const router = useRouter();

  const closeDialog = useCallback(() => {
    refresh();
    router.refresh();
  }, [refresh, router]);

  if (!actionDefs || actionDefs.length === 0) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {taskCount > 0 && (
          <a href="/tasks" className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-caption font-medium text-primary transition-colors hover:bg-primary/20">
            <CheckSquare className="h-3 w-3" /> {taskCount}
          </a>
        )}
        <Button size="sm" variant="outline" onClick={onAssignTaskOpen} className="ml-auto">
          <Send className="h-3.5 w-3.5" /> Assign Task
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
      <NodeActions
        model={model}
        referenceData={referenceData}
        onRecordCreated={closeDialog}
        actions={actionDefs}
        variant="bar"
      />
      <div className="ml-auto flex items-center gap-2">
        {taskCount > 0 && (
          <a href="/tasks" className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-caption font-medium text-primary transition-colors hover:bg-primary/20">
            <CheckSquare className="h-3 w-3" /> {taskCount}
          </a>
        )}
        <Button size="sm" variant="ghost" onClick={onAssignTaskOpen} title="Assign a task to a signed-in user">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Overview tab — Insights (unlinked) or Record detail (linked)
// ════════════════════════════════════════════════════════════════

function InsightsOverview({ model }: { model: ModelKey }) {
  const [data, setData] = useState<ModuleInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/modules/insights?model=${encodeURIComponent(model)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { if (d.error) setError(d.error); else setData(d); } })
      .catch(() => { if (!cancelled) setError("Failed to load insights"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [model]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-meta text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> Loading insights…
      </div>
    );
  }
  if (error || !data) {
    return <div className="px-3 py-6 text-center text-meta text-muted-foreground">{error ?? "No insights available."}</div>;
  }

  const alertColors = { info: "#0ea5e9", warning: "#f59e0b", danger: "#ef4444" };
  const alertIcons = { info: Info, warning: AlertCircle, danger: AlertTriangle };

  return (
    <div className="space-y-3 p-3">
      {/* Stats grid */}
      {data.stats.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {data.stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-2">
              <p className="text-micro text-muted-foreground">{stat.label}</p>
              <p className="text-body font-semibold" style={stat.color ? { color: stat.color } : undefined}>
                {stat.type === "currency" && typeof stat.value === "number"
                  ? formatCurrency(stat.value)
                  : stat.type === "number" && typeof stat.value === "number"
                    ? formatNumber(stat.value)
                    : String(stat.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-1">
          {data.alerts.map((alert, i) => {
            const Icon = alertIcons[alert.severity];
            const color = alertColors[alert.severity];
            return (
              <div
                key={alert.message + i}
                className="flex items-start gap-2 rounded-md border border-border p-2"
                style={{ background: `${color}08`, borderColor: `${color}30` }}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} />
                <p className="text-meta" style={{ color }}>{alert.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline mini chart */}
      {data.timeline && data.timeline.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-2">
          <p className="mb-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">Last 7 days</p>
          <div className="flex h-16 items-end justify-between gap-1">
            {data.timeline.map((point, i) => {
              const maxVal = Math.max(...data.timeline!.map((t) => t.value), 1);
              const height = Math.max((point.value / maxVal) * 100, 4);
              return (
                <div key={point.label ?? i} className="flex flex-1 flex-col items-center gap-0.5">
                  <div
                    className="w-full rounded-t bg-primary/30 transition-all hover:bg-primary/50"
                    style={{ height: `${height}%` }}
                    title={`${point.label}: ${formatNumber(point.value)}`}
                  />
                  <span className="text-[9px] text-muted-foreground">{point.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Related entities */}
      {data.related.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.related.map((rel) => (
            <span key={rel.label} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-muted-foreground">
              {rel.label}: <span className="text-foreground">{rel.count}</span>
            </span>
          ))}
        </div>
      )}

      {data.stats.length === 0 && data.alerts.length === 0 && data.related.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Workflow className="h-6 w-6 text-muted-foreground/40" />
          <p className="text-meta text-muted-foreground">No insights available for this module.</p>
        </div>
      )}
    </div>
  );
}

function RecordOverview({
  model, recordId, onSpawnChild, nodeId,
}: {
  model: ModelKey;
  recordId: string;
  onSpawnChild: (parentId: string, childModel: ModelKey, childRecordId: string, childLabel: string, relation: RelationDef) => void;
  nodeId: string;
}) {
  const [data, setData] = useState<RecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/modules/record?model=${encodeURIComponent(model)}&id=${encodeURIComponent(recordId)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        return json as RecordDetail;
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message ?? "Failed to load"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [model, recordId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-meta text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> Loading record…
      </div>
    );
  }
  if (error || !data) {
    return <div className="px-3 py-6 text-center text-meta text-danger">{error ?? "Record not found."}</div>;
  }

  const mod = MODULES[model];
  const color = mod ? GROUP_COLORS[mod.group] : "#6366f1";

  return (
    <div className="space-y-3 p-3">
      {/* Record identity */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          {mod && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}18`, color }}>
              <mod.icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold">{data.displayLabel}</p>
            {data.secondaryLabel && <p className="truncate text-caption text-muted-foreground">{data.secondaryLabel}</p>}
          </div>
        </div>
      </div>

      {/* Fields */}
      {data.fields.length > 0 && (
        <div className="space-y-1">
          <p className="text-caption font-semibold text-muted-foreground">Fields</p>
          <div className="divide-y divide-border/60 rounded-lg border border-border">
            {data.fields.map((field) => (
              <div key={field.label} className="flex items-center justify-between gap-2 px-2.5 py-2">
                <span className="text-caption text-muted-foreground">{field.label}</span>
                <span className="truncate text-body font-medium text-foreground">
                  {field.type === "currency" ? formatCurrency(Number(field.value)) : field.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related summary (spawn-able children) */}
      {data.related.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption font-semibold text-muted-foreground">Related ({data.related.reduce((s, g) => s + g.count, 0)})</p>
          <div className="flex flex-wrap gap-1.5">
            {data.related.map((group) => {
              const childMod = MODULES[group.relation.toModel];
              const childColor = childMod ? GROUP_COLORS[childMod.group] : "#94a3b8";
              return (
                <button
                  key={group.relation.label}
                  onClick={() => onSpawnChild(nodeId, group.relation.toModel, "", "", group.relation)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-caption font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
                  title={`Spawn ${group.relation.label} nodes on canvas`}
                >
                  {childMod && <childMod.icon className="h-3 w-3" style={{ color: childColor }} />}
                  {group.relation.label} ({group.count})
                </button>
              );
            })}
          </div>
          <p className="text-micro text-muted-foreground/70">Click a related group to spawn child nodes on the canvas, or use the Related tab for individual records.</p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Related tab — grouped children with spawn + open-page actions
// ════════════════════════════════════════════════════════════════

function RelatedTab({
  model, recordId, onSpawnChild, onJumpToNode,
}: {
  model: ModelKey;
  recordId: string;
  onSpawnChild: (parentId: string, childModel: ModelKey, childRecordId: string, childLabel: string, relation: RelationDef) => void;
  onJumpToNode: (nodeId: string) => void;
}) {
  const [data, setData] = useState<RecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/modules/record?model=${encodeURIComponent(model)}&id=${encodeURIComponent(recordId)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        return json as RecordDetail;
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message ?? "Failed to load"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [model, recordId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-meta text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> Loading related…
      </div>
    );
  }
  if (error || !data) {
    return <div className="px-3 py-6 text-center text-meta text-danger">{error ?? "Record not found."}</div>;
  }

  if (data.related.length === 0 || data.related.every((g) => g.count === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <GitBranch className="h-6 w-6 text-muted-foreground/40" />
        <p className="text-meta text-muted-foreground">No related records.</p>
        <p className="text-caption text-muted-foreground/60">This record has no children yet.</p>
      </div>
    );
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <div className="divide-y divide-border/60">
      {data.related.map((group) => {
        const childMod = MODULES[group.relation.toModel];
        const childColor = childMod ? GROUP_COLORS[childMod.group] : "#94a3b8";
        const isExpanded = expandedGroups.has(group.relation.label);
        return (
          <div key={group.relation.label} className="px-3 py-2">
            <button
              onClick={() => toggleGroup(group.relation.label)}
              className="flex w-full items-center gap-2 text-left"
            >
              {childMod && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${childColor}18`, color: childColor }}>
                  <childMod.icon className="h-3 w-3" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-foreground">{group.relation.label}</p>
                <p className="truncate text-micro text-muted-foreground">{childMod?.label ?? group.relation.toModel} · {group.count}</p>
              </div>
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {isExpanded && (
              <div className="mt-1.5 space-y-1">
                {group.children.length === 0 ? (
                  <p className="px-2 py-1.5 text-micro text-muted-foreground">No records.</p>
                ) : (
                  group.children.map((child) => (
                    <div key={child.id} className="group flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption font-medium text-foreground">{child.label}</p>
                        {child.secondary && <p className="truncate text-micro text-muted-foreground">{child.secondary}</p>}
                      </div>
                      <button
                        onClick={() => onSpawnChild("", group.relation.toModel, child.id, child.label, group.relation)}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                        title="Spawn as canvas node"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      {childMod?.popup?.deepLink && (
                        <a
                          href={childMod.popup.deepLink(child.id)}
                          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                          title="Open in management page"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Records tab — browse all records + pin one (unlinked only)
// ════════════════════════════════════════════════════════════════

function RecordsTab({
  model,
  onLinkRecord,
}: {
  model: ModelKey;
  onLinkRecord: (recordId: string, recordLabel: string) => void;
}) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const mod = MODULES[model];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/modules/records?model=${encodeURIComponent(model)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        return json as PreviewData;
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message ?? "Failed to load"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [model]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-meta text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> Loading {mod?.label} records…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <AlertCircle className="h-5 w-5 text-muted-foreground/40" />
        <p className="text-meta text-muted-foreground">{error ?? "No data available"}</p>
      </div>
    );
  }
  if (data.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Package className="h-5 w-5 text-muted-foreground/40" />
        <p className="text-meta text-muted-foreground">No {mod?.label} records exist yet.</p>
        <p className="text-caption text-muted-foreground/60">Use the action bar above to create one.</p>
      </div>
    );
  }

  const filtered = search.trim()
    ? data.rows.filter((row) =>
        data.columns.some((c) => {
          const val = getField(row, c.field);
          return val != null && String(val).toLowerCase().includes(search.toLowerCase());
        }),
      )
    : data.rows;

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${data.rows.length} ${mod?.label} records…`}
            className="h-8 pl-8 text-meta"
          />
        </div>
        <p className="mt-1.5 text-micro text-muted-foreground">Pick a record to link to this node.</p>
      </div>

      {/* Record list */}
      <div className="divide-y divide-border/60">
        {filtered.slice(0, 50).map((row, i) => {
          const label = String(getField(row, data.displayField) ?? "—");
          const secondary = data.secondaryField
            ? String(getField(row, data.secondaryField) ?? "")
            : "";
          return (
            <button
              key={String(row.id) + i}
              onClick={() => onLinkRecord(String(row.id), label)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-primary/5"
            >
              {mod && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: `${GROUP_COLORS[mod.group]}18`, color: GROUP_COLORS[mod.group] }}>
                  <mod.icon className="h-3.5 w-3.5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-foreground">{label}</p>
                {secondary && <p className="truncate text-caption text-muted-foreground">{secondary}</p>}
              </div>
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
        {filtered.length > 50 && (
          <p className="px-3 py-2 text-center text-caption text-muted-foreground">
            Showing 50 of {filtered.length} — refine your search
          </p>
        )}
        {search && filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-caption text-muted-foreground">No records match "{search}"</p>
        )}
      </div>
    </div>
  );
}

// ── Inline link picker (shown in header when link toggle clicked) ──

function LinkPickerInline({
  model,
  onLink,
  onClose,
}: {
  model: ModelKey;
  onLink: (recordId: string, recordLabel: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <button onClick={onClose} className="absolute right-2 top-2 z-10 rounded p-1 text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
      <RecordsTab model={model} onLinkRecord={onLink} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Connections tab — canvas edges (incoming + outgoing)
// ════════════════════════════════════════════════════════════════

function ConnectionsTab({
  connectedNodes,
  onJumpToNode,
}: {
  connectedNodes: ConnectedNode[];
  onJumpToNode: (nodeId: string) => void;
}) {
  if (connectedNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <GitBranch className="h-5 w-5 text-muted-foreground/40" />
        <p className="text-meta text-muted-foreground">No connections yet</p>
        <p className="text-caption text-muted-foreground/60">Drag from a node&apos;s handle to another node to create a connection.</p>
      </div>
    );
  }

  const incoming = connectedNodes.filter((c) => c.direction === "in");
  const outgoing = connectedNodes.filter((c) => c.direction === "out");

  return (
    <div className="space-y-3 p-3">
      {incoming.length > 0 && (
        <div>
          <p className="mb-1.5 text-caption font-medium text-muted-foreground">Incoming ({incoming.length})</p>
          <div className="space-y-1.5">
            {incoming.map((c) => {
              const mod = MODULES[c.model];
              const color = mod ? GROUP_COLORS[mod.group] : "#94a3b8";
              return (
                <button
                  key={c.id}
                  onClick={() => onJumpToNode(c.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  {mod && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${color}18`, color }}>
                      <mod.icon className="h-3 w-3" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-foreground">{c.label}</p>
                    <p className="truncate text-micro text-muted-foreground">{mod?.label ?? c.model} · {c.relationLabel}</p>
                  </div>
                  <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>
      )}
      {outgoing.length > 0 && (
        <div>
          <p className="mb-1.5 text-caption font-medium text-muted-foreground">Outgoing ({outgoing.length})</p>
          <div className="space-y-1.5">
            {outgoing.map((c) => {
              const mod = MODULES[c.model];
              const color = mod ? GROUP_COLORS[mod.group] : "#94a3b8";
              return (
                <button
                  key={c.id}
                  onClick={() => onJumpToNode(c.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  {mod && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${color}18`, color }}>
                      <mod.icon className="h-3 w-3" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-foreground">{c.label}</p>
                    <p className="truncate text-micro text-muted-foreground">{mod?.label ?? c.model} · {c.relationLabel}</p>
                  </div>
                  <ArrowUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Files tab — attachments + links + tags
// ════════════════════════════════════════════════════════════════

function FilesTab({
  nodeId,
  attachments,
  onUploadFiles,
  onAddLink,
  onUpdateAttachment,
  onRemoveAttachment,
  onDeleteFile,
}: {
  nodeId: string;
  attachments: Attachment[];
  onUploadFiles: (nodeId: string, files: FileList) => Promise<void>;
  onAddLink: (nodeId: string, url: string, title: string) => void;
  onUpdateAttachment: (nodeId: string, attachmentId: string, updates: Partial<Attachment>) => void;
  onRemoveAttachment: (nodeId: string, attachmentId: string) => void;
  onDeleteFile: (attachment: Attachment) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    try {
      await onUploadFiles(nodeId, e.target.files);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setUploading(true);
      try {
        await onUploadFiles(nodeId, e.dataTransfer.files);
      } finally {
        setUploading(false);
      }
    }
  };

  const submitLink = () => {
    if (!linkUrl.trim()) return;
    onAddLink(nodeId, linkUrl.trim(), linkTitle.trim());
    setLinkUrl("");
    setLinkTitle("");
    setShowLinkForm(false);
  };

  const handleRemoveAttachment = async (attachment: Attachment) => {
    await onDeleteFile(attachment);
    onRemoveAttachment(nodeId, attachment.id);
  };

  const commitTags = (attachment: Attachment) => {
    const tags = tagDraft.split(",").map((t) => t.trim()).filter(Boolean);
    onUpdateAttachment(nodeId, attachment.id, { tags });
    setEditingTags(null);
    setTagDraft("");
  };

  const commitTitle = (attachment: Attachment) => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== attachment.title) {
      onUpdateAttachment(nodeId, attachment.id, { title: trimmed });
    }
    setEditingTitle(null);
    setTitleDraft("");
  };

  return (
    <div className="space-y-3 p-3">
      {/* Upload zone */}
      <div
        className={cn(
          "rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border",
        )}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-meta text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </div>
        ) : (
          <>
            <p className="text-meta text-muted-foreground">Drag files here or</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-caption font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Paperclip className="h-3.5 w-3.5" /> Choose files
            </button>
          </>
        )}
        <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
      </div>

      {/* Add link */}
      {showLinkForm ? (
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-2.5">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className="h-8 w-full rounded-md border border-input bg-card px-2 text-meta shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-8 w-full rounded-md border border-input bg-card px-2 text-meta shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={submitLink} disabled={!linkUrl.trim()}>Add link</Button>
            <Button size="sm" variant="outline" onClick={() => setShowLinkForm(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLinkForm(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-caption font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          <Link2 className="h-3.5 w-3.5" /> Add a link
        </button>
      )}

      {/* Attachments list */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption font-semibold text-muted-foreground">Attachments ({attachments.length})</p>
          {attachments.map((att) => (
            <div key={att.id} className="group rounded-lg border border-border bg-card p-2">
              <div className="flex items-start gap-2">
                {att.type === "link" ? (
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  {editingTitle === att.id ? (
                    <input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={() => commitTitle(att)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitTitle(att); if (e.key === "Escape") setEditingTitle(null); }}
                      autoFocus
                      className="w-full rounded border border-primary bg-card px-1.5 py-0.5 text-meta shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingTitle(att.id); setTitleDraft(att.title ?? ""); }}
                      className="block w-full truncate text-left text-body font-medium text-foreground hover:text-primary"
                      title="Click to edit title"
                    >
                      {att.title || att.url.split("/").pop() || "Untitled"}
                    </button>
                  )}
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-micro text-muted-foreground hover:text-primary"
                  >
                    {att.url}
                  </a>
                </div>
                <button
                  onClick={() => handleRemoveAttachment(att)}
                  className="shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Tags */}
              {editingTags === att.id ? (
                <div className="mt-1.5 flex items-center gap-1">
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onBlur={() => commitTags(att)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitTags(att); if (e.key === "Escape") setEditingTags(null); }}
                    placeholder="tag1, tag2, tag3"
                    autoFocus
                    className="flex-1 rounded border border-primary bg-card px-1.5 py-0.5 text-micro shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button onClick={() => commitTags(att)} className="text-micro text-primary hover:underline">Save</button>
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {att.tags?.map((t) => (
                    <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-micro font-medium text-primary">
                      {t}
                    </span>
                  ))}
                  <button
                    onClick={() => { setEditingTags(att.id); setTagDraft(att.tags?.join(", ") ?? ""); }}
                    className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-1.5 py-0.5 text-micro text-muted-foreground hover:border-primary/40 hover:text-primary"
                  >
                    <Plus className="h-2 w-2" />{att.tags?.length ? "edit tags" : "add tags"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {attachments.length === 0 && !uploading && (
        <p className="text-center text-caption text-muted-foreground">No attachments yet.</p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Activity tab — recent audit/movement history for a linked record
// ════════════════════════════════════════════════════════════════

function ActivityTab({ model, recordId }: { model: ModelKey; recordId: string }) {
  const [entries, setEntries] = useState<{ action: string; entityType: string; timestamp: string; summary?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Fetch audit logs filtered by this entity
    fetch(`/api/audit-logs?entityId=${encodeURIComponent(recordId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((logs: { action: string; entityType: string; timestamp: string; summary?: string }[]) => {
        if (!cancelled) setEntries(Array.isArray(logs) ? logs.slice(0, 20) : []);
      })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recordId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-meta text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> Loading activity…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Clock className="h-6 w-6 text-muted-foreground/40" />
        <p className="text-meta text-muted-foreground">No activity recorded.</p>
        <p className="text-caption text-muted-foreground/60">Changes to this {MODULES[model]?.label ?? "record"} will appear here.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <Clock className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-caption font-medium text-foreground">{entry.action}</p>
            {entry.summary && <p className="truncate text-micro text-muted-foreground">{entry.summary}</p>}
            <p className="text-micro text-muted-foreground/60">{formatDate(entry.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
