import { Suspense } from "react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileEmployeeDetailClient } from "./MobileEmployeeDetailClient";

export default function MobileEmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileEmployeeDetailContent params={params} />
    </Suspense>
  );
}

async function MobileEmployeeDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.HR_MANAGE);
  const { id } = await params;

  // Hierarchical RBAC: a PROJECT-scoped user only sees employees on their sites.
  const scope = await getUserScope();
  const employeeProjectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { activeProjectId: { in: scope.projectIds } }
      : {};

  const [employee, projects, stockLocations] = await Promise.all([
    prisma.employee.findFirst({
      where: { id, companyId: company.id, deletedAt: null, ...employeeProjectFilter },
      include: {
        crew: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
        activeProject: { select: { id: true, name: true } },
        reportingLocation: { select: { id: true, name: true } },
        user: {
          select: {
            id: true, name: true, email: true, role: true, phone: true, image: true,
            employeeCode: true, designation: true, department: true,
            joiningDate: true, employmentEndDate: true, active: true, lastLoginAt: true,
          },
        },
        supervisedCrews: {
          select: {
            id: true, name: true, active: true,
            project: { select: { id: true, name: true } },
            _count: { select: { members: true } },
          },
        },
        attendances: {
          orderBy: { date: "desc" },
          take: 60,
          include: { project: { select: { id: true, name: true } } },
        },
        payrollLines: {
          orderBy: { payrollPeriod: { year: "desc" } },
          take: 24,
          include: {
            payrollPeriod: {
              select: {
                id: true, month: true, year: true, status: true, paidAt: true,
              },
            },
          },
        },
        dprLaborLines: {
          orderBy: { dpr: { date: "desc" } },
          take: 30,
          include: {
            dpr: {
              select: {
                id: true, date: true, approvalStatus: true, workType: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        },
        leaveRequests: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { approvedBy: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!employee) {
    return (
      <>
        <MobileEmployeeDetailClient notFound canManage={canManage} projects={projects} stockLocations={stockLocations} />
      </>
    );
  }

  // Tasks are assigned to the linked User.
  let tasks: Array<{
    id: string; title: string; status: string; priority: string;
    dueDate: string | null; completedAt: string | null; assignedByName: string | null;
  }> = [];
  if (employee.userId) {
    const taskRows = await prisma.task.findMany({
      where: { assignedToId: employee.userId },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: { assignedBy: { select: { name: true } } },
    });
    tasks = taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      assignedByName: t.assignedBy?.name ?? null,
    }));
  }

  const recent30 = employee.attendances.slice(0, 30);
  const presentDays = recent30.filter((a) => a.status === "PRESENT" || a.status === "OVERTIME").length;
  const halfDays = recent30.filter((a) => a.status === "HALF_DAY").length;
  const lateDays = recent30.filter((a) => a.status === "LATE").length;
  const absentDays = recent30.filter((a) => a.status === "ABSENT").length;

  const payrollHistory = employee.payrollLines.map((l) => ({
    id: l.id,
    month: l.payrollPeriod.month,
    year: l.payrollPeriod.year,
    status: l.payrollPeriod.status,
    daysWorked: toNum(l.daysWorked),
    grossPay: toNum(l.grossPay),
    totalDeductions: toNum(l.totalDeductions),
    netPay: toNum(l.netPay),
    paidAt: l.payrollPeriod.paidAt?.toISOString() ?? null,
  }));
  const totalNetPaid = payrollHistory.filter((p) => p.status === "PAID").reduce((s, p) => s + p.netPay, 0);

  const leaveHistory = employee.leaveRequests.map((l) => ({
    id: l.id,
    type: l.type,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    days: toNum(l.days),
    reason: l.reason,
    status: l.status,
    approvedByName: l.approvedBy?.name ?? null,
  }));

  const dprHistory = employee.dprLaborLines.map((d) => ({
    id: d.id,
    date: d.dpr.date.toISOString(),
    projectName: d.dpr.project?.name ?? null,
    workType: d.dpr.workType,
    approvalStatus: d.dpr.approvalStatus,
    hoursWorked: toNum(d.hoursWorked),
    taskDescription: d.taskDescription,
  }));
  const totalDprHours = dprHistory.reduce((s, d) => s + d.hoursWorked, 0);

  const data = {
    id: employee.id,
    name: employee.name,
    trade: employee.trade,
    designation: employee.designation,
    phone: employee.phone,
    email: employee.email,
    wageType: employee.wageType as "DAILY" | "MONTHLY" | "FIXED",
    dailyRate: employee.dailyRate != null ? toNum(employee.dailyRate) : null,
    monthlySalary: employee.monthlySalary != null ? toNum(employee.monthlySalary) : null,
    joinDate: employee.joinDate ? employee.joinDate.toISOString() : null,
    hierarchyLevel: employee.hierarchyLevel,
    active: employee.active,
    crewName: employee.crew?.name ?? null,
    crewProjectName: employee.crew?.project?.name ?? null,
    activeProjectName: employee.activeProject?.name ?? null,
    reportingLocationName: employee.reportingLocation?.name ?? null,
    userId: employee.userId,
    user: employee.user
      ? {
          email: employee.user.email,
          role: employee.user.role,
          phone: employee.user.phone,
          image: employee.user.image,
          employeeCode: employee.user.employeeCode,
          department: employee.user.department,
          joiningDate: employee.user.joiningDate ? employee.user.joiningDate.toISOString() : null,
          active: employee.user.active,
          lastLoginAt: employee.user.lastLoginAt ? employee.user.lastLoginAt.toISOString() : null,
        }
      : null,
    supervisedCrews: employee.supervisedCrews.map((c) => ({
      id: c.id, name: c.name, active: c.active,
      projectName: c.project?.name ?? null, memberCount: c._count.members,
    })),
    attendances: employee.attendances.map((a) => ({
      id: a.id,
      date: a.date.toISOString(),
      status: a.status,
      checkIn: a.checkIn?.toISOString() ?? null,
      checkOut: a.checkOut?.toISOString() ?? null,
      hoursWorked: a.hoursWorked ? toNum(a.hoursWorked) : null,
      projectName: a.project?.name ?? null,
    })),
    attendanceStats: { presentDays, halfDays, lateDays, absentDays, total: employee.attendances.length },
    payrollHistory,
    payrollStats: { totalNetPaid, count: payrollHistory.length },
    tasks,
    dprHistory,
    dprStats: { totalHours: totalDprHours, count: dprHistory.length },
    leaveHistory,
    leaveStats: {
      pending: leaveHistory.filter((l) => l.status === "PENDING").length,
      approved: leaveHistory.filter((l) => l.status === "APPROVED").length,
      total: leaveHistory.length,
    },
  };

  return (
    <>
      <MobileEmployeeDetailClient
        employee={data}
        canManage={canManage}
        projects={projects}
        stockLocations={stockLocations}
      />
    </>
  );
}
