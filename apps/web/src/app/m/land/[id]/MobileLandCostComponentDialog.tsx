"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
    "w-full rounded-[0.375rem] border px-2.5 py-2 text-m-body outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };
  const labelCls =
    "text-m-caption font-semibold uppercase tracking-wide";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] border p-4 pb-6 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            {editing ? "Edit Cost Component" : "Add Cost Component"}
          </p>
          <button onClick={onClose} className="text-m-body press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <p className="text-m-caption mb-3" style={{ color: "var(--color-ink-500)" }}>
          Add a one-off or recurring cost that accrues into the land&apos;s total cost over time.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
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

          <div className="grid grid-cols-2 gap-2">
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
            <div>
              <label className={labelCls} style={labelStyle}>Frequency *</label>
              <select
                value={form.frequency}
                onChange={(e) => set("frequency", e.target.value as "ONE_TIME" | "RECURRING")}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-m-body outline-none"
                style={inputStyle}
              >
                <option value="ONE_TIME">One-time</option>
                <option value="RECURRING">Recurring</option>
              </select>
            </div>
          </div>

          {form.frequency === "RECURRING" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls} style={labelStyle}>Interval *</label>
                <select
                  value={form.interval}
                  onChange={(e) => set("interval", e.target.value as typeof form.interval)}
                  className="w-full h-10 rounded-[0.5rem] border px-3 text-m-body outline-none"
                  style={inputStyle}
                >
                  {Object.entries(INTERVAL_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
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

          <div className="grid grid-cols-2 gap-2">
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
              <div>
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
              rows={2}
              placeholder="Optional"
              className={inputCls + " resize-none"}
              style={inputStyle}
            />
          </div>

          <div className="flex justify-between gap-2 pt-2">
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
        </form>
      </div>
    </div>
  );
}
