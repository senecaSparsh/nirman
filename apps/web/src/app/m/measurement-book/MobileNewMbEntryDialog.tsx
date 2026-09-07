"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { SectionCard, UnderlineInput, StickyActionBar } from "@/components/mobile/v2/form-primitives";

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

  return (
    <MobileDialog open={open} onClose={onClose} title="New MB Entry">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Entry Details */}
          <SectionCard title="Entry Details">
            {/* BOQ Item */}
            <MobileSelectWithCreate
              label="BOQ Line Item"
              required
              value={form.boqItemId}
              onChange={onBoqItemChange}
              placeholder="— Select BOQ item —"
              options={boqItems.map((b) => ({
                value: b.id,
                label: `${b.serialNo} — ${b.description}${b.unit ? ` (${b.unit})` : ""}`,
              }))}
            />

            {/* WBS Node (optional, auto-suggested) */}
            <div>
              <MobileSelectWithCreate
                label="WBS Activity"
                value={form.wbsNodeId}
                onChange={(v) => set("wbsNodeId", v)}
                placeholder="— None —"
                options={wbsNodes.map((w) => ({
                  value: w.id,
                  label: `${w.code} — ${w.name}`,
                }))}
              />
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
          </SectionCard>

          {/* Measurement */}
          <SectionCard title="Measurement">
            {/* Measured Qty + Unit display */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Measured Qty"
                required
                type="number"
                min={0.001}
                step="any"
                value={form.measuredQty}
                onChange={(v) => set("measuredQty", v)}
                placeholder="0"
                inputMode="decimal"
                autoFocus={!!form.boqItemId}
                enterKeyHint="next"
              />
              <div className="pl-2">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
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
            <UnderlineInput
              label="Description"
              required
              value={form.description}
              onChange={(v) => set("description", v)}
              placeholder="e.g. PCC for foundation, 1st floor slab casting"
              enterKeyHint="next"
            />

            {/* Location Ref */}
            <UnderlineInput
              label="Location Reference (optional)"
              value={form.locationRef}
              onChange={(v) => set("locationRef", v)}
              placeholder="e.g. Grid A-3, Wing B, Plot 7"
              enterKeyHint="done"
            />
          </SectionCard>

          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <StickyActionBar
            summaryLabel=""
            summaryValue=""
            submitLabel="Add Entry"
            onSubmit={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
            submitting={saving}
          />
        </form>
    </MobileDialog>
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
