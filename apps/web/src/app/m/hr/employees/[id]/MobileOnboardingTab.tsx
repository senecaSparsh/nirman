"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DocumentViewer, useDocumentViewer } from "@/components/document-viewer/document-viewer";
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
  IdCard,
  Plus,
  Trash2,
  IndianRupee,
  ChevronRight,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { fieldError } from "@/lib/field-error";
import { OnboardingNav, type OnboardingSubTab } from "./OnboardingNav";
import { TermsEditor } from "./TermsEditor";
import { EmployeeDocuments } from "./EmployeeDocuments";
import { useTabParam } from "@/lib/use-tab-param";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import {
  UnderlineInput,
  EnumSelect,
} from "@/components/mobile/v2/form-primitives";
import { MobileCreateAccountDialog } from "@/app/m/hr/employees/MobileCreateAccountDialog";
import { OnboardingProgress } from "@/components/mobile/v2/onboarding-progress";
import { buildOnboardingSteps } from "@/lib/onboarding-steps";
import { haptic } from "@/lib/haptic";
import { useTodayDateState } from "@/lib/use-today-date";
import { useHydratedDate } from "@/lib/use-hydrated-date";

/* ═══════════════════════════════════════════════════════════════════════════
   MobileOnboardingTab — the full hiring → account → agreement → deposit →
   dossier → offboarding workflow, grouped behind a 2-level OnboardingNav
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
  departmentId: string | null;
  departmentName: string | null;
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
  contractTerms: string | null;
  contractToken: string | null;
  // Offer letter
  offerLetterStatus: string | null;
  offerLetterIssuedAt: string | null;
  offerLetterTerms: string | null;
  offerLetterAcceptedAt: string | null;
  offerToken: string | null;
  // ID card
  idCardStatus: string | null;
  idCardIssuedAt: string | null;
  // Appointment letter
  appointmentLetterStatus: string | null;
  appointmentLetterIssuedAt: string | null;
  // Onboarding checklist
  documentsSubmitted: boolean | null;
  backgroundVerified: boolean | null;
  onboardingComplete: boolean | null;
  // Personal / identity
  dateOfBirth: string | null;
  bloodGroup: string | null;
  photoUrl: string | null;
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
  // Salary components (CTC breakdown)
  salaryComponents: {
    id: string; type: string; amount: number; frequency: string;
    isDeduction: boolean; isPercentage: boolean; percentageOfBasic: number | null;
    notes: string | null; active: boolean;
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
    phoneVerified: boolean | null;
    phoneVerifiedAt: string | null;
    phoneSyncedAt: string | null;
  } | null;
  // Multi-company: other companies this employee works in
  companyMemberships: { employeeId: string; companyId: string; companyName: string; active: boolean }[];
};

const ONBOARDING_TABS = ["profile", "account", "salary", "offer", "agreement", "appointment", "idcard", "deposit", "dossier", "offboard"] as const;

const HIERARCHY_LABELS = ["Management", "Manager", "Engineer", "Supervisor", "Skilled", "Labor"];

export function MobileOnboardingTab({
  employee,
  canManage,
  canManagePayroll,
  actorRole,
  projects,
  stockLocations,
  departments,
  onEdit, // opens the existing EmployeeEditSheet from the parent
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  canManagePayroll: boolean;
  actorRole: string;
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string }[];
  departments: { id: string; name: string; active: boolean }[];
  onEdit: () => void;
}) {
  const [subTab, setSubTab] = useTabParam(ONBOARDING_TABS, "profile", { param: "onboard" });
  const docViewer = useDocumentViewer();

  // ── Onboarding progress (12 canonical steps) ──
  // Uses the shared buildOnboardingSteps so "complete" means the same
  // thing on the queue page, the detail tab, and the profile page.
  // The DB field (employee.onboardingComplete) is the single source of truth
  // for isComplete — buildOnboardingSteps is only for showing step progress.
  const { steps, completedCount } = buildOnboardingSteps({
    hasProfile: !!(employee.name && (employee.phone || employee.user?.phone) && (employee.designation || employee.trade)),
    hasWage: employee.wageType === "DAILY" ? (employee.dailyRate ?? 0) > 0 : (employee.monthlySalary ?? 0) > 0,
    hasEmploymentTerms: !!(
      employee.employmentType &&
      employee.noticePeriodDays != null &&
      (employee.employmentType !== "CONTRACT" || employee.contractStartDate) &&
      (employee.employmentType !== "PROBATION" || employee.contractStartDate)
    ),
    hasSalaryStructure: (employee.salaryComponents ?? []).length > 0,
    documentsSubmitted: employee.documentsSubmitted === true,
    backgroundVerified: employee.backgroundVerified === true,
    hasAccount: !!employee.userId,
    offerLetterIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.offerLetterStatus ?? ""),
    agreementIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? ""),
    agreementConfirmed: ["CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? ""),
    appointmentLetterIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.appointmentLetterStatus ?? ""),
    idCardIssued: ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.idCardStatus ?? ""),
    hasAutoDeposit: employee.autoDepositEnabled === true,
  });
  const isComplete = employee.onboardingComplete === true;

  // ── Auto-skip: on initial load, jump to the first incomplete step ──
  // The user said "I do not want obvious things to be stated again and again"
  // — so if profile + wage are already set (from the FAB quick-create), we
  // skip straight to the next incomplete step instead of showing the
  // profile tab again.
  useEffect(() => {
    // Only auto-navigate if no explicit tab was requested (URL param is
    // the default "profile" and the user hasn't clicked any tab yet).
    // We use a ref guard so this only runs once on mount.
    if (isComplete) return; // everything done — stay on profile
    const firstIncomplete = steps.findIndex((s) => !s.done);
    if (firstIncomplete === -1) return;
    // Map step index → onboarding tab
    const stepToTab: Record<number, string> = {
      0: "profile",      // Profile & Wage
      1: "profile",      // Employment Terms (same tab)
      2: "salary",        // Salary Structure
      3: "dossier",       // Documents
      4: "dossier",       // BG Verification (same tab)
      5: "account",       // Login Account
      6: "offer",         // Offer Letter
      7: "agreement",     // Agreement Issued
      8: "agreement",     // Agreement Confirmed (same tab)
      9: "appointment",   // Appointment Letter
      10: "idcard",       // ID Card
      11: "deposit",      // Auto-Deposit
    };
    const targetTab = stepToTab[firstIncomplete] ?? "profile";
    // Only navigate if we're not already on the right tab
    if (subTab !== targetTab) {
      setSubTab(targetTab as typeof subTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return (
    <div className="px-4 space-y-3">
      {/* ── Onboarding progress bar (shared component) ── */}
      <OnboardingProgress
        steps={steps}
        completedCount={completedCount}
        isComplete={isComplete}
        canManage={canManage}
        employeeId={employee.id}
        onboardingComplete={employee.onboardingComplete === true}
      />

      {/* ── 2-level onboarding nav (phases → sub-sections) ── */}
      <OnboardingNav
        value={subTab as OnboardingSubTab}
        onChange={setSubTab}
      />

      {/* ── Sub-tab content ── */}
      {subTab === "profile" && (
        <ProfileSubTab
          employee={employee}
          canManage={canManage}
          projects={projects}
          stockLocations={stockLocations}
          departments={departments}
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

      {subTab === "salary" && (
        <SalarySubTab
          employee={employee}
          canManage={canManage}
        />
      )}

      {subTab === "offer" && (
        <OfferLetterSubTab
          employee={employee}
          canManage={canManage}
          openDoc={docViewer.openDoc}
        />
      )}

      {subTab === "agreement" && (
        <AgreementSubTab
          employee={employee}
          canManage={canManage}
          openDoc={docViewer.openDoc}
        />
      )}

      {subTab === "appointment" && (
        <AppointmentLetterSubTab
          employee={employee}
          canManage={canManage}
          openDoc={docViewer.openDoc}
        />
      )}

      {subTab === "idcard" && (
        <IdCardSubTab
          employee={employee}
          canManage={canManage}
          openDoc={docViewer.openDoc}
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

      {/* ── In-page document viewer (FAB pop-up, no redirect) ── */}
      <DocumentViewer url={docViewer.docUrl} title={docViewer.docTitle} onClose={docViewer.closeDoc} />
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
  departments,
  onEdit: _onEdit,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string }[];
  departments: { id: string; name: string; active: boolean }[];
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
              departments={departments}
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
  departments,
  onClose,
  onSaved,
}: {
  employee: OnboardingEmployeeData;
  projects: { id: string; name: string }[];
  stockLocations: { id: string; name: string }[];
  departments: { id: string; name: string; active: boolean }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee.name ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [trade, setTrade] = useState(employee.trade ?? "");
  const [designation, setDesignation] = useState(employee.designation ?? "");
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? "");
  const [hierarchyLevel, setHierarchyLevel] = useState(employee.hierarchyLevel?.toString() ?? "");
  const [joinDate, setJoinDate] = useState(employee.joinDate ? employee.joinDate.split("T")[0] ?? "" : "");
  const [activeProjectId, setActiveProjectId] = useState(employee.activeProjectId ?? "");
  const [reportingLocationId, setReportingLocationId] = useState(employee.reportingLocationId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      fieldError("Name is required", "hire-name");
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
          departmentId: departmentId || null,
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
      <UnderlineInput id="hire-name" label="Name" value={name} onChange={setName} placeholder="Full name" />
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
          label="Department"
          value={departmentId}
          onChange={setDepartmentId}
          placeholder="— None —"
          options={departments.filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))}
        />
        <EnumSelect
          label="Project"
          value={activeProjectId}
          onChange={setActiveProjectId}
          placeholder="— None —"
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
    } catch (err) { console.warn("Failed to load available numbers:", err); }
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
   SALARY SUB-TAB — CTC breakdown (Basic, HRA, DA, TA, etc.)
   Shows the salary structure with earnings, deductions, and CTC summary.
   ═══════════════════════════════════════════════════════════════════════════ */
const SALARY_COMPONENT_LABELS: Record<string, string> = {
  BASIC: "Basic Salary",
  HRA: "House Rent Allowance (HRA)",
  DA: "Dearness Allowance (DA)",
  TA: "Travelling Allowance (TA)",
  SPECIAL_ALLOWANCE: "Special Allowance",
  FOOD_ALLOWANCE: "Food Allowance",
  MEDICAL_ALLOWANCE: "Medical Allowance",
  UNIFORM_ALLOWANCE: "Uniform Allowance",
  WASHING_ALLOWANCE: "Washing Allowance",
  LTA: "Leave Travel Allowance (LTA)",
  PERFORMANCE_BONUS: "Performance Bonus",
  JOINING_BONUS: "Joining Bonus",
  RETENTION_BONUS: "Retention Bonus",
  EMPLOYER_PF: "Employer PF Contribution",
  EMPLOYEE_PF: "Employee PF Contribution",
  EMPLOYER_ESI: "Employer ESI Contribution",
  EMPLOYEE_ESI: "Employee ESI Contribution",
  GRATUITY: "Gratuity",
  PROFESSION_TAX: "Profession Tax",
  TDS: "Income Tax (TDS)",
  OTHER: "Other",
};

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

function SalarySubTab({
  employee,
  canManage,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
}) {
  const router = useRouter();
  const components = employee.salaryComponents ?? [];
  const earnings = components.filter((c) => !c.isDeduction);
  const deductions = components.filter((c) => c.isDeduction);

  // ── Edit state ──
  const [editing, setEditing] = useState(false);
  const [editComponents, setEditComponents] = useState(components);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFrequency, setNewFrequency] = useState("MONTHLY");
  const [newIsPercentage, setNewIsPercentage] = useState(false);
  const [newPercentage, setNewPercentage] = useState("");

  // Keep editComponents in sync when employee data changes (e.g. after router.refresh)
  useEffect(() => {
    if (!editing) setEditComponents(employee.salaryComponents ?? []);
  }, [employee.salaryComponents, editing]);

  const monthlyGross = (editing ? editComponents : earnings)
    .filter((c) => !c.isDeduction && c.frequency === "MONTHLY")
    .reduce((sum, c) => sum + c.amount, 0);
  const monthlyDeductions = (editing ? editComponents : deductions)
    .filter((c) => c.isDeduction && c.frequency === "MONTHLY")
    .reduce((sum, c) => sum + c.amount, 0);
  const monthlyNet = monthlyGross - monthlyDeductions;
  const annualCTC = (editing ? editComponents : components).reduce((sum, c) => {
    if (c.isDeduction) return sum;
    if (c.frequency === "MONTHLY") return sum + c.amount * 12;
    if (c.frequency === "QUARTERLY") return sum + c.amount * 4;
    if (c.frequency === "HALF_YEARLY") return sum + c.amount * 2;
    if (c.frequency === "YEARLY") return sum + c.amount;
    if (c.frequency === "ONE_TIME") return sum + c.amount;
    return sum;
  }, 0);

  function handleAdd() {
    if (!newType) { fieldError("Select a component type", "salary-new-type"); return; }
    if (!newIsPercentage && (!newAmount || Number(newAmount) <= 0)) {
      fieldError("Enter a valid amount", "salary-new-amount"); return;
    }
    if (newIsPercentage && (!newPercentage || Number(newPercentage) <= 0)) {
      fieldError("Enter a valid percentage", "salary-new-percentage"); return;
    }
    const option = SALARY_COMPONENT_OPTIONS.find((o) => o.value === newType);
    setEditComponents((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        type: newType,
        amount: newIsPercentage ? 0 : Number(newAmount),
        frequency: newFrequency,
        isDeduction: option?.isDeduction ?? false,
        isPercentage: newIsPercentage,
        percentageOfBasic: newIsPercentage ? Number(newPercentage) : null,
        notes: null,
        active: true,
      },
    ]);
    setNewType(""); setNewAmount(""); setNewFrequency("MONTHLY");
    setNewIsPercentage(false); setNewPercentage("");
    haptic(10);
  }

  function handleRemove(idx: number) {
    setEditComponents((prev) => prev.filter((_, i) => i !== idx));
    haptic(10);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/salary-components`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          components: editComponents.map((c) => ({
            type: c.type,
            amount: c.amount,
            frequency: c.frequency,
            isDeduction: c.isDeduction,
            isPercentage: c.isPercentage,
            percentageOfBasic: c.percentageOfBasic,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
      toast.success("Salary structure saved");
      haptic([10, 40, 80]);
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditComponents(components);
    setEditing(false);
  }

  const displayComponents = editing ? editComponents : components;
  const displayEarnings = displayComponents.filter((c) => !c.isDeduction);
  const displayDeductions = displayComponents.filter((c) => c.isDeduction);

  return (
    <div className="space-y-3">
      {/* ── CTC Summary card ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <span className="text-m-section font-bold flex items-center gap-1.5" style={{ color: "var(--color-ink-950)" }}>
            <IndianRupee className="size-4" />
            Salary Structure
          </span>
          {canManage && !editing && (
            <button
              onClick={() => { setEditing(true); setEditComponents(components); haptic(10); }}
              className="text-m-caption font-semibold press"
              style={{ color: "var(--color-accent, #2563eb)" }}
            >
              Edit
            </button>
          )}
        </div>

        {displayComponents.length === 0 && !editing ? (
          <div className="px-3 pb-4">
            <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
              No salary components configured. {canManage ? "Tap Edit to add Basic, HRA, DA, TA, and other components." : ""}
            </p>
          </div>
        ) : (
          <div className="px-3 pb-3">
            {/* Earnings */}
            <div className="mt-2">
              <p className="text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>
                EARNINGS
              </p>
              {displayEarnings.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-1 border-b" style={{ borderColor: "var(--color-line)" }}>
                  <span className="text-m-body flex-1" style={{ color: "var(--color-ink-950)" }}>
                    {SALARY_COMPONENT_LABELS[c.type] ?? c.type}
                    {c.isPercentage && c.percentageOfBasic != null && (
                      <span className="text-m-caption ml-1" style={{ color: "var(--color-ink-500)" }}>
                        ({c.percentageOfBasic}% of basic)
                      </span>
                    )}
                    <span className="text-m-caption ml-1" style={{ color: "var(--color-ink-500)" }}>
                      /{c.frequency.toLowerCase()}
                    </span>
                  </span>
                  <span className="text-m-body font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                    {formatCurrency(c.amount)}
                  </span>
                  {editing && (
                    <button
                      onClick={() => handleRemove(displayComponents.indexOf(c))}
                      className="ml-2 p-0.5"
                      style={{ color: "var(--color-red-500, #dc2626)" }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex justify-between py-1.5 font-bold">
                <span className="text-m-body" style={{ color: "var(--color-ink-700)" }}>Gross Monthly</span>
                <span className="text-m-body tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(monthlyGross)}
                </span>
              </div>
            </div>

            {/* Deductions */}
            {displayDeductions.length > 0 && (
              <div className="mt-2">
                <p className="text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>
                  DEDUCTIONS
                </p>
                {displayDeductions.map((c) => (
                  <div key={c.id} className="flex justify-between items-center py-1 border-b" style={{ borderColor: "var(--color-line)" }}>
                    <span className="text-m-body flex-1" style={{ color: "var(--color-ink-950)" }}>
                      {SALARY_COMPONENT_LABELS[c.type] ?? c.type}
                    </span>
                    <span className="text-m-body font-semibold tabular-nums" style={{ color: "var(--color-red-500, #dc2626)" }}>
                      -{formatCurrency(c.amount)}
                    </span>
                    {editing && (
                      <button
                        onClick={() => handleRemove(displayComponents.indexOf(c))}
                        className="ml-2 p-0.5"
                        style={{ color: "var(--color-red-500, #dc2626)" }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex justify-between py-1.5 font-bold">
                  <span className="text-m-body" style={{ color: "var(--color-ink-700)" }}>Total Deductions</span>
                  <span className="text-m-body tabular-nums" style={{ color: "var(--color-red-500, #dc2626)" }}>
                    -{formatCurrency(monthlyDeductions)}
                  </span>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="mt-2 pt-2 border-t-2 space-y-1" style={{ borderColor: "var(--color-line)" }}>
              <div className="flex justify-between">
                <span className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>Net Monthly</span>
                <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(monthlyNet)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>Annual CTC</span>
                <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(annualCTC)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Add component (edit mode) ── */}
        {editing && (
          <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-m-caption font-bold mb-1.5" style={{ color: "var(--color-ink-700)" }}>ADD COMPONENT</p>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <EnumSelect
                id="salary-new-type"
                label="Component"
                value={newType}
                onChange={setNewType}
                placeholder="— Select —"
                options={SALARY_COMPONENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
              <div className="pl-2">
                <EnumSelect
                  label="Frequency"
                  value={newFrequency}
                  onChange={setNewFrequency}
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
              {newIsPercentage ? (
                <UnderlineInput
                  id="salary-new-percentage"
                  label="% of Basic"
                  value={newPercentage}
                  onChange={setNewPercentage}
                  placeholder="e.g. 40"
                  type="number"
                  min="0"
                  max="100"
                />
              ) : (
                <UnderlineInput
                  id="salary-new-amount"
                  label="Amount (₹)"
                  value={newAmount}
                  onChange={setNewAmount}
                  placeholder="0"
                  type="number"
                  min="0"
                />
              )}
              <div className="pl-2 flex items-end pb-1">
                <label className="flex items-center gap-1.5 text-m-caption" style={{ color: "var(--color-ink-700)" }}>
                  <input
                    type="checkbox"
                    checked={newIsPercentage}
                    onChange={(e) => setNewIsPercentage(e.target.checked)}
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
              style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-700)" }}
            >
              <Plus className="size-4" />
              Add Component
            </button>

            {/* Save / Cancel */}
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleCancel}
                className="flex-1 h-9 rounded-[0.5rem] text-m-body font-semibold press"
                style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-9 rounded-[0.5rem] text-m-body font-semibold press flex items-center justify-center gap-1.5"
                style={{ backgroundColor: "var(--color-accent, #2563eb)", color: "var(--color-accent-foreground)" }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Salary History Timeline ── */}
      <SalaryHistoryTimeline employeeId={employee.id} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OFFER LETTER SUB-TAB — generate, view/print, regenerate
   Uses: POST /api/employees/[id]/generate-offer-letter
   Print page: /print/offer-letter/[id]
   ═══════════════════════════════════════════════════════════════════════════ */
function OfferLetterSubTab({
  employee,
  canManage,
  openDoc,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  openDoc: (url: string, title?: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const status = employee.offerLetterStatus;
  const issued = ["ISSUED", "CONFIRMED", "EXPIRED", "TERMINATED"].includes(status ?? "");

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/generate-offer-letter`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to generate offer letter");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Offer letter generated");
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
    ISSUED: "Issued",
    CONFIRMED: "Confirmed",
    EXPIRED: "Expired",
    TERMINATED: "Terminated",
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-4" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              Offer Letter
            </span>
          </div>
          <span
            className="text-m-caption font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: issued ? "var(--color-success-bg, #dcfce7)" : "var(--color-ink-100)",
              color: issued ? "var(--color-success-text, #166534)" : "var(--color-ink-500)",
            }}
          >
            {statusLabel[status ?? "DRAFT"] ?? "Draft"}
          </span>
        </div>

        <div className="px-3 pb-3 space-y-2">
          {employee.offerLetterIssuedAt && (
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Issued: {formatDate(employee.offerLetterIssuedAt)}
            </p>
          )}

          <p className="text-m-body" style={{ color: "var(--color-ink-700)" }}>
            The offer letter is a formal job offer document covering position, compensation,
            employment type, and joining date. It is generated automatically when the employee
            is created with the required fields.
          </p>

          {canManage && (
            <button
              onClick={generate}
              disabled={busy}
              className="w-full h-10 rounded-[0.5rem] text-m-section font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {issued ? "Regenerate" : "Generate"} Offer Letter
            </button>
          )}

          {issued && (
            <button
              onClick={() => openDoc(`/print/offer-letter/${employee.id}`, "Offer Letter")}
              className="block w-full h-10 rounded-[0.5rem] text-m-section font-semibold press flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-100)",
                color: "var(--color-ink-700)",
              }}
            >
              <FileText className="size-4" />
              View / Print
            </button>
          )}
        </div>
      </div>

      {/* ── Terms & Conditions editor + shareable link ── */}
      <TermsEditor
        employeeId={employee.id}
        type="offer"
        terms={employee.offerLetterTerms}
        token={employee.offerToken}
        acceptedAt={employee.offerLetterAcceptedAt}
        issued={issued}
        canManage={canManage}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ID CARD SUB-TAB — generate, view/print, regenerate
   Uses: POST /api/employees/[id]/generate-id-card
   Print page: /print/employee-id-card/[id]
   ═══════════════════════════════════════════════════════════════════════════ */
function IdCardSubTab({
  employee,
  canManage,
  openDoc,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  openDoc: (url: string, title?: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const status = employee.idCardStatus;
  const issued = ["ISSUED", "CONFIRMED"].includes(status ?? "");

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/generate-id-card`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to generate ID card");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "ID card generated");
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
    ISSUED: "Issued",
    CONFIRMED: "Issued",
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IdCard className="size-4" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              Employee ID Card
            </span>
          </div>
          <span
            className="text-m-caption font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: issued ? "var(--color-success-bg, #dcfce7)" : "var(--color-ink-100)",
              color: issued ? "var(--color-success-text, #166534)" : "var(--color-ink-500)",
            }}
          >
            {statusLabel[status ?? "DRAFT"] ?? "Draft"}
          </span>
        </div>

        <div className="px-3 pb-3 space-y-2">
          {employee.idCardIssuedAt && (
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Issued: {formatDate(employee.idCardIssuedAt)}
            </p>
          )}

          <p className="text-m-body" style={{ color: "var(--color-ink-700)" }}>
            The ID card is a printable identification card with employee details, emergency
            contact, and statutory IDs. Print on standard card stock and laminate.
          </p>

          {canManage && (
            <button
              onClick={generate}
              disabled={busy}
              className="w-full h-10 rounded-[0.5rem] text-m-section font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <IdCard className="size-4" />}
              {issued ? "Regenerate" : "Generate"} ID Card
            </button>
          )}

          {issued && (
            <button
              onClick={() => openDoc(`/print/employee-id-card/${employee.id}`, "ID Card")}
              className="block w-full h-10 rounded-[0.5rem] text-m-section font-semibold press flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-100)",
                color: "var(--color-ink-700)",
              }}
            >
              <IdCard className="size-4" />
              View / Print
            </button>
          )}
        </div>
      </div>
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
  openDoc,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  openDoc: (url: string, title?: string) => void;
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
            <button
              onClick={() => openDoc(`/print/employment-agreement/${employee.id}`, "Employment Agreement")}
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
                <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>Opens in-page viewer</p>
              </div>
            </button>
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

      {/* ── Terms & Conditions editor + shareable link ── */}
      <TermsEditor
        employeeId={employee.id}
        type="agreement"
        terms={employee.contractTerms}
        token={employee.contractToken}
        acceptedAt={employee.contractConfirmedAt}
        issued={issued}
        canManage={canManage}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   APPOINTMENT LETTER SUB-TAB — generate, view/print, regenerate
   Uses: POST /api/employees/[id]/generate-appointment-letter
   Print page: /print/appointment-letter/[id]
   ═══════════════════════════════════════════════════════════════════════════ */
function AppointmentLetterSubTab({
  employee,
  canManage,
  openDoc,
}: {
  employee: OnboardingEmployeeData;
  canManage: boolean;
  openDoc: (url: string, title?: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const status = employee.appointmentLetterStatus;
  const issued = ["ISSUED", "CONFIRMED", "EXPIRED", "TERMINATED"].includes(status ?? "");

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/generate-appointment-letter`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to generate appointment letter");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Appointment letter generated");
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
    ISSUED: "Issued",
    CONFIRMED: "Confirmed",
    EXPIRED: "Expired",
    TERMINATED: "Terminated",
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-[0.75rem] overflow-hidden"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-4" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              Appointment Letter
            </span>
          </div>
          <span
            className="text-m-caption font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: issued ? "var(--color-success-bg, #dcfce7)" : "var(--color-ink-100)",
              color: issued ? "var(--color-success-text, #166534)" : "var(--color-ink-500)",
            }}
          >
            {statusLabel[status ?? "DRAFT"] ?? "Draft"}
          </span>
        </div>

        <div className="px-3 pb-3 space-y-2">
          {employee.appointmentLetterIssuedAt && (
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Issued: {formatDate(employee.appointmentLetterIssuedAt)}
            </p>
          )}

          <p className="text-m-body" style={{ color: "var(--color-ink-700)" }}>
            The appointment letter is a formal letter confirming the employee
            appointment to the position, with joining date, employment type, and
            key terms. It complements the detailed employment agreement.
          </p>

          {canManage && (
            <button
              onClick={generate}
              disabled={busy}
              className="w-full h-10 rounded-[0.5rem] text-m-section font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {issued ? "Regenerate" : "Generate"} Appointment Letter
            </button>
          )}

          {issued && (
            <button
              onClick={() => openDoc(`/print/appointment-letter/${employee.id}`, "Appointment Letter")}
              className="block w-full h-10 rounded-[0.5rem] text-m-section font-semibold press flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-100)",
                color: "var(--color-ink-700)",
              }}
            >
              <FileText className="size-4" />
              View / Print
            </button>
          )}
        </div>
      </div>
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
      // Scroll to the first empty required field
      const firstEmpty = !holder ? "deposit-holder" : !accountNo ? "deposit-account" : !ifsc ? "deposit-ifsc" : "deposit-bank";
      fieldError("Fill all required fields", firstEmpty);
      haptic([50, 20, 50]);
      return;
    }
    const pd = Number(payDay);
    if (!pd || pd < 1 || pd > 31) {
      fieldError("Pay day must be between 1 and 31", "deposit-payday");
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
        <UnderlineInput id="deposit-holder" label="Account Holder" value={holder} onChange={setHolder} placeholder="Name as per bank" required />
        <UnderlineInput id="deposit-account" label="Account Number" value={accountNo} onChange={setAccountNo} placeholder="Bank account number" required mono inputMode="numeric" />
        <div className="grid grid-cols-2 gap-2">
          <UnderlineInput id="deposit-ifsc" label="IFSC" value={ifsc} onChange={setIfsc} placeholder="HDFC0001234" required mono />
          <UnderlineInput id="deposit-payday" label="Pay Day" value={payDay} onChange={setPayDay} type="number" inputMode="numeric" placeholder="1" required />
        </div>
        <UnderlineInput id="deposit-bank" label="Bank Name" value={bankName} onChange={setBankName} placeholder="e.g. HDFC Bank" required />
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
      <DocumentsCard employee={employee} canManage={canManage} />
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
                        aria-label="Edit"
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
      fieldError("Select a benefit type", "benefit-type");
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
        id="benefit-type"
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
            aria-label="Remove"
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

/* ── Checklist row — onboarding checklist toggle ── */
function ChecklistRow({
  label,
  done,
  onClick,
  disabled,
}: {
  label: string;
  done: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2.5 py-2 text-left"
    >
      <span
        className="h-5 w-5 rounded-full flex items-center justify-center text-m-label font-bold"
        style={{
          backgroundColor: done ? "var(--color-success-bg, #dcfce7)" : "transparent",
          border: done ? "none" : "1.5px solid var(--color-ink-300, #cbd5e1)",
          color: done ? "#16a34a" : "var(--color-ink-400)",
        }}
      >
        {done ? "✓" : ""}
      </span>
      <span className="text-m-body" style={{ color: "var(--color-ink-700)" }}>
        {label}
      </span>
    </button>
  );
}

/* ── Documents card — uses AttachmentList ── */
function DocumentsCard({ employee, canManage }: { employee: OnboardingEmployeeData; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggleChecklist = async (field: "documentsSubmitted" | "backgroundVerified") => {
    setBusy(true);
    try {
      const current = employee[field];
      const newVal = current === true ? null : true;
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newVal }),
      });
      if (!res.ok) throw new Error("Failed to update");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-[0.75rem] overflow-hidden"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="px-3 pt-3 pb-1">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Onboarding Checklist
        </p>
      </div>
      <div className="px-3 pb-1">
        <ChecklistRow
          label="Documents submitted (PAN, Aadhaar, bank proof, education certs)"
          done={employee.documentsSubmitted === true}
          onClick={() => toggleChecklist("documentsSubmitted")}
          disabled={busy || !canManage}
        />
        <ChecklistRow
          label="Background verification completed"
          done={employee.backgroundVerified === true}
          onClick={() => toggleChecklist("backgroundVerified")}
          disabled={busy || !canManage}
        />
      </div>
      <div className="px-3 pt-2 pb-1 border-t" style={{ borderColor: "var(--color-line)" }}>
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Employee Documents
        </p>
        <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
          Upload PAN, Aadhaar, bank proof, photos & other documents (image or PDF).
        </p>
      </div>
      <div className="px-3 pb-3">
        <EmployeeDocuments employeeId={employee.id} canManage={canManage} />
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
  const [endDate, setEndDate] = useTodayDateState();
  const [reactivating, setReactivating] = useState(false);
  // Settlement fields
  const [finalSettlement, setFinalSettlement] = useState("");
  const [leaveEncashDays, setLeaveEncashDays] = useState("");
  const [leaveEncashAmount, setLeaveEncashAmount] = useState("");
  const [assetsReturned, setAssetsReturned] = useState<string>("");
  const [exitInterview, setExitInterview] = useState<string>("");
  const [pfFiled, setPfFiled] = useState<string>("");
  const [esiFiled, setEsiFiled] = useState<string>("");

  const isActive = employee.active;
  const noticeDays = employee.noticePeriodDays;
  // Compare dates only after mount to avoid SSR/client timezone mismatch.
  const now = useHydratedDate();
  const contractEnded = employee.contractEndDate ? now !== null && new Date(employee.contractEndDate) < now : false;

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
          finalSettlementAmount: finalSettlement ? Number(finalSettlement) : null,
          leaveEncashmentDays: leaveEncashDays ? Number(leaveEncashDays) : null,
          leaveEncashmentAmount: leaveEncashAmount ? Number(leaveEncashAmount) : null,
          assetsReturned: assetsReturned === "yes" ? true : assetsReturned === "no" ? false : null,
          exitInterviewConducted: exitInterview === "yes" ? true : exitInterview === "no" ? false : null,
          pfExitFiled: pfFiled === "yes" ? true : pfFiled === "no" ? false : null,
          esiExitFiled: esiFiled === "yes" ? true : esiFiled === "no" ? false : null,
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

              {/* ── Final settlement ── */}
              <div
                className="rounded-[0.5rem] overflow-hidden"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                <div className="px-3 pt-2 pb-1">
                  <p className="text-m-caption font-bold uppercase tracking-wider" style={{ color: "var(--color-ink-500)" }}>
                    Final Settlement
                  </p>
                </div>
                <div className="px-3 pb-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <UnderlineInput
                      label="Settlement Amount"
                      value={finalSettlement}
                      onChange={setFinalSettlement}
                      placeholder="0"
                      type="number"
                    />
                    <UnderlineInput
                      label="Leave Encash (days)"
                      value={leaveEncashDays}
                      onChange={setLeaveEncashDays}
                      placeholder="0"
                      type="number"
                    />
                  </div>
                  <UnderlineInput
                    label="Leave Encashment Amount"
                    value={leaveEncashAmount}
                    onChange={setLeaveEncashAmount}
                    placeholder="0"
                    type="number"
                  />
                  <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <EnumSelect
                      label="Assets Returned"
                      value={assetsReturned}
                      onChange={setAssetsReturned}
                      placeholder="— Select —"
                      options={[
                        { value: "yes", label: "Yes" },
                        { value: "no", label: "No" },
                      ]}
                    />
                    <EnumSelect
                      label="Exit Interview"
                      value={exitInterview}
                      onChange={setExitInterview}
                      placeholder="— Select —"
                      options={[
                        { value: "yes", label: "Conducted" },
                        { value: "no", label: "Not done" },
                      ]}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <EnumSelect
                      label="PF Exit Filed"
                      value={pfFiled}
                      onChange={setPfFiled}
                      placeholder="— Select —"
                      options={[
                        { value: "yes", label: "Filed" },
                        { value: "no", label: "Pending" },
                      ]}
                    />
                    <EnumSelect
                      label="ESI Exit Filed"
                      value={esiFiled}
                      onChange={setEsiFiled}
                      placeholder="— Select —"
                      options={[
                        { value: "yes", label: "Filed" },
                        { value: "no", label: "Pending" },
                      ]}
                    />
                  </div>
                </div>
              </div>

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

/* ─── Salary History Timeline ─── */
function SalaryHistoryTimeline({ employeeId }: { employeeId: string }) {
  const [history, setHistory] = useState<Array<{
    id: string;
    components: Array<{ type: string; amount: number; frequency: string; isDeduction: boolean }>;
    totalCtc: number | null;
    effectiveFrom: string;
    changeReason: string | null;
    changedByName: string;
    createdAt: string;
  }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/employees/${employeeId}/salary-history`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.history)) {
          setHistory(data.history);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);

  if (loading) {
    return (
      <div
        className="rounded-[0.75rem] overflow-hidden mt-3"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <div className="px-3 py-3">
          <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
            Salary History
          </p>
          <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-400)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return null; // Don't show the section if there's no history yet
  }

  return (
    <div
      className="rounded-[0.75rem] overflow-hidden mt-3"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="px-3 pt-3 pb-1">
        <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
          Salary History
        </p>
      </div>
      <div className="px-3 pb-3">
        <div className="flex flex-col gap-2">
          {history.map((entry, idx) => {
            const isLatest = idx === 0;
            const isExpandedRow = expanded === entry.id;
            return (
              <div
                key={entry.id}
                className="rounded-[0.5rem] overflow-hidden"
                style={{
                  backgroundColor: isLatest ? "color-mix(in srgb, var(--color-go) 5%, transparent)" : "var(--color-concrete)",
                }}
              >
                <button
                  onClick={() => setExpanded(isExpandedRow ? null : entry.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left press"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isLatest && (
                        <span
                          className="text-[10px] font-bold px-1 py-0.5 rounded-full"
                          style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
                        >
                          CURRENT
                        </span>
                      )}
                      <span className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {entry.totalCtc != null ? formatCurrency(entry.totalCtc) + "/yr" : "—"}
                      </span>
                    </div>
                    <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                      Effective {formatDate(entry.effectiveFrom)}
                      {entry.changeReason ? ` · ${entry.changeReason}` : ""}
                    </span>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 transition-transform"
                    style={{
                      color: "var(--color-ink-400)",
                      transform: isExpandedRow ? "rotate(90deg)" : "none",
                    }}
                  />
                </button>
                {isExpandedRow && (
                  <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: "var(--color-line)" }}>
                    <div className="flex flex-col gap-1">
                      {entry.components
                        .filter((c) => !c.isDeduction)
                        .map((c, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-m-caption" style={{ color: "var(--color-ink-600)" }}>{c.type}</span>
                            <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-950)" }}>
                              {formatCurrency(c.amount)}{c.frequency === "MONTHLY" ? "/mo" : c.frequency === "YEARLY" ? "/yr" : ""}
                            </span>
                          </div>
                        ))}
                      {entry.components.some((c) => c.isDeduction) && (
                        <div className="pt-1 mt-1 border-t" style={{ borderColor: "var(--color-line)" }}>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--color-ink-400)" }}>
                            Deductions
                          </p>
                          {entry.components
                            .filter((c) => c.isDeduction)
                            .map((c, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="text-m-caption" style={{ color: "var(--color-ink-600)" }}>{c.type}</span>
                                <span className="text-m-caption font-semibold" style={{ color: "var(--color-stop)" }}>
                                  −{formatCurrency(c.amount)}{c.frequency === "MONTHLY" ? "/mo" : ""}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                      <div className="pt-1 mt-1 border-t" style={{ borderColor: "var(--color-line)" }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
                          Changed by {entry.changedByName} on {formatDate(entry.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
