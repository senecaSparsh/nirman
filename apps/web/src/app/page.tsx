import { connection } from "next/server";
import { Suspense } from "react";
import { prisma } from "@nirman/db";
import { trialBalance, projectPnl, materialInventoryValue } from "@nirman/services";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { getCompany, toNum, getUserRole, getCurrentUser, scopeWhere } from "@/lib/server";
import {
  PERM,
  ROLES,
  hasPermission,
  normalizeRole,
  effectivePermissions,
  PERMISSION_MODULES,
} from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { CommandCenter } from "@/components/command-center";
import { homeWorldFor } from "@/lib/nav";
import { OwnerFinancialDashboard, type CashPositionData, type ProjectProfitRow } from "@/components/owner-financial-dashboard";
import {
  type QueueData,
  type MembershipData,
  type ProjectAssignmentData,
  type ActivityCount,
  type AuditLogEntry,
  type Capability,
  type PermModule,
} from "@/components/profile/profile-tabs";

/**
 * ═══════════════════════════════════════════════════════════════════
 * COMMAND CENTER — your cockpit in this system (§44.3)
 *
 * The landing page is a role-adaptive dashboard, not a profile page.
 * It leads with what needs you (queues, tasks), shows KPIs at a glance,
 * and keeps your profile (access, activity) as a secondary expandable
 * section below.
 *
 * The profile identity strip, access matrix, and activity timeline are
 * still here — they're just not the first thing you see. The first
 * thing you see is your work.
 * ═══════════════════════════════════════════════════════════════════
 */
export default function CommandCenterPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading your command center…" variant="list" />}>
      <CommandCenterContent />
    </Suspense>
  );
}

async function CommandCenterContent() {
  await connection();
  const company = await getCompany();
  const role = normalizeRole(await getUserRole());
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id;
  const isDevBypass = userId === "dev";

  // ── Permission flags ─────────────────────────────────────────────
  const canApprovePO = hasPermission(role, PERM.PO_APPROVE);
  const canApproveReq = hasPermission(role, PERM.REQUISITION_APPROVE);
  const canSeeStock = hasPermission(role, PERM.INVENTORY_VIEW);
  const canSeeProcurement = hasPermission(role, PERM.PROCUREMENT_VIEW);
  const canSeeSales = hasPermission(role, PERM.SALES_VIEW);
  const canManageStock = hasPermission(role, PERM.INVENTORY_MANAGE);
  const canManageCompany = hasPermission(role, PERM.COMPANY_MANAGE);

  // ── Procurement trend window (last 6 months) ────────────────────
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ── Data fetch (only what the tabs need — no business queries) ──
  const [
    dbUser,
    memberships,
    projectAssignments,
    lowStockItems,
    draftPOs,
    pendingRequisitions,
    overduePOs,
    activeSales,
    pendingStockCounts,
    availableUnits,
    approvedReqs,
    approvedPOs,
    poTrendOrders,
    userActivityCounts,
    userAuditLogs,
  ] = await Promise.all([
    isDevBypass ? null : prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, image: true, role: true, active: true, createdAt: true },
    }),
    isDevBypass ? [] : prisma.userCompany.findMany({
      take: 500,
      where: { userId },
      include: { company: { select: { id: true, name: true, businessType: true } } },
      orderBy: { createdAt: "asc" },
    }),
    isDevBypass ? [] : prisma.projectAssignment.findMany({
      take: 500,
      where: {...await scopeWhere("ProjectAssignment"),  userId },
      include: { project: { select: { id: true, name: true, status: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.material.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null, minStock: { not: null } },
      select: { id: true, name: true, unit: true, minStock: true,
        stockItems: { where: { location: { deletedAt: null, companyId: company.id } }, select: { qty: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT", createdById: { not: userId } },
      orderBy: { createdAt: "desc" }, take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: {...await scopeWhere("MaterialRequisition"),  project: { companyId: company.id }, status: "SUBMITTED", requestedById: { not: userId } },
      orderBy: { createdAt: "desc" }, take: 5,
      include: { project: { select: { name: true } }, lines: { select: { qtyRequested: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } },
      orderBy: { expectedDate: "asc" }, take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.assetSale.findMany({
      where: {...await scopeWhere("AssetSale"),  companyId: company.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" }, take: 10,
      include: { customer: { select: { name: true } }, payments: { select: { amount: true } } },
    }),
    prisma.stockCount.findMany({
      where: { location: { companyId: company.id }, status: { in: ["DRAFT", "COUNTED"] } },
      orderBy: { countDate: "desc" }, take: 5,
      include: { location: { select: { name: true } } },
    }),
    prisma.builtUnit.findMany({
      where: {...await scopeWhere("BuiltUnit"),  project: { companyId: company.id }, deletedAt: null, status: "AVAILABLE" },
      orderBy: { updatedAt: "desc" }, take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: {...await scopeWhere("MaterialRequisition"),  project: { companyId: company.id }, status: "APPROVED" },
      orderBy: { approvedAt: "asc" as const }, take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "APPROVED" },
      orderBy: { approvedAt: "asc" as const }, take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      take: 200,
      where: {
        companyId: company.id,
        status: { not: "CANCELLED" },
        orderDate: { gte: sixMonthsAgo },
      },
      select: { orderDate: true, total: true },
      orderBy: { orderDate: "asc" },
    }),
    isDevBypass ? null : prisma.auditLog.groupBy({
      by: ["action"], where: { userId },
      _count: { action: true }, orderBy: { _count: { action: "desc" } }, take: 12,
    }),
    isDevBypass ? [] : prisma.auditLog.findMany({
      where: { userId }, orderBy: { timestamp: "desc" }, take: 10,
    }),
  ]);

  // ── Owner Financial Dashboard data (OWNER/ADMIN only) ───────────
  const isOwnerOrAdmin = role === "OWNER" || role === "ADMIN";
  let cashPosition: CashPositionData | null = null;
  let projectProfitRows: ProjectProfitRow[] = [];

  if (isOwnerOrAdmin) {
    const [tb, projects, invVal] = await Promise.all([
      trialBalance(company.id),
      prisma.project.findMany({
        take: 200,
        where: { companyId: company.id, deletedAt: null },
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
      }),
      materialInventoryValue(company.id),
    ]);

    // Extract key account balances from trial balance
    const findBalance = (code: string) => {
      const acct = tb.accounts.find((a) => a.code === code);
      return acct ? toNum(acct.balance) : 0;
    };
    cashPosition = {
      cashBalance: findBalance("1000"),
      arBalance: findBalance("1200"),
      apBalance: findBalance("2000"),
      inventoryValue: toNum(invVal),
    };

    // Compute P&L per project (limit to 10 for performance)
    const pnlResults = await Promise.all(
      projects.slice(0, 10).map(async (p) => {
        const pnl = await projectPnl(p.id);
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          revenue: toNum(pnl.revenue),
          cost: toNum(pnl.total),
          profit: toNum(pnl.profit),
          margin: toNum(pnl.margin),
        } satisfies ProjectProfitRow;
      }),
    );
    projectProfitRows = pnlResults;
  }

  // ── Low stock computation ────────────────────────────────────────
  const lowStock = lowStockItems
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const minStock = toNum(m.minStock);
      return { name: m.name, unit: m.unit, totalQty, minStock, shortfall: minStock - totalQty };
    })
    .filter((m) => m.totalQty < m.minStock)
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 5);

  // ── Stock health (full counts, not sliced) ───────────────────────
  const lowStockFull = lowStockItems.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    return { totalQty, minStock: toNum(m.minStock) };
  });
  const lowStockCount = lowStockFull.filter((m) => m.totalQty < m.minStock).length;
  const healthyStockCount = lowStockFull.length - lowStockCount;
  const stockHealth = healthyStockCount > 0 || lowStockCount > 0
    ? [
        { label: "In stock", value: healthyStockCount },
        { label: "Low stock", value: lowStockCount },
      ]
    : [];

  // ── Procurement trend (last 6 months) ────────────────────────────
  const trendMap = new Map<string, { label: string; count: number; value: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    trendMap.set(key, { label: MONTHS[d.getMonth()] ?? "", count: 0, value: 0 });
  }
  for (const o of poTrendOrders) {
    const d = o.orderDate;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = trendMap.get(key);
    if (!row) continue;
    row.count += 1;
    row.value += toNum(o.total);
  }
  const procurementTrend = Array.from(trendMap.values());
  const totalPOs6mo = procurementTrend.reduce((s, m) => s + m.count, 0);
  const totalSpend6mo = procurementTrend.reduce((s, m) => s + m.value, 0);
  // Trend: current month vs previous month
  const curMonth = procurementTrend[procurementTrend.length - 1];
  const prevMonth = procurementTrend[procurementTrend.length - 2];
  const poTrendDelta = prevMonth && curMonth && prevMonth.count > 0
    ? Math.round(((curMonth.count - prevMonth.count) / prevMonth.count) * 100)
    : null;

  // ── Build action queues ──────────────────────────────────────────
  const queues: QueueData[] = [];

  if (canApproveReq && pendingRequisitions.length > 0) queues.push({
    key: "req", title: "Indents waiting for approval",
    consequence: "Site can't order material until you approve these",
    count: pendingRequisitions.length, href: "/approvals", cta: "Review", urgency: "blocking", icon: "clipboardList",
    items: pendingRequisitions.map((r) => ({ label: r.project?.name ?? "N/A", sub: `${formatNumber(r.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0), 0)} units requested` })),
  });
  if (canApprovePO && draftPOs.length > 0) queues.push({
    key: "po", title: "Purchase orders to approve",
    consequence: "Nothing is ordered from the supplier until these are signed off",
    count: draftPOs.length, href: "/approvals", cta: "Review", urgency: "blocking", icon: "clipboardCheck",
    items: draftPOs.map((po) => ({ label: po.poNumber, sub: po.supplier.name })),
  });
  if (canSeeProcurement && overduePOs.length > 0) queues.push({
    key: "overdue", title: "Deliveries past their date",
    consequence: "Chase the supplier — site is expecting this material",
    count: overduePOs.length, href: "/procurement", cta: "Chase", urgency: "blocking", icon: "truck",
    items: overduePOs.map((po) => ({ label: po.poNumber, sub: `${po.supplier.name} · due ${po.expectedDate ? formatDate(po.expectedDate) : "—"}` })),
  });
  if (canSeeStock && lowStock.length > 0) queues.push({
    key: "low", title: "Materials below their reorder point",
    consequence: "Raise an indent before site runs out",
    count: lowStock.length, href: "/materials", cta: hasPermission(role, PERM.PROCUREMENT_MANAGE) || canApproveReq ? "Reorder" : "View", urgency: "soon", icon: "package",
    items: lowStock.map((m) => ({ label: m.name, sub: `${formatNumber(m.totalQty, 0)} ${m.unit} left · need ${formatNumber(m.minStock, 0)}` })),
  });
  if (canApproveReq && approvedReqs.length > 0) queues.push({
    key: "approved-req", title: "Approved indents ready to order",
    consequence: "Convert these to purchase orders so the supplier can be engaged",
    count: approvedReqs.length, href: "/requisitions", cta: "Convert", urgency: "soon", icon: "clipboardList",
    items: approvedReqs.map((r) => ({ label: r.reqNumber ?? r.id.slice(0, 8), sub: r.project?.name ?? "N/A" })),
  });
  if (canApprovePO && approvedPOs.length > 0) queues.push({
    key: "approved-po", title: "Approved POs ready to send",
    consequence: "Mark these as ordered so the supplier starts fulfilling",
    count: approvedPOs.length, href: "/procurement", cta: "Order", urgency: "soon", icon: "clipboardCheck",
    items: approvedPOs.map((po) => ({ label: po.poNumber, sub: po.supplier.name })),
  });
  const salesWithBalance = activeSales.filter((s) => s.paymentStatus === "PENDING" || s.paymentStatus === "PARTIAL");
  if (canSeeSales && salesWithBalance.length > 0) queues.push({
    key: "sales-balance", title: "Sales awaiting payment",
    consequence: "Collect outstanding balances from customers",
    count: salesWithBalance.length, href: "/sales", cta: "Collect", urgency: "soon", icon: "dollarSign",
    items: salesWithBalance.map((s) => {
      const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
      return { label: s.customer.name, sub: `${formatCurrency(toNum(s.salePrice) - totalPaid)} balance due` };
    }),
  });
  if (canManageStock && pendingStockCounts.length > 0) queues.push({
    key: "stock-count", title: "Stock inventories to process",
    consequence: "Confirm counts and reconcile variances to keep stock accurate",
    count: pendingStockCounts.length, href: "/stock?tab=counts", cta: "Process", urgency: "soon", icon: "clipboardCheck",
    items: pendingStockCounts.map((c) => ({ label: c.location.name, sub: c.status === "DRAFT" ? "Awaiting confirmation" : "Awaiting reconciliation" })),
  });
  if (canSeeSales && availableUnits.length > 0) queues.push({
    key: "units-sell", title: "Units ready to sell",
    consequence: "These built units are available — find buyers and close sales",
    count: availableUnits.length, href: "/units", cta: hasPermission(role, PERM.SALE_CREATE) ? "Sell" : "View", urgency: "soon", icon: "home",
    items: availableUnits.map((u) => ({ label: u.unitNumber, sub: u.project.name })),
  });

  const blockingQueues = queues.filter((q) => q.urgency === "blocking").reduce((n, q) => n + q.count, 0);
  const totalQueues = queues.reduce((n, q) => n + q.count, 0);

  // ── Pending actions by type (for chart) ──────────────────────────
  const pendingActions: { label: string; value: number }[] = [];
  if (canApproveReq && pendingRequisitions.length > 0) pendingActions.push({ label: "Pending indents", value: pendingRequisitions.length });
  if (canApprovePO && draftPOs.length > 0) pendingActions.push({ label: "Draft POs", value: draftPOs.length });
  if (canSeeProcurement && overduePOs.length > 0) pendingActions.push({ label: "Overdue POs", value: overduePOs.length });
  if (canSeeStock && lowStockCount > 0) pendingActions.push({ label: "Low stock", value: lowStockCount });
  if (canApproveReq && approvedReqs.length > 0) pendingActions.push({ label: "Ready to order", value: approvedReqs.length });
  if (canApprovePO && approvedPOs.length > 0) pendingActions.push({ label: "Ready to send", value: approvedPOs.length });
  if (canSeeSales && salesWithBalance.length > 0) pendingActions.push({ label: "Sales dues", value: salesWithBalance.length });
  if (canManageStock && pendingStockCounts.length > 0) pendingActions.push({ label: "Stock inventories", value: pendingStockCounts.length });

  // ── Role + permissions for Access tab ────────────────────────────
  const roleDef = ROLES[role];
  const perms = effectivePermissions(role);
  const isAllAccess = roleDef.permissions === "*";

  // Capabilities — derived dynamically from PERMISSION_MODULES.
  // For each module, show a capability badge if the user has any
  // actionable permission (anything beyond just ".view"). Also
  // includes role-level capabilities (manage users, assign tasks,
  // manage workflows) which aren't part of PERMISSION_MODULES.
  const allCapabilities: { icon: string; label: string; has: boolean }[] = [
    { icon: "users", label: "Manage users", has: roleDef.canManageUsers },
    { icon: "clipboardCheck", label: "Assign tasks", has: roleDef.canAssignTasks },
    { icon: "briefcase", label: "Manage workflows", has: roleDef.canManageWorkflows },
    // One capability badge per module where the user can do more than view
    ...PERMISSION_MODULES.map((mod) => {
      // "Actionable" = any permission in this module that isn't just a view permission
      const hasActionable = mod.permissions.some((p) => {
        if (!p.endsWith(".view")) return hasPermission(role, p);
        return false;
      });
      // Use the module's icon name (lowercased to match the icon key convention)
      return { icon: mod.icon.charAt(0).toLowerCase() + mod.icon.slice(1), label: mod.label, has: hasActionable };
    }),
  ];
  const capabilities: Capability[] = allCapabilities.filter((c) => c.has).map(({ icon, label }) => ({ icon, label }));

  // Permission matrix modules — derived dynamically from PERMISSION_MODULES
  // so any new permissions added in roles.ts automatically appear on the
  // profile Access tab. Each permission key (e.g. "projects.view") is
  // converted to a readable action label (e.g. "View").
  const permModules: PermModule[] = PERMISSION_MODULES.map((mod) => ({
    key: mod.key,
    label: mod.label,
    actions: mod.permissions.map((perm) => {
      const action = perm.split(".")[1] ?? perm;
      const label = action
        .replace(/([A-Z])/g, " $1")     // split camelCase: manageAll → manage All
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase()); // capitalize each word
      return { key: action, label, has: hasPermission(role, perm) };
    }),
  }));

  // ── Activity data ────────────────────────────────────────────────
  const activityCounts: ActivityCount[] = (userActivityCounts ?? []).map((g) => ({
    action: g.action,
    count: g._count.action,
  }));
  const auditLogs: AuditLogEntry[] = userAuditLogs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    timestamp: log.timestamp.toISOString(),
  }));
  const totalActions = activityCounts.reduce((s, g) => s + g.count, 0);
  const hasActivity = !isDevBypass && activityCounts.length > 0;

  // ── Memberships ──────────────────────────────────────────────────
  const membershipData: MembershipData[] = memberships.map((m) => ({
    id: m.id,
    company: { id: m.company.id, name: m.company.name, businessType: m.company.businessType },
    role: m.role,
    isCurrent: m.company.id === company.id,
  }));

  // ── Project assignments ──────────────────────────────────────────
  const assignmentData: ProjectAssignmentData[] = projectAssignments.map((a) => ({
    id: a.id,
    scopedRole: a.scopedRole,
    project: { id: a.project.id, name: a.project.name, status: a.project.status },
  }));

  // ── PageHeader stats — the dashboard's instrument panel ──────────
  const headerStats: { label: string; value: string | number; tone?: "default" | "warning" | "danger" }[] = [
    { label: "Role", value: roleDef.label },
    { label: "Company", value: company.name },
  ];
  if (blockingQueues > 0) {
    headerStats.push({ label: "Blocking", value: blockingQueues, tone: "danger" });
  } else if (totalQueues > 0) {
    headerStats.push({ label: "Pending", value: totalQueues, tone: "warning" });
  } else {
    headerStats.push({ label: "Queue", value: "Clear", tone: "success" as "default" });
  }

  // ── Home world link ──
  const homeWorld = homeWorldFor(role);
  const hasHomeOverride = homeWorld.href !== "/";

  return (
    <Page>
      <PageHeader
        title="Today"
        description={`${roleDef.label} · ${company.name} · ${formatDate(now)}`}
        stats={headerStats}
      />

      {hasHomeOverride && (
        <a
          href={homeWorld.href}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption font-medium text-brand hover:bg-brand/5 transition-colors"
        >
          Go to {homeWorld.label} →
        </a>
      )}

      {isOwnerOrAdmin && cashPosition && (
        <OwnerFinancialDashboard
          cashPosition={cashPosition}
          projectProfits={projectProfitRows}
        />
      )}

      <CommandCenter
        name={currentUser?.name ?? "User"}
        email={currentUser?.email ?? ""}
        phone={dbUser?.phone ?? null}
        image={dbUser?.image ?? null}
        active={dbUser?.active ?? true}
        createdAt={dbUser?.createdAt?.toISOString() ?? null}
        companyName={company.name}
        roleLabel={roleDef.label}
        roleDescription={roleDef.description}
        canManageCompany={canManageCompany}
        queues={queues}
        totalQueues={totalQueues}
        blockingQueues={blockingQueues}
        canApprove={canApprovePO || canApproveReq}
        canSeeTasks={hasPermission(role, PERM.TASKS_VIEW)}
        canSeeProcurement={canSeeProcurement}
        canSeeStock={canSeeStock}
        procurementTrend={procurementTrend}
        totalPOs6mo={totalPOs6mo}
        totalSpend6mo={totalSpend6mo}
        poTrendDelta={poTrendDelta}
        stockHealth={stockHealth}
        lowStockCount={lowStockCount}
        pendingActions={pendingActions}
        capabilities={capabilities}
        permModules={permModules}
        isAllAccess={isAllAccess}
        permCount={perms.length}
        memberships={membershipData}
        projectAssignments={assignmentData}
        totalActions={totalActions}
        activityCounts={activityCounts}
        auditLogs={auditLogs}
        hasActivity={hasActivity}
      />
    </Page>
  );
}
