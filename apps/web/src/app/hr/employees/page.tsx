import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, scopeWhere, getCurrentUser, getActionPermissions, getScopedFormOptions, getUserPermissions, getEmployeeAccessScope } from "@/lib/server";
import { PERM } from "@/lib/roles";
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
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.HR_VIEW)) {
    return (
      <NoAccess what="employees" />
    );
  }

  const actions = await getActionPermissions();
  const scopedOpts = await getScopedFormOptions();
  // Field-visibility policy: wages/dossier data requires payroll.manage or
  // hr.manage — hr.view-only callers get the roster without comp fields.
  const accessScope = await getEmployeeAccessScope();
  const canSeePayroll = accessScope.canSeePayroll;
  const canSeeBank = accessScope.canSeeBankDetails;
  const canSeeDocs = accessScope.canSeePersonalDocs;
  const perms = {
    canCreate: actions?.canCreateEmployee ?? __effPerms.includes(PERM.HR_MANAGE),
    canEdit: actions?.canCreateEmployee ?? __effPerms.includes(PERM.HR_MANAGE),
    canManage: __effPerms.includes(PERM.HR_MANAGE)};

  const [employees, crews, crewRows, locations, memberships] = await Promise.all([
    prisma.employee.findMany({
      take: 500,
      where: { ...await scopeWhere("Employee"), companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        crew: { select: { id: true, name: true } },
        activeProject: { select: { id: true, name: true } },
        reportingLocation: { select: { id: true, name: true } }}}),
    prisma.crew.findMany({
      take: 200,
      where: {...await scopeWhere("Crew"),  companyId: company.id, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" }}),
    prisma.crew.findMany({
      take: 500,
      where: {...await scopeWhere("Crew"),  companyId: company.id },
      orderBy: { name: "asc" },
      include: {
        project: { select: { id: true, name: true } },
        supervisor: { select: { id: true, name: true } },
        members: {
          where: { deletedAt: null },
          select: { id: true, name: true, trade: true, dailyRate: true, wageType: true, active: true },
          orderBy: { name: "asc" }}}}),
    prisma.stockLocation.findMany({
      take: 200,
      where: {
        companyId: company.id, deletedAt: null,
        ...(actions.allowedProjectIds ? { projectId: { in: actions.allowedProjectIds } } : {})},
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" }}),
    // All company memberships — used to populate the Reports To selector and
    // to resolve each employee's current reportsToUserCompanyId.
    // Filtered to the viewer's scope: only users with an employee record in scope.
    prisma.userCompany.findMany({
      where: {
        companyId: company.id,
        user: {
          active: true,
          employees: { some: { ...await scopeWhere("Employee"), companyId: company.id, deletedAt: null } }}},
      select: {
        id: true,
        userId: true,
        role: true,
        reportsToUserCompanyId: true,
        user: { select: { id: true, name: true, active: true } }}}),
  ]);
  const projects = scopedOpts.projects;

  // ── Viewer hierarchy level — for client-side per-row action gating ──
  // Computing canManageSpecificEmployee for every employee in a list is
  // expensive (DB query per employee). Instead, fetch the viewer's
  // hierarchyLevel once and let the client compare per row.
  const currentUser = await getCurrentUser();
  const viewerEmployee = await prisma.employee.findFirst({
    where: { userId: currentUser?.id, companyId: company.id, deletedAt: null },
    select: { hierarchyLevel: true }}).catch(() => null);

  // Map userId → membershipId + reportsToUserCompanyId for quick lookup.
  const membershipByUserId = new Map(memberships.map((m) => [m.userId, m]));
  const potentialManagers = memberships
    .filter((m) => m.user.active)
    .map((m) => ({ membershipId: m.id, name: m.user.name, role: m.role }));

  const rows = employees.map((e) => ({
    id: e.id,
    name: e.name,
    trade: e.trade,
    phone: e.phone,
    email: e.email,
    dailyRate: canSeePayroll ? toNum(e.dailyRate) : null,
    wageType: e.wageType,
    monthlySalary: canSeePayroll && e.monthlySalary ? toNum(e.monthlySalary) : null,
    designation: e.designation,
    joinDate: e.joinDate?.toISOString() ?? null,
    crewId: e.crewId,
    crewName: e.crew?.name ?? null,
    activeProjectId: e.activeProjectId,
    activeProjectName: e.activeProject?.name ?? null,
    active: e.active,
    hierarchyLevel: e.hierarchyLevel,
    reportingLocationId: e.reportingLocationId,
    reportingLocationName: e.reportingLocation?.name ?? null,
    employmentType: canSeePayroll ? e.employmentType : null,
    noticePeriodDays: canSeePayroll ? e.noticePeriodDays : null,
    contractStartDate: canSeePayroll ? (e.contractStartDate?.toISOString() ?? null) : null,
    contractEndDate: canSeePayroll ? (e.contractEndDate?.toISOString() ?? null) : null,
    payDay: canSeePayroll ? e.payDay : null,
    bankAccountHolder: canSeeBank ? e.bankAccountHolder : null,
    bankAccountNumber: canSeeBank ? e.bankAccountNumber : null,
    bankIfsc: canSeeBank ? e.bankIfsc : null,
    bankName: canSeeBank ? e.bankName : null,
    bankBranch: canSeeBank ? e.bankBranch : null,
    panNumber: canSeeDocs ? e.panNumber : null,
    aadhaarNumber: canSeeDocs ? e.aadhaarNumber : null,
    pfNumber: canSeeDocs ? e.pfNumber : null,
    esiNumber: canSeeDocs ? e.esiNumber : null,
    uan: canSeeDocs ? e.uan : null,
    emergencyContactName: e.emergencyContactName,
    emergencyContactPhone: e.emergencyContactPhone,
    emergencyContactRelation: e.emergencyContactRelation,
    permanentAddress: canSeeDocs ? e.permanentAddress : null,
    currentAddress: canSeeDocs ? e.currentAddress : null,
    dateOfBirth: canSeeDocs ? (e.dateOfBirth?.toISOString() ?? null) : null,
    bloodGroup: e.bloodGroup,
    userId: e.userId,
    reportsToMembershipId: e.userId ? (membershipByUserId.get(e.userId)?.reportsToUserCompanyId ?? null) : null}));

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
      dailyRate: canSeePayroll ? toNum(m.dailyRate) : null,
      wageType: m.wageType,
      active: m.active}))}));

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
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        potentialManagers={potentialManagers}
        permissions={perms}
        viewerHierarchyLevel={viewerEmployee?.hierarchyLevel ?? null}
      />
    </>
  );
}
