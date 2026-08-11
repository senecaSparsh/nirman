"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Hammer, Loader2, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { formatDate, formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

type LocationOption = { id: string; name: string; type: string };
type MaterialOption = { id: string; code: string; name: string; unit: string; isScrap: boolean };
type ProjectOption = { id: string; name: string };

type ScrapLine = {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  qty: number;
  unitCost: number;
  lineTotal: number;
};

type ScrapRow = {
  id: string;
  scrapNumber: string;
  toLocationName: string;
  projectName: string | null;
  sourceMaterialName: string | null;
  createdByName: string | null;
  notes: string | null;
  generationDate: string;
  lineCount: number;
  totalValue: number;
  lines: ScrapLine[];
};

const scrapColumns: Column<ScrapRow>[] = [
  {
    key: "scrapNumber",
    label: "Slip No",
    sortable: true,
    render: (s) => <span className="font-mono text-caption font-bold text-foreground">{s.scrapNumber}</span>,
  },
  {
    key: "generationDate",
    label: "Date",
    sortable: true,
    sortValue: (s) => new Date(s.generationDate),
    render: (s) => <span className="tnum text-muted-foreground">{formatDate(s.generationDate)}</span>,
  },
  {
    key: "toLocationName",
    label: "Location",
    sortable: true,
    render: (s) => <span className="text-body">{s.toLocationName}</span>,
  },
  {
    key: "projectName",
    label: "Project",
    sortable: true,
    render: (s) => <span className="text-muted-foreground">{s.projectName ?? "—"}</span>,
  },
  {
    key: "sourceMaterialName",
    label: "Source Material",
    sortable: true,
    render: (s) => <span className="text-muted-foreground">{s.sourceMaterialName ?? "—"}</span>,
  },
  {
    key: "lineCount",
    label: "Lines",
    align: "right",
    sortable: true,
    render: (s) => <span className="tnum text-caption">{s.lineCount}</span>,
  },
  {
    key: "totalValue",
    label: "Total Value",
    align: "right",
    sortable: true,
    render: (s) => <span className="tnum text-body font-medium">{formatCurrency(s.totalValue)}</span>,
  },
];

export function ScrapGenerationsView({
  scraps,
  locations,
  materials,
  projects,
  permissions,
}: {
  scraps: ScrapRow[];
  locations: LocationOption[];
  materials: MaterialOption[];
  projects: ProjectOption[];
  permissions?: { canManage?: boolean };
}) {
  const canManage = permissions?.canManage ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-4">
      {scraps.length === 0 ? (
        <EmptyState
          icon={<Hammer className="h-5 w-5" />}
          title="No scrap generations yet"
          description="Generate scrap or by-product material from a process and add it to stock at a scrap valuation."
          action={canManage ? (
            <Button onClick={() => setFormOpen(true)} disabled={locations.length === 0 || materials.length === 0}>
              <Plus className="h-4 w-4" /> New Scrap Generation
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60">
          <DataTable
            data={scraps}
            columns={scrapColumns}
            searchable
            searchPlaceholder="Search by slip no, location, project…"
            hideable
            pageSize={50}
            showTotals
            sumColumns={["totalValue"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            exportFileName="scrap-generations"
            onAddRow={canManage && locations.length > 0 && materials.length > 0 ? () => setFormOpen(true) : undefined}
            addRowLabel="New Scrap Generation"
            rowActions={(s) => (
              <a
                href={`/print/scrap/${s.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Print slip"
                onClick={(e) => e.stopPropagation()}
              >
                <Printer className="h-3.5 w-3.5" />
              </a>
            )}
            toolbarTrailing={
              <div className="group relative">
                <button
                  onClick={() =>
                    downloadCSV("scrap-generations.csv", scraps as unknown as Record<string, unknown>[], [
                      { key: "scrapNumber", label: "Slip No" },
                      { key: "generationDate", label: "Date", format: (v) => formatDate(v as string) },
                      { key: "toLocationName", label: "Location" },
                      { key: "projectName", label: "Project" },
                      { key: "sourceMaterialName", label: "Source Material" },
                      { key: "lineCount", label: "Lines" },
                      { key: "totalValue", label: "Total Value", format: (v) => formatCurrency(v as number) },
                    ])
                  }
                  className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <Download className="size-3.5" />
                </button>
                <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100 z-50">
                  Export CSV
                </span>
              </div>
            }
          />
        </div>
      )}

      {formOpen && (
        <ScrapGenerationForm
          locations={locations}
          materials={materials}
          projects={projects}
          onOpenChange={setFormOpen}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function ScrapGenerationForm({
  locations,
  materials,
  projects,
  onOpenChange,
  onCreated,
}: {
  locations: LocationOption[];
  materials: MaterialOption[];
  projects: ProjectOption[];
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [toLocationId, setToLocationId] = useState("");
  const [sourceMaterialId, setSourceMaterialId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ id: string; materialId: string; qty: string; unitCost: string }[]>(
    [{ id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "" }],
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!toLocationId) return toast.error("Select a destination location");
    const validLines = lines.filter((l) => l.materialId && l.qty);
    if (validLines.length === 0) return toast.error("Add at least one line with material and qty");
    for (const l of validLines) {
      if (Number(l.qty) <= 0) return toast.error("Qty must be > 0");
      if (Number(l.unitCost) < 0) return toast.error("Unit cost must be ≥ 0");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/scrap-generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toLocationId,
          sourceMaterialId: sourceMaterialId || null,
          projectId: projectId || null,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qty: l.qty,
            unitCost: l.unitCost || "0",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create scrap generation");
      toast.success(`Scrap generation created: ${data.scrapNumber}`);
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // Show scrap materials first, then non-scrap
  const sortedMaterials = [...materials].sort((a, b) => {
    if (a.isScrap && !b.isScrap) return -1;
    if (!a.isScrap && b.isScrap) return 1;
    return a.name.localeCompare(b.name);
  });

  const scrapMaterialOptions = useMemo(
    () => sortedMaterials.map((m) => ({ value: m.id, label: `${m.isScrap ? "[SCRAP] " : ""}${m.code} — ${m.name} (${m.unit})` })),
    [sortedMaterials],
  );

  const scrapColumns: EditableColumn<typeof lines[number]>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: scrapMaterialOptions,
      placeholder: "Select material…",
      width: "1fr",
    },
    {
      key: "qty",
      label: "Qty",
      type: "number",
      align: "right",
      step: "0.001",
      min: 0,
      placeholder: "0",
      width: "100px",
      format: (v) => v ? formatNumber(Number(v), 3) : "",
    },
    {
      key: "unitCost",
      label: "Unit Cost (₹)",
      type: "number",
      align: "right",
      step: "0.01",
      min: 0,
      placeholder: "0",
      width: "110px",
      format: (v) => v ? formatCurrency(Number(v)) : "",
    },
    {
      key: "lineTotal",
      label: "Amount",
      type: "computed",
      align: "right",
      compute: (r) => (Number(r.qty) || 0) * (Number(r.unitCost) || 0),
      format: (v) => formatCurrency(v as number),
    },
  ], [scrapMaterialOptions]);

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="New Scrap Generation"
      description="Add internally generated material to stock at scrap valuation"
      className="max-w-2xl"
    >
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Destination Location *</Label>
            <Select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} required>
              <option value="" disabled>Select…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Source Material (optional — what was scrap generated from?)</Label>
          <Select value={sourceMaterialId} onChange={(e) => setSourceMaterialId(e.target.value)}>
            <option value="">None</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Scrap Lines</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add Line
            </Button>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <EditableGrid
              rows={lines}
              onChange={setLines}
              columns={scrapColumns}
              getRowId={(r) => r.id}
              sumColumns={["qty", "lineTotal"]}
              className="max-h-[40vh]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Scrap"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
