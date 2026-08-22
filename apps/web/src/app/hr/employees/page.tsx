import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { PageHeader } from "@/components/page-header";
import { EmployeesView } from "@/components/hr/employees-view";

import { NoAccess } from "@/components/no-access";
export default function EmployeesPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading employees…" variant="list" />}>
      <EmployeesContent />
    </Suspense>
  );
}

async function EmployeesContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return (
      <NoAccess what="employees" />
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.HR_MANAGE),
    canEdit: hasPermission(role, PERM.HR_MANAGE),
    canManage: hasPermission(role, PERM.HR_MANAGE),
  };

  const [employees, crews, crewRows, projects] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        crew: { select: { id: true, name: true } },
        activeProject: { select: { id: true, name: true } },
      },
    }),
    prisma.crew.findMany({
      where: { companyId: company.id, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.crew.findMany({
      where: { companyId: company.id },
      orderBy: { name: "asc" },
      include: {
        project: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        members: {
          where: { deletedAt: null },
          select: { id: true, name: true, trade: true, dailyRate: true, wageType: true, active: true },
          orderBy: { name: "asc" },
        },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = employees.map((e) => ({
    id: e.id,
    name: e.name,
    trade: e.trade,
    phone: e.phone,
    email: e.email,
    dailyRate: toNum(e.dailyRate),
    wageType: e.wageType,
    monthlySalary: e.monthlySalary ? toNum(e.monthlySalary) : null,
    designation: e.designation,
    joinDate: e.joinDate?.toISOString() ?? null,
    crewId: e.crewId,
    crewName: e.crew?.name ?? null,
    activeProjectId: e.activeProjectId,
    activeProjectName: e.activeProject?.name ?? null,
    active: e.active,
  }));

  const crewRowsMapped = crewRows.map((c) => ({
    id: c.id,
    name: c.name,
    projectId: c.projectId,
    projectName: c.project?.name ?? null,
    supervisorId: c.supervisorId,
    supervisorName: c.supervisor?.name ?? null,
    active: c.active,
    members: c.members.map((m) => ({
      id: m.id,
      name: m.name,
      trade: m.trade,
      dailyRate: toNum(m.dailyRate),
      wageType: m.wageType,
      active: m.active,
    })),
  }));

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage your workforce — employee records, designations, wage types, and crew assignments."
        stats={[
          { label: "Employees", value: rows.length },
          { label: "Active", value: rows.filter(e => e.active).length },
          { label: "Crews", value: crewRowsMapped.length },
        ]}
      />
      <EmployeesView
        employees={rows}
        crews={crews.map((c) => ({ id: c.id, name: c.name }))}
        crewRows={crewRowsMapped}
        crewEmployees={employees.map((e) => ({ id: e.id, name: e.name, trade: e.trade }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        permissions={perms}
      />
    </>
  );
}
