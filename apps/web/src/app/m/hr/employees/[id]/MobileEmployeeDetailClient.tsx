"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  User, Phone, Mail, Briefcase, IndianRupee, Calendar, Clock,
  Pencil, Loader2, Trash2, Wallet, ListChecks, FileText,
  CalendarOff, UsersRound, MapPin, UserCircle, MessageSquare,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IdCard, Building2, Activity, FolderOpen,
  CheckCircle2, ChevronRight, ArrowUp, ArrowDown, Check, Plus,
  AlertCircle, ShieldCheck, XCircle, KeyRound, Shield, Paperclip,
  Package,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import {
  MobileSectionTitle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MobileRow,
  MobileEmptyState,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { DetailStatGrid } from "@/components/mobile/v2/detail-primitives";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { toast } from "sonner";
import { DocumentViewer, useDocumentViewer } from "@/components/document-viewer/document-viewer";
import { CreateAccountDialog } from "@/components/hr/create-account-dialog";
import { type OnboardingEmployeeData } from "./MobileOnboardingTab";
import { OnboardingModal } from "./OnboardingModal";
import { EmployeeDocuments } from "./EmployeeDocuments";
import { AccessSection } from "./AccessSection";
import { buildOnboardingSteps } from "@/lib/onboarding-steps";

type WageType = "DAILY" | "MONTHLY" | "FIXED";

const WAGE_TYPE_LABELS: Record<WageType, string> = {
  DAILY: "Daily Wage",
  MONTHLY: "Monthly Salary",
  FIXED: "Fixed Contract",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const HIERARCHY_LABELS = ["Management", "Manager", "Engineer", "Supervisor", "Skilled", "Labor"];

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Present", ABSENT: "Absent", HALF_DAY: "Half Day", OVERTIME: "Overtime",
  LEAVE: "Leave", LATE: "Late", PAID_LEAVE: "Paid Leave", NON_PAID_LEAVE: "Non-Paid Leave",
};

const PAYROLL_LABELS: Record<string, string> = { DRAFT: "Draft", PROCESSED: "Processed", PAID: "Paid" };
const LEAVE_LABELS: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };
const TASK_LABELS: Record<string, string> = { PENDING: "Pending", IN_PROGRESS: "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const DPR_LABELS: Record<string, string> = { SUBMITTED: "Submitted", SUB_ADMIN_APPROVED: "Sub-Admin Approved", APPROVED: "Approved", REJECTED: "Rejected" };

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface AttendanceItem {
  id: string; date: string; status: string;
  checkIn: string | null; checkOut: string | null;
  hoursWorked: number | null; projectName: string | null;
}

interface PayrollItem {
  id: string; periodId: string; month: number; year: number; status: string;
  daysWorked: number; grossPay: number; totalDeductions: number; netPay: number; paidAt: string | null;
  paymentReference: string | null;
  paymentMode: string | null;
  paymentDate: string | null;
  proofUploadId: string | null;
  proofUrl: string | null;
}

interface TaskItem {
  id: string; title: string; status: string; priority: string;
  dueDate: string | null; completedAt: string | null; assignedByName: string | null;
}

interface DprItem {
  id: string; date: string; projectName: string | null;
  workType: string | null; approvalStatus: string; hoursWorked: number; taskDescription: string;
}

interface LeaveItem {
  id: string; type: string; startDate: string; endDate: string;
  days: number; reason: string | null; status: string; approvedByName: string | null;
}

interface EmployeeData {
  id: string;
  name: string;
  trade: string | null;
  designation: string | null;
  departmentId: string | null;
  departmentName: string | null;
  phone: string | null;
  email: string | null;
  wageType: WageType;
  dailyRate: number | null;
  monthlySalary: number | null;
  joinDate: string | null;
  hierarchyLevel: number | null;
  active: boolean;
  crewName: string | null;
  crewProjectName: string | null;
  activeProjectName: string | null;
  activeProjectId: string | null;
  reportingLocationName: string | null;
  reportingLocationId: string | null;
  userId: string | null;
  reportsTo: { employeeId: string; name: string; designation: string | null; role: string | null } | null;
  directReports: { employeeId: string; name: string; designation: string | null; role: string | null }[];
  reportsToEmployeeId: string | null;
  contractStatus: string | null;
  contractIssuedAt: string | null;
  contractConfirmedAt: string | null;
  offerLetterStatus: string | null;
  offerLetterIssuedAt: string | null;
  idCardStatus: string | null;
  idCardIssuedAt: string | null;
  appointmentLetterStatus: string | null;
  appointmentLetterIssuedAt: string | null;
  documentsSubmitted: boolean | null;
  backgroundVerified: boolean | null;
  onboardingComplete: boolean | null;
  autoDepositEnabled: boolean | null;
  payDay: number | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
  autoDepositSetupAt: string | null;
  employmentType: string | null;
  noticePeriodDays: number | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  salaryComponents: {
    id: string; type: string; amount: number; frequency: string;
    isDeduction: boolean; isPercentage: boolean; percentageOfBasic: number | null;
    notes: string | null; active: boolean;
  }[];
  benefits: {
    id: string; type: string; amount: number | null; frequency: string;
    startDate: string | null; endDate: string | null; notes: string | null; active: boolean;
  }[];
  user: {
    id: string;
    email: string; role: string | null; phone: string | null; image: string | null;
    employeeCode: string | null; department: string | null;
    joiningDate: string | null; active: boolean; lastLoginAt: string | null;
    phoneVerified: boolean | null;
    phoneVerifiedAt: string | null;
    phoneSyncedAt: string | null;
  } | null;
  supervisedCrews: { id: string; name: string; active: boolean; projectName: string | null; memberCount: number }[];
  // Multi-company: other companies this employee works in
  companyMemberships?: { employeeId: string; companyId: string; companyName: string; active: boolean }[];
  // Multi-company: companies available to add the employee to
  availableCompanies?: { id: string; name: string; parentCompanyId: string | null }[];
  // Company resources issued to this employee
  resources?: {
    id: string; name: string; category: string; assetTag: string | null; serialNumber: string | null;
    quantity: number; issuedAt: string; expectedReturnAt: string | null; returnedAt: string | null;
    conditionAtIssue: string | null; conditionAtReturn: string | null;
    depositAmount: number | null; depositRefunded: boolean;
    issuedByUser: { id: string; name: string } | null;
    returnedToUser: { id: string; name: string } | null;
    notes: string | null;
  }[];
  attendances: AttendanceItem[];
  attendanceStats: { presentDays: number; halfDays: number; lateDays: number; absentDays: number; total: number };
  payrollHistory: PayrollItem[];
  payrollStats: { totalNetPaid: number; count: number };
  tasks: TaskItem[];
  dprHistory: DprItem[];
  dprStats: { totalHours: number; count: number };
  leaveHistory: LeaveItem[];
  leaveStats: { pending: number; approved: number; total: number };
}

interface ProjectOption { id: string; name: string; }
interface StockLocationOption { id: string; name: string; }

interface PotentialManager { id: string; name: string; designation: string | null; trade: string | null; }

export function MobileEmployeeDetailClient({
  employee,
  canManage,
  actorRole,
  notFound,
  projects,
  stockLocations,
  potentialManagers,
  onboardingData,
  canManagePayroll,
  canManageUsers,
  assignableRoles,
  departments,
  currentUserId,
}: {
  employee?: EmployeeData;
  canManage: boolean;
  actorRole: string;
  notFound?: boolean;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  potentialManagers: PotentialManager[];
  onboardingData?: OnboardingEmployeeData;
  canManagePayroll?: boolean;
  canManageUsers?: boolean;
  assignableRoles?: { key: string; label: string }[];
  departments?: { id: string; code: string; name: string; active: boolean }[];
  currentUserId?: string;
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [showDprModal, setShowDprModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showCrewsModal, setShowCrewsModal] = useState(false);
  const [showResourcesModal, setShowResourcesModal] = useState(false);
  const [editingReportsTo, setEditingReportsTo] = useState(false);
  const [savingReportsTo, setSavingReportsTo] = useState(false);
  const [reportsToDraft, setReportsToDraft] = useState(employee?.reportsToEmployeeId ?? "");
  const docViewer = useDocumentViewer();
  const [availableNumbers, setAvailableNumbers] = useState<
    { id: string; phoneNumber: string; label: string | null; department: string | null; status: string; monthlyCost: number | null; provider: string | null }[]
  >([]);

  if (notFound || !employee) {
    return <MobileEmptyState icon={User} title="Employee not found" />;
  }

  const employeeId = employee.id;

  // ── Inline reporting line edit with validation ──
  // Gating: only canManage (HR_MANAGE) users can edit.
  // Validation: server-side cycle detection + self-reference check.
  async function saveReportsTo(newManagerId: string | null) {
    setSavingReportsTo(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportsToEmployeeId: newManagerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update reporting line");
      toast.success(newManagerId ? "Reporting line updated" : "Reporting line cleared");
      setEditingReportsTo(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingReportsTo(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Employee archived");
      setShowDelete(false);
      router.push("/m/hr/employees");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  const openTasks = employee.tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const completedTasks = employee.tasks.filter((t) => t.status === "COMPLETED").length;
  const wageValue = employee.wageType === "DAILY"
    ? formatCurrency(employee.dailyRate ?? 0) + "/day"
    : employee.monthlySalary != null
      ? formatCurrency(employee.monthlySalary) + "/mo"
      : "—";

  const phone = employee.phone ?? employee.user?.phone ?? null;
  const email = employee.email ?? employee.user?.email ?? null;
  const photoUrl = employee.user?.image ?? null;

  // ── Payroll summary ──
  const lastPayment = employee.payrollHistory.find((p) => p.paymentDate);
  const lastPaymentDate = lastPayment?.paymentDate ? new Date(lastPayment.paymentDate) : null;
  const lastPaymentAmount = lastPayment?.netPay ?? null;
  const lastPaymentStatus = lastPayment?.status ?? null;
  const pendingPayroll = employee.payrollHistory.find((p) => p.status === "PROCESSED" && !p.paymentDate);
  // Next pay date: employee.payDay of the next month, or pending payroll's expected date
  const nextPayDate = (() => {
    if (pendingPayroll) {
      // If there's a processed-but-unpaid period, that's the next payment
      const d = new Date(pendingPayroll.year, pendingPayroll.month, 0); // last day of that month
      return d;
    }
    // Otherwise, the employee's configured pay day of the current/next month
    if (employee.payDay) {
      const now = new Date();
      const thisMonthPay = new Date(now.getFullYear(), now.getMonth(), employee.payDay);
      if (thisMonthPay >= now) return thisMonthPay;
      return new Date(now.getFullYear(), now.getMonth() + 1, employee.payDay);
    }
    return null;
  })();
  const totalNetPaid = employee.payrollStats.totalNetPaid;
  const payrollCount = employee.payrollStats.count;

  return (
    <div className="pb-4">
      {/* ── Profile header card — color strip + avatar + identity ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden mb-3"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        {/* Color strip — amber for active, grey for inactive */}
        <div
          className="h-1 w-full"
          style={{ backgroundColor: employee.active ? "var(--color-signal)" : "var(--color-ink-300)" }}
        />
        <div className="flex items-start gap-3 p-3">
          {/* Avatar — 56px, photo or initials */}
          <div className="shrink-0 relative size-14 rounded-[0.625rem] overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
            {photoUrl ? (
              <Image src={photoUrl} alt={employee.name} fill sizes="56px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-m-section font-bold" style={{ color: "var(--color-ink-700)" }}>
                {employee.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name + role + badges */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-m-section font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
                {employee.name}
              </h1>
            </div>
            <p className="text-m-caption mt-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
              {employee.designation ?? employee.trade ?? "Employee"}
              {employee.hierarchyLevel != null && ` · H${employee.hierarchyLevel}`}
            </p>
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span
                className="text-m-label font-bold px-1.5 py-0.5 rounded-[0.25rem]"
                style={{
                  backgroundColor: employee.active ? "var(--color-go-wash)" : "var(--color-concrete)",
                  color: employee.active ? "var(--color-go)" : "var(--color-ink-500)",
                }}
              >
                {employee.active ? "Active" : "Inactive"}
              </span>
              {employee.onboardingComplete !== true && (
                <span
                  className="text-m-label font-bold px-1.5 py-0.5 rounded-[0.25rem] flex items-center gap-0.5"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)",
                    color: "var(--color-signal-dark)",
                  }}
                >
                  <Clock className="size-2.5" /> Pending Onboarding
                </span>
              )}
              {employee.user?.employeeCode && (
                <span
                  className="text-m-label font-mono px-1.5 py-0.5 rounded-[0.25rem] flex items-center gap-0.5"
                  style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
                >
                  <IdCard className="size-2.5" /> {employee.user.employeeCode}
                </span>
              )}
              {employee.crewName && (
                <span
                  className="text-m-label px-1.5 py-0.5 rounded-[0.25rem] flex items-center gap-0.5"
                  style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
                >
                  <UsersRound className="size-2.5" /> {employee.crewName}
                </span>
              )}
              {employee.companyMemberships?.map((m) => (
                <Link
                  key={m.employeeId}
                  href={`/m/hr/employees/${m.employeeId}`}
                  className="text-m-label px-1.5 py-0.5 rounded-[0.25rem] flex items-center gap-0.5 press"
                  style={{
                    backgroundColor: m.active ? "color-mix(in srgb, var(--color-go) 10%, transparent)" : "var(--color-concrete)",
                    color: m.active ? "var(--color-go)" : "var(--color-ink-500)",
                  }}
                >
                  <Building2 className="size-2.5" /> {m.companyName}
                </Link>
              ))}
              {employee.availableCompanies && employee.availableCompanies.length > 0 && (
                <AddToCompanyChip employeeId={employee.id} companies={employee.availableCompanies} />
              )}
            </div>
          </div>

          {/* Edit icon for managers */}
          {canManage ? (
            <button
              onClick={() => setShowEdit(true)}
              aria-label="Edit employee"
              className="shrink-0 flex items-center justify-center size-8 rounded-[0.375rem] text-m-body press"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
            >
              <Pencil className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Quick contact actions — Call, SMS, Email (primary mobile actions) */}
        <div className="flex gap-1.5 px-3 pb-3">
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="flex-1 flex items-center justify-center gap-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              <Phone className="size-3.5" /> Call
            </a>
          ) : null}
          {phone ? (
            <a
              href={`sms:${phone.replace(/\s/g, "")}`}
              className="flex-1 flex items-center justify-center gap-1 h-9 rounded-[0.5rem] border-2 text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
            >
              <MessageSquare className="size-3.5" /> Text
            </a>
          ) : null}
          {email ? (
            <a
              href={`mailto:${email}`}
              className="flex-1 flex items-center justify-center gap-1 h-9 rounded-[0.5rem] border-2 text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
            >
              <Mail className="size-3.5" /> Email
            </a>
          ) : null}
        </div>

        {/* Phone verification + Twilio sync status badges */}
        {phone && (
          <div className="flex items-center gap-1.5 flex-wrap px-3 pb-2">
            {employee.user?.phoneVerified === true ? (
              <span
                className="flex items-center gap-0.5 text-m-label font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}
              >
                <CheckCircle2 className="size-2.5" /> Verified
              </span>
            ) : (
              <span
                className="flex items-center gap-0.5 text-m-label font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }}
              >
                <AlertCircle className="size-2.5" /> Unverified
              </span>
            )}
            {employee.user?.phoneSyncedAt ? (
              <span
                className="flex items-center gap-0.5 text-m-label font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}
              >
                <ShieldCheck className="size-2.5" /> Twilio Synced
              </span>
            ) : (
              <span
                className="flex items-center gap-0.5 text-m-label font-bold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }}
              >
                <XCircle className="size-2.5" /> Not Synced
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Assignment & wage — compact info card ── */}
      <div
        className="rounded-[0.625rem] border mb-3 overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <InfoField icon={<Building2 className="size-3" />} label="Project" value={employee.activeProjectName} />
            <InfoField icon={<UsersRound className="size-3" />} label="Crew" value={employee.crewName} sub={employee.crewProjectName ?? undefined} />
            <InfoField icon={<MapPin className="size-3" />} label="Attendance Site" value={employee.reportingLocationName} />
            <InfoField icon={<IndianRupee className="size-3" />} label="Wage" value={wageValue} />
            <InfoField icon={<Briefcase className="size-3" />} label="Trade" value={employee.trade} />
            <InfoField icon={<Calendar className="size-3" />} label="Joined" value={employee.joinDate ? formatDate(employee.joinDate) : null} />
            {/* Phone with inline verification + Twilio sync status — clickable to open dialog */}
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-m-label" style={{ color: "var(--color-ink-500)" }}>
                <Phone className="size-3" /> Phone
              </div>
              <button
                onClick={() => phone && setShowPhoneDialog(true)}
                disabled={!phone}
                className="text-m-body font-semibold truncate text-left press disabled:cursor-default"
                style={{ color: phone ? "var(--color-ink-950)" : "var(--color-ink-300)" }}
              >
                {phone || "—"}
              </button>
              {phone && (
                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                  <button
                    onClick={() => setShowPhoneDialog(true)}
                    className="flex items-center gap-0.5 text-m-label font-bold px-1 py-0.5 rounded-full press"
                    style={
                      employee.user?.phoneVerified === true
                        ? { backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }
                        : { backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }
                    }
                  >
                    {employee.user?.phoneVerified === true ? <CheckCircle2 className="size-2.5" /> : <AlertCircle className="size-2.5" />}
                    {employee.user?.phoneVerified === true ? "Verified" : "Unverified"}
                  </button>
                  <button
                    onClick={() => setShowPhoneDialog(true)}
                    className="flex items-center gap-0.5 text-m-label font-bold px-1 py-0.5 rounded-full press"
                    style={
                      employee.user?.phoneSyncedAt
                        ? { backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }
                        : { backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }
                    }
                  >
                    {employee.user?.phoneSyncedAt ? <ShieldCheck className="size-2.5" /> : <XCircle className="size-2.5" />}
                    {employee.user?.phoneSyncedAt ? "Twilio" : "Not Synced"}
                  </button>
                </div>
              )}
            </div>
          </div>
          {employee.user && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
              <InfoField icon={<Mail className="size-3" />} label="Login" value={employee.user.email} />
              {employee.user.role && <InfoField icon={<UserCircle className="size-3" />} label="Role" value={employee.user.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} />}
              {employee.user.department && <InfoField icon={<Briefcase className="size-3" />} label="Dept" value={employee.user.department} />}
              {employee.user.lastLoginAt && <InfoField icon={<Clock className="size-3" />} label="Last Login" value={formatDate(employee.user.lastLoginAt)} />}
            </div>
          )}
          {!employee.user && employee.active && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/telephony/numbers/available");
                  if (res.ok) setAvailableNumbers(await res.json());
                } catch (err) { console.warn("Failed to load available numbers:", err); }
                setShowCreateAccount(true);
              }}
              className="mt-2 w-full h-8 rounded-[0.375rem] text-m-caption font-bold flex items-center justify-center gap-1 press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <UserCircle className="size-3.5" /> Create Login Account
            </button>
          )}
        </div>
      </div>

      {/* ── Reporting Line — manager + subordinates in one clear section ── */}
      <div
        className="rounded-[0.625rem] border mb-3 overflow-hidden"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Reporting Line
              </p>
              {canManage && !editingReportsTo && (
                <button
                  onClick={() => {
                    setReportsToDraft(employee.reportsToEmployeeId ?? "");
                    setEditingReportsTo(true);
                  }}
                  className="flex items-center gap-1 text-m-caption font-semibold press"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  <Pencil className="size-3" />
                  Edit
                </button>
              )}
            </div>

            {/* Manager (who this person reports to) */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="grid place-items-center size-7 rounded-full shrink-0"
                style={{ backgroundColor: "var(--color-ink-100)" }}
              >
                <ArrowUp className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>Reports to</p>
                {editingReportsTo ? (
                  <select
                    value={reportsToDraft}
                    onChange={(e) => setReportsToDraft(e.target.value)}
                    disabled={savingReportsTo}
                    className="w-full h-8 rounded-[0.375rem] border px-2 text-m-body"
                    style={{
                      borderColor: "var(--color-line)",
                      backgroundColor: "var(--color-paper)",
                      color: "var(--color-ink-950)",
                    }}
                  >
                    <option value="">— No manager (top of chain) —</option>
                    {potentialManagers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{m.designation || m.trade ? ` · ${m.designation ?? m.trade}` : ""}
                        </option>
                      ))}
                  </select>
                ) : employee.reportsTo ? (
                  <Link
                    href={`/m/hr/employees/${employee.reportsTo.employeeId}`}
                    className="text-m-body font-semibold press"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {employee.reportsTo.name}
                  </Link>
                ) : (
                  <p className="text-m-body" style={{ color: "var(--color-ink-300)" }}>
                    No manager assigned
                  </p>
                )}
              </div>
              {!editingReportsTo && employee.reportsTo && (
                <span
                  className="text-m-caption px-1.5 py-0.5 rounded-[0.25rem] shrink-0"
                  style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-700)" }}
                >
                  {employee.reportsTo.designation ?? employee.reportsTo.role?.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) ?? "—"}
                </span>
              )}
            </div>

            {/* Save / Cancel buttons when editing */}
            {editingReportsTo && (
              <div className="flex gap-2 mb-2 ml-9">
                <button
                  onClick={() => saveReportsTo(reportsToDraft || null)}
                  disabled={savingReportsTo}
                  className="flex-1 h-8 rounded-[0.375rem] text-m-caption font-bold flex items-center justify-center gap-1.5 press"
                  style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: savingReportsTo ? 0.5 : 1 }}
                >
                  {savingReportsTo ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                  Save
                </button>
                <button
                  onClick={() => { setEditingReportsTo(false); setReportsToDraft(employee.reportsToEmployeeId ?? ""); }}
                  disabled={savingReportsTo}
                  className="flex-1 h-8 rounded-[0.375rem] border text-m-caption font-bold press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Divider */}
            {employee.reportsTo && employee.directReports.length > 0 && (
              <div className="border-t my-2" style={{ borderColor: "var(--color-line)" }} />
            )}

            {/* Subordinates (who reports to this person) */}
            {employee.directReports.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="grid place-items-center size-7 rounded-full shrink-0"
                    style={{ backgroundColor: "var(--color-ink-100)" }}
                  >
                    <ArrowDown className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                  </div>
                  <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                    {employee.directReports.length} direct report{employee.directReports.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="ml-9 space-y-1.5">
                  {employee.directReports.map((r) => (
                    <Link
                      key={r.employeeId}
                      href={`/m/hr/employees/${r.employeeId}`}
                      className="flex items-center justify-between press"
                    >
                      <span className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>{r.name}</span>
                      <span
                        className="text-m-caption px-1.5 py-0.5 rounded-[0.25rem] shrink-0"
                        style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-700)" }}
                      >
                        {r.designation ?? r.role?.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) ?? "—"}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      {/* ── Access & Login (merged from Team page — gated by USERS_MANAGE) ── */}
      {employee && (
        <AccessSection
          employeeId={employee.id}
          employeeName={employee.name}
          user={employee.user}
          canManageUsers={canManageUsers ?? false}
          isSelf={!!currentUserId && !!employee.user && currentUserId === employee.user.id}
          assignableRoles={assignableRoles ?? []}
          projects={projects}
          departments={departments ?? []}
        />
      )}

      {/* ── Onboarding Progress (compact) ── */}
      {canManage && (() => {
        // Use the shared buildOnboardingSteps for step progress.
        // The DB field (employee.onboardingComplete) is the single source of truth
        // for "is it complete" — no duplicate computation.
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
        const pct = Math.round((completedCount / steps.length) * 100);
        const isComplete = employee.onboardingComplete === true;

        return (
          <>
            <MobileSectionTitle>Onboarding</MobileSectionTitle>
            <button
              onClick={() => setShowOnboardingModal(true)}
              className="w-full rounded-[0.75rem] overflow-hidden mb-3 text-left press"
              style={{
                backgroundColor: "var(--color-paper)",
                border: `1px solid ${isComplete ? "color-mix(in srgb, var(--color-go) 30%, var(--color-line))" : "var(--color-line)"}`,
              }}
            >
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="grid place-items-center size-7 rounded-full shrink-0"
                    style={{
                      backgroundColor: isComplete
                        ? "color-mix(in srgb, var(--color-go) 15%, transparent)"
                        : pct > 0 ? "color-mix(in srgb, var(--color-signal) 15%, transparent)" : "var(--color-ink-100)",
                    }}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="size-4" style={{ color: "var(--color-go)" }} />
                    ) : (
                      <ListChecks className="size-4" style={{ color: pct > 0 ? "var(--color-signal)" : "var(--color-ink-400)" }} />
                    )}
                  </div>
                  <div>
                    <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>
                      {isComplete ? "Onboarding Complete" : "Onboarding in Progress"}
                    </p>
                    <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                      {completedCount}/{steps.length} steps · {pct}%
                    </p>
                  </div>
                </div>
                <span
                  className="text-m-caption font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    color: isComplete ? "var(--color-go)" : pct === 100 ? "var(--color-go)" : "var(--color-signal)",
                    backgroundColor: `color-mix(in srgb, ${isComplete ? "var(--color-go)" : pct === 100 ? "var(--color-go)" : "var(--color-signal)"} 8%, transparent)`,
                  }}
                >
                  {isComplete ? "Done" : `${pct}%`}
                </span>
              </div>
              {/* Progress bar */}
              <div className="px-3 pb-3">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${isComplete ? 100 : pct}%`,
                      backgroundColor: isComplete || pct === 100 ? "var(--color-go)" : "var(--color-signal)",
                    }}
                  />
                </div>
                <p className="text-m-caption mt-2 flex items-center gap-1" style={{ color: "var(--color-ink-500)" }}>
                  <FolderOpen className="size-3" />
                  Tap to {isComplete ? "view" : "complete"} onboarding →
                </p>
              </div>
            </button>
          </>
        );
      })()}

      {/* ── Documents & Deposit — stat cards with pop-up details ── */}
      <MobileSectionTitle>Documents & Deposit</MobileSectionTitle>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {/* Offer Letter */}
        {(() => {
          const issued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.offerLetterStatus ?? "");
          const confirmed = employee.offerLetterStatus === "CONFIRMED";
          return (
            <button
              onClick={() => issued && docViewer.openDoc(`/print/offer-letter/${employee.id}`, "Offer Letter")}
              disabled={!issued}
              className={`rounded-[0.5rem] p-2 text-left ${issued ? "press" : "cursor-default"}`}
              style={{
                backgroundColor: "var(--color-paper)",
                border: `1px solid ${issued ? "color-mix(in srgb, var(--color-go) 25%, var(--color-line))" : "var(--color-line)"}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div
                  className="grid place-items-center size-6 rounded-full shrink-0"
                  style={{ backgroundColor: issued ? "color-mix(in srgb, var(--color-go) 15%, transparent)" : "var(--color-ink-100)" }}
                >
                  <FileText className="size-3" style={{ color: issued ? "var(--color-go)" : "var(--color-ink-400)" }} />
                </div>
                {issued && <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />}
              </div>
              <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Offer</p>
              <p
                className="text-m-caption truncate"
                style={{ color: issued ? "var(--color-go)" : "var(--color-ink-400)" }}
              >
                {confirmed ? "Accepted" : issued ? "Issued" : "Pending"}
              </p>
            </button>
          );
        })()}

        {/* Employment Agreement */}
        {(() => {
          const issued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? "");
          const confirmed = employee.contractStatus === "CONFIRMED";
          return (
            <button
              onClick={() => issued && docViewer.openDoc(`/print/employment-agreement/${employee.id}`, "Employment Agreement")}
              disabled={!issued}
              className={`rounded-[0.5rem] p-2 text-left ${issued ? "press" : "cursor-default"}`}
              style={{
                backgroundColor: "var(--color-paper)",
                border: `1px solid ${issued ? "color-mix(in srgb, var(--color-go) 25%, var(--color-line))" : "var(--color-line)"}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div
                  className="grid place-items-center size-6 rounded-full shrink-0"
                  style={{ backgroundColor: issued ? "color-mix(in srgb, var(--color-go) 15%, transparent)" : "var(--color-ink-100)" }}
                >
                  <FileText className="size-3" style={{ color: issued ? "var(--color-go)" : "var(--color-ink-400)" }} />
                </div>
                {issued && <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />}
              </div>
              <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Agreement</p>
              <p
                className="text-m-caption truncate"
                style={{ color: issued ? "var(--color-go)" : "var(--color-ink-400)" }}
              >
                {confirmed ? "Confirmed" : issued ? "Issued" : "Pending"}
              </p>
            </button>
          );
        })()}

        {/* Appointment Letter */}
        {(() => {
          const issued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.appointmentLetterStatus ?? "");
          return (
            <button
              onClick={() => issued && docViewer.openDoc(`/print/appointment-letter/${employee.id}`, "Appointment Letter")}
              disabled={!issued}
              className={`rounded-[0.5rem] p-2 text-left ${issued ? "press" : "cursor-default"}`}
              style={{
                backgroundColor: "var(--color-paper)",
                border: `1px solid ${issued ? "color-mix(in srgb, var(--color-go) 25%, var(--color-line))" : "var(--color-line)"}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div
                  className="grid place-items-center size-6 rounded-full shrink-0"
                  style={{ backgroundColor: issued ? "color-mix(in srgb, var(--color-go) 15%, transparent)" : "var(--color-ink-100)" }}
                >
                  <FileText className="size-3" style={{ color: issued ? "var(--color-go)" : "var(--color-ink-400)" }} />
                </div>
                {issued && <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />}
              </div>
              <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Appointment</p>
              <p
                className="text-m-caption truncate"
                style={{ color: issued ? "var(--color-go)" : "var(--color-ink-400)" }}
              >
                {issued ? "Issued" : "Pending"}
              </p>
            </button>
          );
        })()}

        {/* ID Card */}
        {(() => {
          const issued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.idCardStatus ?? "");
          return (
            <button
              onClick={() => issued && docViewer.openDoc(`/print/id-card/${employee.id}`, "ID Card")}
              disabled={!issued}
              className={`rounded-[0.5rem] p-2 text-left ${issued ? "press" : "cursor-default"}`}
              style={{
                backgroundColor: "var(--color-paper)",
                border: `1px solid ${issued ? "color-mix(in srgb, var(--color-go) 25%, var(--color-line))" : "var(--color-line)"}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div
                  className="grid place-items-center size-6 rounded-full shrink-0"
                  style={{ backgroundColor: issued ? "color-mix(in srgb, var(--color-go) 15%, transparent)" : "var(--color-ink-100)" }}
                >
                  <IdCard className="size-3" style={{ color: issued ? "var(--color-go)" : "var(--color-ink-400)" }} />
                </div>
                {issued && <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />}
              </div>
              <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>ID Card</p>
              <p
                className="text-m-caption truncate"
                style={{ color: issued ? "var(--color-go)" : "var(--color-ink-400)" }}
              >
                {issued ? "Issued" : "Pending"}
              </p>
            </button>
          );
        })()}

        {/* Auto-Deposit — opens detail popup */}
        <button
          onClick={() => setShowDepositModal(true)}
          className="rounded-[0.5rem] p-2 text-left press"
          style={{
            backgroundColor: "var(--color-paper)",
            border: `1px solid ${employee.autoDepositEnabled ? "color-mix(in srgb, var(--color-go) 25%, var(--color-line))" : "var(--color-line)"}`,
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div
              className="grid place-items-center size-6 rounded-full shrink-0"
              style={{ backgroundColor: employee.autoDepositEnabled ? "color-mix(in srgb, var(--color-go) 15%, transparent)" : "var(--color-ink-100)" }}
            >
              <Wallet className="size-3" style={{ color: employee.autoDepositEnabled ? "var(--color-go)" : "var(--color-ink-400)" }} />
            </div>
            <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Deposit</p>
          <p
            className="text-m-caption truncate"
            style={{ color: employee.autoDepositEnabled ? "var(--color-go)" : "var(--color-ink-400)" }}
          >
            {employee.autoDepositEnabled ? "Active" : "Not set"}
          </p>
        </button>

        {/* Employee Documents — opens detail popup */}
        <button
          onClick={() => setShowDocsModal(true)}
          className="rounded-[0.5rem] p-2 text-left press"
          style={{
            backgroundColor: "var(--color-paper)",
            border: "1px solid var(--color-line)",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div
              className="grid place-items-center size-6 rounded-full shrink-0"
              style={{ backgroundColor: "var(--color-ink-100)" }}
            >
              <FolderOpen className="size-3" style={{ color: "var(--color-ink-500)" }} />
            </div>
            <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Documents</p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
            PAN, Aadhaar…
          </p>
        </button>
      </div>

      {/* ── Document detail popups ── */}
      {showDepositModal && (
        <MobileDialog open={showDepositModal} onClose={() => setShowDepositModal(false)} title="Auto-Deposit Details">
          <div className="space-y-2">
            <DetailRow label="Status" value={employee.autoDepositEnabled ? "Active" : "Not configured"} tone={employee.autoDepositEnabled ? "go" : "neutral"} />
            <DetailRow label="Bank" value={employee.bankName ?? "—"} />
            <DetailRow label="Account Holder" value={employee.bankAccountHolder ?? "—"} />
            <DetailRow label="Account Number" value={employee.bankAccountNumber ? `····${employee.bankAccountNumber.slice(-4)}` : "—"} />
            <DetailRow label="IFSC" value={employee.bankIfsc ?? "—"} />
            <DetailRow label="Branch" value={employee.bankBranch ?? "—"} />
            <DetailRow label="Pay Day" value={employee.payDay ? `${employee.payDay} of each month` : "—"} />
            {employee.autoDepositSetupAt && (
              <DetailRow label="Setup Date" value={formatDate(employee.autoDepositSetupAt)} />
            )}
            {canManage && (
              <Link
                href={`/m/hr/onboarding/${employee.id}`}
                className="block w-full rounded-[0.5rem] p-2.5 text-m-label font-semibold text-center press mt-2"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                {employee.autoDepositEnabled ? "Update Details" : "Set Up Auto-Deposit"}
              </Link>
            )}
          </div>
        </MobileDialog>
      )}

      {showDocsModal && (
        <MobileDialog open={showDocsModal} onClose={() => setShowDocsModal(false)} title="Employee Documents">
          <p className="text-m-caption mb-3" style={{ color: "var(--color-ink-400)" }}>
            Upload PAN, Aadhaar, bank proof, photos & other documents (image or PDF).
          </p>
          <EmployeeDocuments employeeId={employee.id} canManage={canManage} />
        </MobileDialog>
      )}

      {/* ── Activity overview — stat cards with pop-up details ── */}
      <MobileSectionTitle>Activity</MobileSectionTitle>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {/* Attendance */}
        <button
          onClick={() => setShowAttendanceModal(true)}
          className="rounded-[0.5rem] p-2 text-left press"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div
              className="grid place-items-center size-6 rounded-full shrink-0"
              style={{ backgroundColor: employee.attendances.length > 0 ? "color-mix(in srgb, var(--color-go) 15%, transparent)" : "var(--color-ink-100)" }}
            >
              <Clock className="size-3" style={{ color: employee.attendances.length > 0 ? "var(--color-go)" : "var(--color-ink-400)" }} />
            </div>
            <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Attendance</p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
            {employee.attendanceStats.presentDays + employee.attendanceStats.halfDays + employee.attendanceStats.lateDays}P · {employee.attendanceStats.absentDays}A
          </p>
        </button>

        {/* Payroll */}
        <button
          onClick={() => setShowPayrollModal(true)}
          className="rounded-[0.5rem] p-2 text-left press"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div
              className="grid place-items-center size-6 rounded-full shrink-0"
              style={{ backgroundColor: employee.payrollHistory.length > 0 ? "color-mix(in srgb, var(--color-go) 15%, transparent)" : "var(--color-ink-100)" }}
            >
              <Wallet className="size-3" style={{ color: employee.payrollHistory.length > 0 ? "var(--color-go)" : "var(--color-ink-400)" }} />
            </div>
            <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Payroll</p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
            {employee.payrollHistory.length} {employee.payrollHistory.length === 1 ? "entry" : "entries"}
          </p>
        </button>

        {/* Tasks */}
        <button
          onClick={() => setShowTasksModal(true)}
          className="rounded-[0.5rem] p-2 text-left press"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div
              className="grid place-items-center size-6 rounded-full shrink-0"
              style={{ backgroundColor: employee.tasks.length > 0 ? "color-mix(in srgb, var(--color-signal) 15%, transparent)" : "var(--color-ink-100)" }}
            >
              <ListChecks className="size-3" style={{ color: employee.tasks.length > 0 ? "var(--color-signal-dark)" : "var(--color-ink-400)" }} />
            </div>
            <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Tasks</p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
            {openTasks} open · {completedTasks} done
          </p>
        </button>

        {/* DPR Labor */}
        <button
          onClick={() => setShowDprModal(true)}
          className="rounded-[0.5rem] p-2 text-left press"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div
              className="grid place-items-center size-6 rounded-full shrink-0"
              style={{ backgroundColor: employee.dprHistory.length > 0 ? "color-mix(in srgb, var(--color-go) 15%, transparent)" : "var(--color-ink-100)" }}
            >
              <FileText className="size-3" style={{ color: employee.dprHistory.length > 0 ? "var(--color-go)" : "var(--color-ink-400)" }} />
            </div>
            <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>DPR Labor</p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
            {employee.dprStats.count} · {employee.dprStats.totalHours.toFixed(0)}h
          </p>
        </button>

        {/* Leave */}
        <button
          onClick={() => setShowLeaveModal(true)}
          className="rounded-[0.5rem] p-2 text-left press"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div
              className="grid place-items-center size-6 rounded-full shrink-0"
              style={{ backgroundColor: employee.leaveHistory.length > 0 ? "color-mix(in srgb, var(--color-signal) 15%, transparent)" : "var(--color-ink-100)" }}
            >
              <CalendarOff className="size-3" style={{ color: employee.leaveHistory.length > 0 ? "var(--color-signal-dark)" : "var(--color-ink-400)" }} />
            </div>
            <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Leave</p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
            {employee.leaveStats.pending} pend · {employee.leaveStats.approved} ok
          </p>
        </button>

        {/* Supervised Crews */}
        {employee.supervisedCrews.length > 0 && (
          <button
            onClick={() => setShowCrewsModal(true)}
            className="rounded-[0.5rem] p-2 text-left press"
            style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <div
                className="grid place-items-center size-6 rounded-full shrink-0"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 15%, transparent)" }}
              >
                <UsersRound className="size-3" style={{ color: "var(--color-go)" }} />
              </div>
              <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
            </div>
            <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Crews</p>
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
              {employee.supervisedCrews.length} supervised
            </p>
          </button>
        )}

        {/* Company Resources */}
        {employee.resources && employee.resources.length > 0 && (
          <button
            onClick={() => setShowResourcesModal(true)}
            className="rounded-[0.5rem] p-2 text-left press"
            style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <div
                className="grid place-items-center size-6 rounded-full shrink-0"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-brand-strong) 15%, transparent)" }}
              >
                <Package className="size-3" style={{ color: "var(--color-brand-strong)" }} />
              </div>
              <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
            </div>
            <p className="text-m-label font-bold truncate" style={{ color: "var(--color-ink-950)" }}>Resources</p>
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
              {employee.resources.filter((r) => !r.returnedAt).length} active
              {employee.resources.some((r) => r.returnedAt) && ` · ${employee.resources.filter((r) => r.returnedAt).length} returned`}
            </p>
          </button>
        )}
      </div>

      {/* ── Activity detail popups ── */}
      {showAttendanceModal && (
        <MobileDialog open={showAttendanceModal} onClose={() => setShowAttendanceModal(false)} title="Attendance History">
          <div className="space-y-2">
            <DetailStatGrid
              cols={4}
              stats={[
                { label: "Present", value: String(employee.attendanceStats.presentDays) },
                { label: "Half", value: String(employee.attendanceStats.halfDays) },
                { label: "Late", value: String(employee.attendanceStats.lateDays) },
                { label: "Absent", value: String(employee.attendanceStats.absentDays) },
              ]}
            />
            {employee.attendances.length > 0 ? (
              <div className="flex flex-col gap-2">
                {employee.attendances.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-[0.5rem] p-2.5"
                    style={{ backgroundColor: "var(--color-paper)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {formatDate(a.date)}
                      </p>
                      {a.projectName && (
                        <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{a.projectName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.hoursWorked != null && (
                        <span className="text-m-caption tnum" style={{ color: "var(--color-ink-500)" }}>{a.hoursWorked.toFixed(1)}h</span>
                      )}
                      <MobileStatusBadge status={a.status} label={ATTENDANCE_LABELS[a.status] ?? a.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <MobileEmptyState icon={Clock} title="No attendance records" size="compact" />
            )}
          </div>
        </MobileDialog>
      )}

      {showPhoneDialog && employee.user && (
        <PhoneStatusDialog
          user={employee.user}
          phone={phone}
          canManage={canManageUsers ?? false}
          isSelf={!!currentUserId && currentUserId === employee.user.id}
          onClose={() => setShowPhoneDialog(false)}
        />
      )}

      {showPayrollModal && (
        <MobileDialog open={showPayrollModal} onClose={() => setShowPayrollModal(false)} title="Payroll">
          {/* ── Payroll summary card ── */}
          <div
            className="rounded-[0.5rem] border p-3 mb-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {/* Next pay date */}
              <div>
                <p className="text-m-label font-bold" style={{ color: "var(--color-ink-400)" }}>Next Pay Date</p>
                <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {nextPayDate ? formatDate(nextPayDate.toISOString()) : "—"}
                </p>
                {employee.payDay && (
                  <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                    Day {employee.payDay} of each month
                  </p>
                )}
              </div>
              {/* Last payment */}
              <div>
                <p className="text-m-label font-bold" style={{ color: "var(--color-ink-400)" }}>Last Payment</p>
                {lastPaymentDate ? (
                  <>
                    <p className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
                      {lastPaymentAmount ? formatCurrency(lastPaymentAmount) : "—"}
                    </p>
                    <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                      {formatDate(lastPaymentDate.toISOString())}
                    </p>
                  </>
                ) : (
                  <p className="text-m-body font-bold" style={{ color: "var(--color-ink-400)" }}>No payments yet</p>
                )}
              </div>
              {/* Payment status */}
              <div>
                <p className="text-m-label font-bold" style={{ color: "var(--color-ink-400)" }}>Status</p>
                {pendingPayroll ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-m-label font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)", color: "var(--color-signal-dark)" }}
                  >
                    <Clock className="size-2.5" /> Pending
                  </span>
                ) : lastPaymentStatus === "PAID" ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-m-label font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}
                  >
                    <CheckCircle2 className="size-2.5" /> Up to date
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-0.5 text-m-label font-bold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }}
                  >
                    <Clock className="size-2.5" /> No data
                  </span>
                )}
              </div>
              {/* Total paid */}
              <div>
                <p className="text-m-label font-bold" style={{ color: "var(--color-ink-400)" }}>Total Paid</p>
                <p className="text-m-body font-bold tnum" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(totalNetPaid)}
                </p>
                <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                  {payrollCount} {payrollCount === 1 ? "cycle" : "cycles"}
                </p>
              </div>
            </div>
            {/* Bank account summary */}
            {employee.bankAccountNumber && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
                <p className="text-m-label font-bold mb-1" style={{ color: "var(--color-ink-400)" }}>Bank Account</p>
                <p className="text-m-caption" style={{ color: "var(--color-ink-700)" }}>
                  {employee.bankName ?? "—"} · ····{employee.bankAccountNumber.slice(-4)}
                </p>
                {employee.bankIfsc && (
                  <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>IFSC: {employee.bankIfsc}</p>
                )}
              </div>
            )}
          </div>

          {/* ── Manage payroll link ── */}
          {canManagePayroll && (
            <Link
              href="/m/books/payroll"
              className="flex items-center justify-between w-full rounded-[0.5rem] p-2.5 mb-3 press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <span className="flex items-center gap-1.5 text-m-label font-bold">
                <Wallet className="size-3.5" /> Manage Payroll
              </span>
              <ChevronRight className="size-3.5" />
            </Link>
          )}

          {/* ── Payroll history ── */}
          <p className="text-m-label font-bold mb-2" style={{ color: "var(--color-ink-500)" }}>History</p>
          {employee.payrollHistory.length > 0 ? (
            <div className="flex flex-col gap-2">
              {employee.payrollHistory.map((p) => (
                <PayrollHistoryRow key={p.id} p={p} canManagePayroll={canManagePayroll ?? false} _employeeId={employee.id} />
              ))}
            </div>
          ) : (
            <MobileEmptyState icon={Wallet} title="No payroll history" size="compact" />
          )}
        </MobileDialog>
      )}

      {showTasksModal && (
        <MobileDialog open={showTasksModal} onClose={() => setShowTasksModal(false)} title="Tasks">
          <div className="space-y-2">
            <DetailStatGrid
              cols={3}
              stats={[
                { label: "Total", value: String(employee.tasks.length) },
                { label: "Open", value: String(openTasks) },
                { label: "Done", value: String(completedTasks) },
              ]}
            />
            {employee.tasks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {employee.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-[0.5rem] p-2.5"
                    style={{ backgroundColor: "var(--color-paper)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {t.title}
                      </p>
                      {t.assignedByName && (
                        <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>by {t.assignedByName}</p>
                      )}
                    </div>
                    <MobileStatusBadge status={t.status} label={TASK_LABELS[t.status] ?? t.status} />
                  </div>
                ))}
              </div>
            ) : (
              <MobileEmptyState
                icon={ListChecks}
                title={employee.userId ? "No tasks assigned" : "No linked user"}
                description={employee.userId ? undefined : "Tasks cannot be assigned without a linked user."}
                size="compact"
              />
            )}
          </div>
        </MobileDialog>
      )}

      {showDprModal && (
        <MobileDialog open={showDprModal} onClose={() => setShowDprModal(false)} title="DPR Labor">
          <div className="space-y-2">
            <DetailStatGrid
              cols={2}
              stats={[
                { label: "Entries", value: String(employee.dprStats.count) },
                { label: "Total Hours", value: `${employee.dprStats.totalHours.toFixed(1)}h` },
              ]}
            />
            {employee.dprHistory.length > 0 ? (
              <div className="flex flex-col gap-2">
                {employee.dprHistory.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-[0.5rem] p-2.5"
                    style={{ backgroundColor: "var(--color-paper)" }}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
                        {formatDate(d.date)}
                      </p>
                      <span className="text-m-caption tnum" style={{ color: "var(--color-ink-500)" }}>{d.hoursWorked.toFixed(1)}h</span>
                    </div>
                    <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                      {d.taskDescription}{d.projectName ? ` · ${d.projectName}` : ""}
                    </p>
                    <div className="mt-1">
                      <MobileStatusBadge status={d.approvalStatus} label={DPR_LABELS[d.approvalStatus] ?? d.approvalStatus} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <MobileEmptyState icon={FileText} title="No DPR labor entries" size="compact" />
            )}
          </div>
        </MobileDialog>
      )}

      {showLeaveModal && (
        <MobileDialog open={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="Leave Requests">
          <div className="space-y-2">
            <DetailStatGrid
              cols={3}
              stats={[
                { label: "Total", value: String(employee.leaveStats.total) },
                { label: "Pending", value: String(employee.leaveStats.pending) },
                { label: "Approved", value: String(employee.leaveStats.approved) },
              ]}
            />
            {employee.leaveHistory.length > 0 ? (
              <div className="flex flex-col gap-2">
                {employee.leaveHistory.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-[0.5rem] p-2.5"
                    style={{ backgroundColor: "var(--color-paper)" }}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
                        {l.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      <span className="text-m-caption tnum" style={{ color: "var(--color-ink-500)" }}>{l.days.toFixed(1)} days</span>
                    </div>
                    <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                      {formatDate(l.startDate)} → {formatDate(l.endDate)}
                    </p>
                    {l.reason && (
                      <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{l.reason}</p>
                    )}
                    <div className="mt-1">
                      <MobileStatusBadge status={l.status} label={LEAVE_LABELS[l.status] ?? l.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <MobileEmptyState icon={CalendarOff} title="No leave requests" size="compact" />
            )}
          </div>
        </MobileDialog>
      )}

      {showCrewsModal && employee.supervisedCrews.length > 0 && (
        <MobileDialog open={showCrewsModal} onClose={() => setShowCrewsModal(false)} title="Supervised Crews">
          <div className="flex flex-col gap-2">
            {employee.supervisedCrews.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-[0.5rem] p-2.5"
                style={{ backgroundColor: "var(--color-paper)" }}
              >
                <div className="min-w-0">
                  <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>{c.name}</p>
                  <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                    {c.projectName ?? "Floating"} · {c.memberCount} member{c.memberCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <MobileStatusBadge status={c.active ? "ACTIVE" : "INACTIVE"} label={c.active ? "Active" : "Inactive"} />
              </div>
            ))}
          </div>
        </MobileDialog>
      )}

      {/* ── Resources modal ── */}
      {showResourcesModal && employee.resources && employee.resources.length > 0 && (
        <MobileDialog open={showResourcesModal} onClose={() => setShowResourcesModal(false)} title="Company Resources">
          <div className="flex flex-col gap-2">
            {(() => {
              const active = employee.resources!.filter((r) => !r.returnedAt);
              const returned = employee.resources!.filter((r) => r.returnedAt);
              return (
                <>
                  {active.length > 0 && (
                    <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-400)" }}>
                      Active ({active.length})
                    </p>
                  )}
                  {active.map((r) => {
                    const overdue = r.expectedReturnAt && new Date(r.expectedReturnAt) < new Date();
                    return (
                      <div key={r.id} className="rounded-[0.5rem] p-2.5" style={{ backgroundColor: "var(--color-paper)" }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>{r.name}</p>
                            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                              {r.category.replace("_", " ").toLowerCase()} · {r.quantity > 1 ? `${r.quantity} units · ` : ""}issued {new Date(r.issuedAt).toLocaleDateString()}
                            </p>
                            {r.assetTag && <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>Tag: {r.assetTag}</p>}
                            {r.serialNumber && <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>S/N: {r.serialNumber}</p>}
                            {r.expectedReturnAt && (
                              <p className="text-m-caption" style={{ color: overdue ? "var(--color-stop)" : "var(--color-ink-400)" }}>
                                {overdue ? "Overdue · " : ""}Expected: {new Date(r.expectedReturnAt).toLocaleDateString()}
                              </p>
                            )}
                            {r.depositAmount != null && <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>Deposit: ₹{r.depositAmount}</p>}
                            {r.notes && <p className="text-m-caption italic mt-0.5" style={{ color: "var(--color-ink-400)" }}>{r.notes}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {returned.length > 0 && (
                    <p className="text-m-caption font-semibold uppercase tracking-wide pt-2" style={{ color: "var(--color-ink-400)" }}>
                      Returned ({returned.length})
                    </p>
                  )}
                  {returned.map((r) => (
                    <div key={r.id} className="rounded-[0.5rem] p-2.5 opacity-60" style={{ backgroundColor: "var(--color-paper)" }}>
                      <p className="text-m-body font-semibold truncate line-through" style={{ color: "var(--color-ink-950)" }}>{r.name}</p>
                      <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                        {r.category.replace("_", " ").toLowerCase()} · returned {r.returnedAt ? new Date(r.returnedAt).toLocaleDateString() : "—"}
                      </p>
                      {r.conditionAtReturn && <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>Return condition: {r.conditionAtReturn}</p>}
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </MobileDialog>
      )}

      {/* ── Edit + Archive buttons (managers only) ── */}
      {canManage ? (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setShowEdit(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border py-2 text-m-label font-bold text-m-body press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
          >
            <Pencil className="size-3.5" />
            Edit Details
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border py-2 text-m-label font-bold text-m-body press"
            style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
          >
            <Trash2 className="size-3.5" />
            Archive
          </button>
        </div>
      ) : null}

      {/* ── Edit sheet ── */}
      {showEdit ? (
        <EmployeeEditSheet
          employee={employee}
          projects={projects}
          stockLocations={stockLocations}
          potentialManagers={potentialManagers}
          departments={departments ?? []}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* ── Delete confirmation ── */}
      {showDelete ? (
        <MobileDialog open={showDelete} onClose={() => setShowDelete(false)} title="Archive Employee">
          <div className="px-4 pb-4">
              <p className="text-m-body mb-4" style={{ color: "var(--color-ink-500)" }}>
                Archive {employee.name}? Attendance, payroll, and DPR history are preserved.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 h-10 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: "var(--color-stop)", color: "white", opacity: deleting ? 0.5 : 1 }}
                >
                  {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Archive
                </button>
                <button
                  onClick={() => setShowDelete(false)}
                  className="flex-1 h-10 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
        </MobileDialog>
      ) : null}

      {/* ── Create login account dialog ── */}
      {showCreateAccount && employee && (
        <CreateAccountDialog
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

      {/* ── In-page document viewer (FAB pop-up, no redirect) ── */}
      <DocumentViewer url={docViewer.docUrl} title={docViewer.docTitle} onClose={docViewer.closeDoc} />

      {/* ── Full-screen onboarding modal (FAB-style pop-up) ── */}
      {showOnboardingModal && onboardingData && (
        <OnboardingModal
          employee={onboardingData}
          canManage={canManage}
          canManagePayroll={canManagePayroll ?? false}
          actorRole={actorRole}
          projects={projects}
          stockLocations={stockLocations}
          departments={departments ?? []}
          onClose={() => setShowOnboardingModal(false)}
        />
      )}
    </div>
  );
}

/* ─── Payroll history row with mark-as-paid + proof ─── */
function PayrollHistoryRow({ p, canManagePayroll, _employeeId }: { p: PayrollItem; canManagePayroll: boolean; _employeeId: string }) {
  const [markingPaid, setMarkingPaid] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [paymentRef, setPaymentRef] = useState(p.paymentReference ?? "");
  const [paymentMode, setPaymentMode] = useState(p.paymentMode ?? "BANK");
  const [paid, setPaid] = useState(!!p.paymentDate);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofUploadId, setProofUploadId] = useState<string | null>(null);

  async function handleMarkPaid() {
    setMarkingPaid(true);
    try {
      // If a proof file was selected, upload it first
      let uploadId = proofUploadId;
      if (proofFile && !uploadId) {
        setUploadingProof(true);
        const formData = new FormData();
        formData.append("file", proofFile);
        const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadData.error ?? "Failed to upload proof");
        uploadId = uploadData.uploadId;
        setProofUploadId(uploadId);
        setUploadingProof(false);
      }
      const res = await fetch(`/api/payroll/${p.periodId}/lines/${p.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentReference: paymentRef.trim() || null,
          paymentMode: paymentMode,
          paymentDate: new Date().toISOString(),
          proofUploadId: uploadId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to mark as paid");
      setPaid(true);
      setShowMarkPaid(false);
      setProofFile(null);
      setProofUploadId(null);
    } catch (err) {
      console.error(err);
      setUploadingProof(false);
    } finally {
      setMarkingPaid(false);
    }
  }

  const isPaid = paid || p.status === "PAID";
  const hasProof = !!p.proofUrl;

  return (
    <div
      className="rounded-[0.5rem] p-2.5"
      style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
            {MONTHS[p.month]} {p.year}
          </p>
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            {p.daysWorked.toFixed(1)} days · Gross {formatCurrency(p.grossPay)}
          </p>
          {p.paymentReference && (
            <p className="text-m-caption font-mono" style={{ color: "var(--color-ink-400)" }}>
              Ref: {p.paymentReference}
            </p>
          )}
          {p.paymentDate && (
            <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              Paid: {formatDate(p.paymentDate)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-m-body font-bold tnum" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrency(p.netPay)}
          </span>
          <MobileStatusBadge status={p.status} label={PAYROLL_LABELS[p.status] ?? p.status} />
        </div>
      </div>

      {/* Proof indicator */}
      {hasProof && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <a
            href={p.proofUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-m-label font-bold px-1.5 py-0.5 rounded-full press"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}
          >
            <CheckCircle2 className="size-2.5" /> View Proof
          </a>
        </div>
      )}

      {/* Mark as paid action */}
      {canManagePayroll && p.status === "PROCESSED" && !isPaid && !showMarkPaid && (
        <button
          onClick={() => setShowMarkPaid(true)}
          className="mt-2 w-full h-7 rounded-[0.375rem] text-m-label font-bold flex items-center justify-center gap-1 press"
          style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
        >
          <Check className="size-3" /> Mark as Paid
        </button>
      )}

      {/* Mark as paid form */}
      {showMarkPaid && (
        <div className="mt-2 space-y-1.5">
          <input
            type="text"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="UTR / Cheque no / Reference"
            className="w-full h-7 px-2 text-m-caption outline-none border rounded-[0.25rem]"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
            className="w-full h-7 px-2 text-m-caption outline-none border rounded-[0.25rem]"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            <option value="BANK">Bank Transfer</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CHEQUE">Cheque</option>
            <option value="NEFT">NEFT/RTGS</option>
          </select>
          {/* Payment proof upload */}
          <label
            className="w-full h-7 rounded-[0.25rem] border flex items-center gap-1.5 px-2 text-m-caption press cursor-pointer"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: proofFile ? "var(--color-go)" : "var(--color-ink-500)" }}
          >
            <Paperclip className="size-3 shrink-0" />
            {proofFile ? proofFile.name.slice(0, 24) : "Attach payment proof"}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setProofFile(f);
                setProofUploadId(null); // reset previous upload
              }}
            />
          </label>
          <div className="flex gap-1.5">
            <button
              onClick={handleMarkPaid}
              disabled={markingPaid || uploadingProof}
              className="flex-1 h-7 rounded-[0.25rem] text-m-label font-bold flex items-center justify-center gap-1 press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              {markingPaid || uploadingProof ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              {uploadingProof ? "Uploading…" : "Confirm Paid"}
            </button>
            <button
              onClick={() => setShowMarkPaid(false)}
              className="h-7 px-3 rounded-[0.25rem] text-m-label font-bold press"
              style={{ color: "var(--color-ink-500)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Phone status dialog — verification + Twilio sync actions ─── */
function PhoneStatusDialog({
  user,
  phone,
  canManage,
  isSelf,
  onClose,
}: {
  user: { id: string; phoneVerified: boolean | null; phoneVerifiedAt: string | null; phoneSyncedAt: string | null };
  phone: string | null;
  canManage: boolean;
  isSelf: boolean;
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [showVerify, setShowVerify] = useState(false);

  const isVerified = user.phoneVerified === true;
  const isSynced = !!user.phoneSyncedAt;

  async function sendOtp() {
    setSending(true);
    haptic(10);
    try {
      const res = await fetch(`/api/users/${user.id}/verify-phone?action=send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Verification code sent");
      setShowVerify(true);
      if (data.devCode) {
        toast.info(`Dev code: ${data.devCode}`);
      }
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    if (!otpCode || otpCode.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    haptic(10);
    try {
      const res = await fetch(`/api/users/${user.id}/verify-phone?action=verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Phone verified");
      if (data.syncedWithTwilio) {
        toast.success("Also synced with Twilio");
      } else {
        toast.message("Phone verified, but not synced with Twilio. Use 'Sync with Twilio' below.");
      }
      setShowVerify(false);
      setOtpCode("");
      // Don't close the dialog — let the user see the updated status and
      // optionally sync with Twilio if it wasn't done automatically.
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setVerifying(false);
    }
  }

  async function syncTwilio() {
    setSyncing(true);
    haptic(10);
    try {
      const res = await fetch(`/api/users/${user.id}/verify-phone?action=sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      if (data.synced) {
        haptic([10, 40, 80]);
        toast.success(data.message ?? "Synced with Twilio");
        onClose();
      } else {
        // Sync did not succeed — don't show success haptics
        haptic([50, 20, 50]);
        toast.error(data.message ?? "Not found in Twilio");
      }
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <MobileDialog open={true} onClose={onClose} title="Phone Status">
      <div className="flex flex-col gap-3 p-4">
        {/* Phone number */}
        <div>
          <div className="text-m-label mb-1" style={{ color: "var(--color-ink-500)" }}>Number</div>
          <div className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
            {phone ?? "No phone number"}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="flex items-center gap-1 text-m-caption font-bold px-2 py-1 rounded-full"
            style={
              isVerified
                ? { backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }
                : { backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }
            }
          >
            {isVerified ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
            {isVerified ? "Verified" : "Unverified"}
          </span>
          <span
            className="flex items-center gap-1 text-m-caption font-bold px-2 py-1 rounded-full"
            style={
              isSynced
                ? { backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }
                : { backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }
            }
          >
            {isSynced ? <ShieldCheck className="size-3" /> : <XCircle className="size-3" />}
            {isSynced ? "Twilio Synced" : "Not Synced"}
          </span>
        </div>

        {/* Timestamps */}
        {user.phoneVerifiedAt && (
          <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            Verified on {formatDate(user.phoneVerifiedAt)}
          </div>
        )}
        {user.phoneSyncedAt && (
          <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            Synced on {formatDate(user.phoneSyncedAt)}
          </div>
        )}

        {/* Actions — verification available to managers AND self (the API supports self-verify) */}
        {(canManage || isSelf) && phone && (
          <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
            {!isVerified && !showVerify && (
              <button
                onClick={sendOtp}
                disabled={sending}
                className="flex items-center justify-center gap-1.5 h-9 rounded-[0.375rem] text-m-body font-semibold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Send Verification Code
              </button>
            )}

            {showVerify && (
              <div className="flex flex-col gap-2">
                <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Enter the 6-digit code sent to {phone}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="flex-1 h-9 px-2 text-m-body font-mono text-center outline-none border rounded-[0.375rem]"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                  />
                  <button
                    onClick={verifyOtp}
                    disabled={verifying || otpCode.length !== 6}
                    className="flex items-center gap-1 h-9 px-3 rounded-[0.375rem] text-m-body font-semibold press disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
                  >
                    {verifying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Verify
                  </button>
                </div>
                <button
                  onClick={() => { setShowVerify(false); setOtpCode(""); }}
                  className="h-8 text-m-caption font-semibold press"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  Cancel
                </button>
              </div>
            )}

            {!isSynced && canManage && (
              <button
                onClick={syncTwilio}
                disabled={syncing}
                className="flex items-center justify-center gap-1.5 h-9 rounded-[0.375rem] text-m-body font-semibold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
              >
                {syncing ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
                Sync with Twilio
              </button>
            )}
          </div>
        )}

        {!canManage && !isSelf && phone && (
          <div className="text-m-caption pt-2 border-t" style={{ color: "var(--color-ink-500)", borderColor: "var(--color-line)" }}>
            Only administrators can verify or sync phone numbers.
          </div>
        )}
        {isSelf && !canManage && phone && !isSynced && (
          <div className="text-m-caption pt-2 border-t" style={{ color: "var(--color-ink-500)", borderColor: "var(--color-line)" }}>
            Twilio sync requires administrator access.
          </div>
        )}
      </div>
    </MobileDialog>
  );
}

/* ─── Add to Company chip + dialog (multi-company) ─── */
function AddToCompanyChip({ employeeId, companies }: { employeeId: string; companies: { id: string; name: string; parentCompanyId: string | null }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState("");

  async function handleAdd() {
    if (!targetId) return;
    setAdding(true);
    haptic(10);
    try {
      const res = await fetch(`/api/employees/${employeeId}/add-to-company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCompanyId: targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add employee to company");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Employee added to company");
      setOpen(false);
      if (data.newEmployeeId) {
        router.push(`/m/hr/onboarding/${data.newEmployeeId}`);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { haptic(10); setOpen(true); }}
        className="text-m-label px-1.5 py-0.5 rounded-[0.25rem] flex items-center gap-0.5 press"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)",
          color: "var(--color-signal-dark)",
          border: "1px dashed var(--color-signal)",
        }}
      >
        <Plus className="size-2.5" /> Add Company
      </button>
      {open && (
        <MobileDialog open onClose={() => !adding && setOpen(false)} title="Add to Company">
          <div className="space-y-3">
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Select a company to add this employee to. Their personal data will be copied — you&apos;ll complete onboarding for the new company.
            </p>
            <div className="space-y-1">
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { haptic(10); setTargetId(c.id); }}
                  className="w-full flex items-center gap-2 p-2 rounded-[0.375rem] press text-left"
                  style={{
                    backgroundColor: targetId === c.id ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)" : "var(--color-concrete)",
                    border: targetId === c.id ? "1px solid var(--color-ink-950)" : "1px solid var(--color-line)",
                  }}
                >
                  <div
                    className="shrink-0 size-4 rounded-full grid place-items-center border"
                    style={{
                      backgroundColor: targetId === c.id ? "var(--color-ink-950)" : "transparent",
                      borderColor: targetId === c.id ? "var(--color-ink-950)" : "var(--color-ink-300)",
                    }}
                  >
                    {targetId === c.id && <Check className="size-2.5" style={{ color: "var(--color-paper)" }} />}
                  </div>
                  <span className="text-m-body" style={{ color: "var(--color-ink-950)" }}>{c.name}</span>
                  {c.parentCompanyId === null && (
                    <span
                      className="text-m-caption px-1 rounded-full"
                      style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-500)" }}
                    >
                      Parent
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setOpen(false)}
                disabled={adding}
                className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={adding || !targetId}
                className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Add & Onboard
              </button>
            </div>
          </div>
        </MobileDialog>
      )}
    </>
  );
}

/* ─── Compact info field for the assignment card ─── */
function InfoField({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-m-label" style={{ color: "var(--color-ink-500)" }}>
        {icon} {label}
      </div>
      <div
        className="text-m-body font-semibold truncate"
        style={{ color: value ? "var(--color-ink-950)" : "var(--color-ink-300)" }}
      >
        {value || "—"}
      </div>
      {sub && <div className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>{sub}</div>}
    </div>
  );
}

/* ─── Detail row for popups (dense label: value) ─── */
function DetailRow({ label, value, tone }: { label: string; value: string; tone?: "go" | "neutral" }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--color-line)" }}>
      <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>{label}</span>
      <span
        className="text-m-body font-semibold"
        style={{
          color: tone === "go" ? "var(--color-go)" : value === "—" ? "var(--color-ink-300)" : "var(--color-ink-950)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Edit sheet ─── */
function EmployeeEditSheet({
  employee,
  projects,
  stockLocations,
  potentialManagers,
  departments,
  onClose,
  onSaved,
}: {
  employee: EmployeeData;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  potentialManagers: PotentialManager[];
  departments: { id: string; code: string; name: string; active: boolean }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [trade, setTrade] = useState(employee.trade ?? "");
  const [designation, setDesignation] = useState(employee.designation ?? "");
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [email, setEmail] = useState(employee.email ?? "");
  const [wageType, setWageType] = useState<WageType>(employee.wageType);
  const [dailyRate, setDailyRate] = useState(employee.dailyRate != null ? String(employee.dailyRate) : "");
  const [monthlySalary, setMonthlySalary] = useState(employee.monthlySalary != null ? String(employee.monthlySalary) : "");
  const [joinDate, setJoinDate] = useState(employee.joinDate ? employee.joinDate.split("T")[0] : "");
  const [activeProjectId, setActiveProjectId] = useState(employee.activeProjectId ?? "");
  const [hierarchyLevel, setHierarchyLevel] = useState(employee.hierarchyLevel != null ? String(employee.hierarchyLevel) : "");
  const [reportingLocationId, setReportingLocationId] = useState(employee.reportingLocationId ?? "");
  const [reportsToEmployeeId, setReportsToEmployeeId] = useState(employee.reportsToEmployeeId ?? "");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [employmentType, setEmploymentType] = useState(employee.employmentType ?? "");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [noticePeriodDays, setNoticePeriodDays] = useState(employee.noticePeriodDays != null ? String(employee.noticePeriodDays) : "");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [contractStartDate, setContractStartDate] = useState(employee.contractStartDate ? employee.contractStartDate.split("T")[0] : "");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [contractEndDate, setContractEndDate] = useState(employee.contractEndDate ? employee.contractEndDate.split("T")[0] : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade: trade.trim() || null,
          designation: designation.trim() || null,
          departmentId: departmentId || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          wageType,
          dailyRate: wageType === "DAILY" && dailyRate ? Number(dailyRate) : null,
          monthlySalary: wageType !== "DAILY" && monthlySalary ? Number(monthlySalary) : null,
          joinDate: joinDate || null,
          activeProjectId: activeProjectId || null,
          hierarchyLevel: hierarchyLevel ? Number(hierarchyLevel) : null,
          reportingLocationId: reportingLocationId || null,
          reportsToEmployeeId: reportsToEmployeeId || null,
          employmentType: employmentType || null,
          noticePeriodDays: noticePeriodDays ? Number(noticePeriodDays) : null,
          contractStartDate: contractStartDate || null,
          contractEndDate: contractEndDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Employee updated");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <MobileDialog open={true} onClose={onClose} title="Edit Employee">
      <div className="px-3 pb-4 flex flex-col gap-3">
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Personal Info
            </p>
            <div>
              <label className={labelClass} style={labelStyle}>Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <div>
                <label className={labelClass} style={labelStyle}>Trade</label>
                <input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. Mason" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Designation</label>
                <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Site Engineer" className={inputClass} style={inputStyle} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <div>
                <label className={labelClass} style={labelStyle}>Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" inputMode="tel" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firm.com" className={inputClass} style={inputStyle} />
              </div>
            </div>
          </div>

          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Wage & Assignment
            </p>
            {/* Wage type */}
            <div>
              <label className={labelClass} style={labelStyle}>Wage Type</label>
              <div className="flex gap-1.5">
                {(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWageType(w)}
                    className="flex-1 h-9 rounded-[0.5rem] border-2 text-m-caption font-bold text-m-body press"
                    style={{
                      borderColor: wageType === w ? "var(--color-ink-950)" : "var(--color-line)",
                      backgroundColor: wageType === w ? "var(--color-ink-950)" : "var(--color-paper)",
                      color: wageType === w ? "var(--color-paper)" : "var(--color-ink-500)",
                    }}
                  >
                    {WAGE_TYPE_LABELS[w]}
                  </button>
                ))}
              </div>
            </div>

            {/* Rate / Salary */}
            {wageType === "DAILY" ? (
              <div>
                <label className={labelClass} style={labelStyle}>Daily Rate (₹)</label>
                <input type="number" min="0" step="any" inputMode="numeric" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
              </div>
            ) : (
              <div>
                <label className={labelClass} style={labelStyle}>Monthly Salary (₹)</label>
                <input type="number" min="0" step="any" inputMode="numeric" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} placeholder="0" className={inputClass} style={inputStyle} />
              </div>
            )}

            <div className="grid grid-cols-4 gap-1.5">
              <div>
                <label className={labelClass} style={labelStyle}>Join Date</label>
                <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className={inputClass} style={inputStyle} />
              </div>
              <div>
                <EnumSelect
                  label="Hierarchy Level"
                  value={hierarchyLevel}
                  onChange={(v) => setHierarchyLevel(v)}
                  placeholder="— None —"
                  options={[
                    { value: "1", label: "H1 — Management" },
                    { value: "2", label: "H2 — Manager" },
                    { value: "3", label: "H3 — Engineer" },
                    { value: "4", label: "H4 — Supervisor" },
                    { value: "5", label: "H5 — Skilled" },
                    { value: "6", label: "H6 — Labor" },
                  ]}
                />
              </div>
            </div>

            <div>
              <MobileSelectWithCreate
                label="Active Project"
                value={activeProjectId}
                onChange={setActiveProjectId}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="— None —"
                icon={FolderOpen}
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

            <div>
              <MobileSelectWithCreate
                label="Attendance Site"
                value={reportingLocationId}
                onChange={setReportingLocationId}
                options={stockLocations.map((l) => ({ value: l.id, label: l.name }))}
                placeholder="— None —"
              />
            </div>

            <div>
              <MobileSelectWithCreate
                label="Reports To"
                value={reportsToEmployeeId}
                onChange={setReportsToEmployeeId}
                options={potentialManagers.map((m) => ({
                  value: m.id,
                  label: `${m.name}${m.designation || m.trade ? ` · ${m.designation ?? m.trade}` : ""}`,
                }))}
                placeholder="— None — top of chain"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: saving || !name.trim() ? 0.5 : 1 }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save Changes"}
            </button>
          </div>
        </div>
    </MobileDialog>
  );
}
