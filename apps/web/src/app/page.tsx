import { connection } from "next/server";
import { Suspense } from "react";
import { prisma } from "@nirman/db";
import { trialBalance, projectPnl, materialInventoryValue } from "@nirman/services";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { getCompany, toNum, getUserRole, getCurrentUser } from "@/lib/server";
import {
  PERM,
  ROLES,
  hasPermission,
  normalizeRole,
  effectivePermissions,
} from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { CommandCenter } from "@/components/command-center";
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
      where: { userId },
      include: { company: { select: { id: true, name: true, businessType: true } } },
      orderBy: { createdAt: "asc" },
    }),
    isDevBypass ? [] : prisma.projectAssignment.findMany({
      where: { userId },
      include: { project: { select: { id: true, name: true, status: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null, minStock: { not: null } },
      select: { id: true, name: true, unit: true, minStock: true,
        stockItems: { where: { location: { deletedAt: null, companyId: company.id } }, select: { qty: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" }, take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" }, take: 5,
      include: { project: { select: { name: true } }, lines: { select: { qtyRequested: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } },
      orderBy: { expectedDate: "asc" }, take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" }, take: 10,
      include: { customer: { select: { name: true } }, payments: { select: { amount: true } } },
    }),
    prisma.stockCount.findMany({
      where: { location: { companyId: company.id }, status: { in: ["DRAFT", "COUNTED"] } },
      orderBy: { countDate: "desc" }, take: 5,
      include: { location: { select: { name: true } } },
    }),
    prisma.builtUnit.findMany({
      where: { project: { companyId: company.id }, deletedAt: null, status: "AVAILABLE" },
      orderBy: { updatedAt: "desc" }, take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "APPROVED" },
      orderBy: { approvedAt: "asc" as const }, take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "APPROVED" },
      orderBy: { approvedAt: "asc" as const }, take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
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
    key: "req", title: "Requisitions waiting for approval",
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
    consequence: "Raise a requisition before site runs out",
    count: lowStock.length, href: "/materials", cta: "Reorder", urgency: "soon", icon: "package",
    items: lowStock.map((m) => ({ label: m.name, sub: `${formatNumber(m.totalQty, 0)} ${m.unit} left · need ${formatNumber(m.minStock, 0)}` })),
  });
  if (canApproveReq && approvedReqs.length > 0) queues.push({
    key: "approved-req", title: "Approved requisitions ready to order",
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
    key: "stock-count", title: "Stock counts to process",
    consequence: "Confirm counts and reconcile variances to keep stock accurate",
    count: pendingStockCounts.length, href: "/stock?tab=counts", cta: "Process", urgency: "soon", icon: "clipboardCheck",
    items: pendingStockCounts.map((c) => ({ label: c.location.name, sub: c.status === "DRAFT" ? "Awaiting confirmation" : "Awaiting reconciliation" })),
  });
  if (canSeeSales && availableUnits.length > 0) queues.push({
    key: "units-sell", title: "Units ready to sell",
    consequence: "These built units are available — find buyers and close sales",
    count: availableUnits.length, href: "/units", cta: "Sell", urgency: "soon", icon: "home",
    items: availableUnits.map((u) => ({ label: u.unitNumber, sub: u.project.name })),
  });

  const blockingQueues = queues.filter((q) => q.urgency === "blocking").reduce((n, q) => n + q.count, 0);
  const totalQueues = queues.reduce((n, q) => n + q.count, 0);

  // ── Pending actions by type (for chart) ──────────────────────────
  const pendingActions: { label: string; value: number }[] = [];
  if (canApproveReq && pendingRequisitions.length > 0) pendingActions.push({ label: "Pending reqs", value: pendingRequisitions.length });
  if (canApprovePO && draftPOs.length > 0) pendingActions.push({ label: "Draft POs", value: draftPOs.length });
  if (canSeeProcurement && overduePOs.length > 0) pendingActions.push({ label: "Overdue POs", value: overduePOs.length });
  if (canSeeStock && lowStockCount > 0) pendingActions.push({ label: "Low stock", value: lowStockCount });
  if (canApproveReq && approvedReqs.length > 0) pendingActions.push({ label: "Ready to order", value: approvedReqs.length });
  if (canApprovePO && approvedPOs.length > 0) pendingActions.push({ label: "Ready to send", value: approvedPOs.length });
  if (canSeeSales && salesWithBalance.length > 0) pendingActions.push({ label: "Sales dues", value: salesWithBalance.length });
  if (canManageStock && pendingStockCounts.length > 0) pendingActions.push({ label: "Stock counts", value: pendingStockCounts.length });

  // ── Role + permissions for Access tab ────────────────────────────
  const roleDef = ROLES[role];
  const perms = effectivePermissions(role);
  const isAllAccess = roleDef.permissions === "*";

  // Capabilities (only the ones this role has) — pass icon as string key
  const allCapabilities: { icon: string; label: string; has: boolean }[] = [
    { icon: "users", label: "Manage users", has: roleDef.canManageUsers },
    { icon: "clipboardCheck", label: "Assign tasks", has: roleDef.canAssignTasks },
    { icon: "briefcase", label: "Manage workflows", has: roleDef.canManageWorkflows },
    { icon: "clipboardCheck", label: "Approve POs", has: hasPermission(role, PERM.PO_APPROVE) },
    { icon: "clipboardList", label: "Approve requisitions", has: hasPermission(role, PERM.REQUISITION_APPROVE) },
    { icon: "package", label: "Transfer stock", has: hasPermission(role, PERM.STOCK_TRANSFER) },
    { icon: "package", label: "Issue stock", has: hasPermission(role, PERM.STOCK_ISSUE) },
    { icon: "dollarSign", label: "Create sales", has: hasPermission(role, PERM.SALE_CREATE) },
    { icon: "wallet", label: "Record expenses", has: hasPermission(role, PERM.EXPENSE_CREATE) },
    { icon: "home", label: "Sell assets", has: hasPermission(role, PERM.ASSET_SELL) },
    { icon: "building", label: "Partition land", has: hasPermission(role, PERM.LAND_PARTITION) },
  ];
  const capabilities: Capability[] = allCapabilities.filter((c) => c.has).map(({ icon, label }) => ({ icon, label }));

  // Permission matrix modules
  const permModules: PermModule[] = [
    { key: "projects", label: "Projects", actions: [
      { key: "view", label: "View", has: hasPermission(role, PERM.PROJECTS_VIEW) },
      { key: "manage", label: "Manage", has: hasPermission(role, PERM.PROJECTS_MANAGE) },
    ]},
    { key: "procurement", label: "Procurement", actions: [
      { key: "view", label: "View", has: hasPermission(role, PERM.PROCUREMENT_VIEW) },
      { key: "manage", label: "Manage", has: hasPermission(role, PERM.PROCUREMENT_MANAGE) },
      { key: "po_approve", label: "Approve PO", has: hasPermission(role, PERM.PO_APPROVE) },
      { key: "req_approve", label: "Approve Req", has: hasPermission(role, PERM.REQUISITION_APPROVE) },
    ]},
    { key: "inventory", label: "Stock", actions: [
      { key: "view", label: "View", has: hasPermission(role, PERM.INVENTORY_VIEW) },
      { key: "manage", label: "Manage", has: hasPermission(role, PERM.INVENTORY_MANAGE) },
      { key: "transfer", label: "Transfer", has: hasPermission(role, PERM.STOCK_TRANSFER) },
      { key: "issue", label: "Issue", has: hasPermission(role, PERM.STOCK_ISSUE) },
    ]},
    { key: "finance", label: "Finance", actions: [
      { key: "view", label: "View", has: hasPermission(role, PERM.FINANCE_VIEW) },
      { key: "manage", label: "Manage", has: hasPermission(role, PERM.FINANCE_MANAGE) },
      { key: "expense", label: "Expense", has: hasPermission(role, PERM.EXPENSE_CREATE) },
    ]},
    { key: "sales", label: "Sales", actions: [
      { key: "view", label: "View", has: hasPermission(role, PERM.SALES_VIEW) },
      { key: "manage", label: "Manage", has: hasPermission(role, PERM.SALES_MANAGE) },
      { key: "create", label: "Create", has: hasPermission(role, PERM.SALE_CREATE) },
    ]},
    { key: "assets", label: "Assets", actions: [
      { key: "view", label: "View", has: hasPermission(role, PERM.ASSETS_VIEW) },
      { key: "manage", label: "Manage", has: hasPermission(role, PERM.ASSETS_MANAGE) },
      { key: "sell", label: "Sell", has: hasPermission(role, PERM.ASSET_SELL) },
      { key: "partition", label: "Partition", has: hasPermission(role, PERM.LAND_PARTITION) },
    ]},
    { key: "hr", label: "HR", actions: [
      { key: "view", label: "View", has: hasPermission(role, PERM.HR_VIEW) },
      { key: "manage", label: "Manage", has: hasPermission(role, PERM.HR_MANAGE) },
      { key: "payroll", label: "Payroll", has: hasPermission(role, PERM.PAYROLL_VIEW) },
      { key: "dpr", label: "DPR", has: hasPermission(role, PERM.DPR_VIEW) },
    ]},
    { key: "company", label: "Company", actions: [
      { key: "manage", label: "Manage", has: hasPermission(role, PERM.COMPANY_MANAGE) },
    ]},
  ];

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

  return (
    <Page>
      <PageHeader
        title="Today"
        description={`${roleDef.label} · ${company.name} · ${formatDate(now)}`}
        stats={headerStats}
      />

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
