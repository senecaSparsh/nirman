"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewEmployeeDialog } from "@/app/m/hr/employees/MobileNewEmployeeDialog";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

type LeaveType =
  | "CASUAL"
  | "SICK"
  | "EARNED"
  | "UNPAID"
  | "MATERNITY"
  | "PATERNITY";

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

/**
 * MobileNewLeaveForm — form content for recording a leave.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * leaves page, or wrapped by <MobileNewLeaveDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewEmployeeForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 */
export function MobileNewLeaveForm({
  onClose,
  employees,
}: {
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

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };
  const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
  const sectionTitleStyle = { color: "var(--color-ink-950)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Details
        </p>
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <MobileSelectWithCreate
            label="Employee"
            required
            value={form.employeeId}
            onChange={(v) => set("employeeId", v)}
            placeholder="— Select —"
            options={employees.map((emp) => ({
              value: emp.id,
              label: emp.trade ? `${emp.name} (${emp.trade})` : emp.name,
            }))}
            inputClass={inputClass}
            inputStyle={inputStyle}
            labelClass={labelClass}
            labelStyle={labelStyle}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewEmployeeDialog
                open={open}
                onClose={onClose}
                projects={[]}
                stockLocations={[]}
                onCreated={(e) => onCreated(e.id, e.name)}
              />
            )}
          />
          <div className="pl-2">
            <EnumSelect
              label="Leave Type"
              value={form.type}
              onChange={(v) => set("type", v as LeaveType)}
              options={(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((t) => ({
                value: t,
                label: LEAVE_TYPE_LABELS[t],
              }))}
            />
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Dates
        </p>
        <div
          className="grid grid-cols-2 gap-2 divide-x"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div>
            <label className={labelClass} style={labelStyle}>
              Start Date <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>
              End Date <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Notes
        </p>
        <div>
          <label className={labelClass} style={labelStyle}>
            Reason (optional)
          </label>
          <textarea
            value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
            rows={2}
            placeholder="e.g. Family emergency"
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={inputStyle}
          />
        </div>
      </div>

      {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {saving ? "Saving…" : "Record Leave"}
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * MobileNewLeaveDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewLeaveForm> in <MobileFabModal> instead —
 * that gives the spring-from-FAB animation matching the materials and
 * employees pages.
 */
export function MobileNewLeaveDialog({
  open,
  onClose,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  employees: EmployeeOption[];
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Leave">
      <MobileNewLeaveForm onClose={onClose} employees={employees} />
    </MobileDialog>
  );
}
