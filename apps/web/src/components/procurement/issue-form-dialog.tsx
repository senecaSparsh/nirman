"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { MaterialFormDialog } from "@/components/materials/material-form-dialog";
import { formatNumber } from "@/lib/utils";
import { required, type ValidationErrors } from "@/lib/validate";
import type { DepartmentOption, MaterialCategory, MaterialOption, ProjectOption, StockLocationOption } from "@/lib/types";

type IssueFormValues = {
  targetId: string;
  fromLocationId: string;
  lines: IssueLine[];
};

const errorBorder = "border-danger focus-visible:border-danger focus-visible:ring-danger/25";

type Target = "PROJECT" | "DEPARTMENT";

type IssueLine = { id: string; materialId: string; materialName: string; unit: string; qty: string; lotNumber: string; available: number | null };

export function IssueFormDialog({
  open,
  onOpenChange,
  projects,
  locations,
  materials,
  departments,
  categories,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  locations: StockLocationOption[];
  materials: MaterialOption[];
  departments: DepartmentOption[];
  categories: MaterialCategory[];
  /** Pre-fill fields (e.g. { projectId: "abc" } when scoped to a project node). */
  defaults?: { projectId?: string; fromLocationId?: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<Target>("PROJECT");
  const [projectId, setProjectId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [roundOff, setRoundOff] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<IssueLine[]>([{ id: crypto.randomUUID(), materialId: "", materialName: "", unit: "", qty: "", lotNumber: "", available: null }]);
  // Stock available at the from-location: materialId → qty
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  // Fetch stock at from-location when it changes
  useEffect(() => {
    if (!fromLocationId) { setStockMap({}); return; }
    fetch(`/api/stock/available?locationId=${fromLocationId}`)
      .then((r) => r.json())
      .then((data: { materialId: string; qty: number }[]) => {
        const map: Record<string, number> = {};
        for (const item of data) map[item.materialId] = item.qty;
        setStockMap(map);
      })
      .catch(() => setStockMap({}));
  }, [fromLocationId]);
  const [errors, setErrors] = useState<ValidationErrors<IssueFormValues>>({});
  // Local copies so freshly created masters appear in their dropdowns without
  // waiting for router.refresh.
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  const [localLocations, setLocalLocations] = useState<StockLocationOption[]>(locations);
  const [localMaterials, setLocalMaterials] = useState<MaterialOption[]>(materials);
  useEffect(() => { setLocalProjects(projects); }, [projects]);
  useEffect(() => { setLocalLocations(locations); }, [locations]);
  useEffect(() => { setLocalMaterials(materials); }, [materials]);
  const [materialCreateOpen, setMaterialCreateOpen] = useState(false);

  function validateField(key: keyof IssueFormValues): string | undefined {
    if (key === "targetId") {
      if (target === "PROJECT") return required(projectId, "Project");
      if (target === "DEPARTMENT") return required(departmentId, "Cost centre");
    }
    if (key === "fromLocationId") return required(fromLocationId, "From location");
    if (key === "lines") {
      const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
      if (validLines.length === 0) return "Add at least one line item with a material and quantity";
    }
  }

  function onBlur(key: keyof IssueFormValues) {
    const error = validateField(key);
    setErrors((prev) => ({ ...prev, [key]: error }));
  }

  const materialOptions = useMemo(
    () => localMaterials.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` })),
    [localMaterials],
  );

  const issueColumns: EditableColumn<IssueLine>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: materialOptions,
      placeholder: "Select…",
      width: "1fr",
      createLabel: "material",
    },
    {
      key: "unit",
      label: "Unit",
      type: "readonly",
      width: "60px",
    },
    {
      key: "qty",
      label: "Qty",
      type: "number",
      align: "right",
      step: "any",
      min: 0,
      placeholder: "0",
      width: "100px",
      format: (v) => v ? formatNumber(Number(v), 3) : "",
    },
    {
      key: "available",
      label: "Available",
      type: "readonly",
      align: "right",
      width: "90px",
      format: (v) => v != null ? formatNumber(v as number, 3) : "—",
    },
  ], [materialOptions]);

  // Apply defaults when the dialog opens
  useEffect(() => {
    if (open && defaults) {
      if (defaults.projectId) { setProjectId(defaults.projectId); setTarget("PROJECT"); }
      if (defaults.fromLocationId) setFromLocationId(defaults.fromLocationId);
    }
  }, [open, defaults]);

  function addLine() { setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", materialName: "", unit: "", qty: "", lotNumber: "", available: null }]); }

  // Sync materialName + unit + available stock when materialId changes via EditableGrid
  function handleLinesChange(newLines: IssueLine[]) {
    const synced = newLines.map((l) => {
      if (l.materialId) {
        const mat = localMaterials.find((m) => m.id === l.materialId);
        if (mat) return { ...l, materialName: mat.name, unit: mat.unit, available: stockMap[l.materialId] ?? null };
      }
      return { ...l, available: null };
    });
    setLines(synced);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: ValidationErrors<IssueFormValues> = {};
    (["targetId", "fromLocationId", "lines"] as (keyof IssueFormValues)[]).forEach((key) => {
      const error = validateField(key);
      if (error) newErrors[key] = error;
    });
    setErrors(newErrors);
    if (target === "DEPARTMENT" && !receiverName.trim()) { toast.error("Receiver name is required for department issues"); return; }
    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix the errors in the form");
      return;
    }

    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    setSaving(true);
    try {
      const res = await fetch("/api/issue-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: target === "PROJECT" ? projectId : null,
          departmentId: target === "DEPARTMENT" ? departmentId : null,
          fromLocationId,
          notes: notes.trim() || null,
          receiverName: receiverName.trim() || null,
          receiverMobile: receiverMobile.trim() || null,
          roundOff: roundOff ? Number(roundOff) : null,
          lines: validLines.map((l) => ({ materialId: l.materialId, qty: Number(l.qty) })),
          requireGatePass: target === "PROJECT",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to issue materials");
      const issuedProjectId = target === "PROJECT" ? projectId : "";
      if (data.pending) {
        toast.success(`Gate pass created — awaiting approval`, {
          description: data.message ?? "Items cannot leave the gate until the gate pass is approved.",
          action: {
            label: "View Gate Passes",
            onClick: () => router.push("/gate-passes"),
          },
        });
      } else {
        toast.success(`Issue slip ${data.issueNumber ?? ""} created`, {
          action: issuedProjectId
            ? {
                label: "View Project Cost",
                onClick: () => router.push(`/projects/${issuedProjectId}?tab=finance`),
              }
            : undefined,
        });
      }
      onOpenChange(false);
      setProjectId(""); setDepartmentId(""); setFromLocationId(""); setNotes("");
      setReceiverName(""); setReceiverMobile(""); setRoundOff(""); setErrors({});
      setLines([{ id: crypto.randomUUID(), materialId: "", materialName: "", unit: "", qty: "", lotNumber: "", available: null }]);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setSaving(false);
    }
  }

  const targetLabel = target === "PROJECT" ? "Project" : "Cost Centre";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={target === "PROJECT" ? "Issue Materials to Project" : "Issue Materials to Cost Centre"}
      description={
        target === "PROJECT"
          ? "Materials leave stock at MAC and accumulate as project WIP cost."
          : "Materials leave stock at MAC and are expensed to the department (operating expenses)."
      }
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {/* Target toggle — segmented control */}
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setTarget("PROJECT")}
            className={`rounded px-3 py-1.5 text-body font-medium transition-colors ${
              target === "PROJECT" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Project
          </button>
          <button
            type="button"
            onClick={() => setTarget("DEPARTMENT")}
            className={`rounded px-3 py-1.5 text-body font-medium transition-colors ${
              target === "DEPARTMENT" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Cost Centre
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className={errors.targetId ? "text-danger" : undefined}>{targetLabel} *</Label>
            {target === "PROJECT" ? (
              <SelectWithCreate
                value={projectId}
                onChange={setProjectId}
                onBlur={() => onBlur("targetId")}
                aria-invalid={!!errors.targetId}
                className={errors.targetId ? errorBorder : undefined}
                placeholder="Select…"
                createLabel="project"
                options={localProjects.filter((p) => p.status !== "ON_HOLD").map((p) => ({ value: p.id, label: p.name }))}
                renderCreateDialog={({ open: o, onCreated, onClose }) => (
                  <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]); onCreated(e); }} />
                )}
              />
            ) : (
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} onBlur={() => onBlur("targetId")} aria-invalid={!!errors.targetId} className={errors.targetId ? errorBorder : undefined}>
                <option value="">Select…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </Select>
            )}
            {errors.targetId && <p className="text-caption text-danger" role="alert">{errors.targetId}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className={errors.fromLocationId ? "text-danger" : undefined}>From Location *</Label>
            <SelectWithCreate
              value={fromLocationId}
              onChange={setFromLocationId}
              onBlur={() => onBlur("fromLocationId")}
              aria-invalid={!!errors.fromLocationId}
              className={errors.fromLocationId ? errorBorder : undefined}
              placeholder="Select…"
              createLabel="location"
              options={localLocations.map((l) => ({ value: l.id, label: l.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <LocationFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalLocations((p) => [...p, { id: e.id, type: "COMPANY_WAREHOUSE", name: e.label ?? "", projectId: null, projectName: null }]); onCreated(e); }} projects={localProjects} location={null} />
              )}
            />
            {errors.fromLocationId && <p className="text-caption text-danger" role="alert">{errors.fromLocationId}</p>}
          </div>
        </div>

        {/* Receiver accountability — matches the paper Stock Issue Slip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>
              Receiver Name {target === "DEPARTMENT" ? "*" : ""}
            </Label>
            <Input
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              placeholder="Who is picking up the stock"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Receiver Mobile</Label>
            <Input
              value={receiverMobile}
              onChange={(e) => setReceiverMobile(e.target.value)}
              placeholder="Contact number"
              maxLength={20}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Materials</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" /> Add Line
            </Button>
          </div>
          <div className={`rounded-lg border overflow-hidden ${errors.lines ? "border-danger" : "border-border"}`}>
            <EditableGrid
              rows={lines}
              onChange={handleLinesChange}
              columns={issueColumns}
              getRowId={(r) => r.id}
              sumColumns={["qty"]}
              className="max-h-[40vh]"
              onCreateOption={() => setMaterialCreateOpen(true)}
            />
          </div>
          {errors.lines && <p className="text-caption text-danger" role="alert">{errors.lines}</p>}
          {lines.some((l) => l.materialId && l.available !== null && Number(l.qty) > l.available) && (
            <p className="text-caption text-warning flex items-center gap-1" role="alert">
              ⚠ Some lines exceed available stock — issuing will create negative stock.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Round Off</Label>
            <Input
              type="number"
              step="0.01"
              value={roundOff}
              onChange={(e) => setRoundOff(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Issuing…" : `Issue to ${targetLabel}`}</Button>
        </div>
      </form>

      {/* Inline material creator — opened from a line item's "+ Create new
          material…" option. */}
      <MaterialFormDialog
        open={materialCreateOpen}
        onOpenChange={setMaterialCreateOpen}
        categories={categories}
        material={null}
        onCreated={(e) => {
          setLocalMaterials((p) => [...p, { id: e.id, code: "", name: e.label ?? "", unit: "", standardCost: 0, gstRate: 0, isLotTracked: false }]);
        }}
      />
    </Dialog>
  );
}
