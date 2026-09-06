"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

interface CostComponent {
  id: string;
  landPurchaseId: string;
  label: string;
  amount: number;
  frequency: "ONE_TIME" | "RECURRING";
  interval: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | null;
  startDate: string;
  endDate: string | null;
  occurrences: number | null;
  postedAmount: number;
  scheduledTotal: number;
  notes: string | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  YEARLY: "Yearly",
};

export function MobileLandCostComponentDialog({
  landPurchaseId,
  editing,
  onClose,
}: {
  landPurchaseId: string;
  editing?: CostComponent | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    label: "",
    amount: "",
    frequency: "ONE_TIME" as "ONE_TIME" | "RECURRING",
    interval: "YEARLY" as "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY",
    startDate: todayISO(),
    endDate: "",
    occurrences: "",
    notes: "",
  });

  useEffect(() => {
    if (editing) {
      setForm({
        label: editing.label,
        amount: String(editing.amount ?? ""),
        frequency: editing.frequency,
        interval: editing.interval ?? "YEARLY",
        startDate: editing.startDate ? editing.startDate.slice(0, 10) : todayISO(),
        endDate: editing.endDate ? editing.endDate.slice(0, 10) : "",
        occurrences: editing.occurrences != null ? String(editing.occurrences) : "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm({
        label: "",
        amount: "",
        frequency: "ONE_TIME",
        interval: "YEARLY",
        startDate: todayISO(),
        endDate: "",
        occurrences: "",
        notes: "",
      });
    }
  }, [editing]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) {
      toast.error("Label is required");
      return;
    }
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (form.frequency === "RECURRING" && !form.interval) {
      toast.error("Interval is required for recurring costs");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        amount,
        frequency: form.frequency,
        interval: form.frequency === "RECURRING" ? form.interval : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        occurrences: form.occurrences ? Number(form.occurrences) : null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(
        editing
          ? `/api/land-purchases/${landPurchaseId}/cost-components/${editing.id}`
          : `/api/land-purchases/${landPurchaseId}/cost-components`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save cost component");
      toast.success(editing ? "Cost component updated" : "Cost component added");
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete "${editing.label}"? This reverses its GL entries and reduces the land total.`)) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/land-purchases/${landPurchaseId}/cost-components/${editing.id}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Cost component deleted");
      onClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
  };
  const labelCls =
    "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <MobileDialog open={true} onClose={onClose} title="Cost Component">
        <p className="text-m-caption mb-3" style={{ color: "var(--color-ink-500)" }}>
          Add a one-off or recurring cost that accrues into the land&apos;s total cost over time.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {/* Cost Component */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Cost Component
            </p>
            <div>
              <label className={labelCls} style={labelStyle}>Label *</label>
              <input
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="e.g. Yearly Lease Rent, EDC/IDC, Maintenance"
                required
                autoFocus
                className={inputCls}
                style={inputStyle}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelCls} style={labelStyle}>Amount (₹) *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="e.g. 500000"
                  required
                  className={inputCls + " tabular-nums"}
                  style={inputStyle}
                />
              </div>
              <div className="pl-2">
                <EnumSelect
                  label="Frequency"
                  value={form.frequency}
                  onChange={(v) => set("frequency", v as "ONE_TIME" | "RECURRING")}
                  required
                  options={[
                    { value: "ONE_TIME", label: "One-time" },
                    { value: "RECURRING", label: "Recurring" },
                  ]}
                />
              </div>
            </div>

            {form.frequency === "RECURRING" && (
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                <div>
                  <EnumSelect
                    label="Interval"
                    value={form.interval}
                    onChange={(v) => set("interval", v as typeof form.interval)}
                    required
                    options={Object.entries(INTERVAL_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  />
                </div>
                <div className="pl-2">
                  <label className={labelCls} style={labelStyle}>Occurrences</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={form.occurrences}
                    onChange={(e) => set("occurrences", e.target.value)}
                    placeholder="Blank = until end date"
                    className={inputCls + " tabular-nums"}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelCls} style={labelStyle}>Start Date *</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  required
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              {form.frequency === "RECURRING" && (
                <div className="pl-2">
                  <label className={labelCls} style={labelStyle}>End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                    placeholder="Blank = indefinite"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={1}
                placeholder="Optional"
                className={inputCls + " resize-none"}
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
            <div className="flex items-center justify-between gap-3">
              <div>
                {editing && (
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-[0.5rem] border py-2 px-3 text-m-body font-bold press disabled:opacity-50"
                    style={{ borderColor: "var(--color-signal)", color: "var(--color-signal)" }}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 rounded-[0.5rem] border py-2 px-4 text-m-body font-bold press disabled:opacity-50"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-[0.5rem] py-2 px-4 text-m-body font-bold press disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : editing ? "Save" : "Add Cost"}
                </button>
              </div>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}
