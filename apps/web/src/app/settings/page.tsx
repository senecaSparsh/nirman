import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCurrentUser, getCompany, getUserRole, toNum } from "@/lib/server";
import { PageHeader } from "@/components/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { PageLoading } from "@/components/page-loading";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import type { StockLocationRow } from "@/lib/types";

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Company settings, stock locations, and application preferences."
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

  // Hard server-side gate: settings is OWNER/ADMIN only.
  if (role !== "OWNER" && role !== "ADMIN") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ShieldAlert className="h-8 w-8 text-destructive/60" />
          <div>
            <p className="text-body font-medium">Access denied</p>
            <p className="text-caption text-muted-foreground">
              You do not have permission to view this page. Settings are restricted to owners and administrators.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const company = await getCompany();
  const isSuperuser = role === "OWNER" || role === "ADMIN";
  const isDevBypass = user?.id === "dev";

  const [users, locations, projects, subcontractors, employees, companies] = await Promise.all([
    prisma.user.findMany({
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
    prisma.subcontractor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, trade: true, phone: true, email: true },
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
    };
  });

  return (
    <SettingsView
      company={{
        id: company.id,
        name: company.name,
        gstin: company.gstin,
        pan: company.pan,
        address: company.address,
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
      subcontractors={subcontractors.map((s) => ({ id: s.id, name: s.name, trade: s.trade, phone: s.phone, email: s.email }))}
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
    />
  );
}
