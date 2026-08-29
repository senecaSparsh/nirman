"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, BookOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

interface BoqItemOption {
  id: string;
  serialNo: string;
  description: string;
  unit: string | null;
  rate: number | null;
}

interface WbsNodeOption {
  id: string;
  code: string;
  name: string;
  boqItemId: string | null;
}

interface FormState {
  boqItemId: string;
  wbsNodeId: string;
  measuredQty: string;
  description: string;
  locationRef: string;
}

/**
 * MobileNewMbEntryDialog — bottom-sheet form for adding a Measurement Book
 * entry from the mobile surface. Submits POST /api/mb-entries.
 */
export function MobileNewMbEntryDialog({
  open,
  onClose,
  projectId,
  boqItems,
  wbsNodes,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  boqItems: BoqItemOption[];
  wbsNodes: WbsNodeOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    boqItemId: "",
    wbsNodeId: "",
    measuredQty: "",
    description: "",
    locationRef: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Auto-suggest WBS node when BOQ item is selected
  function onBoqItemChange(boqItemId: string) {
    const linkedNode = wbsNodes.find((w) => w.boqItemId === boqItemId);
    setForm((f) => ({ ...f, boqItemId, wbsNodeId: linkedNode?.id ?? f.wbsNodeId }));
  }

  const selectedBoq = boqItems.find((b) => b.id === form.boqItemId);
  const suggestedWbsNode = wbsNodes.find((w) => w.boqItemId === form.boqItemId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.boqItemId) {
      toast.error("Select a BOQ line item");
      return;
    }
    if (!form.measuredQty || Number(form.measuredQty) <= 0) {
      toast.error("Measured quantity must be > 0");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/mb-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          boqItemId: form.boqItemId,
          wbsNodeId: form.wbsNodeId || undefined,
          measuredQty: Number(form.measuredQty),
          description: form.description.trim(),
          locationRef: form.locationRef.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Failed to create measurement entry");
      haptic([10, 40, 80]);
      toast.success("Measurement entry added");
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

  const inputClass =
    "w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-m-caption font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(18, 17, 13, 0.5)" }}
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
          <div className="flex items-center gap-2">
            <span
              className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <BookOpen
                className="size-3.5"
                style={{ color: "var(--color-ink-600)" }}
              />
            </span>
            <p
              className="text-m-section font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              New Measurement Entry
            </p>
          </div>
          <button
            onClick={onClose}
            className="touch grid place-items-center rounded-[0.375rem] text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* BOQ Item */}
          <div>
            <label className={labelClass} style={labelStyle}>
              BOQ Line Item <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <select
              value={form.boqItemId}
              onChange={(e) => onBoqItemChange(e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— Select BOQ item —</option>
              {boqItems.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.serialNo} — {b.description}
                  {b.unit ? ` (${b.unit})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* WBS Node (optional, auto-suggested) */}
          <div>
            <label className={labelClass} style={labelStyle}>
              WBS Activity (optional)
            </label>
            <select
              value={form.wbsNodeId}
              onChange={(e) => set("wbsNodeId", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— None —</option>
              {wbsNodes.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
            {suggestedWbsNode && form.wbsNodeId === suggestedWbsNode.id && (
              <p
                className="text-m-caption mt-1"
                style={{ color: "var(--color-signal-dark)" }}
              >
                Auto-linked from BOQ item. Progress will update on approval.
              </p>
            )}
            {!suggestedWbsNode && form.boqItemId && (
              <p
                className="text-m-caption mt-1"
                style={{ color: "var(--color-stop)" }}
              >
                This BOQ item isn&apos;t linked to any WBS activity.
              </p>
            )}
          </div>

          {/* Measured Qty + Unit display */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} style={labelStyle}>
                Measured Qty{" "}
                <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="number"
                min={0.001}
                step="any"
                value={form.measuredQty}
                onChange={(e) => set("measuredQty", e.target.value)}
                placeholder="0"
                inputMode="decimal"
                autoFocus={!!form.boqItemId}
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Unit
              </label>
              <div
                className="h-10 rounded-[0.5rem] border px-3 flex items-center text-m-section font-semibold"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-concrete)",
                  color: selectedBoq?.unit
                    ? "var(--color-ink-950)"
                    : "var(--color-ink-400)",
                }}
              >
                {selectedBoq?.unit ?? "—"}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Description <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. PCC for foundation, 1st floor slab casting"
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Location Ref */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Location Reference (optional)
            </label>
            <input
              type="text"
              value={form.locationRef}
              onChange={(e) => set("locationRef", e.target.value)}
              placeholder="e.g. Grid A-3, Wing B, Plot 7"
              enterKeyHint="done"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press disabled:opacity-50"
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
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Adding…" : "Add Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * MobileMbFab — floating action button + dialog launcher for adding MB entries.
 */
export function MobileMbFab({
  projectId,
  boqItems,
  wbsNodes,
}: {
  projectId: string;
  boqItems: BoqItemOption[];
  wbsNodes: WbsNodeOption[];
}) {
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
        aria-label="Add measurement entry"
      >
        <Plus className="size-5" />
      </button>

      {open && (
        <MobileNewMbEntryDialog
          open={open}
          onClose={() => setOpen(false)}
          projectId={projectId}
          boqItems={boqItems}
          wbsNodes={wbsNodes}
        />
      )}
    </>
  );
}
