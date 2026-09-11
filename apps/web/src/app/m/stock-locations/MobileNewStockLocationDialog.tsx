"use client";

import { useState, useEffect } from "react";
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
    "CENTRAL_WAREHOUSE" | "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT"
  >("COMPANY_WAREHOUSE");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // Fetch company group (self + children) for the company selector
  const [companies, setCompanies] = useState<{ id: string; name: string; isCurrent: boolean }[]>([]);
  const [targetCompanyId, setTargetCompanyId] = useState("");
  useEffect(() => {
    // Fetch current company + all companies (for child company selection)
    Promise.all([
      fetch("/api/company").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/companies").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([current, all]) => {
      if (current?.id) {
        setTargetCompanyId(current.id);
        // Build the company group: current company + its children
        const children = Array.isArray(all)
          ? all.filter((c: { parentCompanyId?: string | null }) => c.parentCompanyId === current.id)
          : [];
        const group = [
          { id: current.id, name: current.name, isCurrent: true },
          ...children.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name, isCurrent: false })),
        ];
        setCompanies(group);
      }
    });
  }, []);

  // Whether this type needs a project selector
  const needsProject = type === "PROJECT_SITE";
  // Whether the current company has children (show company selector)
  const hasChildren = companies.filter((c) => !c.isCurrent).length > 0;
  // Whether this type can target a child company
  const canTargetCompany = type === "COMPANY_WAREHOUSE" || type === "DEPARTMENT";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Location name is required");
      return;
    }
    if (needsProject && !projectId) {
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
          projectId: needsProject ? projectId : null,
          targetCompanyId: canTargetCompany && targetCompanyId ? targetCompanyId : undefined,
          // If we're overriding a duplicate warning, send force: true
          ...(dupWarning ? { force: true } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.warning === "duplicate") {
          // Show duplicate warning — let the user confirm
          setDupWarning(data.message);
          setSaving(false);
          return;
        }
        throw new Error(data.error ?? "Failed to create stock location");
      }
      haptic([10, 40, 80]);
      toast.success(`${data.name} stock location created`);
      router.refresh();
      onCreated?.({ id: data.id, name: data.name, type: data.type });
      setName("");
      setType("COMPANY_WAREHOUSE");
      setProjectId("");
      setDupWarning(null);
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
                      | "PROJECT_SITE"
                      | "DEPARTMENT",
                  );
                  setProjectId("");
                  setDupWarning(null);
                }}
                options={[
                  { value: "COMPANY_WAREHOUSE", label: "Company Warehouse" },
                  { value: "PROJECT_SITE", label: "Project Site" },
                  { value: "CENTRAL_WAREHOUSE", label: "Central Warehouse" },
                  { value: "DEPARTMENT", label: "Department" },
                ]}
              />
            </div>
          </div>

          {/* Type description */}
          <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
            {type === "PROJECT_SITE" && "Stock stored at a specific project site. Requires a project."}
            {type === "COMPANY_WAREHOUSE" && "Company-level warehouse. No project needed."}
            {type === "CENTRAL_WAREHOUSE" && "Parent company warehouse for distributing to child companies. No project needed."}
            {type === "DEPARTMENT" && "Operational cost-center stock room (e.g. Workshop, Boiler house). No project needed."}
          </p>

          {/* Target company — only if current company has children AND type allows targeting */}
          {hasChildren && canTargetCompany && (
            <EnumSelect
              label="Belongs to"
              value={targetCompanyId}
              onChange={setTargetCompanyId}
              options={companies.map((c) => ({
                value: c.id,
                label: c.isCurrent ? `${c.name} (current)` : c.name,
              }))}
            />
          )}

          {/* Project — only when type is PROJECT_SITE */}
          {needsProject && (
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

        {/* Duplicate warning */}
        {dupWarning && (
          <div
            className="rounded-[0.5rem] border p-3 flex flex-col gap-2"
            style={{
              borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))",
              backgroundColor: "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))",
            }}
          >
            <p className="text-m-caption font-bold" style={{ color: "var(--color-stop)" }}>
              ⚠ {dupWarning}
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-[0.375rem] py-1.5 text-m-caption font-bold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
              >
                {saving ? <Loader2 className="size-3 animate-spin mx-auto" /> : "Create anyway"}
              </button>
              <button
                type="button"
                onClick={() => setDupWarning(null)}
                className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-bold border press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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
