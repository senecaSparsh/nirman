"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, CheckCircle2, Send, Wrench, Tag,
  Package, IndianRupee, FileText,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

/**
 * /m/equipment/new — mobile form to register new equipment.
 * Fields: asset tag, name, model, serial, category, cost, date, notes.
 */
export default function MobileNewEquipmentClient() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: string } | null>(null);

  const [assetTag, setAssetTag] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [category, setCategory] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [notes, setNotes] = useState("");

  const cost = Number(acquisitionCost) || 0;

  const handleSubmit = async () => {
    if (!assetTag.trim()) {
      toast.error("Asset tag is required");
      return;
    }
    if (!name.trim()) {
      toast.error("Equipment name is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetTag: assetTag.trim(),
          name: name.trim(),
          model: model.trim() || null,
          serialNumber: serialNumber.trim() || null,
          category: category.trim() || null,
          acquisitionCost: cost,
          purchaseDate: purchaseDate || null,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create equipment");
      }

      const data = await res.json();
      setSuccess({ id: data.id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create equipment");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          Equipment Registered
        </p>
        <p className="text-[0.6875rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          {assetTag} · {name}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              router.refresh();
              router.push(`/m/equipment/${success.id}`);
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            View Equipment
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setAssetTag("");
              setName("");
              setModel("");
              setSerialNumber("");
              setCategory("");
              setAcquisitionCost("");
              setPurchaseDate("");
              setNotes("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32">

      {/* ── Section: Identity ── */}
      <SectionHeader icon={Tag} label="Identity" />

      <div className="flex flex-col gap-2 mb-3">
        <Field label="Asset Tag" required>
          <input
            type="text"
            value={assetTag}
            onChange={(e) => setAssetTag(e.target.value)}
            placeholder="e.g. EQ-001"
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-mono font-bold outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </Field>

        <Field label="Equipment Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Concrete Mixer 1"
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-bold outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </Field>

        <Field label="Category">
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Mixer, Vehicle, Tool"
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </Field>
      </div>

      {/* ── Section: Specs ── */}
      <SectionHeader icon={Package} label="Specifications" />

      <div className="flex flex-col gap-2 mb-3">
        <Field label="Model">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. BMX-500"
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </Field>

        <Field label="Serial Number">
          <input
            type="text"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="e.g. SN-12345-ABC"
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-mono font-medium outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </Field>
      </div>

      {/* ── Section: Valuation ── */}
      <SectionHeader icon={IndianRupee} label="Valuation" />

      <div className="flex flex-col gap-2 mb-3">
        <Field label="Acquisition Cost">
          <div className="relative">
            <IndianRupee
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="text" inputMode="decimal"
              step="any"
              min="0"
              value={acquisitionCost}
              onChange={(e) => setAcquisitionCost(e.target.value)}
              placeholder="0"
              className="w-full rounded-[0.375rem] border pl-7 pr-2.5 py-2 text-[0.75rem] font-bold tabular-nums outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
        </Field>

        <Field label="Purchase Date">
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </Field>
      </div>

      {/* ── Section: Notes ── */}
      <SectionHeader icon={FileText} label="Notes" />

      <div className="mb-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Purchased from ABC Suppliers, warranty 2 years"
          rows={3}
          className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none resize-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        />
      </div>

      {/* ── STICKY BOTTOM BAR ── */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center gap-3">
          {/* Summary */}
          <div className="shrink-0">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Value
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(cost)}
            </p>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Register Equipment</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Section header ─── */
function SectionHeader({
  icon: Icon, label,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="size-3" style={{ color: "var(--color-steel)" }} />
      <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
    </div>
  );
}

/* ─── Field wrapper ─── */
function Field({
  label, required, children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[0.4375rem] font-semibold uppercase block mb-1" style={{ color: "var(--color-ink-500)" }}>
        {label}{required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}
