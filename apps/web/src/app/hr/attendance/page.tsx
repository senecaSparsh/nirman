import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { PageHeader } from "@/components/page-header";
import { AttendanceView } from "@/components/hr/attendance-view";

import { NoAccess } from "@/components/no-access";
export default function AttendancePage() {
  return (
    <Suspense fallback={<PageLoading label="Loading attendance…" variant="list" />}>
      <AttendanceContent />
    </Suspense>
  );
}

async function AttendanceContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return (
      <NoAccess what="attendance" />
    );
  }

  const perms = {
    canEdit: hasPermission(role, PERM.HR_MANAGE),
  };

  const today = new Date();
  const todayDateOnly = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  // Hierarchical RBAC: a PROJECT-scoped user (Sub-Sub-Admin) only sees
  // attendance + employees + project options for their assigned sites.
  const scope = await getUserScope();
  const projectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { projectId: { in: scope.projectIds } }
      : {};
  const employeeProjectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { activeProjectId: { in: scope.projectIds } }
      : {};
  const projectOptionFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const [employees, projects, recentAttendance, leaves, leaveEmployees] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, active: true, ...employeeProjectFilter },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trade: true, activeProjectId: true, crewId: true },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] }, ...projectOptionFilter },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.workerAttendance.findMany({
      where: { companyId: company.id, date: { gte: weekAgo }, ...projectFilter },
      orderBy: { date: "desc" },
      take: 100,
      include: {
        employee: { select: { id: true, name: true, trade: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        employee: { select: { id: true, name: true, trade: true, designation: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, active: true },
      select: { id: true, name: true, trade: true, designation: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const attendanceRows = recentAttendance.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee.name,
    trade: r.employee.trade,
    date: r.date.toISOString(),
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    checkIn: r.checkIn?.toISOString() ?? null,
    checkOut: r.checkOut?.toISOString() ?? null,
    hoursWorked: r.hoursWorked ? toNum(r.hoursWorked) : null,
    status: r.status,
    notes: r.notes,
  }));

  const leaveRows = leaves.map((l) => ({
    id: l.id,
    employeeId: l.employeeId,
    employeeName: l.employee.name,
    employeeTrade: l.employee.trade,
    employeeDesignation: l.employee.designation,
    type: l.type,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    days: toNum(l.days),
    reason: l.reason,
    status: l.status,
    approvedByName: l.approvedBy?.name ?? null,
    approvedAt: l.approvedAt?.toISOString() ?? null,
    rejectedReason: l.rejectedReason,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Daily worker attendance with GPS check-in/out. Track present, absent, half-day, and overtime."
        stats={[
          { label: "Records", value: attendanceRows.length },
          { label: "Pending leaves", value: leaveRows.filter(l => l.status === "PENDING").length },
        ]}
      />
      <AttendanceView
        employees={employees.map((e) => ({ id: e.id, name: e.name, trade: e.trade }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        recentAttendance={attendanceRows}
        todayDate={todayDateOnly.toISOString().split("T")[0] || ""}
        permissions={perms}
        leaveRows={leaveRows}
        leaveEmployees={leaveEmployees.map((e) => ({ id: e.id, name: e.name, trade: e.trade, designation: e.designation }))}
      />
    </>
  );
}
