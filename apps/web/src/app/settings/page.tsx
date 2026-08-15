import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCurrentUser, getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import type { StockLocationRow, DepartmentRow } from "@/lib/types";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Company settings, stock locations, cost centres, people, and application preferences."
      />
      <Suspense fallback={<PageLoading label="Loading settings…" />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  await connection();
  const user = await getCurrentUser();
  const role = await getUserRole();

  // Server-side gate: settings requires COMPANY_MANAGE permission.
  // OWNER/ADMIN (Admin tier) see everything; MANAGER (Sub-Admin) can access
  // to manage members below them in the hierarchy.
  if (!hasPermission(role, PERM.COMPANY_MANAGE)) {
    return <NoAccess what="company settings" />;
  }

  const company = await getCompany();
  const isSuperuser = role === "OWNER" || role === "ADMIN";
  const isDevBypass = user?.id === "dev";

  const [users, locations, projects, subcontractors, employees, companies, departments] = await Promise.all([
    prisma.user.findMany({
      where: { memberships: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, email: true, name: true, role: true, active: true },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        project: { select: { name: true } },
        stockItems: { select: { qty: true, movingAvgCost: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Subcontractor has no companyId — scope to subcontractors with work orders in this company.
    prisma.subcontractor.findMany({
      where: { deletedAt: null, workOrders: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trade: true, phone: true, email: true, gstin: true, address: true },
    }),
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trade: true, phone: true, email: true, dailyRate: true, active: true },
    }),
    prisma.company.findMany({
      where: {
        deletedAt: null,
        ...(isSuperuser || isDevBypass
          ? {}
          : { userMemberships: { some: { userId: user?.id ?? "" } } }),
      },
      orderBy: { name: "asc" },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { userMemberships: true, children: true } },
      },
    }),
    prisma.department.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { code: "asc" },
      include: {
        stockLocation: { select: { id: true, name: true } },
        _count: { select: { materialIssues: true } },
      },
    }),
  ]);

  const locationRows: StockLocationRow[] = locations.map((l) => {
    const stockValue = l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
    return {
      id: l.id,
      type: l.type,
      name: l.name,
      address: l.address,
      projectId: l.projectId,
      projectName: l.project?.name ?? null,
      stockValue,
      itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
      companyId: company.id,
      companyName: company.name,
    };
  });

  const departmentRows: DepartmentRow[] = departments.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    description: d.description,
    active: d.active,
    stockLocationId: d.stockLocation?.id ?? null,
    stockLocationName: d.stockLocation?.name ?? null,
    issueCount: d._count.materialIssues,
  }));

  return (
    <>
    <SettingsView
      company={{
        id: company.id,
        name: company.name,
        gstin: company.gstin,
        pan: company.pan,
        address: company.address,
        phone: company.phone,
        email: company.email,
        currency: company.currency,
      }}
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active,
      }))}
      locations={locationRows}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      subcontractors={subcontractors.map((s) => ({ id: s.id, name: s.name, trade: s.trade, phone: s.phone, email: s.email, gstin: s.gstin, address: s.address }))}
      employees={employees.map((e) => ({ id: e.id, name: e.name, trade: e.trade, phone: e.phone, email: e.email, dailyRate: toNum(e.dailyRate), active: e.active }))}
      companies={companies.map((c) => ({
        id: c.id,
        name: c.name,
        gstin: c.gstin,
        pan: c.pan,
        address: c.address,
        currency: c.currency,
        businessType: c.businessType,
        parentCompanyId: c.parentCompanyId,
        parentName: c.parent?.name ?? null,
        memberCount: c._count.userMemberships,
        hasChildren: c._count.children > 0,
      }))}
      canManageCompanies={isSuperuser}
      actorRole={role}
      departments={departmentRows}
    />
      {hasPermission(role, PERM.FINANCE_MANAGE) && (
        <div className="mt-6">
          <NotificationsPanel />
        </div>
      )}
      <div className="mt-6">
        <NotificationPreferences />
      </div>
    </>
  );
}
