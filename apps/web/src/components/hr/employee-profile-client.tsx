"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { DocumentViewer, useDocumentViewer } from "@/components/document-viewer/document-viewer";
import {
  ArrowLeft, Phone, Mail, Briefcase, Calendar, MapPin, Users, UsersRound,
  Wallet, Clock, ListChecks, FileText, CalendarOff, Pencil, Trash2,
  CheckCircle2, Circle, AlertCircle, Loader2, UserCircle,
  IdCard, Building2, Navigation, Activity, Paperclip, Gift,
  UserPlus, Ban, RefreshCw, Sparkles, Check, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { MoneyCell, DateCell } from "@/components/ui/cells";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { CreateAccountDialog } from "@/components/hr/create-account-dialog";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useTabParam } from "@/lib/use-tab-param";
import { useHydratedDate } from "@/lib/use-hydrated-date";
import { AttachmentList } from "@/components/attachments/attachment-list";

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
  departmentId: string | null;
  departmentName: string | null;
  userId: string | null;
  // ── Reporting line (from UserCompany.reportsTo) ──
  reportsTo: { membershipId: string; userId: string; name: string; role: string } | null;
  directReports: { membershipId: string; userId: string; name: string; role: string }[];
  reportsToMembershipId: string | null;
  // ── Dossier fields ──
  employmentType: "PERMANENT" | "CONTRACT" | "CASUAL" | "PROBATION" | "INTERN" | null;
  probationEndDate: string | null;
  confirmationDate: string | null;
  noticePeriodDays: number | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  // ── Contract / agreement tracking ──
  contractStatus: "DRAFT" | "ISSUED" | "CONFIRMED" | "EXPIRED" | "TERMINATED" | null;
  contractIssuedAt: string | null;
  contractConfirmedAt: string | null;
  // ── Offer / appointment / ID card tracking ──
  offerLetterStatus: "DRAFT" | "ISSUED" | "CONFIRMED" | "EXPIRED" | "TERMINATED" | null;
  offerLetterIssuedAt: string | null;
  appointmentLetterStatus: "DRAFT" | "ISSUED" | "CONFIRMED" | "EXPIRED" | "TERMINATED" | null;
  appointmentLetterIssuedAt: string | null;
  idCardStatus: "DRAFT" | "ISSUED" | "CONFIRMED" | "EXPIRED" | "TERMINATED" | null;
  idCardIssuedAt: string | null;
  // ── Onboarding checklist ──
  documentsSubmitted: boolean | null;
  backgroundVerified: boolean | null;
  onboardingComplete: boolean | null;
  // ── Salary structure (for onboarding step) ──
  hasSalaryComponents: boolean;
  // ── Auto-deposit ──
  autoDepositEnabled: boolean | null;
  autoDepositSetupAt: string | null;
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
  departments: { id: string; name: string; active: boolean }[];
  // ── Multi-company: other companies this employee works in ──
  companyMemberships: { companyId: string; companyName: string; employeeId: string; active: boolean }[];
  // ── Multi-company: companies available to add the employee to ──
  availableCompanies: { id: string; name: string; parentCompanyId: string | null }[];
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
  actorRole,
  permissions,
}: {
  employee: EmployeeProfileData;
  actorRole: string;
  permissions: { canManage: boolean; canManagePayroll: boolean; canAssignTasks: boolean };
}) {
  const [tab, setTab] = useTabParam(
    ["overview", "attendance", "payroll", "tasks", "dprs", "leaves", "crew", "reports", "dossier"] as const,
    "overview",
  );
  const router = useRouter();
  const docViewer = useDocumentViewer();
  const [showDelete, setShowDelete] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [showSetupDeposit, setShowSetupDeposit] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<
    { id: string; phoneNumber: string; label: string | null; department: string | null; status: string; monthlyCost: number | null; provider: string | null }[]
  >([]);

  const openTasks = employee.tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const completedTasks = employee.tasks.filter((t) => t.status === "COMPLETED").length;
  void openTasks; void completedTasks; // reserved for future stats summary

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
          <ProfileSidebar
            employee={employee}
            canManage={permissions.canManage}
            canManagePayroll={permissions.canManagePayroll}
            onCreateAccount={async () => {
              // Fetch available phone numbers
              try {
                const res = await fetch("/api/telephony/numbers/available");
                if (res.ok) {
                  const data = await res.json();
                  setAvailableNumbers(data);
                }
              } catch (err) { console.warn("Failed to load available numbers:", err); }
              setShowCreateAccount(true);
            }}
            onTerminate={() => setShowTerminate(true)}
            onGenerateAgreement={async () => {
              try {
                const res = await fetch(`/api/employees/${employee.id}/generate-agreement`, { method: "POST" });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                toast.success(data.message ?? "Agreement generated");
                router.refresh();
              } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : "Failed to generate agreement");
              }
            }}
            onConfirmAgreement={async () => {
              try {
                const res = await fetch(`/api/employees/${employee.id}/confirm-agreement`, { method: "POST" });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                toast.success(data.message ?? "Agreement confirmed");
                router.refresh();
              } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : "Failed to confirm agreement");
              }
            }}
            onGenerateAndConfirm={async () => {
              try {
                // Step 1: Generate
                const genRes = await fetch(`/api/employees/${employee.id}/generate-agreement`, { method: "POST" });
                const genData = await genRes.json();
                if (!genRes.ok) throw new Error(genData.error);
                // Step 2: Confirm
                const confRes = await fetch(`/api/employees/${employee.id}/confirm-agreement`, { method: "POST" });
                const confData = await confRes.json();
                if (!confRes.ok) throw new Error(confData.error);
                toast.success("Agreement generated & confirmed");
                router.refresh();
              } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : "Failed to generate & confirm");
              }
            }}
            onSetupDeposit={() => setShowSetupDeposit(true)}
          />
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
              <TabsTrigger value="reports">Reports</TabsTrigger>
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
              <DossierTab employee={employee} canManage={permissions.canManage} departments={employee.departments} />
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

      {/* Create / Link account dialog */}
      {showCreateAccount && (
        <CreateAccountDialog
          employeeId={employee.id}
          employeeName={employee.name}
          employeePhone={employee.phone}
          employeeEmail={employee.email}
          employeeDesignation={employee.designation}
          employeeHierarchyLevel={employee.hierarchyLevel}
          actorRole={actorRole}
          projects={[]}
          availableNumbers={availableNumbers}
          onClose={() => setShowCreateAccount(false)}
        />
      )}

      {/* Terminate confirm */}
      {showTerminate && (
        <TerminateDialog
          employeeName={employee.name}
          employeeId={employee.id}
          onClose={() => setShowTerminate(false)}
        />
      )}

      {/* Setup auto-deposit dialog */}
      {showSetupDeposit && (
        <SetupDepositDialog
          employeeId={employee.id}
          employeeName={employee.name}
          existingBank={{
            holder: employee.bankAccountHolder,
            number: employee.bankAccountNumber,
            ifsc: employee.bankIfsc,
            name: employee.bankName,
            branch: employee.bankBranch,
            payDay: employee.payDay,
          }}
          onClose={() => setShowSetupDeposit(false)}
        />
      )}

      {/* ── In-page document viewer (FAB pop-up, no redirect) ── */}
      <DocumentViewer url={docViewer.docUrl} title={docViewer.docTitle} onClose={docViewer.closeDoc} />
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
              <h1 className="text-title text-foreground">{employee.name}</h1>
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

function ProfileSidebar({
  employee,
  canManage,
  canManagePayroll,
  onCreateAccount,
  onTerminate,
  onGenerateAgreement,
  onConfirmAgreement,
  onGenerateAndConfirm,
  onSetupDeposit,
}: {
  employee: EmployeeProfileData;
  canManage: boolean;
  canManagePayroll: boolean;
  onCreateAccount: () => void;
  onTerminate: () => void;
  onGenerateAgreement: () => void;
  onConfirmAgreement: () => void;
  onGenerateAndConfirm: () => void;
  onSetupDeposit: () => void;
}) {
  const docViewer = useDocumentViewer();
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
        <SidebarRow icon={Navigation} label="Attendance Site" value={employee.reportingLocationName} hint="GPS geofence" />
        <SidebarRow
          icon={UserCircle}
          label="Reports To"
          value={employee.reportsTo?.name ?? (employee.userId ? null : "Link a user account to set")}
          hint={employee.reportsTo ? employee.reportsTo.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : undefined}
        />
        <SidebarRow
          icon={Users}
          label="Direct Reports"
          value={employee.directReports.length > 0 ? `${employee.directReports.length} person(s)` : null}
        />
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
        <SidebarRow icon={Building2} label="Department" value={employee.departmentName ?? u?.department} />
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

      {/* Multi-company: other companies this employee works in */}
      {employee.companyMemberships.length > 0 && (
        <SidebarCard title="Also Works In" icon={Building2}>
          {employee.companyMemberships.map((m) => (
            <div key={m.employeeId} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <Link
                href={`/hr/employees/${m.employeeId}`}
                className="text-body text-foreground hover:text-brand-strong transition-colors"
              >
                {m.companyName}
              </Link>
              <span
                className="text-meta px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: m.active ? "color-mix(in srgb, var(--go) 12%, transparent)" : "color-mix(in srgb, var(--stop) 12%, transparent)",
                  color: m.active ? "var(--go)" : "var(--stop)",
                }}
              >
                {m.active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
          {employee.availableCompanies.length > 0 && (
            <AddToCompanyButton employeeId={employee.id} companies={employee.availableCompanies} />
          )}
        </SidebarCard>
      )}
      {/* Show the add button even if no existing memberships but available companies exist */}
      {employee.companyMemberships.length === 0 && employee.availableCompanies.length > 0 && (
        <SidebarCard title="Also Works In" icon={Building2}>
          <p className="text-body text-muted-foreground py-1">This employee only works in the current company.</p>
          <AddToCompanyButton employeeId={employee.id} companies={employee.availableCompanies} />
        </SidebarCard>
      )}

      {/* Onboarding Checklist — shows where the employee is in the pipeline */}
      <SidebarCard title="Onboarding Checklist" icon={ListChecks}>
        <OnboardingChecklist employee={employee} canManage={canManage} canManagePayroll={canManagePayroll} />
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
            {canManage && employee.active && (
              <div className="py-2">
                <Button variant="outline" size="sm" className="w-full text-destructive" onClick={onTerminate}>
                  <Ban className="h-3.5 w-3.5" /> Terminate Employee
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="py-2 space-y-2">
            <p className="text-center text-caption text-muted-foreground">
              No linked user account.<br />This worker has no app login.
            </p>
            {canManage && employee.active && (
              <Button variant="outline" size="sm" className="w-full" onClick={onCreateAccount}>
                <UserPlus className="h-3.5 w-3.5" /> Create Login
              </Button>
            )}
          </div>
        )}
      </SidebarCard>

      {/* Employment Agreement */}
      <SidebarCard title="Employment Agreement" icon={FileText}>
        {employee.contractStatus ? (
          <>
            <SidebarRow
              icon={FileText}
              label="Status"
              value={contractStatusLabel(employee.contractStatus)}
            />
            {employee.contractIssuedAt && (
              <SidebarRow icon={Calendar} label="Issued" value={formatDate(employee.contractIssuedAt)} />
            )}
            {employee.contractConfirmedAt && (
              <SidebarRow icon={CheckCircle2} label="Confirmed" value={formatDate(employee.contractConfirmedAt)} />
            )}
            {employee.employmentType && (
              <SidebarRow icon={Briefcase} label="Type" value={employee.employmentType.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} />
            )}
            {canManage && employee.active && (
              <div className="py-2 space-y-1.5">
                <button
                  onClick={() => docViewer.openDoc(`/print/employment-agreement/${employee.id}`, "Employment Agreement")}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-caption font-medium text-foreground hover:bg-muted transition-colors w-full"
                >
                  <FileText className="h-3.5 w-3.5" /> View / Print Agreement
                </button>
                {employee.contractStatus === "ISSUED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onConfirmAgreement}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Agreement
                  </Button>
                )}
                {employee.contractStatus === "DRAFT" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onGenerateAgreement}
                  >
                    <FileText className="h-3.5 w-3.5" /> Generate Agreement
                  </Button>
                )}
                {(employee.contractStatus === "ISSUED" || employee.contractStatus === "CONFIRMED" || employee.contractStatus === "EXPIRED") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={onGenerateAgreement}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate (terms changed)
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="py-2 space-y-2">
            <p className="text-center text-caption text-muted-foreground">
              No employment agreement.<br />Generate one to formalize terms.
            </p>
            {canManage && employee.active && (
              <div className="space-y-1.5">
                <Button size="sm" className="w-full" onClick={onGenerateAndConfirm}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Generate &amp; Confirm
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={onGenerateAgreement}>
                  <FileText className="h-3.5 w-3.5" /> Generate Only
                </Button>
              </div>
            )}
          </div>
        )}
      </SidebarCard>

      {/* Auto-Deposit (Salary → Bank) */}
      <SidebarCard title="Auto-Deposit" icon={Wallet}>
        {employee.autoDepositEnabled ? (
          <>
            <SidebarRow icon={Wallet} label="Status" value="Enabled" />
            <SidebarRow icon={Calendar} label="Pay Day" value={`${employee.payDay ?? 7}th of each month`} />
            <SidebarRow icon={UserCircle} label="Holder" value={employee.bankAccountHolder ?? "—"} />
            <SidebarRow icon={Building2} label="Bank" value={employee.bankName ?? "—"} />
            {employee.bankBranch && (
              <SidebarRow icon={MapPin} label="Branch" value={employee.bankBranch} />
            )}
            <SidebarRow
              icon={Wallet}
              label="Account"
              value={employee.bankAccountNumber ? `****${employee.bankAccountNumber.slice(-4)}` : "—"}
            />
            <SidebarRow icon={Wallet} label="IFSC" value={employee.bankIfsc ?? "—"} />
            {employee.autoDepositSetupAt && (
              <SidebarRow icon={Calendar} label="Setup On" value={formatDate(employee.autoDepositSetupAt)} />
            )}
            {canManagePayroll && employee.active && (
              <Button variant="outline" size="sm" className="w-full" onClick={onSetupDeposit}>
                <Pencil className="h-3.5 w-3.5" /> Edit Bank Details
              </Button>
            )}
          </>
        ) : (
          <div className="py-2 space-y-2">
            {employee.contractStatus !== "CONFIRMED" && (
              <p className="text-center text-meta text-amber-600 dark:text-amber-500">
                {employee.contractStatus
                  ? "Agreement not confirmed yet — bank details can be collected now."
                  : "Agreement not issued yet — bank details can be collected now."}
              </p>
            )}
            {canManagePayroll && employee.active && (
              <Button variant="outline" size="sm" className="w-full" onClick={onSetupDeposit}>
                <Wallet className="h-3.5 w-3.5" /> Setup Auto-Deposit
              </Button>
            )}
          </div>
        )}
      </SidebarCard>
    </div>
  );
}

function contractStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    ISSUED: "Issued (pending confirmation)",
    CONFIRMED: "Confirmed",
    EXPIRED: "Expired",
    TERMINATED: "Terminated",
  };
  return labels[status] ?? status;
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
      render: (r) => r.checkIn ? <span className="tnum text-body">{new Date(r.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span> : <span className="text-muted-foreground">—</span>,
      exportValue: (r) => r.checkIn ?? "",
    },
    {
      key: "checkOut", label: "Check Out", width: "100px",
      render: (r) => r.checkOut ? <span className="tnum text-body">{new Date(r.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span> : <span className="text-muted-foreground">—</span>,
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
  const now = useHydratedDate();
  const open = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const overdue = tasks.filter((t) => t.dueDate && t.status !== "COMPLETED" && now !== null && new Date(t.dueDate) < now).length;

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
        const isOverdue = t.status !== "COMPLETED" && now !== null && new Date(t.dueDate) < now;
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
//  Add-to-company button + dialog
// ───────────────────────────────────────────────────────────────

function AddToCompanyButton({ employeeId, companies }: { employeeId: string; companies: { id: string; name: string; parentCompanyId: string | null }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [targetId, setTargetId] = useState("");

  async function handleAdd() {
    if (!targetId) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/add-to-company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCompanyId: targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add employee to company");
      toast.success(data.message ?? "Employee added to company");
      setOpen(false);
      // Navigate to the new employee's onboarding in the target company
      if (data.newEmployeeId) {
        router.push(`/hr/employees/${data.newEmployeeId}`);
      } else {
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-[0.375rem] text-meta font-bold border border-dashed hover:bg-muted/50 transition-colors"
        style={{ borderColor: "var(--border)" }}
      >
        <Plus className="h-3.5 w-3.5" /> Add to Company
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !adding && setOpen(false)}>
          <div className="bg-card rounded-lg shadow-lg max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-title font-bold mb-1">Add to Company</h3>
            <p className="text-body text-muted-foreground mb-3">
              Select a company to add this employee to. Their personal data will be copied; you&apos;ll complete onboarding for the new company.
            </p>
            <div className="space-y-1.5 mb-3">
              {companies.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 p-2 rounded-[0.375rem] border cursor-pointer transition-colors ${targetId === c.id ? "border-brand-strong bg-brand-wash" : "border-border hover:bg-muted/50"}`}
                >
                  <input
                    type="radio"
                    name="targetCompany"
                    value={c.id}
                    checked={targetId === c.id}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="accent-brand-strong"
                  />
                  <span className="text-body font-medium">{c.name}</span>
                  {c.parentCompanyId === null && (
                    <span className="text-meta px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Parent</span>
                  )}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={adding} className="flex-1">
                Cancel
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={adding || !targetId} className="flex-1">
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add & Onboard
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────
//  Dossier tab — attachments + benefits
// ───────────────────────────────────────────────────────────────

function DossierTab({ employee, canManage, departments }: { employee: EmployeeProfileData; canManage: boolean; departments: { id: string; name: string; active: boolean }[] }) {
  const { attachments, benefits } = employee;
  const router = useRouter();
  const [editingTerms, setEditingTerms] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsForm, setTermsForm] = useState({
    employmentType: employee.employmentType ?? "",
    noticePeriodDays: employee.noticePeriodDays?.toString() ?? "",
    contractStartDate: employee.contractStartDate ? employee.contractStartDate.split("T")[0] : "",
    contractEndDate: employee.contractEndDate ? employee.contractEndDate.split("T")[0] : "",
    probationEndDate: employee.probationEndDate ? employee.probationEndDate.split("T")[0] : "",
    confirmationDate: employee.confirmationDate ? employee.confirmationDate.split("T")[0] : "",
  });

  // Statutory IDs
  const [editingIds, setEditingIds] = useState(false);
  const [savingIds, setSavingIds] = useState(false);
  const [idsForm, setIdsForm] = useState({
    panNumber: employee.panNumber ?? "",
    aadhaarNumber: employee.aadhaarNumber ?? "",
    pfNumber: employee.pfNumber ?? "",
    esiNumber: employee.esiNumber ?? "",
    uan: employee.uan ?? "",
  });

  // Emergency contact
  const [editingEmergency, setEditingEmergency] = useState(false);
  const [savingEmergency, setSavingEmergency] = useState(false);
  const [emergencyForm, setEmergencyForm] = useState({
    emergencyContactName: employee.emergencyContactName ?? "",
    emergencyContactPhone: employee.emergencyContactPhone ?? "",
    emergencyContactRelation: employee.emergencyContactRelation ?? "",
  });

  // Addresses
  const [editingAddress, setEditingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    permanentAddress: employee.permanentAddress ?? "",
    currentAddress: employee.currentAddress ?? "",
  });

  // Department
  const [editingDept, setEditingDept] = useState(false);
  const [savingDept, setSavingDept] = useState(false);
  const [deptId, setDeptId] = useState(employee.departmentId ?? "");

  const saveDossierFields = async (fields: Record<string, unknown>) => {
    const res = await fetch(`/api/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Failed to save");
    }
    toast.success("Dossier updated");
    router.refresh();
  };

  const saveDept = async () => {
    setSavingDept(true);
    try {
      await saveDossierFields({ departmentId: deptId || null });
      setEditingDept(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingDept(false);
    }
  };

  const saveIds = async () => {
    setSavingIds(true);
    try {
      await saveDossierFields({
        panNumber: idsForm.panNumber || null,
        aadhaarNumber: idsForm.aadhaarNumber || null,
        pfNumber: idsForm.pfNumber || null,
        esiNumber: idsForm.esiNumber || null,
        uan: idsForm.uan || null,
      });
      setEditingIds(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingIds(false);
    }
  };

  const saveEmergency = async () => {
    setSavingEmergency(true);
    try {
      await saveDossierFields({
        emergencyContactName: emergencyForm.emergencyContactName || null,
        emergencyContactPhone: emergencyForm.emergencyContactPhone || null,
        emergencyContactRelation: emergencyForm.emergencyContactRelation || null,
      });
      setEditingEmergency(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingEmergency(false);
    }
  };

  const saveAddress = async () => {
    setSavingAddress(true);
    try {
      await saveDossierFields({
        permanentAddress: addressForm.permanentAddress || null,
        currentAddress: addressForm.currentAddress || null,
      });
      setEditingAddress(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingAddress(false);
    }
  };

  const saveTerms = async () => {
    setSavingTerms(true);
    try {
      await saveDossierFields({
        employmentType: termsForm.employmentType || null,
        noticePeriodDays: termsForm.noticePeriodDays ? Number(termsForm.noticePeriodDays) : null,
        contractStartDate: termsForm.contractStartDate || null,
        contractEndDate: termsForm.contractEndDate || null,
        probationEndDate: termsForm.probationEndDate || null,
        confirmationDate: termsForm.confirmationDate || null,
      });
      setEditingTerms(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingTerms(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Department — editable */}
      <SectionCard
        title="Department"
        icon={Building2}
        action={canManage && !editingDept ? (
          <button onClick={() => setEditingDept(true)} className="text-meta text-brand-strong hover:underline">Edit</button>
        ) : undefined}
      >
        {editingDept ? (
          <div className="space-y-3 py-1">
            <Select value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">— None —</option>
              {departments.filter((d) => d.active).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveDept} disabled={savingDept}>
                {savingDept ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingDept(false); setDeptId(employee.departmentId ?? ""); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-body text-foreground">{employee.departmentName ?? "—"}</p>
        )}
      </SectionCard>

      {/* Employment Terms — editable */}
      <SectionCard
        title="Employment Terms"
        icon={Briefcase}
        action={canManage && !editingTerms ? (
          <button onClick={() => setEditingTerms(true)} className="text-meta text-brand-strong hover:underline">Edit</button>
        ) : undefined}
      >
        {editingTerms ? (
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Employment Type</Label>
                <Select value={termsForm.employmentType} onChange={(e) => setTermsForm((f) => ({ ...f, employmentType: e.target.value }))}>
                  <option value="">— Select —</option>
                  <option value="PERMANENT">Permanent</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="CASUAL">Casual</option>
                  <option value="PROBATION">Probation</option>
                  <option value="INTERN">Intern</option>
                </Select>
              </div>
              <div>
                <Label>Notice Period (days)</Label>
                <Input type="number" min="0" value={termsForm.noticePeriodDays} onChange={(e) => setTermsForm((f) => ({ ...f, noticePeriodDays: e.target.value }))} />
              </div>
              <div>
                <Label>Contract Start Date</Label>
                <Input type="date" value={termsForm.contractStartDate} onChange={(e) => setTermsForm((f) => ({ ...f, contractStartDate: e.target.value }))} />
              </div>
              <div>
                <Label>Contract End Date</Label>
                <Input type="date" value={termsForm.contractEndDate} onChange={(e) => setTermsForm((f) => ({ ...f, contractEndDate: e.target.value }))} />
              </div>
              <div>
                <Label>Probation End Date</Label>
                <Input type="date" value={termsForm.probationEndDate} onChange={(e) => setTermsForm((f) => ({ ...f, probationEndDate: e.target.value }))} />
              </div>
              <div>
                <Label>Confirmation Date</Label>
                <Input type="date" value={termsForm.confirmationDate} onChange={(e) => setTermsForm((f) => ({ ...f, confirmationDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingTerms(false)} disabled={savingTerms}>Cancel</Button>
              <Button size="sm" onClick={saveTerms} disabled={savingTerms}>
                {savingTerms ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save Terms
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 py-1">
            <DossierRow label="Employment Type" value={employee.employmentType ? employee.employmentType.charAt(0) + employee.employmentType.slice(1).toLowerCase() : "—"} />
            <DossierRow label="Notice Period" value={employee.noticePeriodDays ? `${employee.noticePeriodDays} days` : "—"} />
            <DossierRow label="Contract Start" value={employee.contractStartDate ? formatDate(employee.contractStartDate) : "—"} />
            <DossierRow label="Contract End" value={employee.contractEndDate ? formatDate(employee.contractEndDate) : "—"} />
            <DossierRow label="Probation End" value={employee.probationEndDate ? formatDate(employee.probationEndDate) : "—"} />
            <DossierRow label="Confirmation Date" value={employee.confirmationDate ? formatDate(employee.confirmationDate) : "—"} />
          </div>
        )}
      </SectionCard>

      {/* Statutory IDs — editable */}
      <SectionCard
        title="Statutory IDs"
        icon={IdCard}
        action={canManage && !editingIds ? (
          <button onClick={() => setEditingIds(true)} className="text-meta text-brand-strong hover:underline">Edit</button>
        ) : undefined}
      >
        {editingIds ? (
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>PAN Number</Label><Input value={idsForm.panNumber} onChange={(e) => setIdsForm((f) => ({ ...f, panNumber: e.target.value }))} placeholder="ABCDE1234F" /></div>
              <div><Label>Aadhaar Number</Label><Input value={idsForm.aadhaarNumber} onChange={(e) => setIdsForm((f) => ({ ...f, aadhaarNumber: e.target.value }))} placeholder="XXXX XXXX XXXX" /></div>
              <div><Label>PF Number</Label><Input value={idsForm.pfNumber} onChange={(e) => setIdsForm((f) => ({ ...f, pfNumber: e.target.value }))} placeholder="PF account number" /></div>
              <div><Label>ESI Number</Label><Input value={idsForm.esiNumber} onChange={(e) => setIdsForm((f) => ({ ...f, esiNumber: e.target.value }))} placeholder="ESI insurance number" /></div>
              <div><Label>UAN</Label><Input value={idsForm.uan} onChange={(e) => setIdsForm((f) => ({ ...f, uan: e.target.value }))} placeholder="Universal Account Number" /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingIds(false)} disabled={savingIds}>Cancel</Button>
              <Button size="sm" onClick={saveIds} disabled={savingIds}>
                {savingIds ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save IDs
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 py-1">
            <DossierRow label="PAN" value={employee.panNumber ?? "—"} />
            <DossierRow label="Aadhaar" value={employee.aadhaarNumber ?? "—"} />
            <DossierRow label="PF Number" value={employee.pfNumber ?? "—"} />
            <DossierRow label="ESI Number" value={employee.esiNumber ?? "—"} />
            <DossierRow label="UAN" value={employee.uan ?? "—"} />
          </div>
        )}
      </SectionCard>

      {/* Emergency Contact — editable */}
      <SectionCard
        title="Emergency Contact"
        icon={Phone}
        action={canManage && !editingEmergency ? (
          <button onClick={() => setEditingEmergency(true)} className="text-meta text-brand-strong hover:underline">Edit</button>
        ) : undefined}
      >
        {editingEmergency ? (
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={emergencyForm.emergencyContactName} onChange={(e) => setEmergencyForm((f) => ({ ...f, emergencyContactName: e.target.value }))} /></div>
              <div><Label>Contact Phone</Label><Input value={emergencyForm.emergencyContactPhone} onChange={(e) => setEmergencyForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))} placeholder="Mobile number" /></div>
              <div className="col-span-2"><Label>Relation</Label><Input value={emergencyForm.emergencyContactRelation} onChange={(e) => setEmergencyForm((f) => ({ ...f, emergencyContactRelation: e.target.value }))} placeholder="Spouse, Parent, Sibling…" /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingEmergency(false)} disabled={savingEmergency}>Cancel</Button>
              <Button size="sm" onClick={saveEmergency} disabled={savingEmergency}>
                {savingEmergency ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save Contact
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 py-1">
            <DossierRow label="Name" value={employee.emergencyContactName ?? "—"} />
            <DossierRow label="Phone" value={employee.emergencyContactPhone ?? "—"} />
            <DossierRow label="Relation" value={employee.emergencyContactRelation ?? "—"} />
          </div>
        )}
      </SectionCard>

      {/* Addresses — editable */}
      <SectionCard
        title="Addresses"
        icon={MapPin}
        action={canManage && !editingAddress ? (
          <button onClick={() => setEditingAddress(true)} className="text-meta text-brand-strong hover:underline">Edit</button>
        ) : undefined}
      >
        {editingAddress ? (
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label>Permanent Address</Label>
              <textarea
                value={addressForm.permanentAddress}
                onChange={(e) => setAddressForm((f) => ({ ...f, permanentAddress: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
                placeholder="House no, street, city, state, PIN"
              />
            </div>
            <div className="space-y-2">
              <Label>Current Address</Label>
              <textarea
                value={addressForm.currentAddress}
                onChange={(e) => setAddressForm((f) => ({ ...f, currentAddress: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
                placeholder="House no, street, city, state, PIN"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingAddress(false)} disabled={savingAddress}>Cancel</Button>
              <Button size="sm" onClick={saveAddress} disabled={savingAddress}>
                {savingAddress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save Addresses
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 py-1">
            <div>
              <div className="text-caption text-muted-foreground mb-0.5">Permanent</div>
              <div className="text-caption text-foreground whitespace-pre-wrap">{employee.permanentAddress ?? "—"}</div>
            </div>
            <div>
              <div className="text-caption text-muted-foreground mb-0.5">Current</div>
              <div className="text-caption text-foreground whitespace-pre-wrap">{employee.currentAddress ?? "—"}</div>
            </div>
          </div>
        )}
      </SectionCard>

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

      <AttachmentList entityType="Employee" entityId={employee.id} />

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

// ───────────────────────────────────────────────────────────────
//  Terminate Dialog — soft-deletes employee + disables login + recycles phone
// ───────────────────────────────────────────────────────────────

function TerminateDialog({
  employeeName,
  employeeId,
  onClose,
}: {
  employeeName: string;
  employeeId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("Terminated by admin");
  const [saving, setSaving] = useState(false);

  async function handleTerminate() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to terminate");
      toast.success(data.message ?? "Employee terminated");
      router.refresh();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Terminate ${employeeName}`}
      description="This permanently terminates the employee. Their login is disabled and phone number recycled. All history is preserved."
      size="sm"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-label font-medium text-foreground">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
            placeholder="Termination reason"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="destructive" onClick={handleTerminate} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Terminate
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────
//  Setup Auto-Deposit Dialog — bank details + payday for salary credit
// ───────────────────────────────────────────────────────────────

function SetupDepositDialog({
  employeeId,
  employeeName,
  existingBank,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  existingBank: {
    holder: string | null;
    number: string | null;
    ifsc: string | null;
    name: string | null;
    branch: string | null;
    payDay: number | null;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const [holder, setHolder] = useState(existingBank.holder ?? employeeName);
  const [accountNumber, setAccountNumber] = useState(existingBank.number ?? "");
  const [ifsc, setIfsc] = useState(existingBank.ifsc ?? "");
  const [bankName, setBankName] = useState(existingBank.name ?? "");
  const [branch, setBranch] = useState(existingBank.branch ?? "");
  const [payDay, setPayDay] = useState(String(existingBank.payDay ?? 7));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!holder.trim() || !accountNumber.trim() || !ifsc.trim() || !bankName.trim()) {
      toast.error("All bank details are required");
      return;
    }
    const pd = Number(payDay);
    if (pd < 1 || pd > 31) {
      toast.error("Pay day must be between 1 and 31");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/setup-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountHolder: holder.trim(),
          bankAccountNumber: accountNumber.trim(),
          bankIfsc: ifsc.trim().toUpperCase(),
          bankName: bankName.trim(),
          bankBranch: branch.trim() || null,
          payDay: pd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message ?? "Auto-deposit enabled");
      router.refresh();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Auto-Deposit Setup — ${employeeName}`}
      description="Configure bank details for automatic salary credit on payday."
      size="sm"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-label font-medium text-foreground">Account Holder Name *</label>
          <input
            type="text"
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
            placeholder="Name as per bank record"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-label font-medium text-foreground">Account Number *</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
              placeholder="1234567890"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-label font-medium text-foreground">IFSC Code *</label>
            <input
              type="text"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
              placeholder="HDFC0001234"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-label font-medium text-foreground">Bank Name *</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
              placeholder="HDFC Bank"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-label font-medium text-foreground">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
              placeholder="Connaught Place"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-label font-medium text-foreground">Pay Day (1-31) *</label>
          <input
            type="number"
            min={1}
            max={31}
            value={payDay}
            onChange={(e) => setPayDay(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground outline-none focus:border-primary"
            placeholder="7"
          />
          <p className="text-caption text-muted-foreground">
            Salary will be auto-credited on this day each month.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Enable Auto-Deposit
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────
//  Onboarding Checklist — pipeline status for the employee
//  12 canonical steps — MUST match /m/hr/onboarding queue + MobileOnboardingTab
//  so "complete" means the same thing on desktop, mobile queue, and mobile detail.
// ───────────────────────────────────────────────────────────────

function OnboardingChecklist({
  employee,
  canManage,
}: {
  employee: EmployeeProfileData;
  canManage: boolean;
  canManagePayroll: boolean;
}) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const hasProfile = !!(employee.name && (employee.phone || employee.user?.phone) && (employee.designation || employee.trade));
  const hasWage = employee.wageType === "DAILY" ? employee.dailyRate > 0 : (employee.monthlySalary ?? 0) > 0;
  const hasEmploymentTerms = !!(
    employee.employmentType &&
    employee.noticePeriodDays != null &&
    (employee.employmentType !== "CONTRACT" || employee.contractStartDate) &&
    (employee.employmentType !== "PROBATION" || employee.contractStartDate)
  );
  const hasSalaryStructure = employee.hasSalaryComponents;
  const documentsSubmitted = employee.documentsSubmitted === true;
  const backgroundVerified = employee.backgroundVerified === true;
  const hasAccount = !!employee.userId;
  const offerLetterIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.offerLetterStatus ?? "");
  const agreementIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? "");
  const agreementConfirmed = ["CONFIRMED", "EXPIRED"].includes(employee.contractStatus ?? "");
  const appointmentLetterIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.appointmentLetterStatus ?? "");
  const idCardIssued = ["ISSUED", "CONFIRMED", "EXPIRED"].includes(employee.idCardStatus ?? "");
  const hasAutoDeposit = employee.autoDepositEnabled === true;

  const steps = [
    { label: "Profile & Wage", done: hasProfile && hasWage, hint: !hasProfile ? "Missing name, phone, or designation" : !hasWage ? "Wage not set" : undefined },
    { label: "Employment Terms", done: hasEmploymentTerms, hint: !hasEmploymentTerms ? "Fill: employment type, notice period" : undefined },
    { label: "Salary Structure", done: hasSalaryStructure, hint: !hasSalaryStructure ? "Add CTC components (Basic, HRA, etc.)" : undefined },
    { label: "Documents", done: documentsSubmitted, hint: !documentsSubmitted ? "Collect PAN, Aadhaar, bank proof, education certs" : undefined },
    { label: "BG Verification", done: backgroundVerified, hint: !backgroundVerified ? "Complete background verification" : undefined },
    { label: "Login Account", done: hasAccount, hint: !hasAccount ? "Create a login account for app access" : undefined },
    { label: "Offer Letter", done: offerLetterIssued, hint: !offerLetterIssued ? "Generate the offer letter" : undefined },
    { label: "Agreement Issued", done: agreementIssued, hint: !agreementIssued ? "Generate the employment agreement" : undefined },
    { label: "Agreement Confirmed", done: agreementConfirmed, hint: agreementIssued && !agreementConfirmed ? "Confirm the signed agreement" : !agreementIssued ? "Issue agreement first" : undefined },
    { label: "Appointment Letter", done: appointmentLetterIssued, hint: !appointmentLetterIssued ? "Generate the appointment letter" : undefined },
    { label: "ID Card", done: idCardIssued, hint: !idCardIssued ? "Generate the employee ID card" : undefined },
    { label: "Auto-Deposit", done: hasAutoDeposit, hint: !hasAutoDeposit ? (agreementConfirmed ? "Set up bank details for salary credit" : "Confirm agreement first") : undefined },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const isComplete = completedCount === steps.length;

  async function completeOnboarding() {
    setCompleting(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/complete-onboarding`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(data.message ?? "Onboarding complete");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="py-2 space-y-1.5">
      {isComplete && (
        <div className="flex items-center gap-1.5 rounded-md bg-green-50 dark:bg-green-950/30 px-2 py-1.5 text-caption text-green-700 dark:text-green-400 mb-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="font-medium">Onboarding complete</span>
        </div>
      )}
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2 py-0.5">
          {step.done ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
          ) : (
            <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          )}
          <div className="min-w-0 flex-1">
            <div className={cn("text-caption", step.done ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
            </div>
            {step.hint && canManage && (
              <div className="text-meta text-muted-foreground/70">{step.hint}</div>
            )}
          </div>
        </div>
      ))}
      {!isComplete && canManage && (
        <div className="pt-1.5 text-meta text-muted-foreground">
          {completedCount}/{steps.length} steps complete
        </div>
      )}
      {canManage && !employee.onboardingComplete && isComplete && (
        <Button onClick={completeOnboarding} disabled={completing} className="w-full mt-2" size="sm">
          {completing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Done — Complete Onboarding
        </Button>
      )}
    </div>
  );
}

function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="text-caption font-medium text-foreground">{value}</span>
    </div>
  );
}
