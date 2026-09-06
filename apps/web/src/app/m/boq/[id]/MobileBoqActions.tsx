"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Edit3, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useOptimisticAction } from "@/lib/use-optimistic-action";
import { ActionBar } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";

interface FormState {
  serialNo: string;
  description: string;
  unit: string;
  estimatedQty: string;
  rate: string;
  notes: string;
}

/**
 * MobileBoqEditDialog — bottom-sheet form for editing a BOQ line item.
 * Submits PATCH /api/boq/items/[id].
 */
export function MobileBoqEditDialog({
  open,
  onClose,
  itemId,
  initial,
  isLineItem,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  initial: {
    serialNo: string;
    description: string;
    unit: string | null;
    estimatedQty: number | null;
    rate: number | null;
    notes: string | null;
  };
  isLineItem: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    serialNo: initial.serialNo,
    description: initial.description,
    unit: initial.unit ?? "",
    estimatedQty: initial.estimatedQty != null ? String(initial.estimatedQty) : "",
    rate: initial.rate != null ? String(initial.rate) : "",
    notes: initial.notes ?? "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.serialNo.trim()) {
      toast.error("Serial number is required");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (isLineItem) {
      if (!form.unit.trim()) {
        toast.error("Unit is required for line items");
        return;
      }
      if (!form.estimatedQty || Number(form.estimatedQty) <= 0) {
        toast.error("Estimated qty must be > 0");
        return;
      }
      if (!form.rate || Number(form.rate) < 0) {
        toast.error("Rate is required for line items");
        return;
      }
    }

    setSaving(true);
    haptic(10);
    try {
      const body: Record<string, unknown> = {
        serialNo: form.serialNo.trim(),
        description: form.description.trim(),
        notes: form.notes.trim() || null,
      };
      if (isLineItem) {
        body.unit = form.unit.trim();
        body.estimatedQty = Number(form.estimatedQty);
        body.rate = Number(form.rate);
      }

      const res = await fetch(`/api/boq/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update BOQ item");
      haptic([10, 40, 80]);
      toast.success("BOQ item updated");
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
    <MobileDialog open={open} onClose={onClose} title="Edit BOQ Item">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Item Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Item Details
            </p>
            {/* Serial No + Description */}
            <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Serial No. <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.serialNo}
                  onChange={(e) => set("serialNo", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="col-span-2 pl-2">
                <label className={labelClass} style={labelStyle}>
                  Description <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Line item fields */}
          {isLineItem && (
            <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Line Item Specs
              </p>
              <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                <div>
                  <label className={labelClass} style={labelStyle}>
                    Unit <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => set("unit", e.target.value)}
                    placeholder="CUM"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div className="pl-2">
                  <label className={labelClass} style={labelStyle}>
                    Qty <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={0.001}
                    step="any"
                    value={form.estimatedQty}
                    onChange={(e) => set("estimatedQty", e.target.value)}
                    inputMode="decimal"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div className="pl-2">
                  <label className={labelClass} style={labelStyle}>
                    Rate (₹) <span style={{ color: "var(--color-stop)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.rate}
                    onChange={(e) => set("rate", e.target.value)}
                    inputMode="decimal"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Notes
            </p>
            <div>
              <label className={labelClass} style={labelStyle}>
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={1}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={inputStyle}
              />
            </div>
          </div>

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
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}

/**
 * MobileBoqDeleteConfirm — confirmation modal for deleting a BOQ item.
 */
export function MobileBoqDeleteConfirm({
  open,
  onClose,
  itemId,
  itemDescription,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemDescription: string;
}) {
  const router = useRouter();
  const deleteAction = useOptimisticAction({
    endpoint: `/api/boq/items/${itemId}`,
    method: "DELETE",
    successMessage: "BOQ item deleted",
    hapticOnSuccess: 30,
    onSuccess: () => {
      onClose();
      router.back();
      router.refresh();
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center "
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-[0.75rem] border p-5 shadow-xl"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="grid place-items-center size-10 rounded-full shrink-0"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-stop) 12%, transparent)",
            }}
          >
            <AlertTriangle
              className="size-5"
              style={{ color: "var(--color-stop)" }}
            />
          </div>
          <div>
            <h3
              className="text-m-section font-extrabold tracking-tight"
              style={{ color: "var(--color-ink-950)" }}
            >
              Delete this BOQ item?
            </h3>
            <p
              className="text-m-body mt-1"
              style={{ color: "var(--color-ink-500)" }}
            >
              &quot;{itemDescription}&quot; will be permanently removed. Linked
              measurement entries may be affected.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onClose}
            disabled={deleteAction.isPending}
            className="flex-1 h-10 rounded-[0.5rem] border font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{
              borderColor: "var(--color-line)",
              color: "var(--color-ink-700)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => deleteAction.execute()}
            disabled={deleteAction.isPending}
            className="flex-1 h-10 rounded-[0.5rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-stop)",
              color: "var(--color-paper)",
            }}
          >
            {deleteAction.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * MobileBoqActions — sticky bottom action bar with Edit + Delete buttons
 * for the BOQ item detail page. Only shown when canManage is true.
 */
export function MobileBoqActions({
  itemId,
  itemDescription,
  initial,
  isLineItem,
}: {
  itemId: string;
  itemDescription: string;
  initial: {
    serialNo: string;
    description: string;
    unit: string | null;
    estimatedQty: number | null;
    rate: number | null;
    notes: string | null;
  };
  isLineItem: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <ActionBar>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95"
            style={{
              borderColor: "var(--color-stop)",
              color: "var(--color-stop)",
              backgroundColor: "transparent",
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            <Edit3 className="size-4" />
            Edit
          </button>
        </div>
      </ActionBar>

      <MobileBoqEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        itemId={itemId}
        initial={initial}
        isLineItem={isLineItem}
      />
      <MobileBoqDeleteConfirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        itemId={itemId}
        itemDescription={itemDescription}
      />
    </>
  );
}
