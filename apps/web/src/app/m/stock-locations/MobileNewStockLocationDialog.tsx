"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Mobile bottom-sheet dialog for creating a stock location inline.
 *
 * Used on the /m/stock-locations page so the user can create a new
 * warehouse or project-site location without leaving the page.
 *
 * POSTs to /api/stock-locations { name, type, projectId }.
 */
export function MobileNewStockLocationDialog({
  open,
  onClose,
  onCreated,
  projects = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (location: { id: string; name: string; type: string }) => void;
  projects?: { id: string; name: string }[];
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"COMPANY_WAREHOUSE" | "PROJECT_SITE">("COMPANY_WAREHOUSE");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Location name is required");
      return;
    }
    if (type === "PROJECT_SITE" && !projectId) {
      toast.error("Please select a project");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/stock-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          projectId: type === "PROJECT_SITE" ? projectId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create stock location");
      haptic([10, 40, 80]);
      toast.success(`${data.name} stock location created`);
      onCreated({ id: data.id, name: data.name, type: data.type });
      setName("");
      setType("COMPANY_WAREHOUSE");
      setProjectId("");
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
            New Stock Location
          </h2>
          <button onClick={onClose} className="press grid place-items-center size-7 rounded-[0.375rem]" style={{ color: "var(--color-ink-500)" }}>
            <X className="size-4" />
          </button>
        </div>

        <p className="text-[0.5625rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          A stock location is where materials are stored — a company warehouse or a project site.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Location name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Central Warehouse"
              autoFocus
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Type <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value as "COMPANY_WAREHOUSE" | "PROJECT_SITE"); setProjectId(""); haptic(10); }}
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              <option value="COMPANY_WAREHOUSE">Company Warehouse</option>
              <option value="PROJECT_SITE">Project Site</option>
            </select>
          </div>

          {/* Project — only when type is PROJECT_SITE */}
          {type === "PROJECT_SITE" && (
            <div>
              <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
                Project <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); haptic(10); }}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                <span>Create Stock Location</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
