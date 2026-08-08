"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { formatCurrency, formatNumber } from "@/lib/utils";

type ProjectOption = { id: string; name: string };
type PhaseOption = { id: string; name: string; projectId: string };
type MaterialOption = { id: string; code: string; name: string; unit: string };
type SupplierOption = { id: string; name: string };

type Line = {
  key: string;
  materialId: string;
  qtyRequested: string;
  notes: string;
  preferredSupplierId: string;
  // Fetched stock context (demand-slip enrichment)
  stockLoading: boolean;
  currentStock: number | null;
  stockUnit: string | null;
};

let lineKey = 0;
function newLine(): Line {
  return { key: `l${++lineKey}`, materialId: "", qtyRequested: "", notes: "", preferredSupplierId: "", stockLoading: false, currentStock: null, stockUnit: null };
}

export function RequisitionFormDialog({
  open,
  onOpenChange,
  projects,
  phases,
  materials,
  suppliers = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  phases: PhaseOption[];
  materials: MaterialOption[];
  suppliers?: SupplierOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [neededByDate, setNeededByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const filteredPhases = projectId ? phases.filter((p) => p.projectId === projectId) : [];

  const materialOptions = useMemo(
    () => materials.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })),
    [materials],
  );
  const supplierOptions = useMemo(
    () => [{ value: "", label: "No preferred supplier" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))],
    [suppliers],
  );

  const reqColumns: EditableColumn<Line>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: materialOptions,
      placeholder: "Select…",
      width: "1fr",
    },
    {
      key: "currentStock",
      label: "In Stock",
      type: "readonly",
      align: "right",
      width: "90px",
      format: (v) => {
        const n = Number(v);
        if (n > 0) return formatNumber(n, 3);
        if (n === 0) return "0";
        return "—";
      },
    },
    {
      key: "qtyRequested",
      label: "Qty Requested",
      type: "number",
      align: "right",
      step: "0.001",
      min: 0,
      placeholder: "0",
      width: "110px",
      format: (v) => v ? formatNumber(Number(v), 3) : "",
    },
    {
      key: "preferredSupplierId",
      label: "Preferred Supplier",
      type: "select",
      options: supplierOptions,
      width: "160px",
    },
  ], [materialOptions, supplierOptions]);

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, newLine()]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  // Handle EditableGrid changes — sync stock context when material changes
  function handleLinesChange(newLines: Line[]) {
    for (const nl of newLines) {
      const old = lines.find((l) => l.key === nl.key);
      if (old && old.materialId !== nl.materialId && nl.materialId) {
        fetchStockContext(nl.key, nl.materialId);
      }
    }
    setLines(newLines);
  }

  // Fetch stock context when a material is selected on a line
  async function fetchStockContext(key: string, materialId: string) {
    if (!materialId) {
      updateLine(key, { currentStock: null, stockUnit: null, stockLoading: false });
      return;
    }
    updateLine(key, { stockLoading: true });
    try {
      const res = await fetch(`/api/stock/available?materialId=${materialId}`);
      if (res.ok) {
        const data = await res.json();
        const mat = materials.find((m) => m.id === materialId);
        updateLine(key, {
          currentStock: data.totalQty ?? 0,
          stockUnit: mat?.unit ?? null,
          stockLoading: false,
        });
      } else {
        updateLine(key, { stockLoading: false });
      }
    } catch {
      updateLine(key, { stockLoading: false });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return toast.error("Select a project");
    const validLines = lines.filter((l) => l.materialId && Number(l.qtyRequested) > 0);
    if (validLines.length === 0) return toast.error("Add at least one line item with a material and quantity");

    setSaving(true);
    try {
      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          phaseId: phaseId || null,
          neededByDate: neededByDate || null,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qtyRequested: Number(l.qtyRequested),
            notes: l.notes.trim() || null,
            preferredSupplierId: l.preferredSupplierId || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create indent");
      const reqId = data.id ?? "";
      toast.success(`Indent ${data.reqNumber} created`, {
        description: "Submit it for approval when you're ready to order.",
        action: {
          label: "Submit for Approval",
          onClick: async () => {
            try {
              const r = await fetch(`/api/requisitions/${reqId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "submit" }),
              });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error ?? "Submit failed");
              toast.success("Indent submitted", {
                description: "It's now in the approval queue.",
                action: { label: "View Queue", onClick: () => router.push("/approvals") },
              });
              router.refresh();
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Submit failed");
            }
          },
        },
      });
      onOpenChange(false);
      // Reset form
      setProjectId(""); setPhaseId(""); setNeededByDate(""); setNotes("");
      setLines([newLine()]);
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
      title="New Material Indent (Demand Slip)"
      description="Request materials for a project site. The approver sees current stock and last purchase rate to decide."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Header fields */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setPhaseId(""); }}
              required
            >
              <option value="" disabled>Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phase</Label>
            <Select
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              disabled={filteredPhases.length === 0}
            >
              <option value="">None</option>
              {filteredPhases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Needed By Date</Label>
            <Input type="date" value={neededByDate} onChange={(e) => setNeededByDate(e.target.value)} />
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line Items</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
          <div className="space-y-2">
            <div className="rounded-lg border border-border overflow-hidden">
              <EditableGrid
                rows={lines}
                onChange={handleLinesChange}
                columns={reqColumns}
                getRowId={(r) => r.key}
                sumColumns={["qtyRequested"]}
                className="max-h-[40vh]"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="r-notes">Notes</Label>
          <Textarea
            id="r-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create Indent"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
