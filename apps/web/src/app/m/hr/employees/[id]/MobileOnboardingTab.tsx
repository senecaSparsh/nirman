"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Pencil,
  FileText,
  Check,
  RefreshCw,
  Wallet,
  Ban,
  UserCircle,
  Phone,
  Gift,
  UserPlus,
  Calendar,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";
import { useTabParam } from "@/lib/use-tab-param";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import {
  UnderlineInput,
  EnumSelect,
} from "@/components/mobile/v2/form-primitives";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { MobileCreateAccountDialog } from "@/app/m/hr/employees/MobileCreateAccountDialog";
import { haptic } from "@/lib/haptic";

/* ═══════════════════════════════════════════════════════════════════════════
   MobileOnboardingTab — the full hiring → account → agreement → deposit →
   dossier → offboarding workflow, grouped behind a RegisterTabs toggle
   (same look as the stock hub).

   Reuses existing components:
     · MobileCreateAccountDialog  (account creation/linking)
     · EmployeeEditSheet           (profile editing — passed from parent)
     · AttachmentList              (document uploads)
     · All existing API endpoints  (generate-agreement, confirm-agreement,
                                     setup-deposit, terminate, check-phone,
                                     assign-phone, unlink-phone)

   Sub-tabs: Profile · Account · Agreement · Deposit · Dossier · Offboard
   ═══════════════════════════════════════════════════════════════════════════ */

export type OnboardingEmployeeData = {
  id: string;
  name: string;
  trade: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  wageType: "DAILY" | "MONTHLY" | "FIXED";
  dailyRate: number | null;
  monthlySalary: number | null;
  joinDate: string | null;
  hierarchyLevel: number | null;
  active: boolean;
  activeProjectId: string | null;
  activeProjectName: string | null;
  reportingLocationId: string | null;
  reportingLocationName: string | null;
  crewName: string | null;
  crewProjectName: string | null;
  userId: string | null;
  // Contract / agreement
  contractStatus: string | null;
  contractIssuedAt: string | null;
  contractConfirmedAt: string | null;
  employmentType: string | null;
  probationEndDate: string | null;
  confirmationDate: string | null;
  noticePeriodDays: number | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  // Auto-deposit
  autoDepositEnabled: boolean | null;
  autoDepositSetupAt: string | null;
  payDay: number | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  bankBranch: string | null;
  // Statutory IDs
  panNumber: string | null;
  aadhaarNumber: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  uan: string | null;
  // Emergency contact
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  // Addresses
  permanentAddress: string | null;
  currentAddress: string | null;
  // Benefits
  benefits: {
    id: string; type: string; amount: number | null; frequency: string;
    startDate: string | null; endDate: string | null; notes: string | null; active: boolean;
  }[];
  // Attachments
  attachments: {
    id: string; category: string; label: string | null; createdAt: string;
    upload: { id: string; url: string; originalName: string; mimeType: string; size: number };
  }[];
  // Linked user
  user: {
    id: string;
    email: string; role: string; phone: string | null; image: string | null;
    employeeCode: string | null; department: string | null;
    joiningDate: string | null; active: boolean; lastLoginAt: string | null;
  } | null;
};

const ONBOARDING_TABS = ["profile", "account", "agreement", "deposit", "dossier", "offboard"] as const;

const HIERARCHY_LABELS = ["Management", "Manager", "Engineer", "Supervisor", "Skilled", "Labor"];

export function MobileOnboardingTab({
  employee,
  canManage,
  canManagePayroll,
  actorRole,
  projects,
  stockLocations,
  onEdit, // opens the existing EmployeeEditSheet from the parent
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  canManagePayroll: boolean;
  actorRole: string;
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string }[];
  onEdit: () => void;
}) {
  const [subTab, setSubTab] = useTabParam(ONBOARDING_TABS, "profile", { param: "onboard" });

  // ── Onboarding progress (6 steps, same as desktop) ──
  const hasProfile = !!(employee.name && (employee.phone || employee.user?.phone) && (employee.designation || employee.trade));
  const hasWage = employee.wageType === "DAILY" ? (employee.dailyRate ?? 0) > 0 : (employee.monthlySalary ?? 0) > 0;
  const hasEmploymentTerms = !!(
    employee.employmentType &&
    employee.noticePeriodDays != null &&
    (employee.employmentType !== "CONTRACT" || employee.contractStartDate) &&
    (employee.employmentType !== "PROBATION" || employee.contractStartDate)
  );
  const hasAccount = !!employee.userId;
  const agreementIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? "");
  const agreementConfirmed = ["CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? "");
  const hasAutoDeposit = employee.autoDepositEnabled === true;

  const steps = [
    { label: "Profile & Wage", done: hasProfile && hasWage },
    { label: "Employment Terms", done: hasEmploymentTerms },
    { label: "Login Account", done: hasAccount },
    { label: "Agreement Issued", done: agreementIssued },
    { label: "Agreement Confirmed", done: agreementConfirmed },
    { label: "Auto-Deposit", done: hasAutoDeposit },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const isComplete = completedCount === steps.length;

  return (
    <div className="px-4 space-y-3">
      {/* ── Onboarding progress bar ── */}
      <OnboardingProgress steps={steps} completedCount={completedCount} isComplete={isComplete} canManage={canManage} />

      {/* ── Sub-tab toggle (same RegisterTabs look as stock hub) ── */}
      <RegisterTabs
        tabs={[
          { value: "profile", label: "Profile" },
          { value: "account", label: "Account" },
          { value: "agreement", label: "Agreement" },
          { value: "deposit", label: "Deposit" },
          { value: "dossier", label: "Dossier" },
          { value: "offboard", label: "Offboard" },
        ]}
        value={subTab}
        onChange={setSubTab}
      />

      {/* ── Sub-tab content ── */}
      {subTab === "profile" && (
        <ProfileSubTab
          employee={employee}
          canManage={canManage}
          projects={projects}
          stockLocations={stockLocations}
          onEdit={onEdit}
        />
      )}

      {subTab === "account" && (
        <AccountSubTab
          employee={employee}
          canManage={canManage}
          actorRole={actorRole}
          projects={projects}
        />
      )}

      {subTab === "agreement" && (
        <AgreementSubTab
          employee={employee}
          canManage={canManage}
        />
      )}

      {subTab === "deposit" && (
        <DepositSubTab
          employee={employee}
          canManagePayroll={canManagePayroll}
        />
      )}

      {subTab === "dossier" && (
        <DossierSubTab
          employee={employee}
          canManage={canManage}
        />
      )}

      {subTab === "offboard" && (
        <OffboardSubTab
          employee={employee}
          canManage={canManage}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Onboarding progress — compact 6-step checklist with completion bar
   ═══════════════════════════════════════════════════════════════════════════ */
function OnboardingProgress({
  steps,
  completedCount,
  isComplete,
  canManage: _canManage,
}: {
  steps: { label: string; done: boolean }[];
  completedCount: number;
  isComplete: boolean;
  canManage: boolean;
}) {
  const pct = Math.round((completedCount / steps.length) * 100);

  return (
    <div
      className="rounded-[0.75rem] border p-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Onboarding
        </p>
        <span
          className="text-m-label font-bold tabular-nums"
          style={{ color: isComplete ? "var(--color-go)" : "var(--color-ink-500)" }}
        >
          {completedCount}/{steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden mb-2.5"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: isComplete ? "var(--color-go)" : "var(--color-ink-950)",
            transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>

      {/* Steps — compact 2-col grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {step.done ? (
              <CheckCircle2 className="size-3 shrink-0" style={{ color: "var(--color-go)" }} />
            ) : (
              <Circle className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
            )}
            <span
              className="text-m-caption truncate"
              style={{ color: step.done ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {isComplete && (
        <div
          className="flex items-center gap-1.5 rounded-[0.375rem] px-2 py-1.5 mt-2 text-m-caption"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)", color: "var(--color-go)" }}
        >
          <CheckCircle2 className="size-3.5" />
          <span className="font-semibold">Onboarding complete</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROFILE SUB-TAB — hire details summary + employment terms editing
   ═══════════════════════════════════════════════════════════════════════════ */
function ProfileSubTab({
  employee,
  canManage,
  projects,
  stockLocations,
  onEdit: _onEdit,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string }[];
  onEdit: () => void;
}) {
  const router = useRouter();
  const [editingHire, setEditingHire] = useState(false);
  const [editingTerms, setEditingTerms] = useState(false);

  const wageValue = employee.wageType === "DAILY"
    ? formatCurrency(employee.dailyRate ?? 0) + "/day"
    : employee.monthlySalary != null
      ? formatCurrency(employee.monthlySalary) + "/mo"
      : "—";

  return (
    <div className="space-y-3">
      {/* ── Hire details — read-only summary with edit button ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
            Hire Details
          </p>
          {canManage && !editingHire && (
            <button
              onClick={() => { haptic(10); setEditingHire(true); }}
              className="flex items-center gap-1 text-m-caption font-semibold press"
              style={{ color: "var(--color-ink-600)" }}
            >
              <Pencil className="size-3" /> Edit
            </button>
          )}
        </div>
        <div className="px-3 pb-3">
          {editingHire ? (
            <HireDetailsEditor
              employee={employee}
              projects={projects}
              stockLocations={stockLocations}
              onClose={() => setEditingHire(false)}
              onSaved={() => { setEditingHire(false); router.refresh(); }}
            />
          ) : (
            <InfoGrid items={[
              { label: "Trade", value: employee.trade },
              { label: "Designation", value: employee.designation },
              { label: "Wage", value: wageValue },
              { label: "Hierarchy", value: employee.hierarchyLevel != null ? `H${employee.hierarchyLevel} · ${HIERARCHY_LABELS[employee.hierarchyLevel - 1] ?? "Level " + employee.hierarchyLevel}` : null },
              { label: "Project", value: employee.activeProjectName },
              { label: "Reporting", value: employee.reportingLocationName },
              { label: "Crew", value: employee.crewName, sub: employee.crewProjectName ?? undefined },
              { label: "Joined", value: employee.joinDate ? formatDate(employee.joinDate) : null },
            ]} />
          )}
        </div>
      </div>

      {/* ── Employment terms — editable inline ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
            Employment Terms
          </p>
          {canManage && !editingTerms && (
            <button
              onClick={() => { haptic(10); setEditingTerms(true); }}
              className="flex items-center gap-1 text-m-caption font-semibold press"
              style={{ color: "var(--color-ink-600)" }}
            >
              <Pencil className="size-3" /> Edit
            </button>
          )}
        </div>
        <div className="px-3 pb-3">
          {editingTerms ? (
            <EmploymentTermsEditor
              employee={employee}
              onClose={() => setEditingTerms(false)}
              onSaved={() => { setEditingTerms(false); router.refresh(); }}
            />
          ) : (
            <InfoGrid items={[
              { label: "Type", value: employee.employmentType ? employee.employmentType.charAt(0) + employee.employmentType.slice(1).toLowerCase() : null },
              { label: "Notice", value: employee.noticePeriodDays != null ? `${employee.noticePeriodDays} days` : null },
              { label: "Contract Start", value: employee.contractStartDate ? formatDate(employee.contractStartDate) : null },
              { label: "Contract End", value: employee.contractEndDate ? formatDate(employee.contractEndDate) : null },
              { label: "Probation End", value: employee.probationEndDate ? formatDate(employee.probationEndDate) : null },
              { label: "Confirmed", value: employee.confirmationDate ? formatDate(employee.confirmationDate) : null },
            ]} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Hire details editor — inline form for core profile fields ── */
function HireDetailsEditor({
  employee,
  projects,
  stockLocations,
  onClose,
  onSaved,
}: {
  employee: OnboardingEmployeeData;
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee.name ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [trade, setTrade] = useState(employee.trade ?? "");
  const [designation, setDesignation] = useState(employee.designation ?? "");
  const [hierarchyLevel, setHierarchyLevel] = useState(employee.hierarchyLevel?.toString() ?? "");
  const [joinDate, setJoinDate] = useState(employee.joinDate ? employee.joinDate.split("T")[0] ?? "" : "");
  const [activeProjectId, setActiveProjectId] = useState(employee.activeProjectId ?? "");
  const [reportingLocationId, setReportingLocationId] = useState(employee.reportingLocationId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      haptic([50, 20, 50]);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          trade: trade.trim() || null,
          designation: designation.trim() || null,
          hierarchyLevel: hierarchyLevel ? Number(hierarchyLevel) : null,
          joinDate: joinDate || null,
          activeProjectId: activeProjectId || null,
          reportingLocationId: reportingLocationId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Hire details updated");
      onSaved();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 py-1">
      <UnderlineInput label="Name" value={name} onChange={setName} placeholder="Full name" />
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <UnderlineInput label="Phone" value={phone} onChange={setPhone} placeholder="10-digit mobile" />
        <UnderlineInput label="Trade" value={trade} onChange={setTrade} placeholder="e.g. Masonry" />
      </div>
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <UnderlineInput label="Designation" value={designation} onChange={setDesignation} placeholder="e.g. Supervisor" />
        <EnumSelect
          label="Hierarchy"
          value={hierarchyLevel}
          onChange={setHierarchyLevel}
          placeholder="— Select —"
          options={[
            { value: "1", label: "H1 · Management" },
            { value: "2", label: "H2 · Manager" },
            { value: "3", label: "H3 · Engineer" },
            { value: "4", label: "H4 · Supervisor" },
            { value: "5", label: "H5 · Skilled" },
            { value: "6", label: "H6 · Labor" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <EnumSelect
          label="Project"
          value={activeProjectId}
          onChange={setActiveProjectId}
          placeholder="— None —"
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <EnumSelect
          label="Reporting"
          value={reportingLocationId}
          onChange={setReportingLocationId}
          placeholder="— None —"
          options={stockLocations.map((l) => ({ value: l.id, label: l.name }))}
        />
      </div>
      <UnderlineInput label="Join Date" type="date" value={joinDate} onChange={setJoinDate} />
      <div className="flex gap-2 pt-1">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Save
        </button>
      </div>
    </div>
  );
}

/* ── Employment terms editor — inline form ── */
function EmploymentTermsEditor({
  employee,
  onClose,
  onSaved,
}: {
  employee: OnboardingEmployeeData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [employmentType, setEmploymentType] = useState(employee.employmentType ?? "");
  const [noticePeriodDays, setNoticePeriodDays] = useState(employee.noticePeriodDays?.toString() ?? "");
  const [contractStartDate, setContractStartDate] = useState(employee.contractStartDate ? employee.contractStartDate.split("T")[0] ?? "" : "");
  const [contractEndDate, setContractEndDate] = useState(employee.contractEndDate ? employee.contractEndDate.split("T")[0] ?? "" : "");
  const [probationEndDate, setProbationEndDate] = useState(employee.probationEndDate ? employee.probationEndDate.split("T")[0] ?? "" : "");
  const [confirmationDate, setConfirmationDate] = useState(employee.confirmationDate ? employee.confirmationDate.split("T")[0] ?? "" : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employmentType: employmentType || null,
          noticePeriodDays: noticePeriodDays ? Number(noticePeriodDays) : null,
          contractStartDate: contractStartDate || null,
          contractEndDate: contractEndDate || null,
          probationEndDate: probationEndDate || null,
          confirmationDate: confirmationDate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Employment terms updated");
      onSaved();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 py-1">
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <EnumSelect
          label="Employment Type"
          value={employmentType}
          onChange={setEmploymentType}
          placeholder="— Select —"
          options={[
            { value: "PERMANENT", label: "Permanent" },
            { value: "CONTRACT", label: "Contract" },
            { value: "CASUAL", label: "Casual" },
            { value: "PROBATION", label: "Probation" },
            { value: "INTERN", label: "Intern" },
          ]}
        />
        <UnderlineInput
          label="Notice (days)"
          type="number"
          inputMode="numeric"
          value={noticePeriodDays}
          onChange={setNoticePeriodDays}
          placeholder="30"
        />
      </div>
      {(employmentType === "CONTRACT" || employmentType === "PROBATION") && (
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <UnderlineInput label="Contract Start" type="date" value={contractStartDate} onChange={setContractStartDate} />
          <UnderlineInput label="Contract End" type="date" value={contractEndDate} onChange={setContractEndDate} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <UnderlineInput label="Probation End" type="date" value={probationEndDate} onChange={setProbationEndDate} />
        <UnderlineInput label="Confirmed On" type="date" value={confirmationDate} onChange={setConfirmationDate} />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Save
        </button>
      </div>
    </div>
  );
}

/* ── InfoGrid — 2-column stat grid (label-over-value, matches equipment page) ── */
function InfoGrid({
  items,
}: {
  items: { label: string; value: string | null | undefined; sub?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 py-1">
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <p className="text-m-caption font-semibold uppercase tracking-wide truncate" style={{ color: "var(--color-ink-500)" }}>
            {item.label}
          </p>
          <p
            className="text-m-label font-bold truncate"
            style={{ color: item.value ? "var(--color-ink-950)" : "var(--color-ink-300)" }}
          >
            {item.value || "—"}
          </p>
          {item.sub && <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Status badge helper
   ═══════════════════════════════════════════════════════════════════════════ */
function StatusPill({
  text,
  tone,
}: {
  text: string;
  tone: "go" | "stop" | "signal" | "neutral";
}) {
  const colors = {
    go: { bg: "var(--color-go-wash)", fg: "var(--color-go)", dot: "var(--color-go)" },
    stop: { bg: "color-mix(in srgb, var(--color-stop) 12%, transparent)", fg: "var(--color-stop)", dot: "var(--color-stop)" },
    signal: { bg: "color-mix(in srgb, var(--color-signal) 12%, transparent)", fg: "var(--color-signal-dark)", dot: "var(--color-signal)" },
    neutral: { bg: "var(--color-concrete)", fg: "var(--color-ink-500)", dot: "var(--color-ink-300)" },
  }[tone];

  return (
    <span
      className="inline-flex items-center gap-1 text-m-label font-semibold px-1.5 py-0.5 rounded-full"
      style={{ backgroundColor: colors.bg, color: colors.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
      {text}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PLACEHOLDER sub-tabs — implemented in subsequent parts
   ═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   ACCOUNT SUB-TAB — login account status + create/link + phone management
   Reuses the existing MobileCreateAccountDialog (same component as the
   overview tab's "Create Login Account" button).
   ═══════════════════════════════════════════════════════════════════════════ */
function AccountSubTab({
  employee,
  canManage,
  actorRole,
  projects,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  actorRole: string;
  projects: { id: string; name: string }[];
}) {
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<
    { id: string; phoneNumber: string; label: string | null; department: string | null; status: string; monthlyCost: number | null; provider: string | null }[]
  >([]);

  const u = employee.user;
  const loginPhone = employee.phone ?? u?.phone ?? null;

  async function openCreateAccount() {
    try {
      const res = await fetch("/api/telephony/numbers/available");
      if (res.ok) setAvailableNumbers(await res.json());
    } catch { /* ignore — dialog handles empty list */ }
    setShowCreateAccount(true);
  }

  return (
    <div className="space-y-3">
      {u ? (
        <>
          {/* ── Account linked — show status + details ── */}
          <div
            className="rounded-[0.75rem] overflow-hidden"
            style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
          >
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
              <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
                Login Account
              </p>
              <StatusPill text={u.active ? "Linked" : "Disabled"} tone={u.active ? "go" : "stop"} />
            </div>
            <div className="px-3 pb-3">
              <InfoGrid items={[
                { label: "Email", value: u.email },
                { label: "Role", value: u.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) },
                ...(u.employeeCode ? [{ label: "Code", value: u.employeeCode }] : []),
                ...(u.department ? [{ label: "Dept", value: u.department }] : []),
                ...(loginPhone ? [{ label: "Login Phone", value: loginPhone }] : []),
                ...(u.joiningDate ? [{ label: "Joined", value: formatDate(u.joiningDate) }] : []),
                ...(u.lastLoginAt ? [{ label: "Last Login", value: formatDate(u.lastLoginAt) }] : []),
              ]} />
            </div>
          </div>

          {/* ── Phone & call tracking info ── */}
          <div
            className="rounded-[0.75rem] overflow-hidden"
            style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
          >
            <div className="px-3 pt-3 pb-1">
              <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
                Phone & Call Tracking
              </p>
            </div>
            <div className="px-3 pb-3">
              <p className="text-m-caption py-2" style={{ color: "var(--color-ink-500)" }}>
                {loginPhone
                  ? "This phone number is the employee's OTP login and is connected to call tracking. Manage numbers in Telephony."
                  : "No phone number assigned. The account uses OTP login via the assigned company phone."}
              </p>
            </div>
          </div>

          {/* ── Account management actions ── */}
          {canManage && (
            <AccountActions employee={employee} />
          )}
        </>
      ) : employee.active ? (
        <>
          {/* ── No account — create or link ── */}
          <div
            className="rounded-[0.75rem] p-4 text-center"
            style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
          >
            <UserCircle className="size-8 mx-auto mb-2" style={{ color: "var(--color-ink-400)" }} />
            <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>
              No login account
            </p>
            <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
              Create a phone-based OTP login, or link an existing user.
            </p>
          </div>

          {canManage && (
            <button
              onClick={() => { haptic(10); openCreateAccount(); }}
              className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <div
                className="shrink-0 grid place-items-center size-9 rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-paper) 15%, transparent)" }}
              >
                <UserPlus className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-label font-semibold">Create / Link Login Account</p>
                <p className="text-m-caption mt-0.5" style={{ color: "color-mix(in srgb, var(--color-paper) 60%, transparent)" }}>
                  Assign role, phone & permissions
                </p>
              </div>
            </button>
          )}

          {showCreateAccount && (
            <MobileCreateAccountDialog
              employeeId={employee.id}
              employeeName={employee.name}
              employeePhone={employee.phone}
              employeeEmail={employee.email}
              employeeDesignation={employee.designation}
              employeeHierarchyLevel={employee.hierarchyLevel}
              actorRole={actorRole}
              projects={projects}
              availableNumbers={availableNumbers}
              onClose={() => setShowCreateAccount(false)}
            />
          )}
        </>
      ) : (
        <div
          className="rounded-[0.75rem] p-4 text-center"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
            Inactive employee — no account actions available.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Account actions — disable/enable account, unlink phone ── */
function AccountActions({ employee }: { employee: OnboardingEmployeeData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<null | "disable" | "enable" | "unlink">(null);

  const u = employee.user;
  if (!u) return null;

  async function act(action: "disable" | "enable" | "unlink") {
    setBusy(true);
    try {
      if (action === "unlink") {
        const res = await fetch(`/api/employees/${employee.id}/unlink-phone`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to unlink phone");
        haptic([10, 40, 80]);
        toast.success("Phone number unlinked");
      } else {
        const userId = employee.user?.id;
        if (!userId) throw new Error("No linked user");
        const res = await fetch(`/api/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: action === "enable" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed");
        haptic([10, 40, 80]);
        toast.success(action === "enable" ? "Account enabled" : "Account disabled");
      }
      setConfirming(null);
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="px-3 pt-3 pb-1">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Account Actions
        </p>
      </div>
      <div className="px-3 pb-3 space-y-1.5">
        {/* Enable/Disable toggle */}
        {u.active ? (
          <button
            onClick={() => { haptic(10); setConfirming("disable"); }}
            className="w-full rounded-[0.5rem] p-2 flex items-center gap-2 text-m-caption font-semibold press text-left"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 8%, transparent)", color: "var(--color-stop)" }}
          >
            <Ban className="size-3.5 shrink-0" /> Disable login account
          </button>
        ) : (
          <button
            onClick={() => { haptic(10); setConfirming("enable"); }}
            className="w-full rounded-[0.5rem] p-2 flex items-center gap-2 text-m-caption font-semibold press text-left"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}
          >
            <Check className="size-3.5 shrink-0" /> Enable login account
          </button>
        )}

        {/* Unlink phone */}
        {employee.phone && (
          <button
            onClick={() => { haptic(10); setConfirming("unlink"); }}
            className="w-full rounded-[0.5rem] p-2 flex items-center gap-2 text-m-caption font-semibold press text-left"
            style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-600)" }}
          >
            <Phone className="size-3.5 shrink-0" /> Unlink phone number
          </button>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirming && (
        <MobileDialog open onClose={() => setConfirming(null)} title={
          confirming === "disable" ? "Disable Account?" :
          confirming === "enable" ? "Enable Account?" :
          "Unlink Phone?"
        }>
          <div className="space-y-3">
            <p className="text-m-body py-2" style={{ color: "var(--color-ink-700)" }}>
              {confirming === "disable" && `This will prevent ${employee.name} from logging in. They will not be able to access the system until re-enabled.`}
              {confirming === "enable" && `This will allow ${employee.name} to log in again using their phone number.`}
              {confirming === "unlink" && `This will remove the phone number from ${employee.name}'s account. The number returns to the available pool for re-assignment.`}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirming(null)}
                disabled={busy}
                className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => act(confirming)}
                disabled={busy}
                className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: confirming === "enable" ? "var(--color-go)" : confirming === "disable" ? "var(--color-stop)" : "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Confirm
              </button>
            </div>
          </div>
        </MobileDialog>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AGREEMENT SUB-TAB — generate, view/print, confirm, regenerate
   All mobile-native (no desktop redirect). Uses the existing API endpoints:
     · POST /api/employees/[id]/generate-agreement
     · POST /api/employees/[id]/confirm-agreement
   The print page is at /print/employment-agreement/[id] (opens in new tab).
   ═══════════════════════════════════════════════════════════════════════════ */
function AgreementSubTab({
  employee,
  canManage,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const status = employee.contractStatus;
  const issued = ["ISSUED", "CONFIRMED", "EXPIRED", "TERMINATED"].includes(status ?? "");
  const confirmed = ["CONFIRMED", "EXPIRED"].includes(status ?? "");

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/generate-agreement`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to generate agreement");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Agreement generated");
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/confirm-agreement`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to confirm agreement");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Agreement confirmed");
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateAndConfirm() {
    setBusy(true);
    try {
      // Step 1: Generate
      const genRes = await fetch(`/api/employees/${employee.id}/generate-agreement`, { method: "POST" });
      const genData = await genRes.json().catch(() => ({}));
      if (!genRes.ok) throw new Error(genData.error ?? "Failed to generate");
      // Step 2: Confirm
      const confRes = await fetch(`/api/employees/${employee.id}/confirm-agreement`, { method: "POST" });
      const confData = await confRes.json().catch(() => ({}));
      if (!confRes.ok) throw new Error(confData.error ?? "Failed to confirm");
      haptic([10, 40, 80]);
      toast.success("Agreement generated & confirmed");
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel: Record<string, string> = {
    DRAFT: "Draft",
    ISSUED: "Issued (pending confirmation)",
    CONFIRMED: "Confirmed",
    EXPIRED: "Expired",
    TERMINATED: "Terminated",
  };

  return (
    <div className="space-y-3">
      {/* ── Agreement status card ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
            Employment Agreement
          </p>
          <StatusPill
            text={status ? statusLabel[status] ?? status : "Not issued"}
            tone={confirmed ? "go" : issued ? "signal" : "neutral"}
          />
        </div>
        <div className="px-3 pb-3">
          {status ? (
            <InfoGrid items={[
              ...(employee.contractIssuedAt ? [{ label: "Issued", value: formatDate(employee.contractIssuedAt) }] : []),
              ...(employee.contractConfirmedAt ? [{ label: "Confirmed", value: formatDate(employee.contractConfirmedAt) }] : []),
              ...(employee.employmentType ? [{ label: "Type", value: employee.employmentType.charAt(0) + employee.employmentType.slice(1).toLowerCase() }] : []),
              ...(employee.contractEndDate ? [{ label: "End Date", value: formatDate(employee.contractEndDate) }] : []),
            ]} />
          ) : (
            <p className="text-m-caption py-2" style={{ color: "var(--color-ink-500)" }}>
              No employment agreement. Generate one to formalize the terms.
            </p>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      {canManage && employee.active && (
        <div className="space-y-2">
          {/* View / Print — always available once issued */}
          {issued && (
            <a
              href={`/print/employment-agreement/${employee.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left"
              style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
            >
              <div
                className="shrink-0 grid place-items-center size-9 rounded-full"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                <FileText className="size-4" style={{ color: "var(--color-ink-600)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>View / Print Agreement</p>
                <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>Opens print-friendly page</p>
              </div>
            </a>
          )}

          {/* Confirm — only when ISSUED */}
          {status === "ISSUED" && (
            <button
              onClick={() => { haptic(10); confirm(); }}
              disabled={busy}
              className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left disabled:opacity-50"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-go) 30%, transparent)" }}
            >
              <div
                className="shrink-0 grid place-items-center size-9 rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 15%, transparent)" }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" style={{ color: "var(--color-go)" }} /> : <CheckCircle2 className="size-4" style={{ color: "var(--color-go)" }} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-label font-semibold" style={{ color: "var(--color-go)" }}>Confirm Agreement</p>
                <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>Mark as signed → unlocks auto-deposit</p>
              </div>
            </button>
          )}

          {/* Generate & Confirm — when no agreement yet */}
          {!issued && (
            <button
              onClick={() => { haptic(10); generateAndConfirm(); }}
              disabled={busy}
              className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <div
                className="shrink-0 grid place-items-center size-9 rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-paper) 15%, transparent)" }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-label font-semibold">Generate & Confirm</p>
                <p className="text-m-caption mt-0.5" style={{ color: "color-mix(in srgb, var(--color-paper) 60%, transparent)" }}>One step — issue + mark signed</p>
              </div>
            </button>
          )}

          {/* Generate Only — when no agreement yet */}
          {!issued && (
            <button
              onClick={() => { haptic(10); generate(); }}
              disabled={busy}
              className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left disabled:opacity-50"
              style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
            >
              <div
                className="shrink-0 grid place-items-center size-9 rounded-full"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" style={{ color: "var(--color-ink-500)" }} /> : <FileText className="size-4" style={{ color: "var(--color-ink-600)" }} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>Generate Only</p>
                <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>Issue first, confirm after signing</p>
              </div>
            </button>
          )}

          {/* Regenerate — when terms changed after issuing */}
          {issued && status !== "TERMINATED" && (
            <button
              onClick={() => { haptic(10); generate(); }}
              disabled={busy}
              className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left disabled:opacity-50"
              style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
            >
              <div
                className="shrink-0 grid place-items-center size-9 rounded-full"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" style={{ color: "var(--color-ink-500)" }} /> : <RefreshCw className="size-4" style={{ color: "var(--color-ink-600)" }} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-700)" }}>Regenerate</p>
                <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>Terms changed — re-issue</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEPOSIT SUB-TAB — auto-deposit status + bank details + setup/edit/disable
   Uses the existing API endpoint:
     · POST /api/employees/[id]/setup-deposit
   Prerequisites: agreement must be confirmed before setup.
   Permission: PAYROLL_MANAGE.
   ═══════════════════════════════════════════════════════════════════════════ */
function DepositSubTab({
  employee,
  canManagePayroll,
}: {
  employee: OnboardingEmployeeData;
  canManagePayroll: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const enabled = employee.autoDepositEnabled === true;
  const confirmed = ["CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? "");

  return (
    <div className="space-y-3">
      {/* ── Auto-deposit status ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
            Auto-Deposit
          </p>
          <StatusPill
            text={enabled ? "Active" : "Off"}
            tone={enabled ? "go" : "neutral"}
          />
        </div>
        <div className="px-3 pb-3">
          {enabled ? (
            <InfoGrid items={[
              { label: "Pay Day", value: employee.payDay != null ? `${employee.payDay}${ordinal(employee.payDay)} of month` : null },
              { label: "Holder", value: employee.bankAccountHolder },
              { label: "A/C No.", value: employee.bankAccountNumber },
              { label: "Bank", value: employee.bankName, sub: employee.bankBranch ?? undefined },
              { label: "IFSC", value: employee.bankIfsc },
            ]} />
          ) : (
            <p className="text-m-caption py-2" style={{ color: "var(--color-ink-500)" }}>
              {confirmed
                ? "Auto-deposit is not set up. Add bank details to enable automatic salary credit."
                : "Agreement must be confirmed before auto-deposit can be set up."}
            </p>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      {canManagePayroll && employee.active && (
        <div className="space-y-2">
          {enabled ? (
            <>
              <button
                onClick={() => { haptic(10); setEditing(true); }}
                className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left"
                style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
              >
                <div className="shrink-0 grid place-items-center size-9 rounded-full" style={{ backgroundColor: "var(--color-concrete)" }}>
                  <Pencil className="size-4" style={{ color: "var(--color-ink-600)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>Edit Bank Details</p>
                  <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>Update account, IFSC, or pay day</p>
                </div>
              </button>
              <DisableDepositButton employeeId={employee.id} onDone={() => router.refresh()} />
            </>
          ) : confirmed ? (
            <button
              onClick={() => { haptic(10); setEditing(true); }}
              className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <div className="shrink-0 grid place-items-center size-9 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-paper) 15%, transparent)" }}>
                <Wallet className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-label font-semibold">Set Up Auto-Deposit</p>
                <p className="text-m-caption mt-0.5" style={{ color: "color-mix(in srgb, var(--color-paper) 60%, transparent)" }}>Add bank account + pay day</p>
              </div>
            </button>
          ) : (
            <div
              className="rounded-[0.75rem] p-3 flex items-center gap-3"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <FileText className="size-4 shrink-0" style={{ color: "var(--color-ink-400)" }} />
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                Confirm the employment agreement first to unlock auto-deposit setup.
              </p>
            </div>
          )}
        </div>
      )}

      {editing && (
        <DepositEditor
          employee={employee}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

/* ── Deposit editor — bottom-sheet form ── */
function DepositEditor({
  employee,
  onClose,
  onSaved,
}: {
  employee: OnboardingEmployeeData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [holder, setHolder] = useState(employee.bankAccountHolder ?? "");
  const [accountNo, setAccountNo] = useState(employee.bankAccountNumber ?? "");
  const [ifsc, setIfsc] = useState(employee.bankIfsc ?? "");
  const [bankName, setBankName] = useState(employee.bankName ?? "");
  const [branch, setBranch] = useState(employee.bankBranch ?? "");
  const [payDay, setPayDay] = useState(employee.payDay?.toString() ?? "1");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!holder || !accountNo || !ifsc || !bankName) {
      toast.error("Fill all required fields");
      haptic([50, 20, 50]);
      return;
    }
    const pd = Number(payDay);
    if (!pd || pd < 1 || pd > 31) {
      toast.error("Pay day must be between 1 and 31");
      haptic([50, 20, 50]);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/setup-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountHolder: holder,
          bankAccountNumber: accountNo,
          bankIfsc: ifsc,
          bankName,
          bankBranch: branch || null,
          payDay: pd,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to set up deposit");
      haptic([10, 40, 80]);
      toast.success("Auto-deposit saved");
      onSaved();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog
      open
      onClose={onClose}
      title={employee.autoDepositEnabled ? "Edit Bank Details" : "Set Up Auto-Deposit"}
    >
      <div className="space-y-3">
        <UnderlineInput label="Account Holder" value={holder} onChange={setHolder} placeholder="Name as per bank" required />
        <UnderlineInput label="Account Number" value={accountNo} onChange={setAccountNo} placeholder="Bank account number" required mono inputMode="numeric" />
        <div className="grid grid-cols-2 gap-2">
          <UnderlineInput label="IFSC" value={ifsc} onChange={setIfsc} placeholder="HDFC0001234" required mono />
          <UnderlineInput label="Pay Day" value={payDay} onChange={setPayDay} type="number" inputMode="numeric" placeholder="1" required />
        </div>
        <UnderlineInput label="Bank Name" value={bankName} onChange={setBankName} placeholder="e.g. HDFC Bank" required />
        <UnderlineInput label="Branch" value={branch} onChange={setBranch} placeholder="Branch (optional)" />
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </button>
        </div>
      </div>
    </MobileDialog>
  );
}

/* ── Disable deposit button with confirmation ── */
function DisableDepositButton({ employeeId, onDone }: { employeeId: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function disable() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/setup-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disable: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to disable");
      haptic([10, 40, 80]);
      toast.success("Auto-deposit disabled");
      setConfirming(false);
      onDone();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { haptic(10); setConfirming(true); }}
        className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-stop) 25%, transparent)" }}
      >
        <div className="shrink-0 grid place-items-center size-9 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)" }}>
          <Ban className="size-4" style={{ color: "var(--color-stop)" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-m-label font-semibold" style={{ color: "var(--color-stop)" }}>Disable Auto-Deposit</p>
          <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>Stop automatic salary credit</p>
        </div>
      </button>

      {confirming && (
        <MobileDialog open onClose={() => setConfirming(false)} title="Disable Auto-Deposit?">
          <p className="text-m-label py-2" style={{ color: "var(--color-ink-700)" }}>
            Salary will no longer be auto-credited. Bank details will be cleared. You can re-enable later.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={disable}
              disabled={busy}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              Disable
            </button>
          </div>
        </MobileDialog>
      )}
    </>
  );
}

/* ── ordinal helper (1st, 2nd, 3rd...) ── */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0] ?? "th";
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOSSIER SUB-TAB — statutory IDs, emergency contact, addresses, documents,
   and benefits. All editable inline on mobile.
   Uses PATCH /api/employees/[id] for field updates.
   Uses AttachmentList for document uploads (existing infrastructure).
   ═══════════════════════════════════════════════════════════════════════════ */
function DossierSubTab({
  employee,
  canManage,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
}) {
  return (
    <div className="space-y-3">
      <StatutoryIdsCard employee={employee} canManage={canManage} />
      <EmergencyContactCard employee={employee} canManage={canManage} />
      <AddressesCard employee={employee} canManage={canManage} />
      <BenefitsCard employee={employee} canManage={canManage} />
      <DocumentsCard employee={employee} />
    </div>
  );
}

/* ── Statutory IDs card — PAN, Aadhaar (masked), PF, ESI, UAN ── */
function StatutoryIdsCard({ employee, canManage }: { employee: OnboardingEmployeeData; canManage: boolean }) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Statutory IDs
        </p>
        {canManage && !editing && (
          <button
            onClick={() => { haptic(10); setEditing(true); }}
            className="flex items-center gap-1 text-m-caption font-semibold press"
            style={{ color: "var(--color-ink-600)" }}
          >
            <Pencil className="size-3" /> Edit
          </button>
        )}
      </div>
      <div className="px-3 pb-3">
        {editing ? (
          <StatutoryIdsEditor employee={employee} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
        ) : (
          <InfoGrid items={[
            { label: "PAN", value: employee.panNumber },
            { label: "Aadhaar", value: maskAadhaar(employee.aadhaarNumber) },
            { label: "PF No.", value: employee.pfNumber },
            { label: "ESI No.", value: employee.esiNumber },
            { label: "UAN", value: employee.uan },
          ]} />
        )}
      </div>
    </div>
  );
}

function maskAadhaar(aadhaar: string | null): string | null {
  if (!aadhaar) return null;
  const digits = aadhaar.replace(/\D/g, "");
  if (digits.length < 12) return aadhaar;
  return `•••• •••• ${digits.slice(-4)}`;
}

function StatutoryIdsEditor({ employee, onClose, onSaved }: { employee: OnboardingEmployeeData; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [pan, setPan] = useState(employee.panNumber ?? "");
  const [aadhaar, setAadhaar] = useState(employee.aadhaarNumber ?? "");
  const [pf, setPf] = useState(employee.pfNumber ?? "");
  const [esi, setEsi] = useState(employee.esiNumber ?? "");
  const [uan, setUan] = useState(employee.uan ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panNumber: pan || null,
          aadhaarNumber: aadhaar || null,
          pfNumber: pf || null,
          esiNumber: esi || null,
          uan: uan || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Statutory IDs updated");
      onSaved();
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 py-1">
      <UnderlineInput label="PAN" value={pan} onChange={setPan} placeholder="ABCDE1234F" mono />
      <UnderlineInput label="Aadhaar" value={aadhaar} onChange={setAadhaar} placeholder="1234 5678 9012" mono inputMode="numeric" />
      <UnderlineInput label="PF Number" value={pf} onChange={setPf} placeholder="PF/12345/678" mono />
      <UnderlineInput label="ESI Number" value={esi} onChange={setEsi} placeholder="ESI/1234567" mono />
      <UnderlineInput label="UAN" value={uan} onChange={setUan} placeholder="Universal Account Number" mono />
      <div className="flex gap-2 pt-1">
        <button onClick={onClose} disabled={saving} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </button>
      </div>
    </div>
  );
}

/* ── Emergency contact card ── */
function EmergencyContactCard({ employee, canManage }: { employee: OnboardingEmployeeData; canManage: boolean }) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Emergency Contact
        </p>
        {canManage && !editing && (
          <button onClick={() => { haptic(10); setEditing(true); }} className="flex items-center gap-1 text-m-caption font-semibold press" style={{ color: "var(--color-ink-600)" }}>
            <Pencil className="size-3" /> Edit
          </button>
        )}
      </div>
      <div className="px-3 pb-3">
        {editing ? (
          <EmergencyContactEditor employee={employee} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
        ) : (
          <InfoGrid items={[
            { label: "Name", value: employee.emergencyContactName },
            { label: "Phone", value: employee.emergencyContactPhone },
            { label: "Relation", value: employee.emergencyContactRelation },
          ]} />
        )}
      </div>
    </div>
  );
}

function EmergencyContactEditor({ employee, onClose, onSaved }: { employee: OnboardingEmployeeData; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(employee.emergencyContactName ?? "");
  const [phone, setPhone] = useState(employee.emergencyContactPhone ?? "");
  const [relation, setRelation] = useState(employee.emergencyContactRelation ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emergencyContactName: name || null,
          emergencyContactPhone: phone || null,
          emergencyContactRelation: relation || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Emergency contact updated");
      onSaved();
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 py-1">
      <UnderlineInput label="Contact Name" value={name} onChange={setName} placeholder="Full name" />
      <UnderlineInput label="Phone" value={phone} onChange={setPhone} placeholder="+91..." inputMode="tel" />
      <UnderlineInput label="Relation" value={relation} onChange={setRelation} placeholder="e.g. Spouse, Parent" />
      <div className="flex gap-2 pt-1">
        <button onClick={onClose} disabled={saving} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </button>
      </div>
    </div>
  );
}

/* ── Addresses card ── */
function AddressesCard({ employee, canManage }: { employee: OnboardingEmployeeData; canManage: boolean }) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Addresses
        </p>
        {canManage && !editing && (
          <button onClick={() => { haptic(10); setEditing(true); }} className="flex items-center gap-1 text-m-caption font-semibold press" style={{ color: "var(--color-ink-600)" }}>
            <Pencil className="size-3" /> Edit
          </button>
        )}
      </div>
      <div className="px-3 pb-3">
        {editing ? (
          <AddressesEditor employee={employee} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
        ) : (
          <>
            <div className="py-2 border-b" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-m-caption font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Permanent</p>
              <p className="text-m-body" style={{ color: employee.permanentAddress ? "var(--color-ink-950)" : "var(--color-ink-300)" }}>
                {employee.permanentAddress || "—"}
              </p>
            </div>
            <div className="py-2">
              <p className="text-m-caption font-semibold mb-0.5" style={{ color: "var(--color-ink-500)" }}>Current</p>
              <p className="text-m-body" style={{ color: employee.currentAddress ? "var(--color-ink-950)" : "var(--color-ink-300)" }}>
                {employee.currentAddress || "—"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AddressesEditor({ employee, onClose, onSaved }: { employee: OnboardingEmployeeData; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [permanent, setPermanent] = useState(employee.permanentAddress ?? "");
  const [current, setCurrent] = useState(employee.currentAddress ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permanentAddress: permanent || null,
          currentAddress: current || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Addresses updated");
      onSaved();
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 py-1">
      <div>
        <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Permanent Address</label>
        <textarea
          value={permanent}
          onChange={(e) => setPermanent(e.target.value)}
          placeholder="House, Street, City, State, PIN"
          rows={3}
          className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
        />
      </div>
      <div>
        <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Current Address</label>
        <textarea
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="House, Street, City, State, PIN"
          rows={3}
          className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
          style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onClose} disabled={saving} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </button>
      </div>
    </div>
  );
}

/* ── Benefits card — editable on mobile (add/toggle/delete) ── */
function BenefitsCard({ employee, canManage }: { employee: OnboardingEmployeeData; canManage: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Benefits
        </p>
        {canManage && !adding && (
          <button
            onClick={() => { haptic(10); setAdding(true); }}
            className="flex items-center gap-1 text-m-caption font-semibold press"
            style={{ color: "var(--color-ink-600)" }}
          >
            <UserPlus className="size-3" /> Add
          </button>
        )}
      </div>
      <div className="px-3 pb-3">
        {adding && (
          <BenefitEditor
            employeeId={employee.id}
            onClose={() => setAdding(false)}
            onSaved={() => { setAdding(false); router.refresh(); }}
          />
        )}

        {employee.benefits.length === 0 && !adding ? (
          <p className="text-m-caption py-2" style={{ color: "var(--color-ink-500)" }}>
            No benefits configured. Tap &quot;Add&quot; to create one.
          </p>
        ) : (
          <div className="space-y-0">
            {employee.benefits.map((b, i) => (
              <div
                key={b.id}
                className={`flex items-center gap-2 py-1.5 ${i < employee.benefits.length - 1 ? "border-b" : ""} ${editingId === b.id ? "" : ""}`}
                style={{ borderColor: "var(--color-line)" }}
              >
                {editingId === b.id ? (
                  <BenefitEditor
                    employeeId={employee.id}
                    benefit={b}
                    onClose={() => setEditingId(null)}
                    onSaved={() => { setEditingId(null); router.refresh(); }}
                  />
                ) : (
                  <>
                    <Gift className="size-3 shrink-0" style={{ color: "var(--color-ink-400)" }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-m-label font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {b.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      {b.notes && <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{b.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {b.amount != null && (
                        <p className="text-m-label font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                          {formatCurrency(b.amount)}
                        </p>
                      )}
                      <p className="text-m-caption" style={{ color: b.active ? "var(--color-go)" : "var(--color-ink-400)" }}>
                        {b.active ? "Active" : "Inactive"}
                      </p>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => { haptic(10); setEditingId(b.id); }}
                        className="shrink-0 p-1 press"
                        style={{ color: "var(--color-ink-400)" }}
                      >
                        <Pencil className="size-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Benefit editor — add or edit a benefit inline ── */
function BenefitEditor({
  employeeId,
  benefit,
  onClose,
  onSaved,
}: {
  employeeId: string;
  benefit?: {
    id: string;
    type: string;
    amount: number | null;
    frequency: string;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
    active: boolean;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!benefit;
  const [type, setType] = useState(benefit?.type ?? "");
  const [amount, setAmount] = useState(benefit?.amount?.toString() ?? "");
  const [frequency, setFrequency] = useState(benefit?.frequency ?? "MONTHLY");
  const [notes, setNotes] = useState(benefit?.notes ?? "");
  const [active, setActive] = useState(benefit?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const BENEFIT_TYPES = [
    { value: "PF", label: "PF" },
    { value: "ESI", label: "ESI" },
    { value: "HEALTH_INSURANCE", label: "Health Insurance" },
    { value: "ACCIDENT_INSURANCE", label: "Accident Insurance" },
    { value: "BONUS", label: "Bonus" },
    { value: "LEAVE_ENCASHMENT", label: "Leave Encashment" },
    { value: "ACCOMMODATION", label: "Accommodation" },
    { value: "TRAVEL_ALLOWANCE", label: "Travel Allowance" },
    { value: "FOOD_ALLOWANCE", label: "Food Allowance" },
    { value: "UNIFORM", label: "Uniform" },
    { value: "PPE", label: "PPE" },
    { value: "OTHER", label: "Other" },
  ];

  const FREQUENCIES = [
    { value: "ONE_TIME", label: "One Time" },
    { value: "MONTHLY", label: "Monthly" },
    { value: "QUARTERLY", label: "Quarterly" },
    { value: "YEARLY", label: "Yearly" },
    { value: "ON_DEMAND", label: "On Demand" },
  ];

  async function save() {
    if (!type) {
      toast.error("Select a benefit type");
      haptic([50, 20, 50]);
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        type,
        amount: amount ? Number(amount) : null,
        frequency,
        notes: notes || null,
        active,
      };
      const url = isEdit
        ? `/api/employees/${employeeId}/benefits/${benefit!.id}`
        : `/api/employees/${employeeId}/benefits`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success(isEdit ? "Benefit updated" : "Benefit added");
      onSaved();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/benefits/${benefit!.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      haptic([10, 40, 80]);
      toast.success("Benefit removed");
      onSaved();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 py-1">
      <EnumSelect
        label="Type"
        value={type}
        onChange={setType}
        placeholder="— Select —"
        options={BENEFIT_TYPES}
      />
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <UnderlineInput
          label="Amount (₹)"
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={setAmount}
          placeholder="0"
        />
        <EnumSelect
          label="Frequency"
          value={frequency}
          onChange={setFrequency}
          options={FREQUENCIES}
        />
      </div>
      <UnderlineInput
        label="Notes"
        value={notes}
        onChange={setNotes}
        placeholder="e.g. HDFC Ergo, ₹5L cover"
      />
      {isEdit && (
        <label className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={() => { haptic(10); setActive(!active); }}
            className="relative h-5 w-9 rounded-full transition-colors press"
            style={{ backgroundColor: active ? "var(--color-go)" : "var(--color-line)" }}
          >
            <span
              className="absolute top-0.5 size-4 rounded-full bg-white transition-transform"
              style={{ transform: active ? "translateX(1.125rem)" : "translateX(0.125rem)" }}
            />
          </button>
          <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {active ? "Active" : "Inactive"}
          </span>
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          Cancel
        </button>
        {isEdit && (
          <button
            onClick={() => { haptic(10); setConfirmingDelete(true); }}
            disabled={saving}
            className="h-9 px-3 rounded-[0.5rem] border text-m-label font-bold press"
            style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, transparent)", color: "var(--color-stop)" }}
          >
            <Ban className="size-3.5" />
          </button>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Save
        </button>
      </div>

      {confirmingDelete && (
        <MobileDialog open onClose={() => setConfirmingDelete(false)} title="Remove Benefit?">
          <p className="text-m-body py-2" style={{ color: "var(--color-ink-700)" }}>
            This will permanently remove this benefit. Are you sure?
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={doDelete}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
              Remove
            </button>
          </div>
        </MobileDialog>
      )}
    </div>
  );
}

/* ── Documents card — uses AttachmentList ── */
function DocumentsCard({ employee }: { employee: OnboardingEmployeeData }) {
  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="px-3 pt-3 pb-1">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Documents
        </p>
      </div>
      <div className="px-3 pb-3">
        <AttachmentList
          entityType="Employee"
          entityId={employee.id}
          compact
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OFFBOARD SUB-TAB — termination / exit management.
   Real-world flow:
     1. Pre-exit checklist (dues, assets, advance clearance)
     2. Termination form (reason, end date, notice compliance)
     3. Confirmation (irreversible — soft-deletes employee, disables login, recycles phone)
     4. Post-termination status (what was actioned, history preserved)
     5. Re-activate for inactive employees (reverse active=false)

   Uses:
     · POST /api/employees/[id]/terminate (existing)
     · PATCH /api/employees/[id] { active: true } (re-activate)
   ═══════════════════════════════════════════════════════════════════════════ */
function OffboardSubTab({
  employee,
  canManage,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0] ?? "");
  const [reactivating, setReactivating] = useState(false);

  const isActive = employee.active;
  const noticeDays = employee.noticePeriodDays;
  const contractEnded = employee.contractEndDate
    ? new Date(employee.contractEndDate) < new Date()
    : false;

  // Pre-exit checklist items — computed from employee data
  const checklist = [
    {
      label: "Agreement terminated",
      done: employee.contractStatus === "TERMINATED" || !isActive,
    },
    {
      label: "Auto-deposit disabled",
      done: employee.autoDepositEnabled !== true,
    },
    {
      label: "Login account disabled",
      done: !employee.user?.active,
    },
    {
      label: "No active project assignment",
      done: !employee.activeProjectId,
    },
    {
      label: "No crew supervision",
      done: !employee.crewName,
    },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;

  async function doTerminate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason || "Terminated",
          employmentEndDate: endDate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to terminate");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Employee offboarded");
      setConfirming(false);
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function doReactivate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to re-activate");
      haptic([10, 40, 80]);
      toast.success("Employee re-activated");
      setReactivating(false);
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (isActive) {
    return (
      <div className="space-y-3">
        {/* ── Pre-exit checklist ── */}
        <div
          className="rounded-[0.75rem] overflow-hidden"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
              Pre-Exit Checklist
            </p>
            <span
              className="text-m-label font-bold tabular-nums"
              style={{ color: checklistDone === checklist.length ? "var(--color-go)" : "var(--color-ink-500)" }}
            >
              {checklistDone}/{checklist.length}
            </span>
          </div>
          <div className="px-3 pb-3">
            <div className="grid grid-cols-1 gap-y-1">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  {item.done ? (
                    <CheckCircle2 className="size-3.5 shrink-0" style={{ color: "var(--color-go)" }} />
                  ) : (
                    <Circle className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
                  )}
                  <span
                    className="text-m-caption"
                    style={{ color: item.done ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            {checklistDone < checklist.length && (
              <p className="text-m-caption mt-2 pt-2 border-t" style={{ color: "var(--color-ink-400)", borderColor: "var(--color-line)" }}>
                Some items are pending. The system will handle them automatically on termination (login disabled, phone recycled, deposit stopped).
              </p>
            )}
          </div>
        </div>

        {/* ── Termination form ── */}
        {canManage && (
          <div
            className="rounded-[0.75rem] overflow-hidden"
            style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
          >
            <div className="px-3 pt-3 pb-1">
              <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
                Offboard Employee
              </p>
            </div>
            <div className="px-3 pb-3 space-y-3">
              {/* Reason + End date — horizontal */}
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                <EnumSelect
                  label="Reason"
                  value={reason}
                  onChange={setReason}
                  placeholder="— Select —"
                  options={[
                    { value: "RESIGNATION", label: "Resignation" },
                    { value: "TERMINATION", label: "Termination" },
                    { value: "ABSCONDED", label: "Absconded" },
                    { value: "CONTRACT_ENDED", label: "Contract Ended" },
                    { value: "RETIRED", label: "Retired" },
                  ]}
                />
                <UnderlineInput
                  label="End Date"
                  type="date"
                  value={endDate}
                  onChange={setEndDate}
                />
              </div>

              {/* Notice period check */}
              {noticeDays != null && noticeDays > 0 && (
                <div
                  className="rounded-[0.375rem] px-2 py-1.5 flex items-start gap-1.5"
                  style={{ backgroundColor: "var(--color-concrete)" }}
                >
                  <Calendar className="size-3 shrink-0 mt-0.5" style={{ color: "var(--color-ink-500)" }} />
                  <p className="text-m-caption" style={{ color: "var(--color-ink-600)" }}>
                    Notice period: {noticeDays} days. Verify compliance before proceeding.
                  </p>
                </div>
              )}

              {/* Contract end notice */}
              {contractEnded && (
                <div
                  className="rounded-[0.375rem] px-2 py-1.5 flex items-start gap-1.5"
                  style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 12%, transparent)" }}
                >
                  <Calendar className="size-3 shrink-0 mt-0.5" style={{ color: "var(--color-signal-dark)" }} />
                  <p className="text-m-caption" style={{ color: "var(--color-signal-dark)" }}>
                    Contract end date has passed. Offboarding is recommended.
                  </p>
                </div>
              )}

              {/* Terminate button */}
              <button
                onClick={() => { haptic(10); setConfirming(true); }}
                className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-stop) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-stop) 25%, transparent)",
                }}
              >
                <div
                  className="shrink-0 grid place-items-center size-9 rounded-full"
                  style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)" }}
                >
                  <Ban className="size-4" style={{ color: "var(--color-stop)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-m-label font-semibold" style={{ color: "var(--color-stop)" }}>
                    Terminate Employee
                  </p>
                  <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                    Disable login, recycle phone, preserve all history
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── Confirmation dialog ── */}
        {confirming && (
          <MobileDialog open onClose={() => setConfirming(false)} title="Confirm Offboarding?">
            <div className="space-y-3">
              <p className="text-m-body py-1" style={{ color: "var(--color-ink-700)" }}>
                This will permanently offboard <strong style={{ color: "var(--color-ink-950)" }}>{employee.name}</strong>:
              </p>
              <div className="space-y-1.5">
                {[
                  { icon: <Ban className="size-3" />, text: "Login account disabled" },
                  { icon: <Phone className="size-3" />, text: "Phone number recycled to pool" },
                  { icon: <Wallet className="size-3" />, text: "Auto-deposit stopped" },
                  { icon: <FileText className="size-3" />, text: "Agreement marked TERMINATED" },
                  { icon: <CheckCircle2 className="size-3" />, text: "All history preserved (attendance, payroll, DPR)" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span style={{ color: "var(--color-ink-400)" }}>{item.icon}</span>
                    <span className="text-m-caption" style={{ color: "var(--color-ink-600)" }}>{item.text}</span>
                  </div>
                ))}
              </div>
              {reason && (
                <div className="rounded-[0.375rem] px-2 py-1.5" style={{ backgroundColor: "var(--color-concrete)" }}>
                  <p className="text-m-caption" style={{ color: "var(--color-ink-600)" }}>
                    Reason: <strong>{reason.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</strong>
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={doTerminate}
                  disabled={busy}
                  className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                  Offboard
                </button>
              </div>
            </div>
          </MobileDialog>
        )}
      </div>
    );
  }

  // ── Inactive employee — post-termination status + re-activate ──
  return (
    <div className="space-y-3">
      {/* ── Offboarded status ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
            Employment Status
          </p>
          <StatusPill text="Offboarded" tone="stop" />
        </div>
        <div className="px-3 pb-3">
          <InfoGrid items={[
            { label: "Agreement", value: employee.contractStatus === "TERMINATED" ? "Terminated" : employee.contractStatus ?? "—" },
            { label: "Login", value: employee.user ? (employee.user.active ? "Still active" : "Disabled") : "No account" },
            { label: "Auto-Deposit", value: employee.autoDepositEnabled === true ? "Still active" : "Disabled" },
            { label: "Phone", value: employee.phone ?? "Recycled" },
          ]} />
        </div>
      </div>

      {/* ── History preserved notice ── */}
      <div
        className="rounded-[0.75rem] p-3 flex items-start gap-2"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 8%, transparent)" }}
      >
        <CheckCircle2 className="size-4 shrink-0 mt-0.5" style={{ color: "var(--color-go)" }} />
        <p className="text-m-caption" style={{ color: "var(--color-ink-600)" }}>
          All history is preserved — attendance, payroll, DPR, leave, and call records remain accessible. The employee appears in the &quot;Inactive&quot; section of the onboarding queue.
        </p>
      </div>

      {/* ── Re-activate ── */}
      {canManage && (
        <>
          <button
            onClick={() => { haptic(10); setReactivating(true); }}
            className="w-full rounded-[0.75rem] p-3 flex items-center gap-3 press text-left"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-go) 30%, transparent)",
            }}
          >
            <div
              className="shrink-0 grid place-items-center size-9 rounded-full"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 15%, transparent)" }}
            >
              <RefreshCw className="size-4" style={{ color: "var(--color-go)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-m-label font-semibold" style={{ color: "var(--color-go)" }}>
                Re-activate Employee
              </p>
              <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                Restore active status — login and phone need manual setup
              </p>
            </div>
          </button>

          {reactivating && (
            <MobileDialog open onClose={() => setReactivating(false)} title="Re-activate Employee?">
              <div className="space-y-3">
                <p className="text-m-body py-2" style={{ color: "var(--color-ink-700)" }}>
                  This will mark <strong style={{ color: "var(--color-ink-950)" }}>{employee.name}</strong> as active again. You&apos;ll need to manually re-enable their login account and re-assign a phone number.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setReactivating(false)}
                    disabled={busy}
                    className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
                    style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doReactivate}
                    disabled={busy}
                    className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    Re-activate
                  </button>
                </div>
              </div>
            </MobileDialog>
          )}
        </>
      )}
    </div>
  );
}
