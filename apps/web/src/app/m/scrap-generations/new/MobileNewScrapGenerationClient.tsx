"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Recycle, Plus, Trash2, Send, Loader2,
  ChevronLeft, CheckCircle2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface LocationItem {
  id: string;
  name: string;
  type: string;
}

interface MaterialItem {
  id: string;
  name: string;
  code: string;
  unit: string;
}

interface ProjectItem {
  id: string;
  name: string;
}

interface ScrapLine {
  materialId: string;
  qty: string;
  unitCost: string;
}

export default function MobileNewScrapGenerationClient() {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [toLocationId, setToLocationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sourceMaterialId, setSourceMaterialId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ScrapLine[]>([{ materialId: "", qty: "", unitCost: "" }]);

  const [success, setSuccess] = useState<{ scrapNumber: string; totalValue: number } | null>(null);

  // Load options
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [locRes, projRes, matRes] = await Promise.all([
          fetch("/api/stock-locations").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/projects").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/materials").then((r) => (r.ok ? r.json() : [])),
        ]);
        if (cancelled) return;
        if (Array.isArray(locRes)) {
          setLocations(locRes);
          if (locRes.length > 0) setToLocationId(locRes[0].id);
        }
        if (Array.isArray(projRes)) setProjects(projRes);
        if (Array.isArray(matRes)) {
          setMaterials(matRes);
          if (matRes.length > 0) setLines([{ materialId: matRes[0].id, qty: "", unitCost: "" }]);
        }
      } catch (err) {
        console.error("Failed to load form options:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const handleAddLine = () => {
    const defaultMatId = materials.length > 0 ? materials[0]!.id : "";
    setLines([...lines, { materialId: defaultMatId, qty: "", unitCost: "" }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof ScrapLine, val: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    setLines(updated);
  };

  const totalValue = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!toLocationId) {
      toast.error("Please select destination location");
      return;
    }

    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one line item with quantity");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/scrap-generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toLocationId,
          sourceMaterialId: sourceMaterialId || null,
          projectId: projectId || null,
          notes: notes || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qty: Number(l.qty),
            unitCost: Number(l.unitCost) || 0,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create scrap generation");
      }

      const data = await res.json();
      setSuccess({ scrapNumber: data.scrapNumber, totalValue });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create scrap generation");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          Scrap Generated
        </p>
        <p className="text-[0.6875rem] font-mono mb-3" style={{ color: "var(--color-ink-500)" }}>
          {success.scrapNumber}
        </p>
        <p className="text-[1rem] font-bold tabular-nums mb-4" style={{ color: "var(--color-go)" }}>
          {formatCurrency(success.totalValue)}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              router.refresh();
              router.push("/m/scrap-generations");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            View All Scrap
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: materials[0]?.id ?? "", qty: "", unitCost: "" }]);
              setNotes("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-[0.6875rem] mt-2" style={{ color: "var(--color-ink-500)" }}>Loading form…</p>
      </div>
    );
  }

  const inputClass = "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none";

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <Link href="/m/scrap-generations" className="shrink-0">
          <ChevronLeft className="size-5" style={{ color: "var(--color-ink-700)" }} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Scrap Generation
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <Recycle className="size-2.5" />
          Manual
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ── Destination ── */}
        <FormField label="Destination location" required>
          <select
            value={toLocationId}
            onChange={(e) => setToLocationId(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            required
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.type.replace(/_/g, " ").toLowerCase()})
              </option>
            ))}
          </select>
        </FormField>

        {/* ── Project (optional) ── */}
        <FormField label="Project (optional)">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <option value="">No project linkage</option>
            {projects.map((proj) => (
              <option key={proj.id} value={proj.id}>{proj.name}</option>
            ))}
          </select>
        </FormField>

        {/* ── Source material (optional) ── */}
        <FormField label="Source material (optional)">
          <select
            value={sourceMaterialId}
            onChange={(e) => setSourceMaterialId(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <option value="">No source material</option>
            {materials.map((mat) => (
              <option key={mat.id} value={mat.id}>{mat.name} ({mat.code})</option>
            ))}
          </select>
        </FormField>

        {/* ── Line items ── */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1.5" style={{ color: "var(--color-ink-500)" }}>
            Line Items <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <div className="flex flex-col gap-2">
            {lines.map((line, idx) => {
              const mat = materials.find((m) => m.id === line.materialId);
              const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0);
              return (
                <div
                  key={idx}
                  className="rounded-[0.5rem] border p-2"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  {/* Material selector */}
                  <select
                    value={line.materialId}
                    onChange={(e) => handleLineChange(idx, "materialId", e.target.value)}
                    className={`${inputClass} text-[0.6875rem] mb-2`}
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                  >
                    {materials.map((mat) => (
                      <option key={mat.id} value={mat.id}>
                        {mat.name} ({mat.code})
                      </option>
                    ))}
                  </select>

                  {/* Qty + unit cost */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                        Qty{mat ? ` (${mat.unit})` : ""}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={line.qty}
                        onChange={(e) => handleLineChange(idx, "qty", e.target.value)}
                        placeholder="0"
                        className={`${inputClass} text-[0.6875rem] tabular-nums`}
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                      />
                    </div>
                    <div>
                      <label className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                        Unit Cost
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) => handleLineChange(idx, "unitCost", e.target.value)}
                        placeholder="0"
                        className={`${inputClass} text-[0.6875rem] tabular-nums`}
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                      />
                    </div>
                  </div>

                  {/* Line total + remove */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                      {formatCurrency(lineTotal)}
                    </span>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="flex items-center gap-0.5 text-[0.5rem] font-semibold press"
                        style={{ color: "var(--color-stop)" }}
                      >
                        <Trash2 className="size-3" /> Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add line button */}
          <button
            type="button"
            onClick={handleAddLine}
            className="flex items-center justify-center gap-1 w-full rounded-[0.375rem] border border-dashed py-2 mt-2 press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <Plus className="size-3" />
            <span className="text-[0.625rem] font-semibold">Add line item</span>
          </button>
        </div>

        {/* ── Notes ── */}
        <FormField label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Broken tiles from Tower A flooring"
            rows={2}
            className={`${inputClass} resize-none`}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          />
        </FormField>

        {/* ── Total + submit ── */}
        <div
          className="flex items-center justify-between rounded-[0.5rem] border px-3 py-2"
          style={{ borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))", backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))" }}
        >
          <span className="text-[0.5625rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Total Scrap Value
          </span>
          <span className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrency(totalValue)}
          </span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Send className="size-4" />
              <span>Generate Scrap Slip</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

/* ─── Form field wrapper ─── */
function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-[0.5625rem] font-semibold mb-1"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}
