"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

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
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("NOS");
  const [saving, setSaving] = useState(false);

  const COMMON_UNITS = ["NOS", "BAG", "KG", "TON", "MTR", "FEET", "SQFT", "CUM", "LTR", "BOX", "ROLL", "SET"];

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
        body: JSON.stringify({ name: name.trim(), unit: unit.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create category");
      haptic([10, 40, 80]);
      toast.success(`${data.name} category created`);
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Material Category
          </h2>
          <button onClick={onClose} className="press grid place-items-center size-7 rounded-[0.375rem]" style={{ color: "var(--color-ink-500)" }}>
            <X className="size-4" />
          </button>
        </div>

        <p className="text-[0.5625rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          Categories group materials and define a default unit of measure.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Category name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cement & Binding"
              autoFocus
              className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Unit */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1.5" style={{ color: "var(--color-ink-500)" }}>
              Default unit <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <div className="flex flex-wrap gap-1">
              {COMMON_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => { setUnit(u); haptic(10); }}
                  className="h-7 px-2 rounded-[0.25rem] text-[0.5625rem] font-semibold press"
                  style={{
                    color: unit === u ? "#fff" : "var(--color-ink-700)",
                    backgroundColor: unit === u ? "var(--color-ink-950)" : "var(--color-concrete)",
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
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
      </div>
    </div>
  );
}
