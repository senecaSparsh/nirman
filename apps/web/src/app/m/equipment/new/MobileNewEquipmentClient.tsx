"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, CheckCircle2, Send, Tag,
  Package, IndianRupee, FileText,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";

/**
 * /m/equipment/new — mobile form to register new equipment.
 * Fields: asset tag, name, model, serial, category, cost, date, notes.
 */
export default function MobileNewEquipmentClient({
  onClose,
  onCreated,
}: {
  /** When provided, the form closes this modal on success instead of navigating. */
  onClose?: () => void;
  /** Called with the newly created equipment before closing (optional). */
  onCreated?: (equipment: { id: string }) => void;
}) {
  const router = useRouter();
  const submitLongPress = useLongPressNav("/m/equipment", "Equipment list");
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

  // ── Draft auto-save ──
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<Record<string, string>>("equipment", "equipment-new");
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (success) return;
    const hasContent = assetTag || name || model || serialNumber || category ||
      acquisitionCost || purchaseDate || notes;
    if (!hasContent) return;
    saveDraft({ assetTag, name, model, serialNumber, category, acquisitionCost, purchaseDate, notes });
  }, [assetTag, name, model, serialNumber, category, acquisitionCost, purchaseDate, notes, success, saveDraft]);

  useEffect(() => {
    if (draft && !draftRestored && hasDraft) {
      if (draft.assetTag) setAssetTag(draft.assetTag);
      if (draft.name) setName(draft.name);
      if (draft.model) setModel(draft.model);
      if (draft.serialNumber) setSerialNumber(draft.serialNumber);
      if (draft.category) setCategory(draft.category);
      if (draft.acquisitionCost) setAcquisitionCost(draft.acquisitionCost);
      if (draft.purchaseDate) setPurchaseDate(draft.purchaseDate);
      if (draft.notes) setNotes(draft.notes);
      setDraftRestored(true);
    }
  }, [draft, hasDraft, draftRestored]);

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
    if (cost < 0) {
      toast.error("Acquisition cost cannot be negative");
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
      clearDraft();
      if (onClose) {
        onCreated?.({ id: data.id });
        onClose();
        return;
      }
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
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          Equipment Registered
        </p>
        <p className="text-m-body mb-4" style={{ color: "var(--color-ink-700)" }}>
          {assetTag} · {name}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              router.refresh();
              router.push(`/m/equipment/${success.id}`);
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
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
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {hasDraft && !draftRestored && !success ? (
        <DraftBanner
          formName="equipment-new"
          updatedAt={draftUpdatedAt}
          onRestore={() => setDraftRestored(true)}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      ) : null}

      {/* ── Section: Identity ── */}
      <div
        className="rounded-[0.625rem] border p-3 flex flex-col gap-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Identity
        </p>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <Field label="Asset Tag" required>
              <input
                type="text"
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value)}
                placeholder="e.g. EQ-001"
                className="w-full px-1 py-1 text-m-caption font-mono font-bold outline-none border-b focus:border-b-2 transition-colors"
                style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </Field>
            <Field label="Equipment Name" required className="pl-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Concrete Mixer 1"
                className="w-full px-1 py-1 text-m-caption font-bold outline-none border-b focus:border-b-2 transition-colors"
                style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </Field>
          </div>

          <Field label="Category">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Mixer, Vehicle, Tool"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </Field>
        </div>
      </div>

      {/* ── Section: Specs ── */}
      <div
        className="rounded-[0.625rem] border p-3 flex flex-col gap-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Specifications
        </p>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <Field label="Model">
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. BMX-500"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </Field>
          <Field label="Serial Number" className="pl-2">
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g. SN-12345-ABC"
              className="w-full px-1 py-1 text-m-caption font-mono font-medium outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </Field>
        </div>
      </div>

      {/* ── Section: Valuation ── */}
      <div
        className="rounded-[0.625rem] border p-3 flex flex-col gap-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Valuation
        </p>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <Field label="Acquisition Cost">
            <div className="relative">
              <IndianRupee
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
                style={{ color: "var(--color-ink-700)" }}
              />
              <input
                type="text" inputMode="decimal"
                step="any"
                min="0"
                value={acquisitionCost}
                onChange={(e) => setAcquisitionCost(e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-1 py-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </div>
          </Field>
          <Field label="Purchase Date" className="pl-2">
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </Field>
        </div>
      </div>

      {/* ── Section: Notes ── */}
      <div
        className="rounded-[0.625rem] border p-3 flex flex-col gap-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Notes
        </p>
        <div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Purchased from ABC Suppliers, warranty 2 years"
            rows={3}
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          />
        </div>
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
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center gap-1">
          {/* Summary */}
          <div className="shrink-0">
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-700)" }}>
              Value
            </p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(cost)}
            </p>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={() => { if (submitLongPress.wasLongPress()) return; handleSubmit(); }}
            disabled={submitting}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50 select-none"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", touchAction: "none" }}
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
      <Icon className="size-3" style={{ color: "var(--color-ink-500)" }} />
      <span className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
    </div>
  );
}

/* ─── Field wrapper ─── */
function Field({
  label, required, className, children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
        {label}{required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}
