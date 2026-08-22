"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, Calculator, Loader2 } from "lucide-react";

type ComponentType = "MATERIAL" | "LABOUR" | "EQUIPMENT" | "OVERHEAD" | "PROFIT" | "OTHER";
type LineBasis = "QUANTITY" | "PERCENTAGE";

type Material = { id: string; code: string; name: string; unit: string };

interface RateAnalysisLine {
  id?: string;
  componentType: ComponentType;
  basis: LineBasis;
  materialId: string | null;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  percentage: string;
  amount: number;
}

interface RateAnalysisData {
  id: string;
  perUnit: string;
  wastagePct: number;
  notes: string | null;
  totalRate: number;
  materialSubtotal: number;
  labourSubtotal: number;
  equipmentSubtotal: number;
  overheadSubtotal: number;
  profitSubtotal: number;
  otherSubtotal: number;
  lines: Array<{
    id: string;
    componentType: ComponentType;
    basis: LineBasis;
    materialId: string | null;
    description: string;
    quantity: number | null;
    unit: string | null;
    rate: number | null;
    percentage: number | null;
    amount: number;
    sortOrder: number;
  }>;
}

const COMPONENT_COLORS: Record<ComponentType, string> = {
  MATERIAL: "bg-blue-100 text-blue-700",
  LABOUR: "bg-amber-100 text-amber-700",
  EQUIPMENT: "bg-purple-100 text-purple-700",
  OVERHEAD: "bg-gray-100 text-gray-700",
  PROFIT: "bg-green-100 text-green-700",
  OTHER: "bg-pink-100 text-pink-700",
};

function defaultBasisForType(type: ComponentType): LineBasis {
  return type === "OVERHEAD" || type === "PROFIT" ? "PERCENTAGE" : "QUANTITY";
}

function emptyLine(type: ComponentType): RateAnalysisLine {
  return {
    componentType: type,
    basis: defaultBasisForType(type),
    materialId: null,
    description: "",
    quantity: "",
    unit: "",
    rate: "",
    percentage: "",
    amount: 0,
  };
}

export function RateAnalysisDialog({
  open,
  onOpenChange,
  boqItem,
  materials,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boqItem: {
    id: string;
    serialNo: string;
    description: string;
    unit: string | null;
    rate: number | null;
    estimatedQty: number | null;
  };
  materials: Material[];
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [perUnit, setPerUnit] = useState(boqItem.unit ?? "");
  const [wastagePct, setWastagePct] = useState("0");
  const [notes, setNotes] = useState("");
  const [updateBoqRate, setUpdateBoqRate] = useState(true);
  const [lines, setLines] = useState<RateAnalysisLine[]>([]);

  // Compute live totals from current lines
  const computed = computeLiveTotals(lines, parseFloat(wastagePct) || 0);

  const fetchExisting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/rate-analysis?boqItemId=${boqItem.id}`);
      if (res.ok) {
        const data: RateAnalysisData | null = await res.json();
        if (data) {
          setExistingId(data.id);
          setPerUnit(data.perUnit);
          setWastagePct(data.wastagePct?.toString() ?? "0");
          setNotes(data.notes ?? "");
          setLines(
            data.lines.map((l) => ({
              id: l.id,
              componentType: l.componentType,
              basis: l.basis,
              materialId: l.materialId,
              description: l.description,
              quantity: l.quantity?.toString() ?? "",
              unit: l.unit ?? "",
              rate: l.rate?.toString() ?? "",
              percentage: l.percentage?.toString() ?? "",
              amount: Number(l.amount),
            })),
          );
          return;
        }
      }
      // No existing — start with a default template
      setExistingId(null);
      setPerUnit(boqItem.unit ?? "");
      setWastagePct("0");
      setNotes("");
      setLines([
        emptyLine("MATERIAL"),
        emptyLine("LABOUR"),
        emptyLine("OVERHEAD"),
      ]);
    } catch {
      toast.error("Failed to load rate analysis");
    } finally {
      setLoading(false);
    }
  }, [boqItem.id, boqItem.unit]);

  useEffect(() => {
    if (open) fetchExisting();
  }, [open, fetchExisting]);

  function addLine(type: ComponentType) {
    setLines((prev) => [...prev, emptyLine(type)]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, patch: Partial<RateAnalysisLine>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, ...patch };
        // Auto-switch basis when component type changes
        if (patch.componentType && patch.componentType !== line.componentType) {
          updated.basis = defaultBasisForType(patch.componentType);
        }
        return updated;
      }),
    );
  }

  async function onSave() {
    if (!perUnit.trim()) {
      toast.error("Per unit is required (e.g. CUM, SQM)");
      return;
    }
    if (lines.length === 0) {
      toast.error("At least one line is required");
      return;
    }
    for (const line of lines) {
      if (!line.description.trim()) {
        toast.error("Each line needs a description");
        return;
      }
      const isPct = line.basis === "PERCENTAGE";
      if (isPct && !line.percentage) {
        toast.error(`Line "${line.description}" needs a percentage`);
        return;
      }
      if (!isPct && (!line.quantity || !line.rate)) {
        toast.error(`Line "${line.description}" needs quantity and rate`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        boqItemId: boqItem.id,
        perUnit: perUnit.trim(),
        wastagePct: parseFloat(wastagePct) || 0,
        notes: notes || null,
        updateBoqRate,
        lines: lines.map((l, i) => ({
          componentType: l.componentType,
          basis: l.basis,
          materialId: l.materialId || null,
          description: l.description.trim(),
          quantity: l.quantity ? parseFloat(l.quantity) : null,
          unit: l.unit || null,
          rate: l.rate ? parseFloat(l.rate) : null,
          percentage: l.percentage ? parseFloat(l.percentage) : null,
          sortOrder: i,
        })),
      };

      const res = await fetch(
        existingId ? `/api/rate-analysis/${existingId}` : "/api/rate-analysis",
        {
          method: existingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success(existingId ? "Rate analysis updated" : "Rate analysis created");
      onOpenChange(false);
      if (onSaved) onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!existingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rate-analysis/${existingId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Rate analysis deleted");
      onOpenChange(false);
      if (onSaved) onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rate Analysis"
      description={`${boqItem.serialNo} — ${boqItem.description}`}
      className="max-w-4xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Per Unit" required>
              <Input value={perUnit} onChange={(e) => setPerUnit(e.target.value)} placeholder="CUM, SQM, NOS" />
            </Field>
            <Field label="Wastage %">
              <Input type="number" step="0.01" value={wastagePct} onChange={(e) => setWastagePct(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Current BOQ Rate">
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/50 px-3 text-sm text-muted-foreground">
                {boqItem.rate != null ? formatCurrency(boqItem.rate) : "—"}
              </div>
            </Field>
          </div>

          {/* Lines table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[100px_1fr_90px_90px_90px_100px_40px] gap-1 border-b border-border bg-muted/50 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              <div>Type</div>
              <div>Description</div>
              <div className="text-right">Qty/Hrs</div>
              <div>Unit</div>
              <div className="text-right">Rate/₹</div>
              <div className="text-right">Amount</div>
              <div></div>
            </div>
            {lines.map((line, i) => {
              const isPct = line.basis === "PERCENTAGE";
              return (
                <div key={i} className="grid grid-cols-[100px_1fr_90px_90px_90px_100px_40px] gap-1 border-b border-border/50 px-2 py-1.5 text-sm items-center">
                  <Select
                    value={line.componentType}
                    onChange={(e) => updateLine(i, { componentType: e.target.value as ComponentType })}
                    className="h-8 text-xs"
                  >
                    {(["MATERIAL", "LABOUR", "EQUIPMENT", "OVERHEAD", "PROFIT", "OTHER"] as ComponentType[]).map((t) => (
                      <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-1">
                    {line.componentType === "MATERIAL" && (
                      <Select
                        value={line.materialId ?? ""}
                        onChange={(e) => {
                          const mat = materials.find((m) => m.id === e.target.value);
                          updateLine(i, {
                            materialId: e.target.value || null,
                            description: mat ? `${mat.code} — ${mat.name}` : line.description,
                            unit: mat?.unit ?? line.unit,
                          });
                        }}
                        className="h-8 text-xs w-32"
                      >
                        <option value="">— pick —</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>{m.code}</option>
                        ))}
                      </Select>
                    )}
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder="Description"
                      className="h-8 text-xs"
                    />
                  </div>
                  {isPct ? (
                    <>
                      <Input
                        type="number"
                        step="0.01"
                        value={line.percentage}
                        onChange={(e) => updateLine(i, { percentage: e.target.value })}
                        placeholder="%"
                        className="h-8 text-xs text-right"
                      />
                      <div className="text-xs text-muted-foreground text-center">%</div>
                      <div className="text-xs text-muted-foreground text-center">of base</div>
                    </>
                  ) : (
                    <>
                      <Input
                        type="number"
                        step="0.001"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value })}
                        placeholder="0"
                        className="h-8 text-xs text-right"
                      />
                      <Input
                        value={line.unit}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        placeholder="bag"
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={line.rate}
                        onChange={(e) => updateLine(i, { rate: e.target.value })}
                        placeholder="0"
                        className="h-8 text-xs text-right"
                      />
                    </>
                  )}
                  <div className="text-right font-medium text-xs">
                    {formatCurrency(getLineDisplayAmount(line, computed))}
                  </div>
                  <button
                    onClick={() => removeLine(i)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {/* Add line buttons */}
            <div className="flex flex-wrap gap-1 px-2 py-2 border-b border-border/50">
              {(["MATERIAL", "LABOUR", "EQUIPMENT", "OVERHEAD", "PROFIT", "OTHER"] as ComponentType[]).map((t) => (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => addLine(t)}
                >
                  <Plus className="mr-1 h-3 w-3" /> {t.charAt(0) + t.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Subtotals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <SubtotalCard label="Material" value={computed.materialSubtotal} color="blue" />
            <SubtotalCard label="Labour" value={computed.labourSubtotal} color="amber" />
            <SubtotalCard label="Equipment" value={computed.equipmentSubtotal} color="purple" />
            <SubtotalCard label="Direct" value={computed.directSubtotal} color="gray" />
            <SubtotalCard label="Overhead" value={computed.overheadSubtotal} color="gray" />
            <SubtotalCard label="Profit" value={computed.profitSubtotal} color="green" />
            <SubtotalCard label="Other" value={computed.otherSubtotal} color="pink" />
            <SubtotalCard label="Total Rate" value={computed.totalRate} color="green" highlight />
          </div>

          {/* Notes + options */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes" />
            </Field>
            <div className="flex flex-col gap-2 justify-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={updateBoqRate}
                  onChange={(e) => setUpdateBoqRate(e.target.checked)}
                  className="rounded border-border"
                />
                Update BOQ item rate with computed total
              </label>
              {boqItem.rate != null && (
                <div className="text-xs text-muted-foreground">
                  Current BOQ rate: {formatCurrency(boqItem.rate)} → Computed: {formatCurrency(computed.totalRate)}
                  {Math.abs(boqItem.rate - computed.totalRate) > 0.01 && (
                    <Badge variant="muted" className="ml-2 text-xs">differs</Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-2">
            <div>
              {existingId && (
                <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Calculator className="mr-1 h-4 w-4" />}
                {saving ? "Saving…" : existingId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function SubtotalCard({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
    purple: "border-purple-200 bg-purple-50",
    green: "border-green-200 bg-green-50",
    gray: "border-gray-200 bg-gray-50",
    pink: "border-pink-200 bg-pink-50",
  };
  return (
    <div className={cn("rounded-md border px-2 py-1.5", colorClasses[color], highlight && "ring-2 ring-green-400")}>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold">{formatCurrency(value)}</div>
    </div>
  );
}

// ── Live computation (mirrors the service's computeRateAnalysis) ──

/** Get the display amount for a single line based on current live totals. */
function getLineDisplayAmount(
  line: RateAnalysisLine,
  computed: ReturnType<typeof computeLiveTotals>,
): number {
  if (line.basis === "PERCENTAGE") {
    const pct = parseFloat(line.percentage) || 0;
    const base = line.componentType === "OVERHEAD" ? computed.directSubtotal : computed.directSubtotal + computed.overheadSubtotal;
    return Math.round(((pct / 100) * base) * 100) / 100;
  }
  const qty = parseFloat(line.quantity) || 0;
  const rate = parseFloat(line.rate) || 0;
  return Math.round(qty * rate * 100) / 100;
}

function computeLiveTotals(lines: RateAnalysisLine[], wastagePct: number) {
  const wastageMultiplier = 1 + wastagePct / 100;

  let materialSubtotal = 0;
  let labourSubtotal = 0;
  let equipmentSubtotal = 0;

  for (const line of lines) {
    if (line.componentType === "MATERIAL" || line.componentType === "LABOUR" || line.componentType === "EQUIPMENT") {
      const qty = parseFloat(line.quantity) || 0;
      const rate = parseFloat(line.rate) || 0;
      let amount = qty * rate;
      if (line.componentType === "MATERIAL") amount *= wastageMultiplier;
      if (line.componentType === "MATERIAL") materialSubtotal += amount;
      else if (line.componentType === "LABOUR") labourSubtotal += amount;
      else equipmentSubtotal += amount;
    }
  }

  const directSubtotal = materialSubtotal + labourSubtotal + equipmentSubtotal;

  let overheadSubtotal = 0;
  for (const line of lines) {
    if (line.componentType === "OVERHEAD") {
      const pct = parseFloat(line.percentage) || 0;
      overheadSubtotal += (pct / 100) * directSubtotal;
    }
  }

  const overheadPlusDirect = directSubtotal + overheadSubtotal;

  let profitSubtotal = 0;
  for (const line of lines) {
    if (line.componentType === "PROFIT") {
      const pct = parseFloat(line.percentage) || 0;
      profitSubtotal += (pct / 100) * overheadPlusDirect;
    }
  }

  const otherBase = overheadPlusDirect + profitSubtotal;
  let otherSubtotal = 0;
  for (const line of lines) {
    if (line.componentType === "OTHER") {
      if (line.basis === "PERCENTAGE") {
        const pct = parseFloat(line.percentage) || 0;
        otherSubtotal += (pct / 100) * otherBase;
      } else {
        const qty = parseFloat(line.quantity) || 0;
        const rate = parseFloat(line.rate) || 0;
        otherSubtotal += qty * rate;
      }
    }
  }

  const totalRate = Math.round((directSubtotal + overheadSubtotal + profitSubtotal + otherSubtotal) * 100) / 100;

  return {
    materialSubtotal: Math.round(materialSubtotal * 100) / 100,
    labourSubtotal: Math.round(labourSubtotal * 100) / 100,
    equipmentSubtotal: Math.round(equipmentSubtotal * 100) / 100,
    directSubtotal: Math.round(directSubtotal * 100) / 100,
    overheadSubtotal: Math.round(overheadSubtotal * 100) / 100,
    profitSubtotal: Math.round(profitSubtotal * 100) / 100,
    otherSubtotal: Math.round(otherSubtotal * 100) / 100,
    totalRate,
  };
}
