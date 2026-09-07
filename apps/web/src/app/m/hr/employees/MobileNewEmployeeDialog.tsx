"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
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
              <EnumSelect
                label="Wage Type"
                value={form.wageType}
                onChange={(v) => set("wageType", v as WageType)}
                options={(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => ({
                  value: w,
                  label: WAGE_TYPE_LABELS[w],
                }))}
              />
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

          {/* Reporting Location (geo-fence attendance) */}
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
                className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Adding…" : "Add Employee"}
              </button>
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
