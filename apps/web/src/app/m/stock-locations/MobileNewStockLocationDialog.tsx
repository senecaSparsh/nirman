"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";

/**
 * Form content for creating a stock location — used inside MobileFabModal
 * (spring-from-FAB animation) or wrapped by MobileNewStockLocationDialog
 * (legacy bottom-sheet backdrop).
 *
 * POSTs to /api/stock-locations { name, type, projectId }.
 */
export function MobileNewStockLocationForm({
  onClose,
  onCreated,
  projects = [],
}: {
  onClose: () => void;
  onCreated?: (location: { id: string; name: string; type: string }) => void;
  projects?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<
    "CENTRAL_WAREHOUSE" | "COMPANY_WAREHOUSE" | "PROJECT_SITE"
  >("COMPANY_WAREHOUSE");
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
      if (!res.ok)
        throw new Error(data.error ?? "Failed to create stock location");
      haptic([10, 40, 80]);
      toast.success(`${data.name} stock location created`);
      router.refresh();
      onCreated?.({ id: data.id, name: data.name, type: data.type });
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

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Location Details */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Location Details
          </p>
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Location name{" "}
                <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Central Warehouse"
                autoFocus
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
            <div className="pl-2">
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Type <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <select
                value={type}
                onChange={(e) => {
                  setType(
                    e.target.value as
                      | "CENTRAL_WAREHOUSE"
                      | "COMPANY_WAREHOUSE"
                      | "PROJECT_SITE",
                  );
                  setProjectId("");
                  haptic(10);
                }}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              >
                <option value="CENTRAL_WAREHOUSE">
                  Central Warehouse
                </option>
                <option value="COMPANY_WAREHOUSE">Company Warehouse</option>
                <option value="PROJECT_SITE">Project Site</option>
              </select>
            </div>
          </div>

          {/* Project — only when type is PROJECT_SITE */}
          {type === "PROJECT_SITE" && (
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Project <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  haptic(10);
                }}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
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
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-1 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
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
              <span>Create Stock Location</span>
            </>
          )}
        </button>
      </form>
    </>
  );
}

/**
 * Mobile bottom-sheet dialog for creating a stock location inline.
 * Legacy backdrop version — kept for backward compatibility.
 * Prefer wrapping <MobileNewStockLocationForm> in <MobileFabModal> instead.
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
  return (
    <MobileDialog open={open} onClose={onClose} title="New Stock Location">
      <MobileNewStockLocationForm
        onClose={onClose}
        onCreated={onCreated}
        projects={projects}
      />
    </MobileDialog>
  );
}
