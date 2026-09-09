"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Building2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput, EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

type WageType = "DAILY" | "MONTHLY" | "FIXED";

interface ProjectOption {
  id: string;
  name: string;
}

interface StockLocationOption {
  id: string;
  name: string;
  type: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface FormState {
  // Step 1: Details
  name: string;
  trade: string;
  designation: string;
  phone: string;
  email: string;
  hierarchyLevel: string;
  // Step 2: Compensation & Employment
  wageType: WageType;
  dailyRate: string;
  monthlySalary: string;
  employmentType: string;
  noticePeriodDays: string;
  contractStartDate: string;
  contractEndDate: string;
  joinDate: string;
  // Step 3: Assignment
  departmentId: string;
  activeProjectId: string;
  reportingLocationId: string;
  // Step 4: Bank & Statutory
  payDay: string;
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  bankBranch: string;
  panNumber: string;
  aadhaarNumber: string;
  pfNumber: string;
  esiNumber: string;
  uan: string;
  // Step 5: Emergency & Address
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  permanentAddress: string;
  currentAddress: string;
  // Salary components (CTC breakdown)
  salaryComponents: SalaryComponentEntry[];
}

interface SalaryComponentEntry {
  type: string;
  amount: string;
  frequency: string;
  isDeduction: boolean;
  isPercentage: boolean;
  percentageOfBasic: string;
}

const SALARY_COMPONENT_OPTIONS = [
  { value: "BASIC", label: "Basic Salary", isDeduction: false },
  { value: "HRA", label: "HRA (House Rent)", isDeduction: false },
  { value: "DA", label: "DA (Dearness Allowance)", isDeduction: false },
  { value: "TA", label: "TA (Travelling Allowance)", isDeduction: false },
  { value: "SPECIAL_ALLOWANCE", label: "Special Allowance", isDeduction: false },
  { value: "FOOD_ALLOWANCE", label: "Food Allowance", isDeduction: false },
  { value: "MEDICAL_ALLOWANCE", label: "Medical Allowance", isDeduction: false },
  { value: "UNIFORM_ALLOWANCE", label: "Uniform Allowance", isDeduction: false },
  { value: "WASHING_ALLOWANCE", label: "Washing Allowance", isDeduction: false },
  { value: "LTA", label: "LTA (Leave Travel)", isDeduction: false },
  { value: "PERFORMANCE_BONUS", label: "Performance Bonus", isDeduction: false },
  { value: "JOINING_BONUS", label: "Joining Bonus", isDeduction: false },
  { value: "EMPLOYER_PF", label: "Employer PF (12% of basic)", isDeduction: false },
  { value: "EMPLOYEE_PF", label: "Employee PF (deducted)", isDeduction: true },
  { value: "EMPLOYER_ESI", label: "Employer ESI (3.25%)", isDeduction: false },
  { value: "EMPLOYEE_ESI", label: "Employee ESI (0.75%, deducted)", isDeduction: true },
  { value: "GRATUITY", label: "Gratuity (4.81% of basic)", isDeduction: false },
  { value: "PROFESSION_TAX", label: "Profession Tax (deducted)", isDeduction: true },
  { value: "TDS", label: "TDS / Income Tax (deducted)", isDeduction: true },
  { value: "OTHER", label: "Other", isDeduction: false },
];

/**
 * SalaryComponentAdder — inline form to add a salary component.
 * Shows a type selector, amount input, frequency selector, and Add button.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SalaryComponentAdder({ onAdd }: { onAdd: (comp: SalaryComponentEntry) => void }) {
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [isPercentage, setIsPercentage] = useState(false);
  const [percentageOfBasic, setPercentageOfBasic] = useState("");

  function handleAdd() {
    if (!type) {
      toast.error("Select a component type");
      return;
    }
    if (!isPercentage && (!amount || Number(amount) <= 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    if (isPercentage && (!percentageOfBasic || Number(percentageOfBasic) <= 0)) {
      toast.error("Enter a valid percentage");
      return;
    }
    const option = SALARY_COMPONENT_OPTIONS.find((o) => o.value === type);
    onAdd({
      type,
      amount: isPercentage ? "0" : amount,
      frequency,
      isDeduction: option?.isDeduction ?? false,
      isPercentage,
      percentageOfBasic: isPercentage ? percentageOfBasic : "",
    });
    setType("");
    setAmount("");
    setFrequency("MONTHLY");
    setIsPercentage(false);
    setPercentageOfBasic("");
  }

  return (
    <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <EnumSelect
          label="Component"
          value={type}
          onChange={setType}
          placeholder="— Select —"
          options={SALARY_COMPONENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <div className="pl-2">
          <EnumSelect
            label="Frequency"
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: "MONTHLY", label: "Monthly" },
              { value: "QUARTERLY", label: "Quarterly" },
              { value: "HALF_YEARLY", label: "Half-Yearly" },
              { value: "YEARLY", label: "Yearly" },
              { value: "ONE_TIME", label: "One-time" },
            ]}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 divide-x mt-1" style={{ borderColor: "var(--color-line)" }}>
        {isPercentage ? (
          <UnderlineInput
            label="% of Basic"
            value={percentageOfBasic}
            onChange={setPercentageOfBasic}
            placeholder="e.g. 40"
            type="number"
            min="0"
            max="100"
          />
        ) : (
          <UnderlineInput
            label="Amount (₹)"
            value={amount}
            onChange={setAmount}
            placeholder="0"
            type="number"
            min="0"
          />
        )}
        <div className="pl-2 flex items-end pb-1">
          <label className="flex items-center gap-1.5 text-m-caption" style={{ color: "var(--color-ink-700)" }}>
            <input
              type="checkbox"
              checked={isPercentage}
              onChange={(e) => setIsPercentage(e.target.checked)}
              className="size-4"
            />
            % of Basic
          </label>
        </div>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="mt-1.5 w-full h-9 rounded-[0.5rem] text-m-section font-semibold press flex items-center justify-center gap-1.5"
        style={{
          backgroundColor: "var(--color-ink-100)",
          color: "var(--color-ink-700)",
        }}
      >
        <Plus className="size-4" />
        Add Component
      </button>
    </div>
  );
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
