"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Users, CheckCircle2, Search, ChevronDown, ChevronRight, CheckCheck, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input, Select, Label } from "@/components/ui/input";

type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "OVERTIME" | "LEAVE";

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

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; cls: string; dot: string }> = {
  PRESENT: { label: "Present", cls: "bg-success/10 text-success border-success/30", dot: "bg-success" },
  ABSENT: { label: "Absent", cls: "bg-danger/10 text-danger border-danger/30", dot: "bg-danger" },
  HALF_DAY: { label: "Half", cls: "bg-warning/10 text-warning border-warning/30", dot: "bg-warning" },
  OVERTIME: { label: "OT", cls: "bg-info/10 text-info border-info/30", dot: "bg-info" },
  LEAVE: { label: "Leave", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

const ALL_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE"];

function haptic(ms: number = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}

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
  const [fProject, setFProject] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

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

  const filteredEmployees = useMemo(() => {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter((e) => e.name.toLowerCase().includes(q) || (e.trade?.toLowerCase().includes(q) ?? false));
  }, [employees, search]);

  const stats = useMemo(() => {
    let present = 0, absent = 0, halfDay = 0, overtime = 0, leave = 0;
    for (const emp of employees) {
      const r = records[emp.id];
      if (!r) continue;
      if (r.status === "PRESENT") present++;
      else if (r.status === "ABSENT") absent++;
      else if (r.status === "HALF_DAY") halfDay++;
      else if (r.status === "OVERTIME") overtime++;
      else if (r.status === "LEAVE") leave++;
    }
    return { present, absent, halfDay, overtime, leave, total: employees.length };
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
    toast.success(`Marked ${stats.absent + stats.halfDay + stats.overtime + stats.leave} workers as present`);
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
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: `Site check-in (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`,
        });
        setGpsLoading(false);
        toast.success("GPS location captured");
      },
      (err) => {
        setGpsLoading(false);
        toast.error(`GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function submit() {
    const recordList = employees.map((emp) => {
      const r = records[emp.id] ?? { status: "PRESENT" as AttendanceStatus, checkIn: "", checkOut: "", hoursWorked: "" };
      return {
        employeeId: emp.id,
        status: r.status,
        checkIn: r.checkIn || null,
        checkOut: r.checkOut || null,
        hoursWorked: r.hoursWorked ? Number(r.hoursWorked) : null,
        // Attach GPS coordinates to all records from this submission
        checkInLat: gps?.lat ?? null,
        checkInLng: gps?.lng ?? null,
        checkInLocation: gps?.label ?? null,
      };
    });

    setSubmitting(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, projectId: fProject || null, records: recordList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save attendance");
      haptic(30);
      toast.success(`Attendance saved for ${employees.length} workers`);
      router.push("/m/site");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-24">
      {/* ── Summary band ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70 bg-card">
        <div className="flex items-center gap-3 text-caption">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />{stats.present}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger" />{stats.absent}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" />{stats.halfDay}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-info" />{stats.overtime}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" />{stats.leave}</span>
        </div>
        <span className="text-caption text-muted-foreground">{stats.total} total</span>
      </div>

      {/* ── Project + Search ────────────────────────────────── */}
      <div className="space-y-2 px-3 py-2.5">
        <div>
          <Label>Project (optional)</Label>
          <Select value={fProject} onChange={(e) => setFProject(e.target.value)}>
            <option value="">All workers</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workers…"
            className="pl-9"
            inputMode="search"
            enterKeyHint="search"
          />
        </div>
        {/* GPS capture for site check-in */}
        <button
          type="button"
          onClick={captureGps}
          disabled={gpsLoading}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-body font-medium transition-colors",
            gps
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-card text-foreground",
          )}
        >
          {gpsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className={cn("h-4 w-4", gps && "text-success")} />
          )}
          {gps ? (
            <span>GPS captured: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>
          ) : (
            <span>Capture GPS location</span>
          )}
        </button>
        {/* Quick action: mark all present */}
        {stats.present < stats.total && (
          <button
            onClick={markAllPresent}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-2.5 text-body font-medium text-success transition-colors active:scale-[0.99]"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all present
          </button>
        )}
      </div>

      {/* ── Worker list ─────────────────────────────────────── */}
      <div className="divide-y divide-border/30">
        {filteredEmployees.map((emp) => {
          const r = records[emp.id] ?? { status: "PRESENT" as AttendanceStatus, checkIn: "", checkOut: "", hoursWorked: "" };
          const cfg = STATUS_CONFIG[r.status];
          const isOpen = expandedId === emp.id;
          return (
            <div key={emp.id} className="bg-card">
              {/* Worker row — name + status chips */}
              <div className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : emp.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/40" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
                    <div className="min-w-0">
                      <div className="truncate text-body font-medium text-foreground">{emp.name}</div>
                      <div className="truncate text-caption text-muted-foreground">
                        {emp.trade ?? "General"} · {emp.wageType === "DAILY" ? `₹${emp.dailyRate}/day` : emp.wageType === "MONTHLY" ? "Monthly" : "Fixed"}
                      </div>
                    </div>
                  </button>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-caption font-medium", cfg.cls)}>
                    {cfg.label}
                  </span>
                </div>

                {/* Status chips — always visible, one tap to change */}
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {ALL_STATUSES.map((s) => {
                    const sCfg = STATUS_CONFIG[s];
                    const active = r.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(emp.id, s)}
                        className={cn(
                          "shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium transition-all active:scale-95",
                          active ? sCfg.cls : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        {sCfg.label}
                      </button>
                    );
                  })}
                </div>

                {/* Expanded detail — check in/out, hours */}
                {isOpen && (
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-caption">In</Label>
                      <Input
                        type="time"
                        value={r.checkIn}
                        onChange={(e) => updateRecord(emp.id, "checkIn", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-caption">Out</Label>
                      <Input
                        type="time"
                        value={r.checkOut}
                        onChange={(e) => updateRecord(emp.id, "checkOut", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-caption">Hrs</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        enterKeyHint="done"
                        placeholder="8"
                        value={r.hoursWorked}
                        onChange={(e) => updateRecord(emp.id, "hoursWorked", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filteredEmployees.length === 0 && (
          <div className="py-8 text-center text-meta text-muted-foreground">
            <Users className="mx-auto mb-2 h-7 w-7 opacity-50" />
            No workers found
          </div>
        )}
      </div>

      {/* ── Sticky save bar — thumb zone ────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto max-w-md">
          <button
            onClick={submit}
            disabled={submitting}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-body font-semibold text-background transition-colors active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {submitting ? "Saving…" : `Save Attendance (${employees.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
