"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  ChevronRight, Pencil, Workflow, Loader2,
  CornerLeftUp, FileX, Search as SearchIcon,
  Paperclip,
  Tag, ExternalLink, Download, FileText, Image as ImageIcon,
  FileSpreadsheet, File, Link2, Layers,
  Calendar, Flag, StickyNote, MessageSquare,
} from "lucide-react";

import { MODULES, NODE_KINDS, PRIORITIES, type Attachment, type ModelKey, type NodeKind, type WorkspaceGraph } from "@/lib/modules/registry";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { getField } from "@/lib/modules/resolver";

// ── Types ────────────────────────────────────────────────────

interface PathEntry {
  fromNode: string;
  recordId: string;
  label: string;
  toNode: string;
}

interface ChildNode {
  nodeId: string;
  model: string;
  label: string;
  moduleLabel: string;
}

interface Column {
  field: string;
  label: string;
  type?: "text" | "currency" | "number" | "date" | "badge";
}

interface DrillResponse {
  currentModel: ModelKey;
  moduleLabel: string;
  displayField: string;
  secondaryField: string | null;
  columns: Column[];
  rows: Record<string, unknown>[];
  childNodes: ChildNode[];
  depth: number;
}

// ── Helpers ──────────────────────────────────────────────────

function cellLabel(value: unknown, type?: Column["type"]): string {
  if (value == null || value === "") return "—";
  if (type === "currency") return formatCurrency(Number(value));
  if (type === "number") return formatNumber(Number(value));
  if (type === "date") return formatDate(value as string);
  return String(value);
}

/** Pick the right icon for a file based on its MIME type. */
function fileIcon(mimeType?: string) {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return FileSpreadsheet;
  if (mimeType === "application/pdf" || mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("word") || mimeType.includes("document")) return FileText;
  return File;
}

/** Format file size in human-readable form. */
function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Build the full tree structure from the graph for the sidebar. */
interface TreeNode {
  nodeId: string;
  model: string;
  label: string;
  kind?: NodeKind;
  assigneeId?: string | null;
  attachments?: Attachment[];
  children: TreeNode[];
}

function buildTree(graph: WorkspaceGraph): TreeNode | null {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, { nodeId: string; edge: typeof graph.edges[0] }[]>();
  graph.nodes.forEach((n) => childrenMap.set(n.id, []));
  graph.edges.forEach((e) => {
    const arr = childrenMap.get(e.from);
    if (arr) arr.push({ nodeId: e.to, edge: e });
  });

  function build(nodeId: string): TreeNode {
    const node = nodeMap.get(nodeId);
    const mod = node ? MODULES[node.model as ModelKey] : null;
    const kids = childrenMap.get(nodeId) ?? [];
    return {
      nodeId,
      model: node?.model ?? "",
      label: mod?.label ?? nodeId,
      kind: node?.kind,
      assigneeId: node?.assigneeId,
      attachments: node?.attachments,
      children: kids.map((k) => build(k.nodeId)),
    };
  }

  return build(graph.rootId);
}

// ── Tree sidebar item ────────────────────────────────────────

function TreeItem({
  node,
  currentNodeId,
  pathNodeIds,
  onSelect,
  depth,
  employeeMap,
}: {
  node: TreeNode;
  currentNodeId: string;
  pathNodeIds: Set<string>;
  onSelect: (nodeId: string) => void;
  depth: number;
  employeeMap: Map<string, string>;
}) {
  const isActive = node.nodeId === currentNodeId;
  const isInPath = pathNodeIds.has(node.nodeId);
  const mod = MODULES[node.model as ModelKey];
  const Icon = mod?.icon ?? Workflow;
  const hasChildren = node.children.length > 0;
  const kindDef = node.kind ? NODE_KINDS[node.kind] : null;
  const assigneeName = node.assigneeId ? employeeMap.get(node.assigneeId) : null;

  return (
    <div>
      <button
        onClick={() => onSelect(node.nodeId)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-caption transition-colors",
          isActive
            ? "bg-primary/10 font-medium text-primary"
            : isInPath
              ? "text-foreground hover:bg-accent"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{node.label}</span>
        {kindDef && (
          <span
            className="shrink-0"
            style={{ color: kindDef.color }}
            title={kindDef.label}
          >
            <kindDef.icon className="h-3 w-3" />
          </span>
        )}
        {assigneeName && (
          <span
            className="shrink-0 rounded-full bg-primary/15 px-1.5 text-micro font-medium text-primary"
            title={`Assigned to ${assigneeName}`}
          >
            {assigneeName.charAt(0).toUpperCase()}
          </span>
        )}
        {node.attachments && node.attachments.length > 0 && (
          <span
            className="shrink-0 inline-flex items-center gap-0.5 text-micro text-muted-foreground/70"
            title={`${node.attachments.length} attachment${node.attachments.length !== 1 ? "s" : ""}`}
          >
            <Paperclip className="h-2.5 w-2.5" />
            {node.attachments.length}
          </span>
        )}
        {hasChildren && (
          <span className="ml-auto text-micro text-muted-foreground/50">{node.children.length}</span>
        )}
      </button>
      {hasChildren && (isInPath || isActive) && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.nodeId}
              node={child}
              currentNodeId={currentNodeId}
              pathNodeIds={pathNodeIds}
              onSelect={onSelect}
              depth={depth + 1}
              employeeMap={employeeMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main explorer ────────────────────────────────────────────

export function WorkspaceExplorer({
  workspaceId,
  name,
  description,
  graph,
}: {
  workspaceId: string;
  name: string;
  description?: string | null;
  graph: WorkspaceGraph;
}) {
  const [path, setPath] = useState<PathEntry[]>([]);
  const [data, setData] = useState<DrillResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [employeeMap, setEmployeeMap] = useState<Map<string, string>>(new Map());
  const [treeOpen, setTreeOpen] = useState(false);

  // Fetch employees once for assignee name display in the tree
  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((emps: { id: string; name: string }[]) => {
        if (Array.isArray(emps)) setEmployeeMap(new Map(emps.map((e) => [e.id, e.name])));
      })
      .catch(() => { /* ignore */ });
  }, []);

  const currentNodeId = path.length ? path[path.length - 1]!.toNode : graph.rootId;
  const rootNode = graph.nodes.find((n) => n.id === graph.rootId);
  const rootModule = rootNode ? MODULES[rootNode.model as ModelKey] : null;
  const tree = useMemo(() => buildTree(graph), [graph]);

  // Current node's attachments (for the attachment panel below the table)
  const currentNode = graph.nodes.find((n) => n.id === currentNodeId);
  const currentAttachments = currentNode?.attachments ?? [];
  const currentKind = currentNode?.kind ? NODE_KINDS[currentNode.kind] : null;
  const currentAssignee = currentNode?.assigneeId ? employeeMap.get(currentNode.assigneeId) : null;
  const currentDueDate = currentNode?.dueDate ?? null;
  const currentPriority = currentNode?.priority ? PRIORITIES[currentNode.priority] : null;
  const currentNotes = currentNode?.notes ?? [];
  const currentCustomFields = currentNode?.customFields ?? [];

  // Set of node ids in the current path (for tree highlighting)
  const pathNodeIds = useMemo(() => {
    const set = new Set<string>();
    set.add(graph.rootId);
    path.forEach((p) => set.add(p.toNode));
    return set;
  }, [path, graph.rootId]);

  const pathParam = useMemo(
    () => path.map((p) => `${p.fromNode}:${p.recordId}`).join(","),
    [path],
  );

  const goUp = useCallback(() => {
    setPath((p) => p.slice(0, -1));
  }, []);

  // Keyboard: Escape goes up one level
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && path.length > 0) goUp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path.length, goUp]);

  // Fetch current level data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/workspaces/${workspaceId}/drill?current=${encodeURIComponent(currentNodeId)}&path=${encodeURIComponent(pathParam)}`;
    fetch(url)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        return json as DrillResponse;
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message ?? "Failed to load"); setLoading(false); } });
    return () => { cancelled = true; };
  }, [workspaceId, currentNodeId, pathParam]);

  const drill = (row: Record<string, unknown>, child: ChildNode) => {
    const label = String(getField(row, data?.displayField ?? "id") ?? row.id);
    setPath((p) => [...p, { fromNode: currentNodeId, recordId: String(row.id), label, toNode: child.nodeId }]);
  };

  const truncate = (len: number) => setPath((p) => p.slice(0, len));

  // Navigate to a node in the tree (only if it's on the current path or is root)
  const navigateToNode = (nodeId: string) => {
    if (nodeId === graph.rootId) { setPath([]); return; }
    // find where this node is in the path
    const idx = path.findIndex((p) => p.toNode === nodeId);
    if (idx >= 0) truncate(idx + 1);
  };

  // Build breadcrumb
  const crumbs: { label: string; muted?: boolean; onClick?: () => void }[] = [];
  if (rootModule) crumbs.push({ label: rootModule.label, onClick: () => setPath([]) });
  path.forEach((p, i) => {
    const toMod = MODULES[graph.nodes.find((n) => n.id === p.toNode)?.model as ModelKey];
    crumbs.push({ label: toMod?.label ?? "…", muted: true });
    crumbs.push({ label: p.label, onClick: () => truncate(i + 1) });
  });

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!data || !search) return data?.rows ?? [];
    const q = search.toLowerCase();
    return data.rows.filter((row) =>
      data.columns.some((c) => {
        const val = getField(row, c.field);
        return val != null && String(val).toLowerCase().includes(q);
      }),
    );
  }, [data, search]);

  return (
    <div className="flex gap-4">
      {/* Hierarchy tree sidebar */}
      {tree && (
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-16 rounded-lg border border-border bg-card p-2">
            <p className="px-2 pb-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
              Hierarchy
            </p>
            <div className="space-y-0.5">
              <TreeItem
                node={tree}
                currentNodeId={currentNodeId}
                pathNodeIds={pathNodeIds}
                onSelect={navigateToNode}
                depth={0}
                employeeMap={employeeMap}
              />
            </div>
          </div>
        </aside>
      )}

      {/* Main content */}
      <div className="flex-1 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Workflow className="h-[18px] w-[18px]" />
              </span>
              <h1 className="text-title font-semibold tracking-tight">{name}</h1>
            </div>
            {description && <p className="mt-1 text-meta text-muted-foreground">{description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {path.length > 0 && (
              <Button variant="outline" size="sm" onClick={goUp} title="Go up (Esc)">
                <CornerLeftUp /> Back
              </Button>
            )}
            {tree && (
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setTreeOpen(true)}>
                <Layers /> Tree
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/playground/${workspaceId}`}>
                <Pencil /> Edit graph
              </Link>
            </Button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-meta">
          {crumbs.length === 0 && <span className="text-muted-foreground">{rootModule?.label ?? "Root"}</span>}
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
              {c.onClick ? (
                <button
                  className="rounded px-1 font-medium text-foreground transition-colors hover:bg-accent hover:text-primary"
                  onClick={c.onClick}
                >
                  {c.label}
                </button>
              ) : (
                <span className={cn(c.muted ? "text-muted-foreground" : "font-medium text-foreground")}>{c.label}</span>
              )}
            </span>
          ))}
        </div>

        {/* Level table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <CardTitle>{data?.moduleLabel ?? "…"}</CardTitle>
              {data && <Badge variant="muted">{data.rows.length} records</Badge>}
            </div>
            {data && data.rows.length > 5 && (
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter…"
                  className="h-8 w-40 rounded-md border border-input bg-card pl-8 pr-2 text-caption shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-meta text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : error ? (
              <EmptyState icon={<FileX className="h-5 w-5" />} title="Couldn't load this level" description={error} />
            ) : !data || data.rows.length === 0 ? (
              <EmptyState
                icon={<Workflow className="h-5 w-5" />}
                title="No records here"
                description="This branch has no records at this level yet."
              />
            ) : filteredRows.length === 0 ? (
              <EmptyState
                icon={<SearchIcon className="h-5 w-5" />}
                title="No matches"
                description={`Nothing matches "${search}" at this level.`}
              />
            ) : (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    {data.columns.map((c) => (
                      <TH key={c.field}>{c.label}</TH>
                    ))}
                    {data.childNodes.length > 0 && <TH className="text-right">Drill into</TH>}
                  </TR>
                </THead>
                <TBody>
                  {filteredRows.map((row) => (
                    <TR
                      key={String(row.id)}
                      className={cn(
                        data.childNodes.length > 0 && "cursor-pointer",
                      )}
                      onClick={() => {
                        // Click anywhere on the row drills into the first child
                        if (data.childNodes.length > 0) drill(row, data.childNodes[0]!);
                      }}
                    >
                      {data.columns.map((c, i) => {
                        const value = getField(row, c.field);
                        if (i === 0) {
                          return (
                            <TD key={c.field}>
                              <span className="font-medium text-foreground">{cellLabel(value, c.type)}</span>
                              {data.secondaryField && data.secondaryField !== c.field && (
                                <div className="text-caption text-muted-foreground">
                                  {cellLabel(getField(row, data.secondaryField))}
                                </div>
                              )}
                            </TD>
                          );
                        }
                        if (c.type === "badge") {
                          return (
                            <TD key={c.field}>
                              <Badge variant="outline">{cellLabel(value, c.type)}</Badge>
                            </TD>
                          );
                        }
                        return <TD key={c.field}>{cellLabel(value, c.type)}</TD>;
                      })}
                      {data.childNodes.length > 0 && (
                        <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap justify-end gap-1">
                            {data.childNodes.map((child) => (
                              <button
                                key={child.nodeId}
                                onClick={(e) => { e.stopPropagation(); drill(row, child); }}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-caption font-medium transition-colors hover:border-primary hover:bg-accent hover:text-primary"
                                title={`Drill into ${child.moduleLabel}`}
                              >
                                {child.moduleLabel}
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {data && data.childNodes.length === 0 && !loading && (
          <p className="text-center text-meta text-muted-foreground">
            This is a leaf module — the end of this branch.
          </p>
        )}

        {path.length > 0 && (
          <p className="text-center text-caption text-muted-foreground/60">
            Press <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-micro">Esc</kbd> or click Back to go up.
          </p>
        )}

        {/* Attachment panel for the current node */}
        {(currentAttachments.length > 0 || currentKind || currentAssignee || currentDueDate || currentPriority || currentNotes.length > 0 || currentCustomFields.length > 0) && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  Node details
                </CardTitle>
                {currentAttachments.length > 0 && (
                  <Badge variant="muted">{currentAttachments.length} attachment{currentAttachments.length !== 1 ? "s" : ""}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Kind + assignee + due date + priority badges */}
              {(currentKind || currentAssignee || currentDueDate || currentPriority) && (
                <div className="flex flex-wrap items-center gap-2">
                  {currentKind && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium"
                      style={{ background: `${currentKind.color}18`, color: currentKind.color }}
                    >
                      <currentKind.icon className="h-3 w-3" /> {currentKind.label}
                    </span>
                  )}
                  {currentAssignee && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-medium text-primary">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px]">
                        {currentAssignee.charAt(0).toUpperCase()}
                      </span>
                      {currentAssignee}
                    </span>
                  )}
                  {currentDueDate && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                      <Calendar className="h-3 w-3" /> Due: {formatDate(currentDueDate)}
                    </span>
                  )}
                  {currentPriority && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium text-white"
                      style={{ background: currentPriority.color }}
                    >
                      <Flag className="h-3 w-3" /> {currentPriority.label}
                    </span>
                  )}
                </div>
              )}

              {/* Notes */}
              {currentNotes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
                    <StickyNote className="h-3.5 w-3.5" /> Notes ({currentNotes.length})
                  </p>
                  {currentNotes.map((note) => (
                    <div key={note.id} className="rounded-md border border-border bg-muted/30 p-2">
                      <p className="text-meta whitespace-pre-wrap break-words">{note.text}</p>
                      <p className="mt-1 text-micro text-muted-foreground/60">{formatDate(note.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Custom fields */}
              {currentCustomFields.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" /> Custom fields
                  </p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {currentCustomFields.map((field) => (
                      <div key={field.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                        <span className="w-24 shrink-0 text-micro font-medium text-muted-foreground">{field.label}</span>
                        <span className="flex-1 truncate text-micro text-foreground">{field.value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachment list */}
              {currentAttachments.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {currentAttachments.map((att) => {
                    const Icon = att.type === "link" ? Link2 : fileIcon(att.mimeType);
                    const isImage = att.mimeType?.startsWith("image/");
                    return (
                      <div key={att.id} className="flex items-start gap-2.5 rounded-lg border border-border p-2.5">
                        {isImage ? (
                          <a href={att.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={att.url} alt={att.title} className="h-12 w-12 rounded-md border border-border object-cover" />
                          </a>
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                            <Icon className="h-5 w-5" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-body font-medium">{att.title}</p>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {att.type === "file" && (
                                <a href={att.url} download={att.fileName} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Download">
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              )}
                              {att.type === "link" && (
                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Open link">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                          <p className="truncate text-micro text-muted-foreground">
                            {att.type === "link" ? att.url : `${att.fileName ?? att.title} · ${formatSize(att.size)}`}
                          </p>
                          {att.tags && att.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {att.tags.map((t) => (
                                <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-micro font-medium text-primary">
                                  <Tag className="h-2 w-2" />{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile hierarchy tree drawer */}
      <Dialog open={treeOpen} onOpenChange={setTreeOpen} title="Hierarchy" description="Navigate the workspace tree.">
        <div className="max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
          {tree && (
            <TreeItem
              node={tree}
              currentNodeId={currentNodeId}
              pathNodeIds={pathNodeIds}
              onSelect={(id) => { navigateToNode(id); setTreeOpen(false); }}
              depth={0}
              employeeMap={employeeMap}
            />
          )}
        </div>
      </Dialog>
    </div>
  );
}
