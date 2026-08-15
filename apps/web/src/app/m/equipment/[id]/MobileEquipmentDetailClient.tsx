"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench, MapPin, Calendar, Settings, IndianRupee,
  CheckCircle2, Archive, Loader2, X, Search, ChevronRight,
  TrendingDown, FileText, Package, Send, Check,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

type EquipmentStatus = "AVAILABLE" | "ASSIGNED" | "IN_MAINTENANCE" | "RETIRED";

interface Assignment {
  id: string;
  locationName: string;
  projectName: string | null;
  assignedAt: string;
  returnedAt: string | null;
  status: string;
}

interface MaintenanceRecord {
  id: string;
  type: string;
  startDate: string;
  endDate: string | null;
  cost: number;
  vendor: string | null;
  notes: string | null;
}

interface EquipmentData {
  id: string;
  assetTag: string;
  name: string;
  model: string | null;
  serialNumber: string | null;
  category: string | null;
  status: EquipmentStatus;
  acquisitionCost: number;
  currentValue: number;
  purchaseDate: string | null;
  notes: string | null;
  activeAssignment: {
    id: string;
    locationId: string;
    locationName: string;
    projectId: string | null;
    projectName: string | null;
    assignedAt: string;
  } | null;
  assignments: Assignment[];
  maintenance: MaintenanceRecord[];
}

interface LocationItem { id: string; name: string; type: string; }
interface ProjectItem { id: string; name: string; }

const MAINTENANCE_TYPES = ["SCHEDULED", "REPAIR", "INSPECTION"] as const;

/**
 * Equipment detail — asset info, valuation, assignment, maintenance,
 * and action buttons (assign, return, maintenance, retire).
 */
export function MobileEquipmentDetailClient({
  equipment,
  canManage,
  locations,
  projects,
  notFound,
}: {
  equipment?: EquipmentData;
  canManage: boolean;
  locations: LocationItem[];
  projects: ProjectItem[];
  notFound?: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showRetire, setShowRetire] = useState(false);

  /* ── Not found ── */
  if (notFound || !equipment) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Equipment not found
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Wrench className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Equipment not found
          </p>
        </div>
      </div>
    );
  }

  const isAvailable = equipment.status === "AVAILABLE";
  const isAssigned = equipment.status === "ASSIGNED";
  const isMaintenance = equipment.status === "IN_MAINTENANCE";
  const isRetired = equipment.status === "RETIRED";

  const accentColor = isRetired ? "var(--color-stop)"
    : isMaintenance ? "var(--color-signal)"
    : isAssigned ? "var(--color-steel)"
    : "var(--color-go)";

  const StatusIcon = isAvailable ? CheckCircle2 : isAssigned ? MapPin : isMaintenance ? Settings : Archive;
  const statusLabel = isAvailable ? "Available" : isAssigned ? "Assigned" : isMaintenance ? "In Maintenance" : "Retired";

  const depreciation = equipment.acquisitionCost - equipment.currentValue;
  const depreciationPct = equipment.acquisitionCost > 0
    ? Math.round((depreciation / equipment.acquisitionCost) * 100)
    : 0;

  /* ── Actions ── */
  const handleAction = async (action: string, _body?: Record<string, unknown>) => {
    setActing(action);
    try {
      let res: Response;
      if (action === "return" && equipment.activeAssignment) {
        res = await fetch(`/api/equipment-assignments/${equipment.activeAssignment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "return" }),
        });
      } else if (action === "complete-maintenance") {
        res = await fetch(`/api/equipment/${equipment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete-maintenance" }),
        });
      } else if (action === "retire") {
        res = await fetch(`/api/equipment/${equipment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retire" }),
        });
      } else if (action === "unretire") {
        res = await fetch(`/api/equipment/${equipment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unretire" }),
        });
      } else {
        throw new Error("Unknown action");
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed to ${action}`);
      }

      toast.success(action === "return" ? "Equipment returned" :
        action === "complete-maintenance" ? "Maintenance completed" :
        action === "retire" ? "Equipment retired" :
        "Equipment restored");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActing(null);
      setShowRetire(false);
    }
  };

  return (
    <div className="pb-20">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {equipment.name}
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}
        >
          <StatusIcon className="size-2.5" />
          {statusLabel}
        </span>
      </div>

      {/* ── Valuation banner ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Current Value
            </p>
            <p className="text-[1.125rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrency(equipment.currentValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Acquired
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
              {formatCurrency(equipment.acquisitionCost)}
            </p>
          </div>
        </div>
        {depreciation > 0 ? (
          <div className="flex items-center gap-1 mt-1.5 pt-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <TrendingDown className="size-3" style={{ color: "var(--color-signal)" }} />
            <span className="text-[0.5rem] font-semibold" style={{ color: "var(--color-signal)" }}>
              {depreciationPct}% depreciated
            </span>
            <span className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
              · −{formatCurrency(depreciation)}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Info row ── */}
      <div className="flex flex-col gap-1.5 mb-3">
        <InfoRow icon={Wrench} label="Asset Tag" value={equipment.assetTag} mono />
        {equipment.category ? (
          <InfoRow icon={Package} label="Category" value={equipment.category} />
        ) : null}
        {equipment.model ? (
          <InfoRow icon={Settings} label="Model" value={equipment.model} />
        ) : null}
        {equipment.serialNumber ? (
          <InfoRow icon={FileText} label="Serial No" value={equipment.serialNumber} />
        ) : null}
        {equipment.purchaseDate ? (
          <InfoRow icon={Calendar} label="Purchase Date" value={formatDate(equipment.purchaseDate)} />
        ) : null}
        {equipment.notes ? (
          <InfoRow icon={FileText} label="Notes" value={equipment.notes} />
        ) : null}
      </div>

      {/* ── Active assignment ── */}
      {equipment.activeAssignment ? (
        <>
          <div className="flex items-center gap-1.5 mb-2">
            <MapPin className="size-3" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
              Active Assignment
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
          </div>
          <div
            className="rounded-[0.5rem] border p-2.5 mb-3"
            style={{
              borderColor: "color-mix(in srgb, var(--color-steel) 25%, var(--color-line))",
              backgroundColor: "color-mix(in srgb, var(--color-steel) 4%, var(--color-paper))",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {equipment.activeAssignment.projectName ?? equipment.activeAssignment.locationName}
                </p>
                <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  {equipment.activeAssignment.locationName} · since {formatDate(equipment.activeAssignment.assignedAt)}
                </p>
              </div>
              {canManage ? (
                <button
                  onClick={() => handleAction("return")}
                  disabled={acting !== null}
                  className="shrink-0 rounded-[0.375rem] px-2.5 py-1.5 text-[0.5625rem] font-bold press disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
                >
                  {acting === "return" ? <Loader2 className="size-3 animate-spin" /> : "Return"}
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {/* ── Maintenance history ── */}
      {equipment.maintenance.length > 0 ? (
        <>
          <div className="flex items-center gap-1.5 mb-2">
            <Settings className="size-3" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
              Maintenance ({equipment.maintenance.length})
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
          </div>
          <div className="flex flex-col gap-1.5 mb-3">
            {equipment.maintenance.map((m) => (
              <div
                key={m.id}
                className="rounded-[0.5rem] border p-2"
                style={{
                  borderColor: m.endDate ? "var(--color-line)" : "color-mix(in srgb, var(--color-signal) 25%, var(--color-line))",
                  backgroundColor: m.endDate ? "var(--color-paper)" : "color-mix(in srgb, var(--color-signal) 4%, var(--color-paper))",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                    {m.type}
                  </span>
                  <span
                    className="text-[0.4375rem] font-bold uppercase"
                    style={{ color: m.endDate ? "var(--color-go)" : "var(--color-signal)" }}
                  >
                    {m.endDate ? "Done" : "Active"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                    {formatDate(m.startDate)}
                  </span>
                  {m.cost > 0 ? (
                    <>
                      <span style={{ color: "var(--color-line)" }}>·</span>
                      <span className="text-[0.5rem] font-semibold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                        {formatCurrency(m.cost)}
                      </span>
                    </>
                  ) : null}
                  {m.vendor ? (
                    <>
                      <span style={{ color: "var(--color-line)" }}>·</span>
                      <span className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                        {m.vendor}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Action buttons ── */}
      {canManage && !isRetired ? (
        <div className="flex flex-col gap-2 mt-2">
          {/* Assign (only if available) */}
          {isAvailable ? (
            <button
              onClick={() => setShowAssign(true)}
              disabled={acting !== null}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              <MapPin className="size-4" />
              <span>Assign to Project</span>
            </button>
          ) : null}

          {/* Record maintenance (if not already in maintenance) */}
          {!isMaintenance ? (
            <button
              onClick={() => setShowMaintenance(true)}
              disabled={acting !== null}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold border press disabled:opacity-50"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              <Settings className="size-4" />
              <span>Record Maintenance</span>
            </button>
          ) : null}

          {/* Complete maintenance (if in maintenance) */}
          {isMaintenance ? (
            <button
              onClick={() => handleAction("complete-maintenance")}
              disabled={acting !== null}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-go)", color: "#fff" }}
            >
              {acting === "complete-maintenance" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>Complete Maintenance</span>
                </>
              )}
            </button>
          ) : null}

          {/* Retire */}
          <button
            onClick={() => setShowRetire(true)}
            disabled={acting !== null}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border press disabled:opacity-50"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-stop)" }}
          >
            <Archive className="size-3.5" />
            <span>Retire Equipment</span>
          </button>
        </div>
      ) : null}

      {/* Unretire */}
      {canManage && isRetired ? (
        <button
          onClick={() => handleAction("unretire")}
          disabled={acting !== null}
          className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50 w-full"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          {acting === "unretire" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="size-4" />
              <span>Restore Equipment</span>
            </>
          )}
        </button>
      ) : null}

      {/* ── Assign modal ── */}
      {showAssign ? (
        <AssignModal
          equipmentId={equipment.id}
          locations={locations}
          projects={projects}
          onClose={() => setShowAssign(false)}
          onSuccess={() => {
            setShowAssign(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* ── Maintenance modal ── */}
      {showMaintenance ? (
        <MaintenanceModal
          equipmentId={equipment.id}
          onClose={() => setShowMaintenance(false)}
          onSuccess={() => {
            setShowMaintenance(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* ── Retire confirmation ── */}
      {showRetire ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
          onClick={() => setShowRetire(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Retire equipment?</p>
            </div>
            <div className="p-3">
              <p className="text-[0.6875rem] mb-3" style={{ color: "var(--color-ink-500)" }}>
                {equipment.name} will be marked as retired. You can restore it later if needed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRetire(false)}
                  className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border press"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAction("retire")}
                  disabled={acting === "retire"}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
                >
                  {acting === "retire" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Archive className="size-3.5" />
                      <span>Retire</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Info row
 * ═══════════════════════════════════════════════════════════ */
function InfoRow({
  icon: Icon, label, value, mono,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-[0.5rem] border px-2.5 py-1.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <Icon className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
      <div className="min-w-0 flex-1">
        <span className="text-[0.4375rem] font-semibold uppercase block" style={{ color: "var(--color-ink-500)" }}>
          {label}
        </span>
        <span
          className={`text-[0.6875rem] font-bold truncate block ${mono ? "font-mono" : ""}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Assign modal — bottom-sheet with location + project selectors
 * ═══════════════════════════════════════════════════════════ */
function AssignModal({
  equipmentId, locations, projects, onClose, onSuccess,
}: {
  equipmentId: string;
  locations: LocationItem[];
  projects: ProjectItem[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState<null | "location" | "project">(null);

  const selectedLocation = locations.find((l) => l.id === locationId);
  const selectedProject = projects.find((p) => p.id === projectId);

  const handleSubmit = async () => {
    if (!locationId) {
      toast.error("Select a location");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/equipment-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId,
          locationId,
          projectId: projectId || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to assign");
      }
      toast.success("Equipment assigned");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
          style={{ backgroundColor: "var(--color-paper)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Assign Equipment</p>
            <button onClick={onClose} className="press">
              <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
            </button>
          </div>

          <div className="p-3 flex flex-col gap-3">
            {/* Location — tappable selector card */}
            <div>
              <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Location
              </label>
              <button
                type="button"
                onClick={() => setPicker("location")}
                className="w-full flex items-center gap-2 rounded-[0.5rem] border p-2.5 press text-left"
                style={{
                  borderColor: selectedLocation ? "var(--color-line)" : "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
                  backgroundColor: "var(--color-paper-2)",
                }}
              >
                <MapPin className="size-4 shrink-0" style={{ color: selectedLocation ? "var(--color-ink-700)" : "var(--color-signal)" }} />
                <div className="min-w-0 flex-1">
                  {selectedLocation ? (
                    <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {selectedLocation.name}
                    </p>
                  ) : (
                    <p className="text-[0.75rem] font-medium" style={{ color: "var(--color-ink-500)" }}>
                      Tap to select…
                    </p>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>

            {/* Project — tappable selector card */}
            <div>
              <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Project (optional)
              </label>
              <button
                type="button"
                onClick={() => setPicker("project")}
                className="w-full flex items-center gap-2 rounded-[0.5rem] border p-2.5 press text-left"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper-2)",
                }}
              >
                <Package className="size-4 shrink-0" style={{ color: "var(--color-ink-700)" }} />
                <div className="min-w-0 flex-1">
                  {selectedProject ? (
                    <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {selectedProject.name}
                    </p>
                  ) : (
                    <p className="text-[0.75rem] font-medium" style={{ color: "var(--color-ink-500)" }}>
                      No project linkage
                    </p>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Deployed for foundation work"
                rows={2}
                className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none resize-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Send className="size-3.5" />
                  <span>Assign</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Location picker */}
      {picker === "location" ? (
        <PickerSheet
          title="Select Location"
          items={locations.map((l) => ({ id: l.id, label: l.name, sub: l.type.replace(/_/g, " ").toLowerCase() }))}
          selectedId={locationId}
          onSelect={(id) => { setLocationId(id); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {/* Project picker */}
      {picker === "project" ? (
        <PickerSheet
          title="Select Project"
          items={[
            { id: "", label: "No project linkage", sub: "Assign to location only" },
            ...projects.map((p) => ({ id: p.id, label: p.name, sub: undefined })),
          ]}
          selectedId={projectId}
          onSelect={(id) => { setProjectId(id); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Picker sheet — searchable bottom-sheet for selecting from a list
 * ═══════════════════════════════════════════════════════════ */
function PickerSheet({
  title, items, selectedId, onSelect, onClose,
}: {
  title: string;
  items: { id: string; label: string; sub?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sub?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 60%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
        style={{ backgroundColor: "var(--color-paper)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        {/* Search */}
        <div className="p-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus
              className="w-full h-9 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
              <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>No results</p>
            </div>
          ) : (
            filtered.map((item, i) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  key={item.id || i}
                  onClick={() => onSelect(item.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 press text-left"
                  style={{
                    backgroundColor: isSelected ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)" : "transparent",
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[0.75rem] font-bold truncate"
                      style={{ color: isSelected ? "var(--color-ink-950)" : "var(--color-ink-900)" }}
                    >
                      {item.label}
                    </p>
                    {item.sub ? (
                      <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                        {item.sub}
                      </p>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <Check className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Maintenance modal — record new maintenance
 * ═══════════════════════════════════════════════════════════ */
function MaintenanceModal({
  equipmentId, onClose, onSuccess,
}: {
  equipmentId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<typeof MAINTENANCE_TYPES[number]>("SCHEDULED");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/equipment-maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId,
          type,
          cost: cost ? Number(cost) : undefined,
          vendor: vendor || undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to record maintenance");
      }
      toast.success("Maintenance recorded");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record maintenance");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
        style={{ backgroundColor: "var(--color-paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Record Maintenance</p>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          {/* Type */}
          <div>
            <label className="text-[0.4375rem] font-semibold uppercase block mb-1.5" style={{ color: "var(--color-ink-500)" }}>
              Type
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {MAINTENANCE_TYPES.map((t) => {
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className="rounded-[0.375rem] py-1.5 text-[0.5625rem] font-bold press"
                    style={
                      active
                        ? { backgroundColor: "var(--color-ink-950)", color: "#fff" }
                        : { backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)", border: "1px solid var(--color-line)" }
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cost + Vendor */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Cost (optional)
              </label>
              <div className="relative">
                <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 size-3" style={{ color: "var(--color-ink-500)" }} />
                <input
                  type="text" inputMode="decimal"
                  step="any"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-[0.375rem] border pl-6 pr-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
              </div>
            </div>
            <div>
              <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Vendor (optional)
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g. ABC Services"
                className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-medium outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Oil change + filter replacement"
              rows={2}
              className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Record</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
