"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, CheckCircle2, Search, ChevronDown, ChevronRight, CheckCheck, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyCompact } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { useSmartDefaults } from "@/lib/use-smart-defaults";
import { useNearestProject } from "@/lib/use-nearest-project";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileNoResults } from "@/components/mobile/v2/scaffold";

type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "OVERTIME" | "LEAVE" | "LATE" | "PAID_LEAVE" | "NON_PAID_LEAVE";

type EmployeeRow = {
  id: string;
  name: string;
  trade: string | null;
  dailyRate: number;
  wageType: string;
};

type ExistingAttendance = Record<string, {
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number | null;
  notes: string | null;
}>;

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string; border: string }> = {
  PRESENT: { label: "Present", color: "var(--color-go)", bg: "color-mix(in srgb, var(--color-go) 10%, transparent)", border: "color-mix(in srgb, var(--color-go) 30%, transparent)" },
  ABSENT: { label: "Absent", color: "var(--color-stop)", bg: "color-mix(in srgb, var(--color-stop) 10%, transparent)", border: "color-mix(in srgb, var(--color-stop) 30%, transparent)" },
  HALF_DAY: { label: "Half", color: "var(--color-signal-dark)", bg: "color-mix(in srgb, var(--color-signal) 12%, transparent)", border: "color-mix(in srgb, var(--color-signal) 30%, transparent)" },
  OVERTIME: { label: "OT", color: "var(--color-signal-dark)", bg: "color-mix(in srgb, var(--color-signal) 12%, transparent)", border: "color-mix(in srgb, var(--color-signal) 30%, transparent)" },
  LEAVE: { label: "Leave", color: "var(--color-ink-500)", bg: "var(--color-concrete)", border: "var(--color-line)" },
  LATE: { label: "Late", color: "var(--color-signal-dark)", bg: "color-mix(in srgb, var(--color-signal) 8%, transparent)", border: "color-mix(in srgb, var(--color-signal) 25%, transparent)" },
  PAID_LEAVE: { label: "PL", color: "var(--color-steel)", bg: "color-mix(in srgb, var(--color-steel) 10%, transparent)", border: "color-mix(in srgb, var(--color-steel) 30%, transparent)" },
  NON_PAID_LEAVE: { label: "NPL", color: "var(--color-stop)", bg: "color-mix(in srgb, var(--color-stop) 8%, transparent)", border: "color-mix(in srgb, var(--color-stop) 25%, transparent)" },
};

const ALL_STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE", "PAID_LEAVE", "NON_PAID_LEAVE"];

const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-m-label font-medium outline-none";
const inputStyle = {
  borderColor: "var(--color-line)",
  backgroundColor: "var(--color-paper)",
  color: "var(--color-ink-950)",
} as React.CSSProperties;

export function MobileAttendanceForm({
  projects,
  employees,
  existingAttendance,
}: {
  projects: { id: string; name: string }[];
  employees: EmployeeRow[];
  existingAttendance: ExistingAttendance;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const { getDefault, recordDefaults } = useSmartDefaults("attendance");
  const { nearestProjectId, nearestProjectName, distanceMeters, loading: gpsLoading, request: requestGps } = useNearestProject();
  const [fProject, setFProject] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [gpsFetching, setGpsFetching] = useState(false);

  const [records, setRecords] = useState<Record<string, { status: AttendanceStatus; checkIn: string; checkOut: string; hoursWorked: string }>>(() => {
    const init: Record<string, { status: AttendanceStatus; checkIn: string; checkOut: string; hoursWorked: string }> = {};
    for (const emp of employees) {
      const existing = existingAttendance[emp.id];
      init[emp.id] = {
        status: (existing?.status as AttendanceStatus) ?? "PRESENT",
        checkIn: existing?.checkIn ?? "",
        checkOut: existing?.checkOut ?? "",
        hoursWorked: existing?.hoursWorked ? String(existing.hoursWorked) : "",
      };
    }
    return init;
  });

  // ── Draft auto-save ──────────────────────────────────────────
  type AttendanceDraft = {
    fProject: string;
    records: Record<string, { status: AttendanceStatus; checkIn: string; checkOut: string; hoursWorked: string }>;
    gps: { lat: number; lng: number; label: string } | null;
  };

  const draftKey = `attendance:${today}`;
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<AttendanceDraft>("attendance", draftKey);
  const [draftRestored, setDraftRestored] = useState(false);

  // ── Smart defaults: pre-select last-used project if no draft ──
  useEffect(() => {
    if (!fProject && !hasDraft) {
      const lastProject = getDefault("project");
      if (lastProject && projects.some((p) => p.id === lastProject)) {
        setFProject(lastProject);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getDefault, hasDraft, projects]);

  // ── GPS auto-select: when nearest project is found, auto-select it ──
  useEffect(() => {
    if (nearestProjectId && projects.some((p) => p.id === nearestProjectId)) {
      setFProject(nearestProjectId);
      haptic(10);
      toast.success(`Auto-selected ${nearestProjectName} (${Math.round(distanceMeters ?? 0)}m away)`);
    }
  }, [nearestProjectId, nearestProjectName, distanceMeters, projects]);

  // Auto-save form state (debounced via the hook's internal timer)
  useEffect(() => {
    // Only save if the user has made changes (project selected or non-default records)
    const hasChanges = fProject !== "" || Object.values(records).some((r) => r.status !== "PRESENT" || r.checkIn || r.checkOut || r.hoursWorked);
    if (hasChanges) {
      saveDraft({ fProject, records, gps });
    }
  }, [fProject, records, gps, saveDraft]);

  function restoreDraft() {
    if (!draft) return;
    if (draft.fProject) setFProject(draft.fProject);
    if (draft.records) setRecords(draft.records);
    if (draft.gps) setGps(draft.gps);
    toast.success("Draft restored");
  }

  const filteredEmployees = useMemo(() => {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter((e) => e.name.toLowerCase().includes(q) || (e.trade?.toLowerCase().includes(q) ?? false));
  }, [employees, search]);

  const stats = useMemo(() => {
    let present = 0, absent = 0, halfDay = 0, overtime = 0, leave = 0, late = 0, paidLeave = 0, nonPaidLeave = 0;
    for (const emp of employees) {
      const r = records[emp.id];
      if (!r) continue;
      if (r.status === "PRESENT") present++;
      else if (r.status === "ABSENT") absent++;
      else if (r.status === "HALF_DAY") halfDay++;
      else if (r.status === "OVERTIME") overtime++;
      else if (r.status === "LEAVE") leave++;
      else if (r.status === "LATE") late++;
      else if (r.status === "PAID_LEAVE") paidLeave++;
      else if (r.status === "NON_PAID_LEAVE") nonPaidLeave++;
    }
    return { present, absent, halfDay, overtime, leave, late, paidLeave, nonPaidLeave, total: employees.length };
  }, [records, employees]);

  function setStatus(employeeId: string, status: AttendanceStatus) {
    haptic(10);
    setRecords((prev) => {
      const existing = prev[employeeId];
      if (!existing) return prev;
      return { ...prev, [employeeId]: { ...existing, status } };
    });
  }

  function markAllPresent() {
    haptic(20);
    setRecords((prev) => {
      const next: Record<string, { status: AttendanceStatus; checkIn: string; checkOut: string; hoursWorked: string }> = {};
      for (const emp of employees) {
        const existing = prev[emp.id];
        if (existing && existing.status !== "PRESENT") {
          next[emp.id] = { ...existing, status: "PRESENT" as AttendanceStatus };
        } else if (existing) {
          next[emp.id] = existing;
        }
      }
      return next;
    });
    toast.success(`Marked ${stats.absent + stats.halfDay + stats.overtime + stats.leave + stats.late + stats.paidLeave + stats.nonPaidLeave} workers as present`);
  }

  function updateRecord(employeeId: string, field: string, value: string) {
    setRecords((prev) => {
      const existing = prev[employeeId];
      if (!existing) return prev;
      return { ...prev, [employeeId]: { ...existing, [field]: value } };
    });
  }

  async function captureGps() {
    if (!navigator.geolocation) {
      toast.error("GPS not available on this device");
      return;
    }
    setGpsFetching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: `Site check-in (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`,
        });
        setGpsFetching(false);
        haptic(20);
        toast.success("GPS location captured");
      },
      (err) => {
        setGpsFetching(false);
        haptic([50, 20, 50]);
        toast.error(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function submit() {
    const recordList = employees.map((emp) => {
      const r = records[emp.id] ?? { status: "PRESENT" as AttendanceStatus, checkIn: "", checkOut: "", hoursWorked: "" };
      const hrs = r.hoursWorked ? Number(r.hoursWorked) : null;
      return {
        employeeId: emp.id,
        status: r.status,
        checkIn: r.checkIn || null,
        checkOut: r.checkOut || null,
        hoursWorked: hrs != null && !isNaN(hrs) ? Math.min(Math.max(hrs, 0), 24) : null,
        // Attach GPS coordinates to all records from this submission
        checkInLat: gps?.lat ?? null,
        checkInLng: gps?.lng ?? null,
        checkInLocation: gps?.label ?? null,
      };
    });

    setSubmitting(true);
    haptic(10);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, projectId: fProject || null, records: recordList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save attendance");
      haptic([10, 40, 80]);
      toast.success(`Attendance saved for ${employees.length} workers`);
      // Record smart defaults for next time
      if (fProject) recordDefaults({ project: fProject });
      clearDraft();
      router.push("/m/site");
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-32">
      {/* ── Draft restoration banner ─────────────────────────── */}
      {hasDraft && !draftRestored && (
        <div className="pt-3">
          <DraftBanner
            formName="Attendance"
            updatedAt={draftUpdatedAt}
            onRestore={() => { restoreDraft(); setDraftRestored(true); }}
            onDiscard={() => { clearDraft(); setDraftRestored(true); }}
          />
        </div>
      )}

      {/* ── Summary band ────────────────────────────────────── */}
      <div
        className="flex items-center justify-between rounded-[0.625rem] border p-2.5 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center gap-2 text-m-caption font-semibold overflow-x-auto scrollbar-hide">
          <span className="flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-go)" }} title="Present">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-go)" }} />
            {stats.present} P
          </span>
          {stats.late > 0 && (
            <span className="flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-signal-dark)" }} title="Late">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-signal)" }} />
              {stats.late} L
            </span>
          )}
          <span className="flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-stop)" }} title="Absent">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-stop)" }} />
            {stats.absent} A
          </span>
          {stats.halfDay > 0 && (
            <span className="flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-signal-dark)" }} title="Half Day">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-signal)" }} />
              {stats.halfDay} H
            </span>
          )}
          {stats.overtime > 0 && (
            <span className="flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-signal-dark)" }} title="Overtime">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-signal)" }} />
              {stats.overtime} OT
            </span>
          )}
          {stats.leave > 0 && (
            <span className="flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-ink-500)" }} title="Leave">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-ink-400)" }} />
              {stats.leave} L
            </span>
          )}
          {stats.paidLeave > 0 && (
            <span className="flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-steel)" }} title="Paid Leave">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-steel)" }} />
              {stats.paidLeave} PL
            </span>
          )}
          {stats.nonPaidLeave > 0 && (
            <span className="flex items-center gap-0.5 shrink-0" style={{ color: "var(--color-stop)" }} title="Non-Paid Leave">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--color-stop)" }} />
              {stats.nonPaidLeave} NPL
            </span>
          )}
        </div>
        <span className="text-m-caption font-bold tabular-nums shrink-0 ml-2" style={{ color: "var(--color-ink-500)" }}>
          {stats.total} total
        </span>
      </div>

      {/* ── Project + Search ────────────────────────────────── */}
      <div className="flex flex-col gap-2 mb-3">
        <div>
          <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Project (optional)
          </label>
          <div className="flex gap-1.5">
            <select
              value={fProject}
              onChange={(e) => setFProject(e.target.value)}
              className="flex-1 h-10 rounded-[0.5rem] border px-3 text-m-section outline-none"
              style={inputStyle}
            >
              <option value="">All workers</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button
              type="button"
              onClick={requestGps}
              disabled={gpsLoading}
              className="shrink-0 grid place-items-center w-10 h-10 rounded-[0.5rem] border text-m-body press disabled:opacity-50"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
              title="Use my location to auto-select project"
            >
              {gpsLoading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workers…"
            className="w-full h-10 rounded-[0.5rem] border pl-8 pr-8 text-m-section outline-none"
            style={{
              borderColor: search ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-m-body press"
              aria-label="Clear"
            >
              <X className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
            </button>
          )}
        </div>
        {/* GPS capture for site check-in */}
        <button
          type="button"
          onClick={captureGps}
          disabled={gpsFetching}
          className="flex w-full items-center justify-center gap-2 rounded-[0.5rem] border-2 py-2.5 text-m-body font-bold text-m-body press disabled:opacity-50"
          style={
            gps
              ? { borderColor: "color-mix(in srgb, var(--color-go) 40%, transparent)", backgroundColor: "color-mix(in srgb, var(--color-go) 8%, transparent)", color: "var(--color-go)" }
              : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }
          }
        >
          {gpsFetching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MapPin className="size-3.5" style={{ color: gps ? "var(--color-go)" : "var(--color-ink-500)" }} />
          )}
          {gps ? (
            <span className="tabular-nums">GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>
          ) : (
            <span>Capture GPS location</span>
          )}
        </button>
        {/* Quick action: mark all present */}
        {stats.present < stats.total && (
          <button
            onClick={markAllPresent}
            className="flex w-full items-center justify-center gap-2 rounded-[0.5rem] border-2 py-2.5 text-m-body font-bold text-m-body press"
            style={{
              borderColor: "color-mix(in srgb, var(--color-go) 30%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--color-go) 5%, transparent)",
              color: "var(--color-go)",
            }}
          >
            <CheckCheck className="size-3.5" />
            Mark all present
          </button>
        )}
      </div>

      {/* ── Worker list ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {filteredEmployees.map((emp) => {
          const r = records[emp.id] ?? { status: "PRESENT" as AttendanceStatus, checkIn: "", checkOut: "", hoursWorked: "" };
          const cfg = STATUS_CONFIG[r.status];
          const isOpen = expandedId === emp.id;
          return (
            <div
              key={emp.id}
              className="rounded-[0.625rem] border p-2.5"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              {/* Worker row — name + status badge */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => { setExpandedId(isOpen ? null : emp.id); haptic(10); }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-m-body press"
                  >
                    {isOpen ? <ChevronDown className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} /> : <ChevronRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />}
                    <div className="min-w-0">
                      <div className="truncate text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>{emp.name}</div>
                      <div className="truncate text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                        {emp.trade ?? "General"} · {emp.wageType === "DAILY" ? `${formatCurrencyCompact(emp.dailyRate)}/day` : emp.wageType === "MONTHLY" ? "Monthly" : "Fixed"}
                      </div>
                    </div>
                  </button>
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-m-caption font-bold"
                    style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
                  >
                    {cfg.label}
                  </span>
                </div>

                {/* Status chips — always visible, one tap to change */}
                <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
                  <div className="flex gap-1.5 w-max items-center">
                    {ALL_STATUSES.map((s) => {
                      const sCfg = STATUS_CONFIG[s];
                      const active = r.status === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setStatus(emp.id, s)}
                          className="shrink-0 rounded-full border px-2.5 py-1 text-m-caption font-bold text-m-body press"
                          style={
                            active
                              ? { color: sCfg.color, backgroundColor: sCfg.bg, borderColor: sCfg.border }
                              : { color: "var(--color-ink-500)", backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }
                          }
                        >
                          {sCfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Expanded detail — check in/out, hours */}
                {isOpen && (
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-m-caption font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>In</label>
                      <input
                        type="time"
                        value={r.checkIn}
                        onChange={(e) => updateRecord(emp.id, "checkIn", e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-m-caption font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Out</label>
                      <input
                        type="time"
                        value={r.checkOut}
                        onChange={(e) => updateRecord(emp.id, "checkOut", e.target.value)}
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-m-caption font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Hrs</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        enterKeyHint="done"
                        placeholder="8"
                        min={0}
                        max={24}
                        step="0.5"
                        value={r.hoursWorked}
                        onChange={(e) => updateRecord(emp.id, "hoursWorked", e.target.value)}
                        className={`${inputClass} tabular-nums`}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filteredEmployees.length === 0 && (
          search ? (
            <MobileNoResults query={search} />
          ) : (
            <MobileEmptyState
              icon={Users}
              title="No workers yet"
              description="Add workers in the HR module to start marking attendance."
              size="compact"
            />
          )
        )}
      </div>

      {/* ── Sticky save bar ─────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2">
          <button
            onClick={submit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {submitting ? "Saving…" : `Save Attendance (${employees.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
