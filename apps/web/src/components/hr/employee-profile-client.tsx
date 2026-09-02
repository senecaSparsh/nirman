"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft, Phone, Mail, Briefcase, Calendar, MapPin, Users, UsersRound,
  Wallet, Clock, ListChecks, FileText, CalendarOff, Pencil, Trash2,
  CheckCircle2, Circle, AlertCircle, Loader2, UserCircle,
  IdCard, Building2, Navigation, Activity, Paperclip, Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { MoneyCell, DateCell } from "@/components/ui/cells";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useTabParam } from "@/lib/use-tab-param";

// ───────────────────────────────────────────────────────────────
//  Types — serialized employee profile payload from the server
// ───────────────────────────────────────────────────────────────

export type EmployeeProfileData = {
  id: string;
  name: string;
  trade: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  wageType: "DAILY" | "MONTHLY" | "FIXED";
  dailyRate: number;
  monthlySalary: number | null;
  joinDate: string | null;
  hierarchyLevel: number | null;
  active: boolean;
  crewId: string | null;
  crewName: string | null;
  crewProjectName: string | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  reportingLocationId: string | null;
  reportingLocationName: string | null;
  userId: string | null;
  // ── Dossier fields ──
  employmentType: "PERMANENT" | "CONTRACT" | "CASUAL" | "PROBATION" | "INTERN" | null;
  probationEndDate: string | null;
  confirmationDate: string | null;
  noticePeriodDays: number | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  payDay: number | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  bankBranch: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  uan: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  user: {
    id: string; name: string; email: string; role: string; phone: string | null;
    employeeCode: string | null; designation: string | null; department: string | null;
    joiningDate: string | null; employmentEndDate: string | null;
    active: boolean; image: string | null; lastLoginAt: string | null;
  } | null;
  supervisedCrews: { id: string; name: string; active: boolean; projectName: string | null; memberCount: number }[];
  attendance: {
    records: {
      id: string; date: string; status: string; checkIn: string | null;
      checkOut: string | null; hoursWorked: number | null; projectName: string | null; notes: string | null;
    }[];
    presentDays: number; halfDays: number; lateDays: number; absentDays: number; leaveDays: number;
    totalRecords: number;
  };
  payroll: {
    history: {
      id: string; periodId: string; month: number; year: number; status: string;
      daysWorked: number; basicAmount: number; overtimeAmount: number; allowance: number;
      bonus: number; pf: number; esi: number; professionTax: number; tax: number;
      deductions: number; grossPay: number; totalDeductions: number; netPay: number; paidAt: string | null;
    }[];
    totalNetPaid: number; avgNet: number; lastNet: number | null; lastPeriod: string | null;
  };
  tasks: {
    id: string; title: string; status: string; priority: string;
    dueDate: string | null; completedAt: string | null; createdAt: string;
    assignedByName: string | null;
  }[];
  dprs: {
    history: {
      id: string; dprId: string; date: string; projectName: string | null;
      workType: string | null; approvalStatus: string; hoursWorked: number; taskDescription: string;
    }[];
    totalHours: number;
  };
  leaves: {
    history: {
      id: string; type: string; startDate: string; endDate: string; days: number;
      reason: string | null; status: string; approvedByName: string | null;
      approvedAt: string | null; rejectedReason: string | null; createdAt: string;
    }[];
    pending: number; approved: number; total: number;
  };
  benefits: {
    id: string; type: string; amount: number | null; frequency: string;
    startDate: string | null; endDate: string | null; notes: string | null; active: boolean;
  }[];
  attachments: {
    id: string; category: string; label: string | null; createdAt: string;
    upload: { id: string; url: string; originalName: string; mimeType: string; size: number };
  }[];
};

// ───────────────────────────────────────────────────────────────
//  Constants & helpers
// ───────────────────────────────────────────────────────────────

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const WAGE_LABELS: Record<string, string> = { DAILY: "Daily Wage", MONTHLY: "Monthly Salary", FIXED: "Fixed Contract" };

const HIERARCHY_LABELS = ["Management", "Manager", "Engineer", "Supervisor", "Skilled", "Labor"];

const ATTENDANCE_STATUS_CONFIG: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "brand" | "muted" }> = {
  PRESENT: { label: "Present", variant: "success" },
  ABSENT: { label: "Absent", variant: "danger" },
  HALF_DAY: { label: "Half Day", variant: "warning" },
  OVERTIME: { label: "Overtime", variant: "info" },
  LEAVE: { label: "Leave", variant: "muted" },
  LATE: { label: "Late", variant: "warning" },
  PAID_LEAVE: { label: "Paid Leave", variant: "brand" },
  NON_PAID_LEAVE: { label: "Non-Paid Leave", variant: "muted" },
};

const PAYROLL_STATUS_CONFIG: Record<string, { label: string; variant: "warning" | "info" | "success" }> = {
  DRAFT: { label: "Draft", variant: "warning" },
  PROCESSED: { label: "Processed", variant: "info" },
  PAID: { label: "Paid", variant: "success" },
};

const LEAVE_STATUS_CONFIG: Record<string, { label: string; variant: "warning" | "success" | "danger" | "muted" }> = {
  PENDING: { label: "Pending", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "muted" },
};

const TASK_STATUS_CONFIG: Record<string, { label: string; variant: "muted" | "info" | "success" | "danger" }> = {
  PENDING: { label: "Pending", variant: "muted" },
  IN_PROGRESS: { label: "In Progress", variant: "info" },
  COMPLETED: { label: "Completed", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "danger" },
};

const PRIORITY_CONFIG: Record<string, { label: string; variant: "muted" | "info" | "warning" | "danger" }> = {
  low: { label: "Low", variant: "muted" },
  medium: { label: "Medium", variant: "info" },
  high: { label: "High", variant: "warning" },
  urgent: { label: "Urgent", variant: "danger" },
};

const DPR_STATUS_CONFIG: Record<string, { label: string; variant: "warning" | "info" | "success" | "danger" }> = {
  SUBMITTED: { label: "Submitted", variant: "warning" },
  SUB_ADMIN_APPROVED: { label: "Sub-Admin Approved", variant: "info" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
};

function statusBadge<T extends Record<string, { label: string; variant: string }>>(cfg: T, status: string) {
  const c = cfg[status];
  if (!c) return <Badge variant="outline">{status}</Badge>;
  return <Badge variant={c.variant as never} dot>{c.label}</Badge>;
}

/** Deterministic avatar color from name hash. */
const AVATAR_COLORS = [
  "bg-[var(--color-world-hr)]/15 text-[var(--color-world-hr)]",
  "bg-success/15 text-success",
  "bg-info/15 text-info",
  "bg-warning/15 text-warning",
  "bg-brand/15 text-brand",
  "bg-primary/10 text-primary",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ───────────────────────────────────────────────────────────────
//  Main component
// ───────────────────────────────────────────────────────────────

export function EmployeeProfileClient({
  employee,
  permissions,
}: {
  employee: EmployeeProfileData;
  permissions: { canManage: boolean; canManagePayroll: boolean; canAssignTasks: boolean };
}) {
  const [tab, setTab] = useTabParam(
    ["overview", "attendance", "payroll", "tasks", "dprs", "leaves", "crew"] as const,
    "overview",
  );
  const [showDelete, setShowDelete] = useState(false);

  const openTasks = employee.tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const completedTasks = employee.tasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/hr/employees"
        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Employees
      </Link>

      {/* ── Profile Hero ── */}
      <ProfileHero employee={employee} permissions={permissions} onDelete={() => setShowDelete(true)} />

      {/* ── Two-column: sticky sidebar + tabbed content ── */}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Sidebar — identity details, sticky on desktop */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <ProfileSidebar employee={employee} />
        </aside>

        {/* Main — tabs + content */}
        <div className="min-w-0 space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="attendance" count={employee.attendance.totalRecords}>Attendance</TabsTrigger>
              <TabsTrigger value="payroll" count={employee.payroll.history.length}>Payroll</TabsTrigger>
              <TabsTrigger value="tasks" count={employee.tasks.length}>Tasks</TabsTrigger>
              <TabsTrigger value="dprs" count={employee.dprs.history.length}>DPRs</TabsTrigger>
              <TabsTrigger value="leaves" count={employee.leaves.total}>Leave</TabsTrigger>
              <TabsTrigger value="crew" count={employee.supervisedCrews.length}>Crew</TabsTrigger>
              <TabsTrigger value="dossier" count={employee.attachments.length + employee.benefits.length}>Dossier</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab employee={employee} />
            </TabsContent>
            <TabsContent value="attendance">
              <AttendanceTab employee={employee} />
            </TabsContent>
            <TabsContent value="payroll">
              <PayrollTab employee={employee} canManagePayroll={permissions.canManagePayroll} />
            </TabsContent>
            <TabsContent value="tasks">
              <TasksTab employee={employee} canAssignTasks={permissions.canAssignTasks} />
            </TabsContent>
            <TabsContent value="dprs">
              <DprsTab employee={employee} />
            </TabsContent>
            <TabsContent value="leaves">
              <LeavesTab employee={employee} canManage={permissions.canManage} />
            </TabsContent>
            <TabsContent value="crew">
              <CrewTab employee={employee} />
            </TabsContent>
            <TabsContent value="dossier">
              <DossierTab employee={employee} canManage={permissions.canManage} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Delete confirm */}
      {showDelete && (
        <DeleteConfirmDialog
          open={!!showDelete}
          onOpenChange={(o) => !o && setShowDelete(false)}
          endpoint={`/api/employees/${employee.id}`}
          title="Archive Employee"
          description={`Are you sure you want to archive ${employee.name}? This soft-deletes the record. Attendance, payroll, and DPR history are preserved.`}
          successMessage="Employee archived"
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Profile Hero — cover banner + avatar + identity + stats + actions
// ───────────────────────────────────────────────────────────────

function ProfileHero({
  employee,
  permissions,
  onDelete,
}: {
  employee: EmployeeProfileData;
  permissions: { canManage: boolean; canManagePayroll: boolean; canAssignTasks: boolean };
  onDelete: () => void;
}) {
  const u = employee.user;
  const photoUrl = u?.image ?? null;
  const subtitle = employee.designation ?? employee.trade ?? "Employee";
  const attendanceRate = employee.attendance.totalRecords > 0
    ? Math.round((employee.attendance.presentDays / employee.attendance.totalRecords) * 100)
    : null;
  const phone = employee.phone ?? u?.phone ?? null;
  const email = employee.email ?? u?.email ?? null;
  const openTaskCount = employee.tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-raised">
      {/* ── Cover banner — vibrant gradient with geometric pattern ── */}
      <div className="relative h-36 sm:h-44">
        {/* Base gradient — warm HR orange to deep indigo */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #d4541a 0%, #b8401a 30%, #7c2d5e 65%, #2d1b4e 100%)",
          }}
        />
        {/* Geometric mesh overlay */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 60% 80% at 15% 20%, rgba(255,180,80,0.4) 0%, transparent 60%),
              radial-gradient(ellipse 50% 60% at 85% 30%, rgba(180,80,200,0.35) 0%, transparent 55%),
              radial-gradient(ellipse 70% 50% at 50% 100%, rgba(80,40,120,0.4) 0%, transparent 60%)
            `,
          }}
        />
        {/* Diagonal line texture */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 12px)",
          }}
        />
        {/* Action buttons — top right of cover */}
        {permissions.canManage && (
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <Link href="/hr/employees">
              <Button size="sm" className="bg-white/15 backdrop-blur-md border border-white/20 text-white hover:bg-white/25 shadow-lg">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </Link>
            <Button
              size="sm"
              className="bg-white/15 backdrop-blur-md border border-white/20 text-white hover:bg-red-500/40 shadow-lg"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {/* Bottom fade into card */}
        <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-card to-transparent" />
      </div>

      {/* ── Identity row — avatar overlaps cover ── */}
      <div className="px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
          {/* Avatar — 112px, rounded-2xl, overlapping cover by 56px */}
          <div className="-mt-14 sm:-mt-16 shrink-0">
            <div className="relative size-24 sm:size-28 rounded-2xl border-4 border-card bg-card shadow-floating overflow-hidden">
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={employee.name}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              ) : (
                <div className={cn("flex h-full w-full items-center justify-center text-3xl font-bold", avatarColor(employee.name))}>
                  {initials(employee.name)}
                </div>
              )}
              {/* Active status dot on avatar */}
              <div
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-5 rounded-full border-3 border-card",
                  employee.active ? "bg-success" : "bg-muted-foreground",
                )}
                style={{ borderWidth: 3 }}
              />
            </div>
          </div>

          {/* Name + title + badges + contact pills */}
          <div className="min-w-0 flex-1 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-bold leading-tight text-foreground">{employee.name}</h1>
              <Badge variant={employee.active ? "success" : "muted"} dot>
                {employee.active ? "Active" : "Inactive"}
              </Badge>
              {u?.employeeCode && (
                <Badge variant="outline" className="gap-1 font-mono">
                  <IdCard className="h-3 w-3" /> {u.employeeCode}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {subtitle}
              {employee.hierarchyLevel != null && (
                <> · <span className="text-muted-foreground/80">H{employee.hierarchyLevel} — {HIERARCHY_LABELS[employee.hierarchyLevel - 1] ?? `Level ${employee.hierarchyLevel}`}</span></>
              )}
              {employee.trade && <> · <span className="text-muted-foreground/80">{employee.trade}</span></>}
            </p>

            {/* Contact pills — inline, dense */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-subtle px-2.5 py-1 text-caption font-medium text-foreground transition-colors hover:bg-muted hover:border-border-strong"
                >
                  <Phone className="h-3 w-3 text-muted-foreground" /> {phone}
                </a>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-subtle px-2.5 py-1 text-caption font-medium text-foreground transition-colors hover:bg-muted hover:border-border-strong"
                >
                  <Mail className="h-3 w-3 text-muted-foreground" /> {email}
                </a>
              )}
              {employee.activeProjectName && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-subtle px-2.5 py-1 text-caption font-medium text-foreground">
                  <MapPin className="h-3 w-3 text-muted-foreground" /> {employee.activeProjectName}
                </span>
              )}
              {employee.crewName && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-subtle px-2.5 py-1 text-caption font-medium text-foreground">
                  <UsersRound className="h-3 w-3 text-muted-foreground" /> {employee.crewName}
                </span>
              )}
              {employee.joinDate && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-subtle px-2.5 py-1 text-caption font-medium text-foreground">
                  <Calendar className="h-3 w-3 text-muted-foreground" /> Joined {formatDate(employee.joinDate)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Stat tiles — colored, dense, icon-backed ── */}
        <div className="mt-4 mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HeroStatTile
            icon={Clock}
            label="Attendance"
            value={attendanceRate != null ? `${attendanceRate}%` : "—"}
            hint={`${employee.attendance.presentDays}/${employee.attendance.totalRecords} days`}
            color={attendanceRate != null && attendanceRate >= 75 ? "success" : attendanceRate != null && attendanceRate < 50 ? "danger" : "warning"}
          />
          <HeroStatTile
            icon={Wallet}
            label="Net Paid"
            value={formatCurrency(employee.payroll.totalNetPaid)}
            hint={`${employee.payroll.history.filter((p) => p.status === "PAID").length} periods`}
            color="brand"
          />
          <HeroStatTile
            icon={ListChecks}
            label="Open Tasks"
            value={String(openTaskCount)}
            hint={`${employee.tasks.filter((t) => t.status === "COMPLETED").length} done`}
            color={openTaskCount > 0 ? "info" : "muted"}
          />
          <HeroStatTile
            icon={Activity}
            label="DPR Hours"
            value={`${employee.dprs.totalHours.toFixed(1)}h`}
            hint={`${employee.dprs.history.length} entries`}
            color="info"
          />
        </div>
      </div>
    </div>
  );
}

/** Dense, colored stat tile with icon chip. */
function HeroStatTile({
  icon: Icon,
  label,
  value,
  hint,
  color = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  color?: "default" | "success" | "danger" | "warning" | "info" | "brand" | "muted";
}) {
  const colors: Record<string, { bg: string; text: string; chip: string }> = {
    default: { bg: "bg-subtle", text: "text-foreground", chip: "bg-muted text-muted-foreground" },
    success: { bg: "bg-success-soft/40", text: "text-success", chip: "bg-success/15 text-success" },
    danger: { bg: "bg-danger-soft/40", text: "text-danger", chip: "bg-danger/15 text-danger" },
    warning: { bg: "bg-warning-soft/40", text: "text-warning", chip: "bg-warning/15 text-warning" },
    info: { bg: "bg-info-soft/40", text: "text-info", chip: "bg-info/15 text-info" },
    brand: { bg: "bg-brand-soft/40", text: "text-brand-strong", chip: "bg-brand/15 text-brand-strong" },
    muted: { bg: "bg-muted/50", text: "text-muted-foreground", chip: "bg-muted text-muted-foreground" },
  };
  const c = colors[color] ?? colors.default!;

  return (
    <div className={cn("rounded-lg border border-border p-2.5", c.bg)}>
      <div className="flex items-center gap-2">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", c.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-label text-muted-foreground leading-tight">{label}</div>
          <div className={cn("text-[15px] font-bold tnum leading-tight truncate", c.text)}>{value}</div>
        </div>
      </div>
      {hint && <div className="mt-1 text-micro text-muted-foreground/70 truncate pl-9">{hint}</div>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Profile Sidebar — sticky identity details (left column)
// ───────────────────────────────────────────────────────────────

function ProfileSidebar({ employee }: { employee: EmployeeProfileData }) {
  const u = employee.user;
  const phone = employee.phone ?? u?.phone ?? null;
  const email = employee.email ?? u?.email ?? null;

  return (
    <div className="space-y-3">
      {/* Contact */}
      <SidebarCard title="Contact" icon={Phone}>
        <SidebarLink
          icon={Phone}
          label="Phone"
          value={phone}
          href={phone ? `tel:${phone.replace(/\s/g, "")}` : null}
        />
        <SidebarLink
          icon={Mail}
          label="Email"
          value={email}
          href={email ? `mailto:${email}` : null}
        />
        <SidebarRow icon={Briefcase} label="Trade" value={employee.trade} />
        <SidebarRow
          icon={UserCircle}
          label="Hierarchy"
          value={employee.hierarchyLevel != null ? `H${employee.hierarchyLevel} · ${HIERARCHY_LABELS[employee.hierarchyLevel - 1] ?? "Level " + employee.hierarchyLevel}` : null}
        />
      </SidebarCard>

      {/* Assignment */}
      <SidebarCard title="Assignment" icon={Building2}>
        <SidebarRow icon={MapPin} label="Project" value={employee.activeProjectName} />
        <SidebarRow icon={UsersRound} label="Crew" value={employee.crewName} hint={employee.crewProjectName ?? undefined} />
        <SidebarRow icon={Navigation} label="Reporting" value={employee.reportingLocationName} hint="GPS geofence" />
        <SidebarRow
          icon={Users}
          label="Supervises"
          value={employee.supervisedCrews.length > 0 ? `${employee.supervisedCrews.length} crew(s)` : null}
        />
      </SidebarCard>

      {/* Employment */}
      <SidebarCard title="Employment" icon={IdCard}>
        <SidebarRow icon={Calendar} label="Join Date" value={employee.joinDate ? formatDate(employee.joinDate) : (u?.joiningDate ? formatDate(u.joiningDate) : null)} />
        <SidebarRow icon={Briefcase} label="Designation" value={employee.designation ?? u?.designation} />
        <SidebarRow icon={Building2} label="Department" value={u?.department} />
        <SidebarRow
          icon={Wallet}
          label="Wage"
          value={employee.wageType === "DAILY"
            ? `${formatCurrency(employee.dailyRate)}/day`
            : employee.monthlySalary != null
              ? `${formatCurrency(employee.monthlySalary)}/mo`
              : WAGE_LABELS[employee.wageType] ?? null}
        />
        {u?.employmentEndDate && (
          <SidebarRow icon={Calendar} label="End Date" value={formatDate(u.employmentEndDate)} />
        )}
      </SidebarCard>

      {/* Login account */}
      <SidebarCard title="Login Account" icon={UserCircle}>
        {u ? (
          <>
            <SidebarRow icon={Mail} label="Email" value={u.email} />
            <SidebarRow
              icon={UserCircle}
              label="Role"
              value={u.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
            />
            <SidebarRow icon={UserCircle} label="Status" value={u.active ? "Active login" : "Disabled"} />
            {u.lastLoginAt && (
              <SidebarRow icon={Clock} label="Last Login" value={formatDate(u.lastLoginAt)} />
            )}
          </>
        ) : (
          <p className="py-2 text-center text-caption text-muted-foreground">
            No linked user account.<br />This worker has no app login.
          </p>
        )}
      </SidebarCard>
    </div>
  );
}

function SidebarCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-raised">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-label font-semibold text-foreground">{title}</span>
      </div>
      <div className="divide-y divide-border/60 px-3">{children}</div>
    </div>
  );
}

function SidebarRow({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string | null | undefined; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      <div className="min-w-0 flex-1">
        <div className="text-label text-muted-foreground">{label}</div>
        <div className={cn("truncate text-body", !value ? "text-muted-foreground/50" : "text-foreground")}>
          {value || "—"}
        </div>
        {hint && <div className="text-micro text-muted-foreground/60 truncate">{hint}</div>}
      </div>
    </div>
  );
}

function SidebarLink({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value: string | null | undefined; href: string | null }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      <div className="min-w-0 flex-1">
        <div className="text-label text-muted-foreground">{label}</div>
        {value && href ? (
          <a href={href} className="truncate text-body text-foreground underline decoration-dotted underline-offset-2 hover:text-brand-strong">
            {value}
          </a>
        ) : (
          <div className={cn("truncate text-body", !value ? "text-muted-foreground/50" : "text-foreground")}>
            {value || "—"}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Stat band helper (used inside tab content)
// ───────────────────────────────────────────────────────────────

function StatBand({ items }: { items: { label: string; value: string | number; tone?: string; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x divide-y sm:divide-y-0">
      {items.map((s, i) => (
        <div key={i} className="flex flex-col gap-0.5 p-3">
          <span className="text-label text-muted-foreground/75">{s.label}</span>
          <span className={cn("text-figure", s.tone ?? "text-foreground")}>{s.value}</span>
          {s.hint && <span className="text-micro text-muted-foreground">{s.hint}</span>}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Overview tab
// ───────────────────────────────────────────────────────────────

function OverviewTab({ employee }: { employee: EmployeeProfileData }) {
  const wageValue = employee.wageType === "DAILY"
    ? formatCurrency(employee.dailyRate) + "/day"
    : employee.monthlySalary != null
      ? formatCurrency(employee.monthlySalary) + "/mo"
      : "—";

  const approvedLeaveDays = employee.leaves.history
    .filter((l) => l.status === "APPROVED")
    .reduce((s, l) => s + l.days, 0);

  return (
    <div className="space-y-4">
      {/* Payroll quick stats */}
      <StatBand
        items={[
          { label: "Wage", value: wageValue, hint: WAGE_LABELS[employee.wageType] ?? employee.wageType },
          { label: "Avg Net / Period", value: formatCurrency(employee.payroll.avgNet) },
          { label: "Total Net Paid", value: formatCurrency(employee.payroll.totalNetPaid), tone: "text-success" },
          { label: "Last Net Pay", value: employee.payroll.lastNet != null ? formatCurrency(employee.payroll.lastNet) : "—", hint: employee.payroll.lastPeriod ? `for ${employee.payroll.lastPeriod}` : undefined },
        ]}
      />

      {/* Activity snapshots — 2×2 grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Attendance */}
        <SectionCard title="Recent Attendance" icon={Clock} action={<Link href="?tab=attendance" className="text-meta text-brand-strong hover:underline">View all →</Link>}>
          {employee.attendance.records.length === 0 ? (
            <EmptyState size="compact" icon={<Clock className="h-4 w-4" />} title="No attendance records" />
          ) : (
            <div className="space-y-1">
              {employee.attendance.records.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md bg-subtle px-2.5 py-1.5">
                  <div className="min-w-0">
                    <span className="text-body text-foreground">{formatDate(a.date)}</span>
                    {a.projectName && <span className="ml-1.5 text-micro text-muted-foreground/70 truncate">{a.projectName}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.hoursWorked != null && <span className="text-micro tnum text-muted-foreground">{a.hoursWorked.toFixed(1)}h</span>}
                    {statusBadge(ATTENDANCE_STATUS_CONFIG, a.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Recent Payroll */}
        <SectionCard title="Recent Payroll" icon={Wallet} action={<Link href="?tab=payroll" className="text-meta text-brand-strong hover:underline">View all →</Link>}>
          {employee.payroll.history.length === 0 ? (
            <EmptyState size="compact" icon={<Wallet className="h-4 w-4" />} title="No payroll history" />
          ) : (
            <div className="space-y-1">
              {employee.payroll.history.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md bg-subtle px-2.5 py-1.5">
                  <span className="text-body text-foreground">{MONTHS[p.month]} {p.year}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tnum text-body font-medium text-foreground">{formatCurrency(p.netPay)}</span>
                    {statusBadge(PAYROLL_STATUS_CONFIG, p.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Open Tasks */}
        <SectionCard title="Open Tasks" icon={ListChecks} action={<Link href="?tab=tasks" className="text-meta text-brand-strong hover:underline">View all →</Link>}>
          {employee.tasks.length === 0 ? (
            <EmptyState size="compact" icon={<ListChecks className="h-4 w-4" />} title="No tasks assigned" description={employee.userId ? undefined : "No linked user account"} />
          ) : (
            <div className="space-y-1">
              {employee.tasks.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-md bg-subtle px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {t.status === "COMPLETED" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" /> : t.status === "IN_PROGRESS" ? <Loader2 className="h-3.5 w-3.5 shrink-0 text-info" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className={cn("truncate text-body", t.status === "COMPLETED" && "text-muted-foreground line-through")}>{t.title}</span>
                  </div>
                  {statusBadge(TASK_STATUS_CONFIG, t.status)}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Leave Summary */}
        <SectionCard title="Leave Summary" icon={CalendarOff} action={<Link href="?tab=leaves" className="text-meta text-brand-strong hover:underline">View all →</Link>}>
          {employee.leaves.history.length === 0 ? (
            <EmptyState size="compact" icon={<CalendarOff className="h-4 w-4" />} title="No leave requests" />
          ) : (
            <div className="space-y-2">
              {/* Mini stat row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-subtle px-2 py-1.5 text-center">
                  <div className="text-[16px] font-semibold tnum text-foreground">{employee.leaves.total}</div>
                  <div className="text-micro text-muted-foreground">Total</div>
                </div>
                <div className="rounded-md bg-warning-soft/50 px-2 py-1.5 text-center">
                  <div className="text-[16px] font-semibold tnum text-warning">{employee.leaves.pending}</div>
                  <div className="text-micro text-muted-foreground">Pending</div>
                </div>
                <div className="rounded-md bg-success-soft/50 px-2 py-1.5 text-center">
                  <div className="text-[16px] font-semibold tnum text-success">{approvedLeaveDays.toFixed(1)}</div>
                  <div className="text-micro text-muted-foreground">Days Taken</div>
                </div>
              </div>
              {/* Recent requests */}
              <div className="space-y-1">
                {employee.leaves.history.slice(0, 3).map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-md bg-subtle px-2.5 py-1.5">
                    <div className="min-w-0">
                      <span className="text-body text-foreground">{l.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                      <span className="ml-1.5 text-micro text-muted-foreground/70">{formatDate(l.startDate)} → {formatDate(l.endDate)}</span>
                    </div>
                    {statusBadge(LEAVE_STATUS_CONFIG, l.status)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Attendance tab
// ───────────────────────────────────────────────────────────────

function AttendanceTab({ employee }: { employee: EmployeeProfileData }) {
  const a = employee.attendance;
  const att = a.records;

  const columns: Column<(typeof att)[number]>[] = [
    {
      key: "date", label: "Date", sortable: true, width: "140px",
      render: (r) => <span className="text-body text-foreground">{formatDate(r.date)}</span>,
      sortValue: (r) => r.date,
      exportValue: (r) => formatDate(r.date),
    },
    {
      key: "status", label: "Status", sortable: true, filterable: true,
      render: (r) => statusBadge(ATTENDANCE_STATUS_CONFIG, r.status),
      filterValue: (r) => r.status,
      exportValue: (r) => r.status,
    },
    {
      key: "checkIn", label: "Check In", width: "100px",
      render: (r) => r.checkIn ? <span className="tnum text-body">{new Date(r.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span> : <span className="text-muted-foreground">—</span>,
      exportValue: (r) => r.checkIn ?? "",
    },
    {
      key: "checkOut", label: "Check Out", width: "100px",
      render: (r) => r.checkOut ? <span className="tnum text-body">{new Date(r.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span> : <span className="text-muted-foreground">—</span>,
      exportValue: (r) => r.checkOut ?? "",
    },
    {
      key: "hoursWorked", label: "Hours", align: "right", sortable: true,
      render: (r) => r.hoursWorked != null ? <span className="tnum text-body">{r.hoursWorked.toFixed(1)}h</span> : <span className="text-muted-foreground">—</span>,
      sortValue: (r) => r.hoursWorked ?? 0,
      exportValue: (r) => r.hoursWorked ?? "",
    },
    {
      key: "projectName", label: "Project", sortable: true, filterable: true,
      render: (r) => r.projectName ? <span className="text-body text-foreground">{r.projectName}</span> : <span className="text-muted-foreground">—</span>,
      filterValue: (r) => r.projectName ?? "—",
      exportValue: (r) => r.projectName ?? "",
    },
    {
      key: "notes", label: "Notes",
      render: (r) => r.notes ? <span className="text-body text-muted-foreground">{r.notes}</span> : <span className="text-muted-foreground">—</span>,
      exportValue: (r) => r.notes ?? "",
    },
  ];

  return (
    <div className="space-y-4">
      <StatBand
        items={[
          { label: "Present", value: a.presentDays, tone: "text-success", hint: `of ${a.totalRecords} records` },
          { label: "Half Days", value: a.halfDays, tone: "text-warning" },
          { label: "Late", value: a.lateDays, tone: "text-warning" },
          { label: "Absent", value: a.absentDays, tone: "text-danger" },
        ]}
      />

      {att.length === 0 ? (
        <EmptyState icon={<Clock className="h-5 w-5" />} title="No attendance records" description="This employee has no attendance entries yet." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={att}
            columns={columns}
            storageKey="employee-attendance"
            hideable
            exportFileName={`attendance-${employee.name}`}
            initialSort={{ key: "date", direction: "desc" }}
            searchable
            searchPlaceholder="Search date, status, project…"
            pageSize={25}
            emptyState={<EmptyState size="compact" icon={<AlertCircle />} title="No matching records" description="Adjust the search or filters." />}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Payroll tab
// ───────────────────────────────────────────────────────────────

function PayrollTab({ employee, canManagePayroll }: { employee: EmployeeProfileData; canManagePayroll: boolean }) {
  const p = employee.payroll;
  const rows = p.history;

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "period", label: "Period", sortable: true, width: "140px",
      render: (r) => <span className="font-medium text-foreground">{MONTHS[r.month]} {r.year}</span>,
      sortValue: (r) => r.year * 100 + r.month,
      exportValue: (r) => `${MONTHS[r.month]} ${r.year}`,
    },
    {
      key: "status", label: "Status", sortable: true, filterable: true,
      render: (r) => statusBadge(PAYROLL_STATUS_CONFIG, r.status),
      filterValue: (r) => r.status,
      exportValue: (r) => r.status,
    },
    {
      key: "daysWorked", label: "Days", align: "right", sortable: true,
      render: (r) => <span className="tnum text-body">{r.daysWorked.toFixed(1)}</span>,
      sortValue: (r) => r.daysWorked,
      exportValue: (r) => r.daysWorked,
    },
    {
      key: "basicAmount", label: "Basic", align: "right", sortable: true,
      render: (r) => <MoneyCell value={r.basicAmount} formatted={formatCurrency(r.basicAmount)} neutral />,
      sortValue: (r) => r.basicAmount,
      exportValue: (r) => r.basicAmount,
    },
    {
      key: "overtimeAmount", label: "Overtime", align: "right", sortable: true,
      render: (r) => <MoneyCell value={r.overtimeAmount} formatted={formatCurrency(r.overtimeAmount)} neutral />,
      sortValue: (r) => r.overtimeAmount,
      exportValue: (r) => r.overtimeAmount,
    },
    {
      key: "grossPay", label: "Gross", align: "right", sortable: true,
      render: (r) => <MoneyCell value={r.grossPay} formatted={formatCurrency(r.grossPay)} neutral />,
      sortValue: (r) => r.grossPay,
      exportValue: (r) => r.grossPay,
    },
    {
      key: "totalDeductions", label: "Deductions", align: "right", sortable: true,
      render: (r) => <span className="tnum text-body text-danger">{formatCurrency(r.totalDeductions)}</span>,
      sortValue: (r) => r.totalDeductions,
      exportValue: (r) => r.totalDeductions,
    },
    {
      key: "netPay", label: "Net Pay", align: "right", sortable: true,
      render: (r) => <span className="tnum font-semibold text-foreground">{formatCurrency(r.netPay)}</span>,
      sortValue: (r) => r.netPay,
      exportValue: (r) => r.netPay,
    },
    {
      key: "paidAt", label: "Paid On", width: "120px",
      render: (r) => r.paidAt ? <DateCell date={r.paidAt} formatted={formatDate(r.paidAt)} /> : <span className="text-muted-foreground">—</span>,
      exportValue: (r) => r.paidAt ? formatDate(r.paidAt) : "",
    },
  ];

  return (
    <div className="space-y-4">
      <StatBand
        items={[
          { label: "Periods", value: rows.length, hint: `${rows.filter((r) => r.status === "PAID").length} paid` },
          { label: "Avg Net / Period", value: formatCurrency(p.avgNet) },
          { label: "Total Net Paid", value: formatCurrency(p.totalNetPaid), tone: "text-success" },
          { label: "Last Net Pay", value: p.lastNet != null ? formatCurrency(p.lastNet) : "—", hint: p.lastPeriod ? `for ${p.lastPeriod}` : undefined },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={<Wallet className="h-5 w-5" />} title="No payroll history" description="This employee has no payroll entries yet. Run payroll from the Payroll page." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={rows}
            columns={columns}
            storageKey="employee-payroll"
            hideable
            exportFileName={`payroll-${employee.name}`}
            initialSort={{ key: "period", direction: "desc" }}
            searchable
            searchPlaceholder="Search period, status…"
            pageSize={25}
            emptyState={<EmptyState size="compact" icon={<AlertCircle />} title="No matching records" description="Adjust the search or filters." />}
          />
        </div>
      )}

      {canManagePayroll && rows.length > 0 && (
        <div className="flex justify-end">
          <Link href="/hr/payroll">
            <Button variant="outline" size="sm"><Wallet className="h-3.5 w-3.5" /> Manage Payroll</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Tasks tab
// ───────────────────────────────────────────────────────────────

function TasksTab({ employee, canAssignTasks }: { employee: EmployeeProfileData; canAssignTasks: boolean }) {
  const tasks = employee.tasks;
  const open = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const overdue = tasks.filter((t) => t.dueDate && t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()).length;

  const columns: Column<(typeof tasks)[number]>[] = [
    {
      key: "title", label: "Task", sortable: true,
      render: (t) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {t.status === "COMPLETED" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : t.status === "IN_PROGRESS" ? <Loader2 className="h-3.5 w-3.5 text-info" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className={cn("font-medium text-foreground", t.status === "COMPLETED" && "line-through text-muted-foreground")}>{t.title}</span>
          </div>
          {t.assignedByName && <div className="text-meta text-muted-foreground">by {t.assignedByName}</div>}
        </div>
      ),
      sortValue: (t) => t.title,
      exportValue: (t) => t.title,
    },
    {
      key: "status", label: "Status", sortable: true, filterable: true, width: "130px",
      render: (t) => statusBadge(TASK_STATUS_CONFIG, t.status),
      filterValue: (t) => t.status,
      exportValue: (t) => t.status,
    },
    {
      key: "priority", label: "Priority", sortable: true, filterable: true, width: "110px",
      render: (t) => statusBadge(PRIORITY_CONFIG, t.priority),
      filterValue: (t) => t.priority,
      exportValue: (t) => t.priority,
    },
    {
      key: "dueDate", label: "Due Date", sortable: true, width: "130px",
      render: (t) => {
        if (!t.dueDate) return <span className="text-muted-foreground">—</span>;
        const isOverdue = t.status !== "COMPLETED" && new Date(t.dueDate) < new Date();
        return <span className={cn("text-body", isOverdue ? "text-danger font-medium" : "text-foreground")}>{formatDate(t.dueDate)}</span>;
      },
      sortValue: (t) => t.dueDate ?? "",
      exportValue: (t) => t.dueDate ? formatDate(t.dueDate) : "",
    },
    {
      key: "completedAt", label: "Completed", width: "130px",
      render: (t) => t.completedAt ? <span className="text-body text-success">{formatDate(t.completedAt)}</span> : <span className="text-muted-foreground">—</span>,
      exportValue: (t) => t.completedAt ? formatDate(t.completedAt) : "",
    },
  ];

  return (
    <div className="space-y-4">
      <StatBand
        items={[
          { label: "Total Tasks", value: tasks.length },
          { label: "Open", value: open, tone: "text-info" },
          { label: "Completed", value: completed, tone: "text-success" },
          { label: "Overdue", value: overdue, tone: overdue > 0 ? "text-danger" : "text-foreground" },
        ]}
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-5 w-5" />}
          title="No tasks assigned"
          description={employee.userId ? "This employee has no tasks yet. Assign tasks from the My Tasks page." : "This employee has no linked user account, so tasks cannot be assigned. Link a user in the edit form."}
          action={canAssignTasks && employee.userId ? (
            <Link href="/my-tasks"><Button size="sm">Assign Task</Button></Link>
          ) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={tasks}
            columns={columns}
            storageKey="employee-tasks"
            hideable
            exportFileName={`tasks-${employee.name}`}
            initialSort={{ key: "status", direction: "asc" }}
            searchable
            searchPlaceholder="Search task title, status…"
            pageSize={25}
            emptyState={<EmptyState size="compact" icon={<AlertCircle />} title="No matching tasks" description="Adjust the search or filters." />}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  DPRs tab
// ───────────────────────────────────────────────────────────────

function DprsTab({ employee }: { employee: EmployeeProfileData }) {
  const d = employee.dprs;
  const rows = d.history;

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "date", label: "Date", sortable: true, width: "140px",
      render: (r) => <span className="text-body text-foreground">{formatDate(r.date)}</span>,
      sortValue: (r) => r.date,
      exportValue: (r) => formatDate(r.date),
    },
    {
      key: "projectName", label: "Project", sortable: true, filterable: true,
      render: (r) => r.projectName ? <span className="text-body text-foreground">{r.projectName}</span> : <span className="text-muted-foreground">—</span>,
      filterValue: (r) => r.projectName ?? "—",
      exportValue: (r) => r.projectName ?? "",
    },
    {
      key: "workType", label: "Work Type", sortable: true, filterable: true,
      render: (r) => r.workType ? <Badge variant="outline">{r.workType}</Badge> : <span className="text-muted-foreground">—</span>,
      filterValue: (r) => r.workType ?? "—",
      exportValue: (r) => r.workType ?? "",
    },
    {
      key: "taskDescription", label: "Task Description",
      render: (r) => <span className="text-body text-foreground">{r.taskDescription}</span>,
      exportValue: (r) => r.taskDescription,
    },
    {
      key: "hoursWorked", label: "Hours", align: "right", sortable: true, width: "100px",
      render: (r) => <span className="tnum text-body">{r.hoursWorked.toFixed(1)}h</span>,
      sortValue: (r) => r.hoursWorked,
      exportValue: (r) => r.hoursWorked,
    },
    {
      key: "approvalStatus", label: "DPR Status", sortable: true, filterable: true, width: "160px",
      render: (r) => statusBadge(DPR_STATUS_CONFIG, r.approvalStatus),
      filterValue: (r) => r.approvalStatus,
      exportValue: (r) => r.approvalStatus,
    },
  ];

  return (
    <div className="space-y-4">
      <StatBand
        items={[
          { label: "DPR Entries", value: rows.length },
          { label: "Total Hours", value: `${d.totalHours.toFixed(1)}h` },
          { label: "Avg Hours / Entry", value: rows.length > 0 ? `${(d.totalHours / rows.length).toFixed(1)}h` : "—" },
          { label: "Approved DPRs", value: rows.filter((r) => r.approvalStatus === "APPROVED").length, tone: "text-success" },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No DPR labor entries" description="This employee has not been listed on any Daily Progress Reports." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={rows}
            columns={columns}
            storageKey="employee-dprs"
            hideable
            exportFileName={`dpr-labor-${employee.name}`}
            initialSort={{ key: "date", direction: "desc" }}
            searchable
            searchPlaceholder="Search date, project, work type…"
            pageSize={25}
            emptyState={<EmptyState size="compact" icon={<AlertCircle />} title="No matching entries" description="Adjust the search or filters." />}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Leaves tab
// ───────────────────────────────────────────────────────────────

function LeavesTab({ employee, canManage }: { employee: EmployeeProfileData; canManage: boolean }) {
  const l = employee.leaves;
  const rows = l.history;

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "type", label: "Type", sortable: true, filterable: true, width: "120px",
      render: (r) => <Badge variant="outline">{r.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>,
      filterValue: (r) => r.type,
      exportValue: (r) => r.type,
    },
    {
      key: "startDate", label: "Start", sortable: true, width: "130px",
      render: (r) => <span className="text-body text-foreground">{formatDate(r.startDate)}</span>,
      sortValue: (r) => r.startDate,
      exportValue: (r) => formatDate(r.startDate),
    },
    {
      key: "endDate", label: "End", width: "130px",
      render: (r) => <span className="text-body text-foreground">{formatDate(r.endDate)}</span>,
      exportValue: (r) => formatDate(r.endDate),
    },
    {
      key: "days", label: "Days", align: "right", sortable: true, width: "80px",
      render: (r) => <span className="tnum text-body">{r.days.toFixed(1)}</span>,
      sortValue: (r) => r.days,
      exportValue: (r) => r.days,
    },
    {
      key: "reason", label: "Reason",
      render: (r) => r.reason ? <span className="text-body text-muted-foreground">{r.reason}</span> : <span className="text-muted-foreground">—</span>,
      exportValue: (r) => r.reason ?? "",
    },
    {
      key: "status", label: "Status", sortable: true, filterable: true, width: "130px",
      render: (r) => statusBadge(LEAVE_STATUS_CONFIG, r.status),
      filterValue: (r) => r.status,
      exportValue: (r) => r.status,
    },
    {
      key: "approvedByName", label: "Approved By", width: "140px",
      render: (r) => r.approvedByName ? <span className="text-body text-foreground">{r.approvedByName}</span> : <span className="text-muted-foreground">—</span>,
      exportValue: (r) => r.approvedByName ?? "",
    },
  ];

  return (
    <div className="space-y-4">
      <StatBand
        items={[
          { label: "Total Requests", value: l.total },
          { label: "Pending", value: l.pending, tone: l.pending > 0 ? "text-warning" : "text-foreground" },
          { label: "Approved", value: l.approved, tone: "text-success" },
          { label: "Days Taken", value: rows.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.days, 0).toFixed(1) },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={<CalendarOff className="h-5 w-5" />} title="No leave requests" description="This employee has not filed any leave requests." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={rows}
            columns={columns}
            storageKey="employee-leaves"
            hideable
            exportFileName={`leaves-${employee.name}`}
            initialSort={{ key: "startDate", direction: "desc" }}
            searchable
            searchPlaceholder="Search type, reason, status…"
            pageSize={25}
            emptyState={<EmptyState size="compact" icon={<AlertCircle />} title="No matching requests" description="Adjust the search or filters." />}
          />
        </div>
      )}

      {canManage && (
        <div className="flex justify-end">
          <Link href="/hr/leaves">
            <Button variant="outline" size="sm"><CalendarOff className="h-3.5 w-3.5" /> Manage All Leaves</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Crew tab
// ───────────────────────────────────────────────────────────────

function CrewTab({ employee }: { employee: EmployeeProfileData }) {
  const crews = employee.supervisedCrews;

  return (
    <div className="space-y-4">
      {/* Membership */}
      <SectionCard title="Crew Membership" icon={Users}>
        {employee.crewName ? (
          <div className="flex items-center justify-between rounded-md bg-subtle px-3 py-2.5">
            <div>
              <div className="font-medium text-foreground">{employee.crewName}</div>
              {employee.crewProjectName && <div className="text-meta text-muted-foreground">on {employee.crewProjectName}</div>}
            </div>
            <Badge variant="brand">Member</Badge>
          </div>
        ) : (
          <p className="py-3 text-center text-body text-muted-foreground">Not a member of any crew</p>
        )}
      </SectionCard>

      {/* Supervised crews */}
      <SectionCard title="Supervised Crews" icon={UsersRound}>
        {crews.length === 0 ? (
          <p className="py-3 text-center text-body text-muted-foreground">Does not supervise any crews</p>
        ) : (
          <div className="space-y-1.5">
            {crews.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md bg-subtle px-3 py-2.5">
                <div>
                  <div className="font-medium text-foreground">{c.name}</div>
                  <div className="text-meta text-muted-foreground">
                    {c.projectName ? c.projectName : "Floating crew"} · {c.memberCount} member{c.memberCount !== 1 ? "s" : ""}
                  </div>
                </div>
                <Badge variant={c.active ? "success" : "muted"} dot>{c.active ? "Active" : "Inactive"}</Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Shared section card + detail row
// ───────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, action, children }: { title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-raised">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-label font-semibold text-foreground">{title}</span>
        </div>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Dossier tab — attachments + benefits
// ───────────────────────────────────────────────────────────────

function DossierTab({ employee, canManage }: { employee: EmployeeProfileData; canManage: boolean }) {
  const { attachments, benefits } = employee;

  return (
    <div className="space-y-4">
      {/* Attachments */}
      <SectionCard title="Documents & Attachments" icon={Paperclip}>
        {attachments.length === 0 ? (
          <p className="py-3 text-center text-body text-muted-foreground">No documents on file</p>
        ) : (
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md bg-subtle px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground truncate">
                    {a.label || a.upload.originalName}
                  </div>
                  <div className="text-meta text-muted-foreground">
                    {a.category} · {formatDate(a.createdAt)}
                  </div>
                </div>
                <a
                  href={a.upload.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 ml-2 text-meta text-brand-strong hover:underline"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Benefits */}
      <SectionCard title="Benefits & Allowances" icon={Gift}>
        {benefits.length === 0 ? (
          <p className="py-3 text-center text-body text-muted-foreground">No benefits assigned</p>
        ) : (
          <div className="space-y-1.5">
            {benefits.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-md bg-subtle px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground">{b.type}</span>
                    <Badge variant={b.active ? "success" : "muted"} dot>{b.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="text-meta text-muted-foreground">
                    {b.amount != null ? formatCurrency(b.amount) : "—"}
                    {b.frequency ? ` · ${b.frequency}` : ""}
                    {b.startDate ? ` · from ${formatDate(b.startDate)}` : ""}
                  </div>
                  {b.notes && <div className="text-meta text-muted-foreground mt-0.5">{b.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
