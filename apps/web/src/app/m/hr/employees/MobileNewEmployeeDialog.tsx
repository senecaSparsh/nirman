"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";

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
  name: string;
  trade: string;
  designation: string;
  phone: string;
  email: string;
  wageType: WageType;
  dailyRate: string;
  monthlySalary: string;
  joinDate: string;
  activeProjectId: string;
  hierarchyLevel: string;
  reportingLocationId: string;
  employmentType: string;
  noticePeriodDays: string;
  contractStartDate: string;
  contractEndDate: string;
}

/**
 * MobileNewEmployeeForm — form content for adding an employee.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * employees page, or wrapped by <MobileNewEmployeeDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages
 * (e.g. the leaves dialog). Mirrors the desktop employees-view's
 * API contract (POST /api/employees).
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
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
  const [form, setForm] = useState<FormState>({
    name: "",
    trade: "",
    designation: "",
    phone: "",
    email: "",
    wageType: "DAILY",
    dailyRate: "",
    monthlySalary: "",
    joinDate: "",
    activeProjectId: "",
    hierarchyLevel: "",
    reportingLocationId: "",
    employmentType: "",
    noticePeriodDays: "",
    contractStartDate: "",
    contractEndDate: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Employee name is required");
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
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add employee");
      haptic([10, 40, 80]);
      toast.success("Employee added");
      if (onCreated) {
        onCreated({ id: data.id, name: data.name });
      }
      onClose();
      if (!onCreated) router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  const sectionClass =
    "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };
  const sectionTitleClass =
    "text-m-section font-extrabold tracking-tight";
  const sectionTitleStyle = { color: "var(--color-ink-950)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Details */}
        <div className={sectionClass} style={sectionStyle}>
          <p className={sectionTitleClass} style={sectionTitleStyle}>Details</p>
          {/* Name + Hierarchy Level — side by side */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Name <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Rajesh Kumar"
                autoFocus
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Hierarchy
              </label>
              <select
                value={form.hierarchyLevel}
                onChange={(e) => { set("hierarchyLevel", e.target.value); haptic(10); }}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Unassigned</option>
                <option value="1">H1 — Management</option>
                <option value="2">H2 — Manager</option>
                <option value="3">H3 — Engineer</option>
                <option value="4">H4 — Supervisor</option>
                <option value="5">H5 — Skilled</option>
                <option value="6">H6 — Labor</option>
              </select>
            </div>
          </div>

          {/* Trade + Designation */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Trade / Skill
              </label>
              <input
                type="text"
                value={form.trade}
                onChange={(e) => set("trade", e.target.value)}
                placeholder="e.g. Mason"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Designation
              </label>
              <input
                type="text"
                value={form.designation}
                onChange={(e) => set("designation", e.target.value)}
                placeholder="e.g. Site Supervisor"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className={sectionClass} style={sectionStyle}>
          <p className={sectionTitleClass} style={sectionTitleStyle}>Contact</p>
          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="98765 43210"
                enterKeyHint="next"
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="employee@email.com"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div className={sectionClass} style={sectionStyle}>
          <p className={sectionTitleClass} style={sectionTitleStyle}>Compensation</p>
          {/* Wage Type (selector) + Rate/Salary — side by side */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Wage Type
              </label>
              <select
                value={form.wageType}
                onChange={(e) => { set("wageType", e.target.value as WageType); haptic(10); }}
                className={inputClass}
                style={inputStyle}
              >
                {(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => (
                  <option key={w} value={w}>
                    {WAGE_TYPE_LABELS[w]}
                  </option>
                ))}
              </select>
            </div>
            <div>
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
                className={`${inputClass} tabular-nums`}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Employment Terms */}
        <div className={sectionClass} style={sectionStyle}>
          <p className={sectionTitleClass} style={sectionTitleStyle}>Employment Terms</p>
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Employment Type
              </label>
              <select
                className={inputClass}
                style={inputStyle}
                value={form.employmentType}
                onChange={(e) => set("employmentType", e.target.value)}
              >
                <option value="">— Select —</option>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
                <option value="CASUAL">Casual</option>
                <option value="PROBATION">Probation</option>
                <option value="INTERN">Intern</option>
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Notice (days)
              </label>
              <input
                className={inputClass}
                style={inputStyle}
                type="number"
                min="0"
                value={form.noticePeriodDays}
                onChange={(e) => set("noticePeriodDays", e.target.value)}
                placeholder="30"
              />
            </div>
          </div>
          {(form.employmentType === "CONTRACT" || form.employmentType === "PROBATION") && (
            <div className="grid grid-cols-2 gap-2 divide-x mt-2" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Contract Start
                </label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="date"
                  value={form.contractStartDate}
                  onChange={(e) => set("contractStartDate", e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Contract End
                </label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  type="date"
                  value={form.contractEndDate}
                  onChange={(e) => set("contractEndDate", e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Assignment */}
        <div className={sectionClass} style={sectionStyle}>
          <p className={sectionTitleClass} style={sectionTitleStyle}>Assignment</p>
          {/* Join Date + Project */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Join Date
              </label>
              <input
                type="date"
                value={form.joinDate}
                onChange={(e) => set("joinDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Active Project
              </label>
              <select
                value={form.activeProjectId}
                onChange={(e) => set("activeProjectId", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reporting Location (geo-fence attendance) */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Reporting Location
            </label>
            <select
              value={form.reportingLocationId}
              onChange={(e) => set("reportingLocationId", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— None (manual attendance) —</option>
              {stockLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-700)" }}>
              Auto-marks PRESENT when employee enters this location&apos;s geo-fence.
            </p>
          </div>
        </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Adding…" : "Add Employee"}
          </button>
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
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  onCreated?: (employee: { id: string; name: string }) => void;
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Employee">
      <MobileNewEmployeeForm
        onClose={onClose}
        projects={projects}
        stockLocations={stockLocations}
        onCreated={onCreated}
      />
    </MobileDialog>
  );
}
