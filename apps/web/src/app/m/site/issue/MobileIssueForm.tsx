"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Plus, Trash2, Send, Loader2,
  MapPin, User, CheckCircle2, ChevronLeft,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface LocationItem {
  id: string;
  name: string;
  type: string;
}

interface ProjectItem {
  id: string;
  name: string;
  code?: string;
}

interface MaterialItem {
  id: string;
  name: string;
  code: string;
  unitOfMeasure: string;
}

interface UnitItem {
  id: string;
  unitNumber: string;
  builtAreaSqft?: number;
}

interface IssueLine {
  materialId: string;
  qty: string;
}

export default function MobileIssueForm() {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [fromLocationId, setFromLocationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [builtUnitId, setBuiltUnitId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<IssueLine[]>([
    { materialId: "", qty: "" },
  ]);

  const [issueSuccess, setIssueSuccess] = useState<{
    issueNumber: string;
    totalAmount: number;
  } | null>(null);

  // Load initial options
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
          if (locRes.length > 0) setFromLocationId(locRes[0].id);
        }
        if (Array.isArray(projRes)) {
          setProjects(projRes);
          if (projRes.length > 0) setProjectId(projRes[0].id);
        }
        if (Array.isArray(matRes)) {
          setMaterials(matRes);
          if (matRes.length > 0) {
            setLines([{ materialId: matRes[0].id, qty: "" }]);
          }
        }
      } catch (err) {
        console.error("Failed to load issue form options:", err);
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch built units when project changes
  useEffect(() => {
    if (!projectId) {
      setUnits((prev) => (prev.length > 0 ? [] : prev));
      setBuiltUnitId((prev) => (prev !== "" ? "" : prev));
      return;
    }

    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.units && Array.isArray(data.units)) {
          setUnits(data.units);
        } else {
          setUnits([]);
        }
      })
      .catch(() => setUnits([]));
  }, [projectId]);

  const handleAddLine = () => {
    const defaultMatId = materials.length > 0 ? materials[0]!.id : "";
    setLines([...lines, { materialId: defaultMatId, qty: "" }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof IssueLine, val: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromLocationId) {
      toast.error("Please select source stock location");
      return;
    }
    if (!projectId) {
      toast.error("Please select target project");
      return;
    }

    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) {
      toast.error("Please add at least one material line item with quantity > 0");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        fromLocationId,
        projectId,
        builtUnitId: builtUnitId || undefined,
        receiverName: receiverName.trim() || undefined,
        receiverMobile: receiverMobile.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: validLines.map((l) => ({
          materialId: l.materialId,
          qty: Number(l.qty),
        })),
      };

      const res = await fetch("/api/issue-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue materials");

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(50);
      }

      toast.success(`Challan ${data.issueNumber} generated successfully!`);
      router.refresh();
      setIssueSuccess({
        issueNumber: data.issueNumber,
        totalAmount: data.totalAmount || 0,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error issuing materials");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingOptions) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
        <Loader2 className="size-8 animate-spin" style={{ color: "var(--color-steel)" }} />
        <p className="mt-2 text-[0.6875rem] font-medium" style={{ color: "var(--color-ink-500)" }}>
          Loading issue form...
        </p>
      </div>
    );
  }

  if (issueSuccess) {
    return (
      <div className="p-1">
        {/* Back arrow */}
        <div className="mb-3">
          <button onClick={() => router.back()} className="flex items-center" style={{ color: "var(--color-ink-700)" }}>
            <ChevronLeft className="size-5" />
          </button>
        </div>

        <div
          className="rounded-[0.875rem] border p-5 text-center space-y-3"
          style={{
            borderColor: "var(--color-go)",
            backgroundColor: "var(--color-go-wash)",
          }}
        >
          <div
            className="mx-auto flex size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--color-go)" }}
          >
            <CheckCircle2 className="size-7" style={{ color: "#fff" }} />
          </div>
          <h2 className="text-[0.9375rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Materials Issued
          </h2>

          <div
            className="rounded-[0.5rem] border p-3 text-left space-y-1.5 font-mono text-[0.6875rem]"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="flex justify-between">
              <span style={{ color: "var(--color-ink-500)" }}>Challan No:</span>
              <span className="font-bold" style={{ color: "var(--color-ink-950)" }}>
                {issueSuccess.issueNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--color-ink-500)" }}>Total Value:</span>
              <span className="font-bold" style={{ color: "var(--color-go)" }}>
                {formatCurrency(issueSuccess.totalAmount)}
              </span>
            </div>
          </div>

          <div className="pt-1 flex flex-col gap-2">
            <button
              onClick={() => {
                setIssueSuccess(null);
                setLines([{ materialId: materials[0]?.id || "", qty: "" }]);
              }}
              className="w-full rounded-[0.625rem] py-3 text-[0.75rem] font-bold press transition-transform active:scale-95"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              Issue More Materials
            </button>
            <button
              onClick={() => router.back()}
              className="w-full rounded-[0.625rem] border py-3 text-[0.75rem] font-semibold press transition-transform active:scale-95"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
            >
              Back to Site
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Back arrow */}
      <div>
        <button onClick={() => router.back()} className="flex items-center" style={{ color: "var(--color-ink-700)" }}>
          <ChevronLeft className="size-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* ── Source & Destination ── */}
        <div
          className="rounded-[0.625rem] border p-3 space-y-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <MapPin className="size-3.5" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Source & Destination
            </span>
          </div>

          <FormField label="From location" required>
            <select
              value={fromLocationId}
              onChange={(e) => setFromLocationId(e.target.value)}
              className={inputClass}
              required
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.type})
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="To project" required>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={inputClass}
              required
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </FormField>

          {units.length > 0 ? (
            <FormField label="Built unit (optional)">
              <select
                value={builtUnitId}
                onChange={(e) => setBuiltUnitId(e.target.value)}
                className={inputClass}
              >
                <option value="">General project allocation</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unitNumber} {u.builtAreaSqft ? `(${u.builtAreaSqft} sqft)` : ""}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
        </div>

        {/* ── Receiver ── */}
        <div
          className="rounded-[0.625rem] border p-3 space-y-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <User className="size-3.5" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Receiver
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FormField label="Name">
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="e.g. Guljaar"
                className={inputClass}
              />
            </FormField>
            <FormField label="Mobile">
              <input
                type="tel"
                value={receiverMobile}
                onChange={(e) => setReceiverMobile(e.target.value)}
                placeholder="9876543210"
                className={`${inputClass} font-mono`}
              />
            </FormField>
          </div>
        </div>

        {/* ── Material Lines ── */}
        <div
          className="rounded-[0.625rem] border p-3 space-y-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex items-center gap-1.5">
              <Package className="size-3.5" style={{ color: "var(--color-steel)" }} />
              <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Materials
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddLine}
              className="flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-[0.5625rem] font-bold press active:scale-95"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-steel)" }}
            >
              <Plus className="size-3" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => {
              const selectedMat = materials.find((m) => m.id === line.materialId);
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-[0.5rem] border p-2"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <select
                      value={line.materialId}
                      onChange={(e) => handleLineChange(idx, "materialId", e.target.value)}
                      className={`${inputClass} text-[0.6875rem]`}
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unitOfMeasure})
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        value={line.qty}
                        onChange={(e) => handleLineChange(idx, "qty", e.target.value)}
                        placeholder="Qty"
                        className="w-20 rounded-[0.375rem] border px-2 py-1 text-[0.6875rem] font-mono font-bold outline-none"
                        style={{
                          borderColor: "var(--color-line)",
                          backgroundColor: "var(--color-paper)",
                          color: "var(--color-ink-950)",
                        }}
                      />
                      <span className="text-[0.5625rem] font-medium truncate" style={{ color: "var(--color-ink-500)" }}>
                        {selectedMat?.unitOfMeasure || "units"}
                      </span>
                    </div>
                  </div>

                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="p-1.5 press active:scale-95"
                      style={{ color: "var(--color-ink-500)" }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Notes ── */}
        <FormField label="Notes / work area remark">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Issued for Tower A foundation concreting"
            className="w-full rounded-[0.5rem] border p-2.5 text-[0.75rem] outline-none resize-none"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
        </FormField>

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] py-3.5 text-[0.8125rem] font-bold press transition-transform active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Send className="size-4" />
              <span>Generate Issue Challan</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

/* ─── Shared input class ─── */
const inputClass =
  "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none";

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
