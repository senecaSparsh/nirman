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
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { DetailStatGrid } from "@/components/mobile/v2/detail-primitives";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { toast } from "sonner";
import { CreateAccountDialog } from "@/components/hr/create-account-dialog";

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
  id: string; month: number; year: number; status: string;
  daysWorked: number; grossPay: number; totalDeductions: number; netPay: number; paidAt: string | null;
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
  contractStatus: string | null;
  offerLetterStatus: string | null;
  offerLetterIssuedAt: string | null;
  idCardStatus: string | null;
  idCardIssuedAt: string | null;
  autoDepositEnabled: boolean | null;
  payDay: number | null;
  bankName: string | null;
  bankAccountNumber: string | null;
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
    email: string; role: string; phone: string | null; image: string | null;
    employeeCode: string | null; department: string | null;
    joiningDate: string | null; active: boolean; lastLoginAt: string | null;
  } | null;
  supervisedCrews: { id: string; name: string; active: boolean; projectName: string | null; memberCount: number }[];
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

export function MobileEmployeeDetailClient({
  employee,
  canManage,
  actorRole,
  notFound,
  projects,
  stockLocations,
}: {
  employee?: EmployeeData;
  canManage: boolean;
  actorRole: string;
  notFound?: boolean;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
}) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<
    { id: string; phoneNumber: string; label: string | null; department: string | null; status: string; monthlyCost: number | null; provider: string | null }[]
  >([]);

  if (notFound || !employee) {
    return <MobileEmptyState icon={User} title="Employee not found" />;
  }

  const employeeId = employee.id;

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
  const attendanceRate = employee.attendanceStats.total > 0
    ? Math.round((employee.attendanceStats.presentDays / employee.attendanceStats.total) * 100)
    : null;

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
      </div>

      {/* ── Key stats — 2×2 grid, compact ── */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <MobileStatCard
          label="Attendance"
          value={attendanceRate != null ? `${attendanceRate}%` : "—"}
          hint={`${employee.attendanceStats.presentDays}/${employee.attendanceStats.total} days`}
          tone={attendanceRate != null && attendanceRate >= 75 ? "go" : attendanceRate != null && attendanceRate < 50 ? "stop" : "signal"}
        />
        <MobileStatCard
          label="Open Tasks"
          value={String(openTasks)}
          hint={`${completedTasks} completed`}
          tone={openTasks > 0 ? "signal" : "neutral"}
        />
        <MobileStatCard
          label="Net Paid"
          value={formatCurrency(employee.payrollStats.totalNetPaid)}
          hint={`${employee.payrollStats.count} periods`}
        />
        <MobileStatCard
          label="DPR Hours"
          value={`${employee.dprStats.totalHours.toFixed(1)}h`}
          hint={`${employee.dprStats.count} entries`}
        />
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
            <InfoField icon={<MapPin className="size-3" />} label="Reporting" value={employee.reportingLocationName} />
            <InfoField icon={<IndianRupee className="size-3" />} label="Wage" value={wageValue} />
            <InfoField icon={<Briefcase className="size-3" />} label="Trade" value={employee.trade} />
            <InfoField icon={<Calendar className="size-3" />} label="Joined" value={employee.joinDate ? formatDate(employee.joinDate) : null} />
          </div>
          {employee.user && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
              <InfoField icon={<Mail className="size-3" />} label="Login" value={employee.user.email} />
              <InfoField icon={<UserCircle className="size-3" />} label="Role" value={employee.user.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} />
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

      {/* ── Agreement & Auto-Deposit ── */}
      <MobileSectionTitle>Agreement & Deposit</MobileSectionTitle>
      <div className="rounded-xl border border-border bg-card p-3 mb-3 space-y-2">
        {/* Agreement status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-m-body">Agreement</span>
          </div>
          <MobileStatusBadge
            status={employee.contractStatus ?? "NOT_ISSUED"}
            label={employee.contractStatus
              ? employee.contractStatus.charAt(0) + employee.contractStatus.slice(1).toLowerCase()
              : "Not issued"}
          />
        </div>
        {/* Auto-deposit status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-m-body">Auto-Deposit</span>
          </div>
          <MobileStatusBadge
            status={employee.autoDepositEnabled ? "PAID" : "DRAFT"}
            label={employee.autoDepositEnabled ? "Active" : "Not set"}
          />
        </div>
        {employee.autoDepositEnabled && employee.bankName && (
          <div className="text-m-caption text-muted-foreground pt-1 border-t border-border">
            {employee.bankName} · ····{employee.bankAccountNumber?.slice(-4) ?? ""}
            {employee.payDay ? ` · Payday ${employee.payDay}` : ""}
          </div>
        )}
        {canManage && !employee.contractStatus && (
          <Link
            href={`/m/hr/onboarding/${employee.id}`}
            className="block text-m-caption text-primary text-center pt-1"
          >
            Generate agreement →
          </Link>
        )}
        {employee.contractStatus && (
          <a
            href={`/print/employment-agreement/${employee.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-m-caption text-primary text-center pt-1"
          >
            View / Print agreement →
          </a>
        )}
      </div>

      {/* ── Attendance ── */}
      <MobileSectionTitle>Attendance</MobileSectionTitle>
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
        <div className="flex flex-col gap-2 mb-4">
          {employee.attendances.slice(0, 15).map((a) => (
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
        <MobileEmptyState
          icon={Clock}
          title="No attendance records"
          size="compact"
        />
      )}

      {/* ── Payroll ── */}
      <MobileSectionTitle>Payroll History</MobileSectionTitle>
      {employee.payrollHistory.length > 0 ? (
        <div className="flex flex-col gap-2 mb-4">
          {employee.payrollHistory.slice(0, 12).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-[0.5rem] p-2.5"
              style={{ backgroundColor: "var(--color-paper)" }}
            >
              <div className="min-w-0">
                <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {MONTHS[p.month]} {p.year}
                </p>
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  {p.daysWorked.toFixed(1)} days · Gross {formatCurrency(p.grossPay)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-m-body font-bold tnum" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(p.netPay)}
                </span>
                <MobileStatusBadge status={p.status} label={PAYROLL_LABELS[p.status] ?? p.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <MobileEmptyState
          icon={Wallet}
          title="No payroll history"
          size="compact"
        />
      )}

      {/* ── Tasks ── */}
      <MobileSectionTitle>Tasks</MobileSectionTitle>
      <DetailStatGrid
        cols={3}
        stats={[
          { label: "Total", value: String(employee.tasks.length) },
          { label: "Open", value: String(openTasks) },
          { label: "Done", value: String(completedTasks) },
        ]}
      />
      {employee.tasks.length > 0 ? (
        <div className="flex flex-col gap-2 mb-4">
          {employee.tasks.slice(0, 15).map((t) => (
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

      {/* ── DPRs ── */}
      <MobileSectionTitle>DPR Labor</MobileSectionTitle>
      <DetailStatGrid
        cols={2}
        stats={[
          { label: "Entries", value: String(employee.dprStats.count) },
          { label: "Total Hours", value: `${employee.dprStats.totalHours.toFixed(1)}h` },
        ]}
      />
      {employee.dprHistory.length > 0 ? (
        <div className="flex flex-col gap-2 mb-4">
          {employee.dprHistory.slice(0, 10).map((d) => (
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
        <MobileEmptyState
          icon={FileText}
          title="No DPR labor entries"
          size="compact"
        />
      )}

      {/* ── Leave ── */}
      <MobileSectionTitle>Leave Requests</MobileSectionTitle>
      <DetailStatGrid
        cols={3}
        stats={[
          { label: "Total", value: String(employee.leaveStats.total) },
          { label: "Pending", value: String(employee.leaveStats.pending) },
          { label: "Approved", value: String(employee.leaveStats.approved) },
        ]}
      />
      {employee.leaveHistory.length > 0 ? (
        <div className="flex flex-col gap-2 mb-4">
          {employee.leaveHistory.slice(0, 10).map((l) => (
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
        <MobileEmptyState
          icon={CalendarOff}
          title="No leave requests"
          size="compact"
        />
      )}

      {/* ── Crew ── */}
      {employee.supervisedCrews.length > 0 && (
        <>
          <MobileSectionTitle>Supervised Crews</MobileSectionTitle>
          <div className="flex flex-col gap-2 mb-4">
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
        </>
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
    </div>
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

/* ─── Edit sheet ─── */
function EmployeeEditSheet({
  employee,
  projects,
  stockLocations,
  onClose,
  onSaved,
}: {
  employee: EmployeeData;
  projects: ProjectOption[];
  stockLocations: StockLocationOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [trade, setTrade] = useState(employee.trade ?? "");
  const [designation, setDesignation] = useState(employee.designation ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [email, setEmail] = useState(employee.email ?? "");
  const [wageType, setWageType] = useState<WageType>(employee.wageType);
  const [dailyRate, setDailyRate] = useState(employee.dailyRate != null ? String(employee.dailyRate) : "");
  const [monthlySalary, setMonthlySalary] = useState(employee.monthlySalary != null ? String(employee.monthlySalary) : "");
  const [joinDate, setJoinDate] = useState(employee.joinDate ? employee.joinDate.split("T")[0] : "");
  const [activeProjectId, setActiveProjectId] = useState(employee.activeProjectId ?? "");
  const [hierarchyLevel, setHierarchyLevel] = useState(employee.hierarchyLevel != null ? String(employee.hierarchyLevel) : "");
  const [reportingLocationId, setReportingLocationId] = useState(employee.reportingLocationId ?? "");
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
          phone: phone.trim() || null,
          email: email.trim() || null,
          wageType,
          dailyRate: wageType === "DAILY" && dailyRate ? Number(dailyRate) : null,
          monthlySalary: wageType !== "DAILY" && monthlySalary ? Number(monthlySalary) : null,
          joinDate: joinDate || null,
          activeProjectId: activeProjectId || null,
          hierarchyLevel: hierarchyLevel ? Number(hierarchyLevel) : null,
          reportingLocationId: reportingLocationId || null,
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
                label="Reporting Location"
                value={reportingLocationId}
                onChange={setReportingLocationId}
                options={stockLocations.map((l) => ({ value: l.id, label: l.name }))}
                placeholder="— None —"
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
