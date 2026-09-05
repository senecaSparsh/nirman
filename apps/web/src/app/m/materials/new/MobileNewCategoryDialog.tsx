"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";

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
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (cat: { id: string; name: string; unit: string }) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("NOS");
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create category");
      haptic([10, 40, 80]);
      toast.success(`${data.name} category created`);
      router.refresh();
      onCreated({ id: data.id, name: data.name, unit: data.unit });
      setName("");
      setUnit("NOS");
      onClose();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog open={open} onClose={onClose} title="New Category">
      <p
        className="text-m-caption mb-4"
        style={{ color: "var(--color-ink-500)" }}
      >
        Categories group materials and define a default unit of measure.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Category Details */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Category Details
          </p>
          {/* Name */}
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Category name{" "}
              <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cement & Binding"
              autoFocus
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Unit */}
          <div>
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
                    color: unit === u ? "#fff" : "var(--color-ink-700)",
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

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
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
      </form>
    </MobileDialog>
  );
}
