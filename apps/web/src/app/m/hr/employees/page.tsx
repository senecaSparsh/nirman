import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@nirman/db";
import { Users } from "lucide-react";
import { getCompany, toNum, getEmployeeAccessScope, getActionPermissions, filterOptionsByScope, getCompanyDescendantIds, getCurrentUser, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileEmployeesList } from "./MobileEmployeesList";
import { MobileEmployeesFab } from "./MobileEmployeesFab";

/**
 * /m/hr/employees — mobile workforce roster. Managers need to see who's
 * on the books, their trade, wage rate, and current project assignment.
 */
export default function MobileEmployeesPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileEmployeesContent />
    </Suspense>
  );
}

async function MobileEmployeesContent() {
  await connection();
  const company = await getCompany();
  const __effPerms = await getUserPermissions();
  // Gate: require HR_VIEW to access the employee roster
  if (!__effPerms.includes(PERM.HR_VIEW)) {
    redirect("/m");
  }
  // Root-level access scope: department + field gating
  const accessScope = await getEmployeeAccessScope();
  const canManage = accessScope.canManageEmployee;
  // Scope-aware action permissions (for FABs + form option restriction)
  const actions = await getActionPermissions();

  const [employees, projects, stockLocations, departments] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: company.id, active: true, deletedAt: null, ...accessScope.employeeFilter },
      orderBy: { name: "asc" },
      take: 100,
      select: {
        id: true,
        name: true,
        trade: true,
        phone: true,
        dailyRate: true,
        wageType: true,
        monthlySalary: true,
        designation: true,
        onboardingComplete: true,
        active: true,
        activeProject: { select: { name: true } },
        user: { select: { employeeCode: true } },
      },
    }),
    actions.canCreateEmployee
      ? filterOptionsByScope(
          await prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }),
          actions.allowedProjectIds,
        )
      : [],
    actions.canCreateEmployee
      ? prisma.stockLocation.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, type: true },
        })
      : [],
    actions.canCreateEmployee
      ? filterOptionsByScope(
          await prisma.department.findMany({
            where: { companyId: company.id, active: true },
            orderBy: { name: "asc" },
            select: { id: true, name: true, active: true },
          }),
          actions.allowedDepartmentIds,
        )
      : [],
  ]);

  // ── Company targets for multi-company onboarding: self + descendants ──
  // Only owners/admins (COMPANY scope) can onboard across companies.
  // Descendants only — POST /api/employees refuses targets outside the
  // caller's own tree (no onboarding into parent/sibling companies).
  const groupIds = actions.canCreateEmployee ? [company.id, ...(await getCompanyDescendantIds(company.id))] : [];
  const companyGroup = groupIds.length > 1
    ? await prisma.company.findMany({
        where: { id: { in: groupIds }, deletedAt: null },
        select: { id: true, name: true, parentCompanyId: true },
        orderBy: { name: "asc" },
      })
    : [];

  const trades = [...new Set(employees.map((e) => e.trade).filter(Boolean))];

  // ── Viewer hierarchy level — for client-side per-row action gating ──
  const currentUser = await getCurrentUser();
  const viewerEmployee = await prisma.employee.findFirst({
    where: { userId: currentUser?.id, companyId: company.id, deletedAt: null },
    select: { hierarchyLevel: true },
  }).catch(() => null);
  const viewerHierarchyLevel = viewerEmployee?.hierarchyLevel ?? null;

  // Compensation data follows the shared field-visibility policy:
  // payroll.manage|hr.manage only. hr.view-only viewers (site engineers,
  // supervisors) get the roster without wage amounts or the cost rollup.
  const canSeePayroll = accessScope.canSeePayroll;
  const dailyWorkers = employees.filter((e) => e.wageType === "DAILY");
  const monthlyStaff = employees.filter((e) => e.wageType !== "DAILY");
  const totalMonthlyCost = monthlyStaff.reduce(
    (s, e) => s + toNum(e.monthlySalary ?? 0),
    0,
  );

  // Serialize for the client component (search + filter chips + badges)
  const serialized = employees.map((e) => ({
    id: e.id,
    name: e.name,
    trade: e.trade ?? null,
    designation: e.designation ?? null,
    phone: e.phone ?? null,
    dailyRate: canSeePayroll ? (e.dailyRate?.toString() ?? null) : null,
    monthlySalary: canSeePayroll ? (e.monthlySalary?.toString() ?? null) : null,
    wageType: e.wageType,
    activeProjectName: e.activeProject?.name ?? null,
    onboardingComplete: e.onboardingComplete === true,
    employeeCode: e.user?.employeeCode ?? null,
    active: e.active,
  }));

  return (
    <div>
      <div className={`grid ${canSeePayroll ? "grid-cols-4" : "grid-cols-3"} gap-1.5 mb-4`}>
        <MobileStatCard label="Daily Workers" value={String(dailyWorkers.length)} icon={Users} />
        <MobileStatCard label="Monthly Staff" value={String(monthlyStaff.length)} icon={Users} />
        {canSeePayroll && (
          <MobileStatCard
            label="Monthly Cost"
            value={formatCurrency(totalMonthlyCost)}
            icon={Users}
            tone="neutral"
          />
        )}
        <MobileStatCard label="Trades" value={String(trades.length)} icon={Users} />
      </div>

      <MobileEmployeesList
        items={serialized}
        viewerHierarchyLevel={viewerHierarchyLevel}
        exportTitle="Employees"
        exportRows={serialized as unknown as Record<string, unknown>[]}
        exportColumns={([
          { key: "name", label: "Name" },
          { key: "trade", label: "Trade" },
          { key: "wageType", label: "Wage Type" },
          { key: "phone", label: "Phone" },
          // Compensation columns only for payroll/hr-manage viewers.
          ...(canSeePayroll
            ? [
                { key: "dailyRate", label: "Daily Rate", format: "currency" as const },
                { key: "monthlySalary", label: "Monthly Salary", format: "currency" as const },
              ]
            : []),
        ]) as MobileColumnSpec[]}
        exportSummary={`${serialized.length} employees`}
      />

      {/* FAB: New Employee — gated by scope-aware action permission */}
      {actions.canCreateEmployee && (
        <MobileEmployeesFab
          projects={projects}
          stockLocations={stockLocations}
          departments={departments}
          companyGroup={companyGroup}
        />
      )}

      {employees.length === 0 && (
        <>
          <MobileSectionTitle>By Trade</MobileSectionTitle>
          <MobileEmptyState
            icon={Users}
            title="No employees"
            hint={canManage ? "Tap the + button (bottom-right) to add your first employee" : "Employees will appear here once added"}
          />
        </>
      )}
    </div>
  );
}
