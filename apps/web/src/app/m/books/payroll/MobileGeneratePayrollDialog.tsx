"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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
  const [form, setForm] = useState<FormState>({
    month: "",
    year: "",
  });

  // Set current month/year after mount to avoid hydration mismatch.
  useEffect(() => {
    const now = new Date();
    setForm({ month: String(now.getMonth() + 1), year: String(now.getFullYear()) });
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const month = Number(form.month);
    const year = Number(form.year);
    if (!month || month < 1 || month > 12) {
      toast.error("Select a valid month");
      return;
    }
    if (!year || year < 2000 || year > 2100) {
      toast.error("Enter a valid year");
      return;
    }

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
    <MobileDialog open={open} onClose={onClose} title="Generate Payroll">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Period */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Period
            </p>
            {/* Month + Year */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <EnumSelect
                  label="Month"
                  required
                  value={form.month}
                  onChange={(v) => set("month", v)}
                  options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>
                  Year <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.year}
                  onChange={(e) => set("year", e.target.value)}
                  placeholder="2024"
                  inputMode="numeric"
                  autoFocus
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <p
            className="text-m-caption rounded-[0.375rem] p-2"
            style={{
              backgroundColor: "var(--color-concrete)",
              color: "var(--color-ink-500)",
            }}
          >
            This will create a DRAFT payroll period with salary lines for all
            active employees. You can review and mark it as paid after
            processing.
          </p>

          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-3 -mb-3 px-3 py-2"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Generating…" : "Generate Payroll"}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
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
          bottom:
            "calc(3.5rem + max(env(safe-area-inset-bottom), 0px) + 0.75rem)",
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
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
