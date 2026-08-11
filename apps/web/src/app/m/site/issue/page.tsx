"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Plus,
  Trash2,
  Send,
  Loader2,
  Building2,
  MapPin,
  User,
  Phone,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { MobilePageHeader } from "@/components/mobile/mobile-primitives";
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

export default function QuickIssuePage() {
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
          fetch("/api/locations").then((r) => (r.ok ? r.json() : [])),
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
      setUnits([]);
      setBuiltUnitId("");
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

      // Haptic feedback for mobile
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(50);
      }

      toast.success(`Challan ${data.issueNumber} generated successfully!`);
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
        <Loader2 className="size-8 animate-spin text-amber-500" />
        <p className="mt-2 text-xs font-medium text-muted-foreground">Loading quick issue form...</p>
      </div>
    );
  }

  if (issueSuccess) {
    return (
      <div className="p-4 space-y-4 text-center">
        <MobilePageHeader title="Issue Confirmation" subtitle="Material Challan Generated" />

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-3">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600">
            <CheckCircle2 className="size-7" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Materials Issued Successfully</h2>
          <div className="rounded-lg bg-card p-3 border border-border text-left space-y-1 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Challan No:</span>
              <span className="font-bold text-foreground">{issueSuccess.issueNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Value:</span>
              <span className="font-bold text-emerald-600">{formatCurrency(issueSuccess.totalAmount)}</span>
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => {
                setIssueSuccess(null);
                setLines([{ materialId: materials[0]?.id || "", qty: "" }]);
              }}
              className="w-full rounded-xl bg-brand py-3 text-xs font-bold text-brand-foreground shadow-sm active:scale-95"
            >
              Issue More Materials
            </button>

            <button
              onClick={() => router.push("/m/site")}
              className="w-full rounded-xl border border-border bg-card py-3 text-xs font-semibold text-foreground active:scale-95"
            >
              Return to Site Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      <MobilePageHeader
        title="Quick Issue"
        subtitle="Material Issue Challan (Flow B)"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source & Destination */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <MapPin className="size-4 text-amber-500" />
            <span>Source &amp; Destination</span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              From Location (Store/Warehouse) *
            </label>
            <select
              value={fromLocationId}
              onChange={(e) => setFromLocationId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-amber-500"
              required
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              To Project Site *
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-amber-500"
              required
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>

          {units.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Specific Built Unit (Optional Cost Allocation)
              </label>
              <select
                value={builtUnitId}
                onChange={(e) => setBuiltUnitId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">General Project Allocation</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unitNumber} {u.builtAreaSqft ? `(${u.builtAreaSqft} sqft)` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Receiver Details */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <User className="size-4 text-amber-500" />
            <span>Receiver Information</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Receiver Name
              </label>
              <input
                type="text"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="e.g. Guljaar"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                Receiver Mobile
              </label>
              <input
                type="tel"
                value={receiverMobile}
                onChange={(e) => setReceiverMobile(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-amber-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Material Line Items */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Package className="size-4 text-amber-500" />
              <span>Material Line Items</span>
            </div>
            <button
              type="button"
              onClick={handleAddLine}
              className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 active:scale-95"
            >
              <Plus className="size-3.5" />
              <span>Add Line</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {lines.map((line, idx) => {
              const selectedMat = materials.find((m) => m.id === line.materialId);
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg border border-border/80 bg-background p-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <select
                      value={line.materialId}
                      onChange={(e) => handleLineChange(idx, "materialId", e.target.value)}
                      className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground outline-none"
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
                        className="w-24 rounded border border-border bg-card px-2 py-1 text-xs font-mono font-bold text-foreground outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="text-[11px] font-medium text-muted-foreground truncate">
                        {selectedMat?.unitOfMeasure || "units"}
                      </span>
                    </div>
                  </div>

                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="p-1.5 text-muted-foreground hover:text-danger active:scale-95"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Issue Notes */}
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
            Notes / Work Area Remark
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Issued for Tower A foundation concreting"
            className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Action Button */}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
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
