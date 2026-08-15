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
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
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
          dailyRate: form.dailyRate === "" ? 0 : Number(form.dailyRate),
          monthlySalary: form.wageType !== "DAILY" && form.monthlySalary !== "" ? Number(form.monthlySalary) : null,
          joinDate: form.joinDate || null,
          activeProjectId: form.activeProjectId || null,
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add employee");
      haptic([10, 40, 80]);
      toast.success("Employee added");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <UserPlus className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              New Employee
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center size-7 rounded-[0.375rem] press"
            style={{ color: "var(--color-ink-500)" }}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Trade / Skill</label>
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
              <label className={labelClass} style={labelStyle}>Designation</label>
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

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="98765 43210"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Email</label>
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

          {/* Wage Type */}
          <div>
            <label className={labelClass} style={labelStyle}>Wage Type</label>
            <div className="flex gap-2">
              {(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => { set("wageType", w); haptic(10); }}
                  className="flex-1 h-10 rounded-[0.5rem] border-2 text-[0.6875rem] font-bold press"
                  style={{
                    borderColor: form.wageType === w ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: form.wageType === w ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: form.wageType === w ? "#fff" : "var(--color-ink-500)",
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
              <label className={labelClass} style={labelStyle}>Daily Rate (₹)</label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.dailyRate}
                onChange={(e) => set("dailyRate", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          ) : (
            <div>
              <label className={labelClass} style={labelStyle}>Monthly Salary (₹)</label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.monthlySalary}
                onChange={(e) => set("monthlySalary", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          )}

          {/* Join Date + Project */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Join Date</label>
              <input
                type="date"
                value={form.joinDate}
                onChange={(e) => set("joinDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Active Project</label>
              <select
                value={form.activeProjectId}
                onChange={(e) => set("activeProjectId", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-500)",
                backgroundColor: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "#fff",
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
