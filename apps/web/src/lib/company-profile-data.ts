import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission, ROLE_LIST, assignableRoles, type Role } from "@/lib/roles";
import type { CompanyProfileData } from "@/components/companies/company-profile-client";

/**
 * Shared server-side loader for the company profile data payload.
 * Used by both the desktop (/companies/[id]) and mobile (/m/settings/company)
 * company profile pages so they show identical data.
 *
 * Access check: the requested company must be the current company OR a
 * direct child of the current company (parent-admin drill-down). This
 * mirrors the member-or-parent gate in /api/companies/[id].
 */
export async function loadCompanyProfileData(companyId: string): Promise<{
  data: CompanyProfileData;
  actorRole: string;
  permissions: {
    canManage: boolean;
    canViewAudit: boolean;
    canManageTelephony: boolean;
    canManageCompanies: boolean;
    canManageHr: boolean;
    canManageProcurement: boolean;
    canManageSales: boolean;
    canManageInventory: boolean;
    canManageProjects: boolean;
  };
  roleOptions: { key: string; label: string }[];
  assignableRoles: Role[];
} | null> {
  const role = await getUserRole();
  const currentCompany = await getCompany();

  let isChild = false;
  if (companyId !== currentCompany.id) {
    const child = await prisma.company.findFirst({
      where: { id: companyId, parentCompanyId: currentCompany.id, deletedAt: null },
      select: { id: true },
    });
    if (!child) return null;
    isChild = true;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      parent: { select: { id: true, name: true } },
      _count: {
        select: {
          children: true,
          projects: true,
          stockLocations: true,
          userMemberships: true,
          employees: true,
          suppliers: true,
          customers: true,
        },
      },
    },
  });
  if (!company || company.deletedAt) return null;

  // ── Hierarchy: children + siblings ──
  const [children, siblings] = await Promise.all([
    prisma.company.findMany({
      where: { parentCompanyId: companyId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, businessType: true, currency: true,
        _count: { select: { userMemberships: true, children: true } },
      },
    }),
    company.parentCompanyId
      ? prisma.company.findMany({
          where: { parentCompanyId: company.parentCompanyId, deletedAt: null, id: { not: companyId } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, businessType: true },
        })
      : Promise.resolve([]),
  ]);

  // ── Members with scopes + reporting line ──
  const memberships = await prisma.userCompany.findMany({
    where: { companyId: companyId, user: { isHidden: { not: true } } },
    orderBy: { user: { name: "asc" } },
    include: {
      user: {
        select: {
          id: true, name: true, email: true, active: true, role: true,
          phone: true, designation: true, lastLoginAt: true,
          lockedUntil: true, failedLoginAttempts: true,
        },
      },
      scopes: {
        include: {
          department: { select: { code: true, name: true } },
          project: { select: { name: true } },
        },
      },
      reportsTo: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  // ── Locations ──
  const locations = await prisma.stockLocation.findMany({
    where: { companyId: companyId, deletedAt: null },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      project: { select: { name: true } },
      stockItems: { select: { qty: true, movingAvgCost: true } },
    },
  });

  // ── Departments ──
  const departments = await prisma.department.findMany({
    where: { companyId: companyId, deletedAt: null },
    orderBy: { code: "asc" },
    include: {
      stockLocation: { select: { id: true, name: true } },
      _count: { select: { materialIssues: true } },
    },
  });

  // ── Projects (names for linking out) ──
  const projects = await prisma.project.findMany({
    where: { companyId: companyId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true },
    take: 200,
  });

  // ── Audit logs + backups ──
  const [auditLogs, backups] = await Promise.all([
    prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { timestamp: "desc" },
      take: 100,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.backupRecord.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, sizeBytes: true, createdAt: true },
    }),
  ]);

  const data: CompanyProfileData = {
    id: company.id,
    name: company.name,
    gstin: company.gstin,
    pan: company.pan,
    address: company.address,
    phone: company.phone,
    email: company.email,
    currency: company.currency,
    businessType: company.businessType,
    parentCompanyId: company.parentCompanyId,
    parentName: company.parent?.name ?? null,
    isCurrentCompany: !isChild,
    // ── Procurement config ──
    lciThresholdDefault: company.lciThresholdDefault ? toNum(company.lciThresholdDefault) : null,
    lciWeights: company.lciWeights as Record<string, number> | null,
    poApprovalThresholdManager: company.poApprovalThresholdManager ? toNum(company.poApprovalThresholdManager) : null,
    poApprovalThresholdAdmin: company.poApprovalThresholdAdmin ? toNum(company.poApprovalThresholdAdmin) : null,
    // ── Password policy ──
    passwordMinLength: company.passwordMinLength,
    passwordRequireSpecial: company.passwordRequireSpecial,
    passwordExpiryDays: company.passwordExpiryDays,
    accountLockoutThreshold: company.accountLockoutThreshold,
    accountLockoutDurationMin: company.accountLockoutDurationMin,
    // ── Call recording config ──
    recordingConsentBeep: company.recordingConsentBeep,
    recordingRetentionDays: company.recordingRetentionDays,
    recordingAutoDelete: company.recordingAutoDelete,
    recordingStorageProvider: company.recordingStorageProvider,
    recordingMode: company.recordingMode,
    // ── Stats ──
    stats: {
      members: company._count.userMemberships,
      projects: company._count.projects,
      locations: company._count.stockLocations,
      children: company._count.children,
      employees: company._count.employees,
      suppliers: company._count.suppliers,
      customers: company._count.customers,
    },
    createdAt: company.createdAt.toISOString(),
    // ── Hierarchy ──
    children: children.map((c) => ({
      id: c.id, name: c.name, businessType: c.businessType, currency: c.currency,
      memberCount: c._count.userMemberships, hasChildren: c._count.children > 0,
    })),
    siblings: siblings.map((s) => ({ id: s.id, name: s.name, businessType: s.businessType })),
    // ── Members ──
    members: memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      active: m.user.active,
      phone: m.user.phone,
      designation: m.user.designation,
      lastLoginAt: m.user.lastLoginAt ? m.user.lastLoginAt.toISOString() : null,
      lockedUntil: m.user.lockedUntil ? m.user.lockedUntil.toISOString() : null,
      failedLoginAttempts: m.user.failedLoginAttempts,
      scopeType: m.scopeType,
      reportsToName: m.reportsTo?.user.name ?? null,
      scopes: m.scopes.map((s) => ({
        scopeKind: s.scopeKind,
        departmentId: s.departmentId,
        projectId: s.projectId,
        departmentName: s.department?.name ?? null,
        departmentCode: s.department?.code ?? null,
        projectName: s.project?.name ?? null,
      })),
    })),
    // ── Locations ──
    locations: locations.map((l) => {
      const stockValue = l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
      return {
        id: l.id, type: l.type, name: l.name, address: l.address,
        projectId: l.projectId, projectName: l.project?.name ?? null,
        stockValue, itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
        lat: l.lat, lng: l.lng, geoRadius: l.geoRadius,
      };
    }),
    // ── Departments ──
    departments: departments.map((d) => ({
      id: d.id, code: d.code, name: d.name, description: d.description,
      active: d.active,
      stockLocationId: d.stockLocation?.id ?? null,
      stockLocationName: d.stockLocation?.name ?? null,
      issueCount: d._count.materialIssues,
    })),
    // ── Projects ──
    projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status })),
    // ── Audit ──
    auditLogs: auditLogs.map((l) => ({
      id: l.id, action: l.action, entityType: l.entityType, entityId: l.entityId,
      userName: l.user?.name ?? null, userEmail: l.user?.email ?? null,
      timestamp: l.timestamp.toISOString(),
    })),
    backups: backups.map((b) => ({
      id: b.id, sizeBytes: b.sizeBytes, createdAt: b.createdAt.toISOString(),
    })),
  };

  const canManage = hasPermission(role, PERM.COMPANY_MANAGE);
  const canViewAudit = hasPermission(role, PERM.AUDIT_VIEW);
  const canManageTelephony = hasPermission(role, PERM.TELEPHONY_MANAGE);
  const assignable = assignableRoles(role);

  return {
    data,
    actorRole: role,
    permissions: {
      canManage,
      canViewAudit,
      canManageTelephony,
      canManageCompanies: role === "OWNER" || role === "ADMIN",
      canManageHr: hasPermission(role, PERM.HR_MANAGE),
      canManageProcurement: hasPermission(role, PERM.PROCUREMENT_MANAGE),
      canManageSales: hasPermission(role, PERM.SALES_MANAGE),
      canManageInventory: hasPermission(role, PERM.INVENTORY_MANAGE),
      canManageProjects: hasPermission(role, PERM.PROJECTS_MANAGE),
    },
    roleOptions: ROLE_LIST.map((r) => ({ key: r.key, label: r.label })),
    assignableRoles: assignable,
  };
}
