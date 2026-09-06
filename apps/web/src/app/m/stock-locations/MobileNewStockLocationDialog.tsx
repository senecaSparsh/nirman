"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileProjectSelect } from "@/components/mobile/selectors";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

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
              <EnumSelect
                label="Type"
                required
                value={type}
                onChange={(v) => {
                  setType(
                    v as
                      | "CENTRAL_WAREHOUSE"
                      | "COMPANY_WAREHOUSE"
                      | "PROJECT_SITE",
                  );
                  setProjectId("");
                }}
                options={[
                  { value: "CENTRAL_WAREHOUSE", label: "Central Warehouse" },
                  { value: "COMPANY_WAREHOUSE", label: "Company Warehouse" },
                  { value: "PROJECT_SITE", label: "Project Site" },
                ]}
              />
            </div>
          </div>

          {/* Project — only when type is PROJECT_SITE */}
          {type === "PROJECT_SITE" && (
            <MobileProjectSelect
              required
              value={projectId}
              onChange={(v) => { setProjectId(v); haptic(10); }}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select a project…"
              icon={FolderOpen}
            />
          )}
        </div>

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
              className="flex-1 flex items-center justify-center gap-1 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
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
          </div>
        </div>
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
  nested,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (location: { id: string; name: string; type: string }) => void;
  projects?: { id: string; name: string }[];
  nested?: boolean;
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Stock Location" nested={nested}>
      <MobileNewStockLocationForm
        onClose={onClose}
        onCreated={onCreated}
        projects={projects}
      />
    </MobileDialog>
  );
}
