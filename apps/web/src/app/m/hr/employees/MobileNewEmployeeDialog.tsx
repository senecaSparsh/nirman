"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type WageType = "DAILY" | "MONTHLY" | "FIXED";

const WAGE_TYPE_LABELS: Record<WageType, string> = {
  DAILY: "Daily Wage",
  MONTHLY: "Monthly Salary",
  FIXED: "Fixed",
};

interface ProjectOption {
  id: string;
  name: string;
}

interface StockLocationOption {
  id: string;
  name: string;
  type: string;
}

interface FormState {
  name: string;
  trade: string;
  designation: string;
  phone: string;
  email: string;
  wageType: WageType;
  dailyRate: string;
  monthlySalary: string;
  joinDate: string;
  activeProjectId: string;
  hierarchyLevel: string;
  reportingLocationId: string;
}

/**
 * MobileNewEmployeeDialog — bottom-sheet form for adding an employee
 * from the mobile surface. Mirrors the desktop employees-view's API
 * contract (POST /api/employees).
 */
export function MobileNewEmployeeDialog({
  open,
  onClose,
  projects,
  stockLocations,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  onCreated?: (employee: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    trade: "",
    designation: "",
    phone: "",
    email: "",
    wageType: "DAILY",
    dailyRate: "",
    monthlySalary: "",
    joinDate: "",
    activeProjectId: "",
    hierarchyLevel: "",
    reportingLocationId: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Employee name is required");
      return;
    }
    const dailyRate = form.dailyRate === "" ? 0 : Number(form.dailyRate);
    const monthlySalary = form.wageType !== "DAILY" && form.monthlySalary !== "" ? Number(form.monthlySalary) : null;
    const hierarchyLevel = form.hierarchyLevel ? Number(form.hierarchyLevel) : null;
    if (dailyRate < 0) { toast.error("Daily rate cannot be negative"); return; }
    if (monthlySalary !== null && monthlySalary < 0) { toast.error("Monthly salary cannot be negative"); return; }
    if (hierarchyLevel !== null && (hierarchyLevel < 1 || hierarchyLevel > 6)) { toast.error("Hierarchy level must be 1–6"); return; }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          trade: form.trade.trim() || null,
          designation: form.designation.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          wageType: form.wageType,
          dailyRate,
          monthlySalary,
          joinDate: form.joinDate || null,
          activeProjectId: form.activeProjectId || null,
          hierarchyLevel,
          reportingLocationId: form.reportingLocationId || null,
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add employee");
      haptic([10, 40, 80]);
      toast.success("Employee added");
      if (onCreated) {
        onCreated({ id: data.id, name: data.name });
      }
      onClose();
      if (!onCreated) router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <span
              className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <UserPlus
                className="size-3.5"
                style={{ color: "var(--color-ink-600)" }}
              />
            </span>
            <p
              className="text-m-section font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              New Employee
            </p>
          </div>
          <button
            onClick={onClose}
            className="touch grid place-items-center rounded-[0.375rem] text-m-body press"
            style={{ color: "var(--color-ink-700)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              autoFocus
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Trade + Designation */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Trade / Skill
              </label>
              <input
                type="text"
                value={form.trade}
                onChange={(e) => set("trade", e.target.value)}
                placeholder="e.g. Mason"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Designation
              </label>
              <input
                type="text"
                value={form.designation}
                onChange={(e) => set("designation", e.target.value)}
                placeholder="e.g. Site Supervisor"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Hierarchy Level (H1-H6) */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Hierarchy Level
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { value: "", label: "Unassigned" },
                { value: "1", label: "H1 — Management" },
                { value: "2", label: "H2 — Manager" },
                { value: "3", label: "H3 — Engineer" },
                { value: "4", label: "H4 — Supervisor" },
                { value: "5", label: "H5 — Skilled" },
                { value: "6", label: "H6 — Labor" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { set("hierarchyLevel", opt.value); haptic(10); }}
                  className="rounded-[0.375rem] border px-2.5 py-1.5 text-m-caption font-bold text-m-body press"
                  style={{
                    borderColor: form.hierarchyLevel === opt.value ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: form.hierarchyLevel === opt.value ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: form.hierarchyLevel === opt.value ? "var(--color-paper)" : "var(--color-ink-500)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="98765 43210"
                enterKeyHint="next"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="employee@email.com"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Wage Type — horizontal 3-col */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Wage Type
            </label>
            <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              {(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    set("wageType", w);
                    haptic(10);
                  }}
                  className="h-9 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press"
                  style={{
                    borderColor:
                      form.wageType === w
                        ? "var(--color-ink-950)"
                        : "var(--color-line)",
                    backgroundColor:
                      form.wageType === w
                        ? "var(--color-ink-950)"
                        : "var(--color-paper)",
                    color:
                      form.wageType === w
                        ? "var(--color-paper)"
                        : "var(--color-ink-500)",
                  }}
                >
                  {WAGE_TYPE_LABELS[w]}
                </button>
              ))}
            </div>
          </div>

          {/* Rate / Salary (conditional) */}
          {form.wageType === "DAILY" ? (
            <div>
              <label className={labelClass} style={labelStyle}>
                Daily Rate (₹)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.dailyRate}
                onChange={(e) => set("dailyRate", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
          ) : (
            <div>
              <label className={labelClass} style={labelStyle}>
                Monthly Salary (₹)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.monthlySalary}
                onChange={(e) => set("monthlySalary", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
          )}

          {/* Join Date + Project */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Join Date
              </label>
              <input
                type="date"
                value={form.joinDate}
                onChange={(e) => set("joinDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Active Project
              </label>
              <select
                value={form.activeProjectId}
                onChange={(e) => set("activeProjectId", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reporting Location (geo-fence attendance) */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Reporting Location
            </label>
            <select
              value={form.reportingLocationId}
              onChange={(e) => set("reportingLocationId", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— None (manual attendance) —</option>
              {stockLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-700)" }}>
              Auto-marks PRESENT when employee enters this location&apos;s geo-fence.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 ">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-700)",
                backgroundColor: "var(--color-paper)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Adding…" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
