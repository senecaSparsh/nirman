"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, CalendarCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface FormState {
  month: string;
  year: string;
}

/**
 * MobileGeneratePayrollDialog — bottom-sheet form for generating a payroll
 * period from the mobile surface. Submits POST /api/payroll.
 */
export function MobileGeneratePayrollDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const [form, setForm] = useState<FormState>({
    month: String(now.getMonth() + 1), // 1-12
    year: String(now.getFullYear()),
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const month = Number(form.month);
    const year = Number(form.year);
    if (!month || month < 1 || month > 12) { toast.error("Select a valid month"); return; }
    if (!year || year < 2000 || year > 2100) { toast.error("Enter a valid year"); return; }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate payroll");
      haptic([10, 40, 80]);
      toast.success(`Payroll generated for ${MONTHS[month - 1]} ${year}`);
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
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-7 rounded-[0.375rem]" style={{ backgroundColor: "var(--color-concrete)" }}>
              <CalendarCheck className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Generate Payroll</p>
          </div>
          <button onClick={onClose} className="grid place-items-center size-7 rounded-[0.375rem] press" style={{ color: "var(--color-ink-500)" }} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Month */}
          <div>
            <label className={labelClass} style={labelStyle}>Month <span style={{ color: "var(--color-stop)" }}>*</span></label>
            <select value={form.month} onChange={(e) => set("month", e.target.value)} className={inputClass} style={inputStyle}>
              {MONTHS.map((m, i) => (
                <option key={i} value={String(i + 1)}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className={labelClass} style={labelStyle}>Year <span style={{ color: "var(--color-stop)" }}>*</span></label>
            <input type="number" min={2000} max={2100} value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2024" inputMode="numeric" autoFocus className={inputClass} style={inputStyle} />
          </div>

          <p className="text-[0.5rem] rounded-[0.375rem] p-2" style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}>
            This will create a DRAFT payroll period with salary lines for all active employees. You can review and mark it as paid after processing.
          </p>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent" }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Generating…" : "Generate Payroll"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * MobilePayrollFab — floating action button + dialog launcher.
 */
export function MobilePayrollFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-3 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
          backgroundColor: "var(--color-ink-950)",
          color: "#fff",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}
        aria-label="Generate payroll"
      >
        <Plus className="size-5" />
      </button>

      {open && (
        <MobileGeneratePayrollDialog
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
