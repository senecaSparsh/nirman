"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewEmployeeDialog } from "@/app/m/hr/employees/MobileNewEmployeeDialog";

type LeaveType = "CASUAL" | "SICK" | "EARNED" | "UNPAID" | "MATERNITY" | "PATERNITY";

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  CASUAL: "Casual",
  SICK: "Sick",
  EARNED: "Earned",
  UNPAID: "Unpaid",
  MATERNITY: "Maternity",
  PATERNITY: "Paternity",
};

interface EmployeeOption {
  id: string;
  name: string;
  trade: string | null;
}

interface FormState {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

export function MobileNewLeaveDialog({
  open,
  onClose,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  employees: EmployeeOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    employeeId: "",
    type: "CASUAL",
    startDate: "",
    endDate: "",
    reason: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId) {
      toast.error("Please select an employee");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      toast.error("End date cannot be before start date");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId,
          type: form.type,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create leave");
      haptic([10, 40, 80]);
      toast.success("Leave recorded");
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
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-[0.375rem]" style={{ backgroundColor: "var(--color-concrete)" }}>
              <CalendarDays className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Record Leave</p>
          </div>
          <button onClick={onClose} className="grid place-items-center size-7 rounded-[0.375rem] press" style={{ color: "var(--color-ink-500)" }} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Employee */}
          <MobileSelectWithCreate
            label="Employee"
            required
            value={form.employeeId}
            onChange={(v) => set("employeeId", v)}
            placeholder="— Select employee —"
            options={employees.map((emp) => ({ value: emp.id, label: emp.trade ? `${emp.name} (${emp.trade})` : emp.name }))}
            inputClass={inputClass}
            inputStyle={inputStyle}
            labelClass={labelClass}
            labelStyle={labelStyle}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewEmployeeDialog open={open} onClose={onClose} projects={[]} onCreated={(e) => onCreated(e.id, e.name)} />
            )}
          />

          {/* Leave Type */}
          <div>
            <label className={labelClass} style={labelStyle}>Leave Type</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { set("type", t); haptic(10); }}
                  className="h-8 px-2.5 rounded-[0.375rem] text-[0.5625rem] font-semibold press"
                  style={{
                    color: form.type === t ? "#fff" : "var(--color-ink-500)",
                    backgroundColor: form.type === t ? "var(--color-ink-950)" : "var(--color-concrete)",
                  }}
                >
                  {LEAVE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                Start Date <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                End Date <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputClass} style={inputStyle} />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className={labelClass} style={labelStyle}>Reason (optional)</label>
            <textarea
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              rows={2}
              placeholder="e.g. Family emergency"
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none"
              style={inputStyle}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Record Leave"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
