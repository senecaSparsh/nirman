"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FolderOpen, ChevronRight, ChevronLeft, Check, Building2, Shield, Heart, Plus, Trash2, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput, EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

type WageType = "DAILY" | "MONTHLY" | "FIXED";

const WAGE_TYPE_LABELS: Record<WageType, string> = {
  DAILY: "Daily Wage",
  MONTHLY: "Monthly Salary",
  FIXED: "Fixed",
};

interface ProjectOption {
  id: string;
  name: string;
}

interface StockLocationOption {
  id: string;
  name: string;
  type: string;
}

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

const STEPS = [
  { id: 0, label: "Details", icon: Building2 },
  { id: 1, label: "Salary", icon: IndianRupee },
  { id: 2, label: "Assignment", icon: FolderOpen },
  { id: 3, label: "Bank & IDs", icon: Shield },
  { id: 4, label: "Contact", icon: Heart },
] as const;

const EMPTY_FORM: FormState = {
  name: "", trade: "", designation: "", phone: "", email: "", hierarchyLevel: "",
  wageType: "DAILY", dailyRate: "", monthlySalary: "", employmentType: "", noticePeriodDays: "",
  contractStartDate: "", contractEndDate: "", joinDate: "",
  activeProjectId: "", reportingLocationId: "",
  payDay: "", bankAccountHolder: "", bankAccountNumber: "", bankIfsc: "", bankName: "", bankBranch: "",
  panNumber: "", aadhaarNumber: "", pfNumber: "", esiNumber: "", uan: "",
  emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelation: "",
  permanentAddress: "", currentAddress: "",
  salaryComponents: [],
};

/**
 * SalaryComponentAdder — inline form to add a salary component.
 * Shows a type selector, amount input, frequency selector, and Add button.
 */
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
 * MobileNewEmployeeForm — multi-step form for adding an employee with
 * complete hiring information.
 *
 * Steps:
 *   0. Details (name, trade, designation, phone, email, hierarchy)
 *   1. Compensation & Employment (wage, type, notice, contract dates, join date)
 *   2. Assignment (project, reporting location)
 *   3. Bank & Statutory IDs (bank a/c, PAN, Aadhaar, PF, ESI, UAN)
 *   4. Emergency Contact & Address
 *
 * On submit, posts to /api/employees with all fields. The API auto-generates
 * offer letter, employment agreement, and ID card when prerequisites are met.
 */
export function MobileNewEmployeeForm({
  onClose,
  projects,
  stockLocations,
  onCreated,
}: {
  onClose: () => void;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  onCreated?: (employee: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function nextStep() {
    if (step === 0 && !form.name.trim()) {
      toast.error("Employee name is required");
      return;
    }
    haptic(10);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prevStep() {
    haptic(10);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Employee name is required");
      setStep(0);
      return;
    }
    const dailyRate = form.dailyRate === "" ? 0 : Number(form.dailyRate);
    const monthlySalary = form.wageType !== "DAILY" && form.monthlySalary !== "" ? Number(form.monthlySalary) : null;
    const hierarchyLevel = form.hierarchyLevel ? Number(form.hierarchyLevel) : null;
    if (dailyRate < 0) { toast.error("Daily rate cannot be negative"); return; }
    if (monthlySalary !== null && monthlySalary < 0) { toast.error("Monthly salary cannot be negative"); return; }
    if (hierarchyLevel !== null && (hierarchyLevel < 1 || hierarchyLevel > 6)) { toast.error("Hierarchy level must be 1–6"); return; }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          trade: form.trade.trim() || null,
          designation: form.designation.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          wageType: form.wageType,
          dailyRate,
          monthlySalary,
          joinDate: form.joinDate || null,
          activeProjectId: form.activeProjectId || null,
          hierarchyLevel,
          reportingLocationId: form.reportingLocationId || null,
          employmentType: form.employmentType || null,
          noticePeriodDays: form.noticePeriodDays ? Number(form.noticePeriodDays) : null,
          contractStartDate: form.contractStartDate || null,
          contractEndDate: form.contractEndDate || null,
          // Dossier fields
          payDay: form.payDay ? Number(form.payDay) : null,
          bankAccountHolder: form.bankAccountHolder.trim() || null,
          bankAccountNumber: form.bankAccountNumber.trim() || null,
          bankIfsc: form.bankIfsc.trim() || null,
          bankName: form.bankName.trim() || null,
          bankBranch: form.bankBranch.trim() || null,
          panNumber: form.panNumber.trim() || null,
          aadhaarNumber: form.aadhaarNumber.trim() || null,
          pfNumber: form.pfNumber.trim() || null,
          esiNumber: form.esiNumber.trim() || null,
          uan: form.uan.trim() || null,
          emergencyContactName: form.emergencyContactName.trim() || null,
          emergencyContactPhone: form.emergencyContactPhone.trim() || null,
          emergencyContactRelation: form.emergencyContactRelation.trim() || null,
          permanentAddress: form.permanentAddress.trim() || null,
          currentAddress: form.currentAddress.trim() || null,
          // Salary components — sent in the same POST so they're saved
          // BEFORE the offer letter/agreement are auto-generated
          salaryComponents: form.salaryComponents.map((c) => ({
            type: c.type,
            amount: Number(c.amount) || 0,
            frequency: c.frequency,
            isDeduction: c.isDeduction,
            isPercentage: c.isPercentage,
            percentageOfBasic: c.isPercentage ? Number(c.percentageOfBasic) || null : null,
          })),
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add employee");

      haptic([10, 40, 80]);
      const docs = data.autoGenerated ?? {};
      const docList = [
        docs.offerLetter && "offer letter",
        docs.agreement && "agreement",
        docs.idCard && "ID card",
      ].filter(Boolean);
      toast.success(
        docList.length > 0
          ? `Employee added. Auto-generated: ${docList.join(", ")}`
          : "Employee added",
      );
      if (onCreated) {
        onCreated({ id: data.id, name: data.name });
      }
      onClose();
      if (!onCreated) {
        // Send the user straight to the onboarding workflow so they know
        // exactly what to do next instead of landing back on the roster.
        router.push(`/m/hr/onboarding/${data.id}`);
      }
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* ══════ STEP INDICATOR ══════ */}
      <div className="flex items-center justify-between px-1 pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={s.id} className="flex flex-1 flex-col items-center gap-0.5">
              <div
                className="flex items-center justify-center rounded-full transition-all"
                style={{
                  width: 28, height: 28,
                  backgroundColor: isActive || isDone ? "var(--color-ink-950)" : "var(--color-ink-100)",
                  color: isActive || isDone ? "var(--color-paper)" : "var(--color-ink-400)",
                }}
              >
                {isDone ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
              </div>
              <span
                className="text-[10px] font-semibold"
                style={{ color: isActive ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ══════ STEP CONTENT ══════ */}
      {step === 0 && (
        <>
          <SectionCard title="Personal Details">
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Name"
                value={form.name}
                onChange={(v) => set("name", v)}
                placeholder="e.g. Rajesh Kumar"
                required
                autoFocus
                enterKeyHint="next"
              />
              <div>
                <EnumSelect
                  label="Hierarchy"
                  value={form.hierarchyLevel}
                  onChange={(v) => set("hierarchyLevel", v)}
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
            </div>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Trade / Skill"
                value={form.trade}
                onChange={(v) => set("trade", v)}
                placeholder="e.g. Mason"
                enterKeyHint="next"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Designation"
                  value={form.designation}
                  onChange={(v) => set("designation", v)}
                  placeholder="e.g. Site Supervisor"
                  enterKeyHint="next"
                />
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Contact">
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Phone"
                value={form.phone}
                onChange={(v) => set("phone", v)}
                placeholder="98765 43210"
                type="tel"
                enterKeyHint="next"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Email"
                  value={form.email}
                  onChange={(v) => set("email", v)}
                  placeholder="employee@email.com"
                  type="email"
                  enterKeyHint="next"
                />
              </div>
            </div>
          </SectionCard>
        </>
      )}

      {step === 1 && (
        <>
          <SectionCard title="Wage & Employment">
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <EnumSelect
                label="Wage Type"
                value={form.wageType}
                onChange={(v) => set("wageType", v as WageType)}
                options={(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => ({
                  value: w,
                  label: WAGE_TYPE_LABELS[w],
                }))}
              />
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>
                  {form.wageType === "DAILY" ? "Daily Rate (₹)" : form.wageType === "FIXED" ? "Fixed Amount (₹)" : "Monthly Salary (₹)"}
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.wageType === "DAILY" ? form.dailyRate : form.monthlySalary}
                  onChange={(e) => form.wageType === "DAILY" ? set("dailyRate", e.target.value) : set("monthlySalary", e.target.value)}
                  placeholder="0"
                  inputMode="numeric"
                  className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 divide-x mt-2" style={{ borderColor: "var(--color-line)" }}>
              <EnumSelect
                label="Employment Type"
                value={form.employmentType}
                onChange={(v) => set("employmentType", v)}
                placeholder="— Select —"
                options={[
                  { value: "PERMANENT", label: "Permanent" },
                  { value: "CONTRACT", label: "Contract" },
                  { value: "CASUAL", label: "Casual" },
                  { value: "PROBATION", label: "Probation" },
                  { value: "INTERN", label: "Intern" },
                ]}
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Notice (days)"
                  value={form.noticePeriodDays}
                  onChange={(v) => set("noticePeriodDays", v)}
                  placeholder="30"
                  type="number"
                  min="0"
                />
              </div>
            </div>
            {(form.employmentType === "CONTRACT" || form.employmentType === "PROBATION") && (
              <div className="grid grid-cols-2 gap-2 divide-x mt-2" style={{ borderColor: "var(--color-line)" }}>
                <UnderlineInput
                  label="Contract Start"
                  value={form.contractStartDate}
                  onChange={(v) => set("contractStartDate", v)}
                  type="date"
                />
                <div className="pl-2">
                  <UnderlineInput
                    label="Contract End"
                    value={form.contractEndDate}
                    onChange={(v) => set("contractEndDate", v)}
                    type="date"
                  />
                </div>
              </div>
            )}
            <div className="mt-2">
              <UnderlineInput
                label="Join Date"
                value={form.joinDate}
                onChange={(v) => set("joinDate", v)}
                type="date"
              />
            </div>
          </SectionCard>

          {/* ── Salary Structure (CTC Breakdown) ── */}
          <SectionCard title="Salary Structure (CTC Breakdown)">
            <p className="text-m-caption mb-2" style={{ color: "var(--color-ink-700)" }}>
              Add salary components like Basic, HRA, DA, TA, etc. These appear in the offer letter and employment agreement.
            </p>

            {form.salaryComponents.length === 0 && (
              <div className="text-center py-3 rounded-lg" style={{ backgroundColor: "var(--color-ink-100)" }}>
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  No components added yet. Tap below to add.
                </p>
              </div>
            )}

            {form.salaryComponents.map((comp, idx) => {
              const option = SALARY_COMPONENT_OPTIONS.find((o) => o.value === comp.type);
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 py-1.5 border-b last:border-b-0"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <div className="flex-1">
                    <span className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
                      {option?.label ?? comp.type}
                    </span>
                    {comp.isPercentage && comp.percentageOfBasic && (
                      <span className="text-m-caption ml-1" style={{ color: "var(--color-ink-500)" }}>
                        ({comp.percentageOfBasic}% of basic)
                      </span>
                    )}
                    <span className="text-m-caption ml-1" style={{ color: "var(--color-ink-500)" }}>
                      ₹{comp.amount || "0"} / {comp.frequency.toLowerCase()}
                    </span>
                    {comp.isDeduction && (
                      <span className="text-m-caption ml-1" style={{ color: "var(--color-red-500, #dc2626)" }}>
                        (deduction)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic(10);
                      setForm((f) => ({
                        ...f,
                        salaryComponents: f.salaryComponents.filter((_, i) => i !== idx),
                      }));
                    }}
                    className="p-1"
                    style={{ color: "var(--color-red-500, #dc2626)" }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}

            {/* Add component row */}
            <SalaryComponentAdder
              onAdd={(comp) => {
                haptic(10);
                setForm((f) => ({
                  ...f,
                  salaryComponents: [...f.salaryComponents, comp],
                }));
              }}
            />

            {/* CTC summary */}
            {form.salaryComponents.length > 0 && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
                {(() => {
                  const earnings = form.salaryComponents
                    .filter((c) => !c.isDeduction && c.frequency === "MONTHLY")
                    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
                  const deductions = form.salaryComponents
                    .filter((c) => c.isDeduction && c.frequency === "MONTHLY")
                    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
                  return (
                    <div className="space-y-0.5 text-m-caption">
                      <div className="flex justify-between">
                        <span style={{ color: "var(--color-ink-700)" }}>Monthly Gross:</span>
                        <span className="font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>₹{earnings.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--color-ink-700)" }}>Monthly Deductions:</span>
                        <span className="font-bold tabular-nums" style={{ color: "var(--color-red-500, #dc2626)" }}>₹{deductions.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--color-ink-700)" }}>Monthly Net:</span>
                        <span className="font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>₹{(earnings - deductions).toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between pt-0.5 border-t" style={{ borderColor: "var(--color-line)" }}>
                        <span className="font-bold" style={{ color: "var(--color-ink-950)" }}>Annual CTC:</span>
                        <span className="font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>₹{(earnings * 12).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {step === 2 && (
        <SectionCard title="Assignment">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Join Date"
              value={form.joinDate}
              onChange={(v) => set("joinDate", v)}
              type="date"
            />
            <div>
              <MobileSelectWithCreate
                label="Active Project"
                value={form.activeProjectId}
                onChange={(v) => set("activeProjectId", v)}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="— None —"
                icon={FolderOpen}
              />
            </div>
          </div>
          <div>
            <MobileSelectWithCreate
              label="Reporting Location"
              value={form.reportingLocationId}
              onChange={(v) => set("reportingLocationId", v)}
              options={stockLocations.map((l) => ({ value: l.id, label: l.name }))}
              placeholder="— None (manual attendance) —"
            />
            <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-700)" }}>
              Auto-marks PRESENT when employee enters this location&apos;s geo-fence.
            </p>
          </div>
        </SectionCard>
      )}

      {step === 3 && (
        <>
          <SectionCard title="Bank Details">
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Account Holder"
                value={form.bankAccountHolder}
                onChange={(v) => set("bankAccountHolder", v)}
                placeholder="Name as per bank"
                enterKeyHint="next"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Pay Day"
                  value={form.payDay}
                  onChange={(v) => set("payDay", v)}
                  placeholder="7"
                  type="number"
                  min="1"
                  max="31"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Account Number"
                value={form.bankAccountNumber}
                onChange={(v) => set("bankAccountNumber", v)}
                placeholder="Bank a/c no."
                enterKeyHint="next"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="IFSC Code"
                  value={form.bankIfsc}
                  onChange={(v) => set("bankIfsc", v)}
                  placeholder="HDFC0001234"
                  enterKeyHint="next"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Bank Name"
                value={form.bankName}
                onChange={(v) => set("bankName", v)}
                placeholder="e.g. HDFC Bank"
                enterKeyHint="next"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Branch"
                  value={form.bankBranch}
                  onChange={(v) => set("bankBranch", v)}
                  placeholder="Branch name"
                  enterKeyHint="next"
                />
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Statutory IDs">
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="PAN Number"
                value={form.panNumber}
                onChange={(v) => set("panNumber", v)}
                placeholder="ABCDE1234F"
                enterKeyHint="next"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Aadhaar Number"
                  value={form.aadhaarNumber}
                  onChange={(v) => set("aadhaarNumber", v)}
                  placeholder="XXXX XXXX XXXX"
                  enterKeyHint="next"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="PF Number"
                value={form.pfNumber}
                onChange={(v) => set("pfNumber", v)}
                placeholder="PF a/c no."
                enterKeyHint="next"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="ESI Number"
                  value={form.esiNumber}
                  onChange={(v) => set("esiNumber", v)}
                  placeholder="ESI no."
                  enterKeyHint="next"
                />
              </div>
            </div>
            <UnderlineInput
              label="UAN (Universal Account Number)"
              value={form.uan}
              onChange={(v) => set("uan", v)}
              placeholder="UAN"
              enterKeyHint="next"
            />
          </SectionCard>
        </>
      )}

      {step === 4 && (
        <>
          <SectionCard title="Emergency Contact">
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Contact Name"
                value={form.emergencyContactName}
                onChange={(v) => set("emergencyContactName", v)}
                placeholder="e.g. Sunita Kumar"
                enterKeyHint="next"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Contact Phone"
                  value={form.emergencyContactPhone}
                  onChange={(v) => set("emergencyContactPhone", v)}
                  placeholder="98765 43210"
                  type="tel"
                  enterKeyHint="next"
                />
              </div>
            </div>
            <UnderlineInput
              label="Relationship"
              value={form.emergencyContactRelation}
              onChange={(v) => set("emergencyContactRelation", v)}
              placeholder="e.g. Spouse, Parent, Sibling"
              enterKeyHint="next"
            />
          </SectionCard>
          <SectionCard title="Address">
            <UnderlineInput
              label="Permanent Address"
              value={form.permanentAddress}
              onChange={(v) => set("permanentAddress", v)}
              placeholder="Home address"
              enterKeyHint="next"
            />
            <UnderlineInput
              label="Current Address"
              value={form.currentAddress}
              onChange={(v) => set("currentAddress", v)}
              placeholder="Stay address (if different)"
              enterKeyHint="next"
            />
            <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-700)" }}>
              Current address is used for migrant workers whose stay address differs from permanent address.
            </p>
          </SectionCard>
        </>
      )}

      {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={prevStep}
              disabled={saving}
              className="flex items-center gap-1 h-11 px-3 rounded-[0.5rem] text-m-section font-semibold press disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-ink-100)",
                color: "var(--color-ink-700)",
              }}
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
          ) : (
            <div className="w-20" />
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              Next
              <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Adding…" : "Add Employee"}
            </button>
          )}
        </div>
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
  onCreated,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  onCreated?: (employee: { id: string; name: string }) => void;
  nested?: boolean;
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Employee" nested={nested}>
      <MobileNewEmployeeForm
        onClose={onClose}
        projects={projects}
        stockLocations={stockLocations}
        onCreated={onCreated}
      />
    </MobileDialog>
  );
}
