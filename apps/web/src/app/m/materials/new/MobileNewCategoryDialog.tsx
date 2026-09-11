"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { HsnSacSearch } from "@/components/hsn-sac-search";

/**
 * Mobile dialog for creating a material category.
 *
 * Used inline on the /m/materials/new page when no categories exist,
 * so the user doesn't hit a dead-end ("you need a category first")
 * with no way to create one.
 *
 * POSTs to /api/material-categories { name, unit }.
 */
export function MobileNewCategoryDialog({
  open,
  onClose,
  onCreated,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (cat: { id: string; name: string; unit: string; hsnCode?: string | null; gstRate?: number | null }) => void;
  nested?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("NOS");
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const COMMON_UNITS = [
    "NOS",
    "BAG",
    "KG",
    "TON",
    "MTR",
    "FEET",
    "SQFT",
    "CUM",
    "LTR",
    "BOX",
    "ROLL",
    "SET",
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }
    if (!unit.trim()) {
      toast.error("Default unit is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/material-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          unit: unit.trim().toUpperCase(),
          hsnCode: hsnCode.trim() || undefined,
          gstRate: gstRate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create category");
      haptic([10, 40, 80]);
      toast.success(`${data.name} category created`);
      router.refresh();
      onCreated({ id: data.id, name: data.name, unit: data.unit, hsnCode: data.hsnCode ?? null, gstRate: data.gstRate != null ? Number(data.gstRate) : null });
      setName("");
      setUnit("NOS");
      setHsnCode("");
      setGstRate(undefined);
      onClose();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog open={open} onClose={onClose} title="New Category" nested={nested}>
      <p
        className="text-m-caption mb-4"
        style={{ color: "var(--color-ink-500)" }}
      >
        Categories group materials and define a default unit of measure.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Category Details */}
        <SectionCard title="Category Details">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Category name"
              value={name}
              onChange={setName}
              placeholder="e.g. Cement & Binding"
              required
              autoFocus
            />

            {/* Unit — custom button group, stays inline */}
            <div className="pl-2">
              <label
                className="block text-m-caption font-semibold mb-1.5"
                style={{ color: "var(--color-ink-500)" }}
              >
                Default unit <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <div className="flex flex-wrap gap-1">
                {COMMON_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      setUnit(u);
                      haptic(10);
                    }}
                    className="h-7 px-2 rounded-[0.25rem] text-m-caption font-semibold text-m-body press"
                    style={{
                      color: unit === u ? "var(--color-paper)" : "var(--color-ink-700)",
                      backgroundColor:
                        unit === u
                          ? "var(--color-ink-950)"
                          : "var(--color-concrete)",
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* HSN Code + GST Rate */}
        <SectionCard title="Default HSN/SAC Code">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div className="pr-2">
              <span className="block text-m-caption font-bold mb-0.5" style={{ color: "var(--color-ink-700)" }}>
                HSN Code
              </span>
              <HsnSacSearch
                value={hsnCode}
                onCodeChange={setHsnCode}
                onGstRateChange={(rate) => setGstRate(rate)}
                placeholder="Search…"
                materialName={name}
                inputClassName="flex-1 min-w-0 h-7 px-1 text-m-caption outline-none font-mono"
                inputStyle={{
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
            <div className="pl-2">
              <span className="block text-m-caption font-bold mb-0.5" style={{ color: "var(--color-ink-700)" }}>
                GST %
              </span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={gstRate ?? ""}
                onChange={(e) => setGstRate(e.target.value === "" ? undefined : Number(e.target.value))}
                placeholder="Auto"
                className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors font-mono"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
          </div>
          <p
            className="text-m-caption mt-1"
            style={{ color: "var(--color-ink-500)" }}
          >
            Materials in this category will auto-fill this HSN code + GST rate.
          </p>
        </SectionCard>

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
              className="flex-1 flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" />
                  <span>Create Category</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </MobileDialog>
  );
}
