"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User, Phone, Mail, Briefcase, IndianRupee, Calendar, Clock,
  Pencil, X, Loader2,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { toast } from "sonner";

type WageType = "DAILY" | "MONTHLY" | "FIXED";

const WAGE_TYPE_LABELS: Record<WageType, string> = {
  DAILY: "Daily Wage",
  MONTHLY: "Monthly Salary",
  FIXED: "Fixed Contract",
};

interface AttendanceItem {
  id: string;
  date: string;
  status: string;
}

interface EmployeeData {
  id: string;
  name: string;
  trade: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  wageType: WageType;
  dailyRate: number | null;
  monthlySalary: number | null;
  joinDate: string | null;
  hierarchyLevel: number | null;
  crewName: string | null;
  activeProjectName: string | null;
  attendances: AttendanceItem[];
}

interface ProjectOption { id: string; name: string; }
interface StockLocationOption { id: string; name: string; }

export function MobileEmployeeDetailClient({
  employee,
  canManage,
  notFound,
  projects,
  stockLocations,
}: {
  employee?: EmployeeData;
  canManage: boolean;
  notFound?: boolean;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);

  if (notFound || !employee) {
    return <MobileEmptyState icon={User} title="Employee not found" />;
  }

  const presentDays = employee.attendances.filter((a) => a.status === "PRESENT").length;
  const totalDays = employee.attendances.length;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {employee.name}
          </p>
          {employee.designation ? (
            <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
              {employee.designation}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] press"
            style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>

      <MobileSectionTitle>Contact</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        {employee.phone && <MobileRow icon={Phone} title="Phone" meta={employee.phone} />}
        {employee.email && <MobileRow icon={Mail} title="Email" meta={employee.email} />}
        {employee.trade && <MobileRow icon={Briefcase} title="Trade" meta={employee.trade} />}
        {employee.hierarchyLevel != null && (
          <MobileRow
            icon={Briefcase}
            title="Hierarchy"
            meta={`H${employee.hierarchyLevel} — ${["Management", "Manager", "Engineer", "Supervisor", "Skilled", "Labor"][employee.hierarchyLevel - 1] ?? "Level " + employee.hierarchyLevel}`}
          />
        )}
        {employee.crewName && (
          <MobileRow icon={Briefcase} title="Crew" meta={employee.crewName} />
        )}
        {employee.activeProjectName && (
          <MobileRow icon={Briefcase} title="Project" meta={employee.activeProjectName} />
        )}
        {employee.joinDate && (
          <MobileRow icon={Calendar} title="Join Date" meta={formatDate(employee.joinDate)} />
        )}
      </div>

      <MobileSectionTitle>Salary</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard
          label={employee.wageType === "DAILY" ? "Daily Rate" : "Monthly Salary"}
          value={formatCurrency(employee.wageType === "DAILY" ? (employee.dailyRate ?? 0) : (employee.monthlySalary ?? 0))}
          icon={IndianRupee}
          tone="signal"
        />
        <MobileStatCard
          label="Attendance"
          value={`${presentDays}/${totalDays}`}
          icon={Clock}
        />
      </div>

      {employee.attendances.length > 0 && (
        <>
          <MobileSectionTitle>Recent Attendance</MobileSectionTitle>
          <div className="flex flex-col gap-2.5">
            {employee.attendances.map((a) => (
              <MobileRow
                key={a.id}
                icon={Calendar}
                title={formatDate(a.date)}
                subtitle={a.status}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Edit sheet ── */}
      {showEdit ? (
        <EmployeeEditSheet
          employee={employee}
          projects={projects}
          stockLocations={stockLocations}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* ─── Edit sheet ─── */
function EmployeeEditSheet({
  employee,
  projects,
  stockLocations,
  onClose,
  onSaved,
}: {
  employee: EmployeeData;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [trade, setTrade] = useState(employee.trade ?? "");
  const [designation, setDesignation] = useState(employee.designation ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [email, setEmail] = useState(employee.email ?? "");
  const [wageType, setWageType] = useState<WageType>(employee.wageType);
  const [dailyRate, setDailyRate] = useState(employee.dailyRate != null ? String(employee.dailyRate) : "");
  const [monthlySalary, setMonthlySalary] = useState(employee.monthlySalary != null ? String(employee.monthlySalary) : "");
  const [joinDate, setJoinDate] = useState(employee.joinDate ? employee.joinDate.split("T")[0] : "");
  const [activeProjectId, setActiveProjectId] = useState("");
  const [hierarchyLevel, setHierarchyLevel] = useState(employee.hierarchyLevel != null ? String(employee.hierarchyLevel) : "");
  const [reportingLocationId, setReportingLocationId] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade: trade.trim() || null,
          designation: designation.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          wageType,
          dailyRate: wageType === "DAILY" && dailyRate ? Number(dailyRate) : null,
          monthlySalary: wageType !== "DAILY" && monthlySalary ? Number(monthlySalary) : null,
          joinDate: joinDate || null,
          activeProjectId: activeProjectId || null,
          hierarchyLevel: hierarchyLevel ? Number(hierarchyLevel) : null,
          reportingLocationId: reportingLocationId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Employee updated");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-[1rem] max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
        </div>
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Edit Employee
          </p>
          <button onClick={onClose} className="press p-1">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>
        <div className="px-3 pb-4 flex flex-col gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>Trade</label>
              <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Mason" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Designation</label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Site Engineer" className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" inputMode="tel" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firm.com" className={inputClass} style={inputStyle} />
            </div>
          </div>

          {/* Wage type */}
          <div>
            <label className={labelClass} style={labelStyle}>Wage Type</label>
            <div className="flex gap-1.5">
              {(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWageType(w)}
                  className="flex-1 h-9 rounded-[0.5rem] border-2 text-[0.5625rem] font-bold press"
                  style={{
                    borderColor: wageType === w ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: wageType === w ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: wageType === w ? "var(--color-paper)" : "var(--color-ink-500)",
                  }}
                >
                  {WAGE_TYPE_LABELS[w]}
                </button>
              ))}
            </div>
          </div>

          {/* Rate / Salary */}
          {wageType === "DAILY" ? (
            <div>
              <label className={labelClass} style={labelStyle}>Daily Rate (₹)</label>
              <input type="number" min="0" step="any" inputMode="numeric" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
            </div>
          ) : (
            <div>
              <label className={labelClass} style={labelStyle}>Monthly Salary (₹)</label>
              <input type="number" min="0" step="any" inputMode="numeric" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>Join Date</label>
              <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Hierarchy Level</label>
              <select value={hierarchyLevel} onChange={(e) => setHierarchyLevel(e.target.value)} className={inputClass} style={inputStyle}>
                <option value="">— None —</option>
                <option value="1">H1 — Management</option>
                <option value="2">H2 — Manager</option>
                <option value="3">H3 — Engineer</option>
                <option value="4">H4 — Supervisor</option>
                <option value="5">H5 — Skilled</option>
                <option value="6">H6 — Labor</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass} style={labelStyle}>Active Project</label>
            <select value={activeProjectId} onChange={(e) => setActiveProjectId(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} style={labelStyle}>Reporting Location</label>
            <select value={reportingLocationId} onChange={(e) => setReportingLocationId(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">— None —</option>
              {stockLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press flex items-center justify-center gap-1"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: saving || !name.trim() ? 0.5 : 1 }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
