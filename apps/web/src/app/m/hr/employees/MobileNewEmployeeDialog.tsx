"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Building2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput, EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

interface ProjectOption {
  id: string;
  name: string;
}

interface StockLocationOption {
  id: string;
  name: string;
  type: string;
}

/**
 * MobileNewEmployeeForm — quick-create form for adding a new employee.
 *
 * Captures only the bare minimum to create a record (name, phone, trade,
 * designation, department, hierarchy). On submit, creates the employee
 * and immediately redirects to the onboarding workflow, which handles
 * everything else (compensation, employment terms, bank, statutory,
 * documents, offer letter, agreement, ID card, etc.).
 *
 * This is intentionally NOT a duplicate of onboarding — the FAB is the
 * entry point, onboarding is the workflow. No fields are asked twice.
 */
export function MobileNewEmployeeForm({
  onClose,
  projects: _projects,
  stockLocations: _stockLocations,
  departments,
  companyGroup = [],
  onCreated,
}: {
  onClose: () => void;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  departments: { id: string; name: string; active: boolean }[];
  companyGroup?: { id: string; name: string; parentCompanyId: string | null }[];
  onCreated?: (employee: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState("");
  const [designation, setDesignation] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [hierarchyLevel, setHierarchyLevel] = useState("");
  // Multi-company: which companies to onboard this employee in.
  // Defaults to just the active company (pre-selected, toggleable).
  // Only shown when the owner has multiple companies in the group.
  const activeCompanyId = companyGroup.find((c) => !c.parentCompanyId)?.id ?? companyGroup[0]?.id ?? "";
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>(activeCompanyId ? [activeCompanyId] : []);
  const showCompanyPicker = companyGroup.length > 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Employee name is required");
      haptic([50, 20, 50]);
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          trade: trade.trim() || null,
          designation: designation.trim() || null,
          departmentId: departmentId || null,
          hierarchyLevel: hierarchyLevel ? Number(hierarchyLevel) : null,
          active: true,
          // Multi-company onboarding: create in all selected companies
          ...(showCompanyPicker && selectedCompanyIds.length > 0 ? { companyIds: selectedCompanyIds } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create employee");
      haptic([10, 40, 80]);
      const companyCount = data.companyIds?.length ?? 1;
      toast.success(companyCount > 1 ? `Employee created in ${companyCount} companies — starting onboarding` : "Employee created — starting onboarding");
      if (onCreated) {
        onCreated({ id: data.id, name: data.name });
      }
      onClose();
      if (!onCreated) {
        // Go straight to onboarding — the workflow that handles everything else
        router.push(`/m/hr/onboarding/${data.id}`);
      }
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <SectionCard title="Quick Add">
        <p className="text-m-caption pb-2" style={{ color: "var(--color-ink-500)" }}>
          Create the employee record. Onboarding will handle the rest — compensation, documents, offer letter, and more.
        </p>
        <UnderlineInput
          label="Name"
          value={name}
          onChange={setName}
          placeholder="e.g. Rajesh Kumar"
          required
          autoFocus
          enterKeyHint="next"
        />
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="98765 43210"
            type="tel"
            enterKeyHint="next"
          />
          <UnderlineInput
            label="Trade / Skill"
            value={trade}
            onChange={setTrade}
            placeholder="e.g. Mason"
            enterKeyHint="next"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput
            label="Designation"
            value={designation}
            onChange={setDesignation}
            placeholder="e.g. Supervisor"
            enterKeyHint="next"
          />
          <EnumSelect
            label="Hierarchy"
            value={hierarchyLevel}
            onChange={setHierarchyLevel}
            options={[
              { value: "1", label: "H1 — Management" },
              { value: "2", label: "H2 — Manager" },
              { value: "3", label: "H3 — Engineer" },
              { value: "4", label: "H4 — Supervisor" },
              { value: "5", label: "H5 — Skilled" },
              { value: "6", label: "H6 — Labor" },
            ]}
            placeholder="Unassigned"
          />
        </div>
        <div>
          <MobileSelectWithCreate
            label="Department"
            value={departmentId}
            onChange={setDepartmentId}
            options={departments.filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))}
            placeholder="— None —"
            icon={Building2}
          />
        </div>
        {/* Multi-company onboarding: select which companies to create this employee in */}
        {showCompanyPicker && (
          <div
            className="rounded-[0.5rem] overflow-hidden"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <div className="px-3 pt-2 pb-1">
              <p className="text-m-caption font-bold uppercase tracking-wider" style={{ color: "var(--color-ink-500)" }}>
                Onboard in Companies
              </p>
              <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                The employee will be created in all selected companies and can switch between them.
              </p>
            </div>
            <div className="px-3 pb-2 space-y-1">
              {companyGroup.map((c) => {
                const checked = selectedCompanyIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      haptic(10);
                      setSelectedCompanyIds((prev) =>
                        checked ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                      );
                    }}
                    className="w-full flex items-center gap-2 py-1.5 press"
                  >
                    <div
                      className="shrink-0 size-4 rounded-[0.25rem] grid place-items-center border"
                      style={{
                        backgroundColor: checked ? "var(--color-ink-950)" : "transparent",
                        borderColor: checked ? "var(--color-ink-950)" : "var(--color-ink-300)",
                      }}
                    >
                      {checked && <Check className="size-3" style={{ color: "var(--color-paper)" }} />}
                    </div>
                    <span className="text-m-body" style={{ color: "var(--color-ink-950)" }}>
                      {c.name}
                    </span>
                    {c.parentCompanyId === null && (
                      <span
                        className="text-m-caption px-1 rounded-full"
                        style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }}
                      >
                        Parent
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      <div
        className="sticky bottom-0 z-10 flex items-center gap-2 p-3 -mx-4 border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="h-11 px-4 rounded-[0.5rem] text-m-section font-semibold press disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-ink-100)",
            color: "var(--color-ink-700)",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
          style={{
            backgroundColor: "var(--color-ink-950)",
            color: "var(--color-paper)",
          }}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {saving ? "Creating…" : "Create & Onboard"}
        </button>
      </div>
    </form>
  );
}

/**
 * MobileNewEmployeeDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility (used by the leaves dialog's inline
 * "create employee" picker). Prefer wrapping <MobileNewEmployeeForm>
 * in <MobileFabModal> instead — that gives the spring-from-FAB
 * animation matching the materials page.
 */
export function MobileNewEmployeeDialog({
  open,
  onClose,
  projects,
  stockLocations,
  departments,
  onCreated,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  departments: { id: string; name: string; active: boolean }[];
  onCreated?: (employee: { id: string; name: string }) => void;
  nested?: boolean;
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Employee" nested={nested}>
      <MobileNewEmployeeForm
        onClose={onClose}
        projects={projects}
        stockLocations={stockLocations}
        departments={departments}
        onCreated={onCreated}
      />
    </MobileDialog>
  );
}
