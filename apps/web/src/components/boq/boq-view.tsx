"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, Folder, FileText } from "lucide-react";

export type BoqNode = {
  id: string;
  parentId: string | null;
  serialNo: string;
  description: string;
  type: "SECTION" | "SUBSECTION" | "LINE_ITEM";
  unit: string | null;
  estimatedQty: number | null;
  rate: number | null;
  estimatedAmount: number | null;
  materialId: string | null;
  material?: { code: string; name: string; unit: string } | null;
  notes: string | null;
  sortOrder: number;
  children: BoqNode[];
  _count?: { mbEntries: number; wbsNodes: number };
};

type Material = { id: string; code: string; name: string; unit: string };

export function BoqView({
  projectId,
  tree,
  totalEstimatedAmount,
  materials,
  canEdit,
  onChanged,
}: {
  projectId: string;
  tree: BoqNode[];
  totalEstimatedAmount: number;
  materials: Material[];
  canEdit: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BoqNode | null>(null);
  const [parentNode, setParentNode] = useState<BoqNode | null>(null);

  // Flat lookup for finding parent nodes by id
  const nodeMap = useMemo(() => {
    const map = new Map<string, BoqNode>();
    function collect(nodes: BoqNode[]) {
      for (const n of nodes) {
        map.set(n.id, n);
        collect(n.children);
      }
    }
    collect(tree);
    return map;
  }, [tree]);

  // After tree refetch, sync editingItem + parentNode with fresh data
  useEffect(() => {
    if (editingItem) {
      const fresh = nodeMap.get(editingItem.id);
      if (fresh && fresh !== editingItem) {
        setEditingItem(fresh);
        setParentNode(fresh.parentId ? nodeMap.get(fresh.parentId) ?? null : null);
      }
    }
  }, [nodeMap, editingItem]);

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
    function collect(nodes: BoqNode[]) {
      for (const n of nodes) {
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

  function onAdd(parent: BoqNode | null) {
    setEditingItem(null);
    setParentNode(parent);
    setDialogOpen(true);
  }

  function onEdit(item: BoqNode) {
    setEditingItem(item);
    setParentNode(item.parentId ? nodeMap.get(item.parentId) ?? null : null);
    setDialogOpen(true);
  }

  async function onDelete(item: BoqNode) {
    const ok = await confirm({
      title: `Delete "${item.description}"?`,
      description: "This will also delete all child items.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/boq/items/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("BOQ item deleted");
      if (onChanged) onChanged();
      else router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>Expand all</Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse all</Button>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => onAdd(null)}>
            <Plus className="mr-1 h-4 w-4" /> Add Section
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          <div>Description</div>
          <div>Unit</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Rate</div>
          <div className="text-right">Amount</div>
          <div className="w-20"></div>
        </div>
        <BoqTree
          nodes={tree}
          expanded={expanded}
          toggle={toggle}
          canEdit={canEdit}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
          depth={0}
        />
        <div className="border-t border-border bg-muted/30 px-3 py-2 text-sm font-semibold">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2">
            <div>Total Estimated Cost</div>
            <div></div>
            <div></div>
            <div></div>
            <div className="text-right">{formatCurrency(totalEstimatedAmount)}</div>
            <div className="w-20"></div>
          </div>
        </div>
      </div>

      <BoqFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        materials={materials}
        item={editingItem}
        parentNode={parentNode}
        tree={tree}
        onSaved={onChanged}
      />
      {confirmDialog}
    </div>
  );
}

function BoqTree({
  nodes,
  expanded,
  toggle,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
  depth,
}: {
  nodes: BoqNode[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  canEdit: boolean;
  onAdd: (parent: BoqNode | null) => void;
  onEdit: (item: BoqNode) => void;
  onDelete: (item: BoqNode) => void;
  depth: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isExpanded = expanded.has(node.id);
        const hasChildren = node.children.length > 0;
        const isLeaf = node.type === "LINE_ITEM";
        return (
          <div key={node.id}>
            <div
              className={cn(
                "grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 border-b border-border/50 px-3 py-1.5 text-sm hover:bg-muted/30",
                !isLeaf && "font-medium",
              )}
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
                {isLeaf ? (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
                <span className="text-muted-foreground text-xs">{node.serialNo}</span>
                <div className="min-w-0 flex-1">
                  <span className="truncate">{node.description}</span>
                  {node.notes && (
                    <p className="truncate text-micro text-muted-foreground/70">{node.notes}</p>
                  )}
                </div>
                {node._count?.mbEntries ? (
                  <Badge variant="muted" className="shrink-0 text-xs">{node._count.mbEntries} MB</Badge>
                ) : null}
              </div>
              <div className="text-muted-foreground text-xs self-center">{node.unit ?? ""}</div>
              <div className="text-right self-center">{node.estimatedQty != null ? formatNumber(node.estimatedQty, 3) : ""}</div>
              <div className="text-right self-center">{node.rate != null ? formatCurrency(node.rate) : ""}</div>
              <div className="text-right self-center font-medium">{node.estimatedAmount != null ? formatCurrency(node.estimatedAmount) : ""}</div>
              <div className="flex items-center gap-1 w-20">
                {canEdit && (
                  <>
                    {!isLeaf && (
                      <button onClick={() => onAdd(node)} className="text-muted-foreground hover:text-primary" title="Add child">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
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
              <BoqTree
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

export function BoqFormDialog({
  open,
  onOpenChange,
  projectId,
  materials,
  item,
  parentNode,
  tree,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  materials: Material[];
  item: BoqNode | null;
  parentNode: BoqNode | null;
  tree: BoqNode[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEdit = item != null;
  const parentId = parentNode?.id ?? null;

  // ── Smart serial number generator ──
  // Parses the full tree to find the next available serial at the target level.
  // Top-level: looks at all root nodes, parses their serial as int, suggests max+1
  // Under a parent: looks at the parent's children, parses the last segment, suggests max+1
  function computeNextSerial(parent: BoqNode | null, fullTree: BoqNode[]): string {
    if (parent) {
      // Children of this parent — parse the last segment after parent's serial prefix
      const siblings = parent.children;
      const prefix = parent.serialNo + ".";
      let max = 0;
      for (const s of siblings) {
        if (s.serialNo.startsWith(prefix)) {
          const lastSeg = s.serialNo.slice(prefix.length);
          const n = parseInt(lastSeg, 10);
          if (!isNaN(n) && n > max) max = n;
        }
      }
      return `${parent.serialNo}.${max + 1}`;
    } else {
      // Top-level — parse root serials as integers
      let max = 0;
      for (const n of fullTree) {
        const parsed = parseInt(n.serialNo, 10);
        if (!isNaN(parsed) && parsed > max) max = parsed;
      }
      return String(max + 1);
    }
  }

  // Determine allowed types based on parent depth
  // No parent → SECTION only (top-level)
  // Parent is SECTION → SUBSECTION or LINE_ITEM
  // Parent is SUBSECTION → LINE_ITEM only
  const parentDepth = parentNode
    ? (parentNode.serialNo.match(/\./g)?.length ?? 0)
    : -1;
  const allowedTypes: BoqNode["type"][] =
    parentDepth < 0 ? ["SECTION"] :
    parentDepth === 0 ? ["SUBSECTION", "LINE_ITEM"] :
    ["LINE_ITEM"];

  const defaultType = allowedTypes[0];
  const nextSerial = isEdit ? (item?.serialNo ?? "") : computeNextSerial(parentNode, tree);
  const [form, setForm] = useState({
    serialNo: item?.serialNo ?? nextSerial,
    description: item?.description ?? "",
    type: item?.type ?? defaultType,
    materialId: item?.materialId ?? "",
    unit: item?.unit ?? "",
    estimatedQty: item?.estimatedQty?.toString() ?? "",
    rate: item?.rate?.toString() ?? "",
    notes: item?.notes ?? "",
  });

  // Reset form when dialog reopens with different item/parent
  useEffect(() => {
    if (open) {
      const s = isEdit ? (item?.serialNo ?? "") : computeNextSerial(parentNode, tree);
      setForm({
        serialNo: s,
        description: item?.description ?? "",
        type: item?.type ?? defaultType,
        materialId: item?.materialId ?? "",
        unit: item?.unit ?? "",
        estimatedQty: item?.estimatedQty?.toString() ?? "",
        rate: item?.rate?.toString() ?? "",
        notes: item?.notes ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, parentNode, tree, defaultType]);

  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.serialNo.trim() || !form.description.trim()) {
      toast.error("Serial number and description are required");
      return;
    }
    if (form.type === "LINE_ITEM" && (!form.unit || !form.estimatedQty || !form.rate)) {
      toast.error("Line items require unit, quantity, and rate");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        projectId,
        serialNo: form.serialNo.trim(),
        description: form.description.trim(),
        type: form.type,
        notes: form.notes || null,
      };
      if (parentId) payload.parentId = parentId;
      if (form.type === "LINE_ITEM") {
        payload.unit = form.unit;
        payload.estimatedQty = parseFloat(form.estimatedQty);
        payload.rate = parseFloat(form.rate);
        payload.materialId = form.materialId || null;
      }
      const res = await fetch(
        isEdit ? `/api/boq/items/${item!.id}` : "/api/boq/items",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success(isEdit ? "BOQ item updated" : "BOQ item created");
      onOpenChange(false);
      if (onSaved) onSaved();
      else router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // Context label for the dialog
  const contextLabel = parentNode
    ? `Under: ${parentNode.serialNo} — ${parentNode.description}`
    : "Top-level section";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit BOQ Item" : "New BOQ Item"}
      description={isEdit ? "Update the BOQ item details." : contextLabel}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Serial No." required>
            <Input value={form.serialNo} onChange={(e) => set("serialNo", e.target.value)} placeholder="1.1.1" required />
          </Field>
          <Field label="Type" required>
            <Select
              value={form.type}
              onChange={(e) => set("type", e.target.value as typeof form.type)}
              disabled={allowedTypes.length === 1}
            >
              {allowedTypes.map((t) => (
                <option key={t} value={t}>
                  {t === "SECTION" ? "Section" : t === "SUBSECTION" ? "Subsection" : "Line Item"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description" required>
          <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Excavation for foundation" required />
        </Field>
        {form.type === "LINE_ITEM" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Material (optional)">
              <Select value={form.materialId} onChange={(e) => set("materialId", e.target.value)}>
                <option value="">— No material link —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Unit" required>
              <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="CUM, SQM, NOS, KG" required />
            </Field>
            <Field label="Estimated Qty" required>
              <Input type="number" step="0.001" value={form.estimatedQty} onChange={(e) => set("estimatedQty", e.target.value)} placeholder="0.000" required />
            </Field>
            <Field label="Rate (₹)" required>
              <Input type="number" step="0.01" value={form.rate} onChange={(e) => set("rate", e.target.value)} placeholder="0.00" required />
            </Field>
          </div>
        )}
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Optional notes" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
