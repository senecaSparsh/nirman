import { connection } from "next/server";
import { Suspense } from "react";
import { prisma, type DprApprovalStatus } from "@nirman/db";
import { trialBalance, projectPnlBatch, materialInventoryValue } from "@nirman/services";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {   getCompany, toNum, getUserRole, getCurrentUser, scopeWhere, getUserPermissions, getCustomRoleLabels, roleDisplayLabel } from "@/lib/server";
import {
  PERM,
  ROLES,
    normalizeRole,
  effectivePermissions,
  PERMISSION_MODULES} from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { CommandCenter } from "@/components/command-center";
import { homeWorldFor } from "@/lib/nav";
import { saleDues } from "@/lib/sale-dues";
import { OwnerFinancialDashboard, type CashPositionData, type ProjectProfitRow } from "@/components/owner-financial-dashboard";
import {
  type QueueData,
  type MembershipData,
  type ProjectAssignmentData,
  type ActivityCount,
  type AuditLogEntry,
  type Capability,
  type PermModule} from "@/components/profile/profile-tabs";

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
  const __effPerms = await getUserPermissions();
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id;
  const isDevBypass = userId === "dev";

  // ── Permission flags ─────────────────────────────────────────────
  const canApprovePO = __effPerms.includes(PERM.PO_APPROVE);
  const canApproveReq = __effPerms.includes(PERM.REQUISITION_APPROVE);
  const canApproveGatePass = __effPerms.includes(PERM.GATE_PASS_APPROVE);
  const canApproveDprSubAdmin = __effPerms.includes(PERM.DPR_APPROVE_SUB_ADMIN);
  const canApproveDprAdmin = __effPerms.includes(PERM.DPR_APPROVE_ADMIN);
  const canApproveExpense = __effPerms.includes(PERM.EXPENSE_APPROVE);
  const canApproveRaBill = __effPerms.includes(PERM.RA_APPROVE);
  // Same status set as /approvals: sub-admins see SUBMITTED, admins also see
  // SUB_ADMIN_APPROVED.
  const dprApprovalStatuses: DprApprovalStatus[] = [];
  if (canApproveDprSubAdmin) dprApprovalStatuses.push("SUBMITTED");
  if (canApproveDprAdmin) dprApprovalStatuses.push("SUB_ADMIN_APPROVED");
  const canSeeStock = __effPerms.includes(PERM.INVENTORY_VIEW);
  const canSeeProcurement = __effPerms.includes(PERM.PROCUREMENT_VIEW);
  const canSeeSales = __effPerms.includes(PERM.SALES_VIEW);
  const canManageStock = __effPerms.includes(PERM.INVENTORY_MANAGE);
  const canManageProcurement = __effPerms.includes(PERM.PROCUREMENT_MANAGE);
  const canManageCompany = __effPerms.includes(PERM.COMPANY_MANAGE);

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
    pendingGatePasses,
    pendingDprs,
    pendingExpenses,
    pendingClaims,
    pendingRaBills,
    pendingCheques,
    overdueInstallments,
  ] = await Promise.all([
    isDevBypass ? null : prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, image: true, role: true, active: true, createdAt: true }}),
    isDevBypass ? [] : prisma.userCompany.findMany({
      take: 500,
      where: { userId },
      include: { company: { select: { id: true, name: true, businessType: true } } },
      orderBy: { createdAt: "asc" }}),
    isDevBypass ? [] : prisma.projectAssignment.findMany({
      take: 500,
      where: {...await scopeWhere("ProjectAssignment"),  userId },
      include: { project: { select: { id: true, name: true, status: true } } },
      orderBy: { assignedAt: "desc" }}),
    // Reorder point = the low-stock trigger — same definition as
    // lowStockAlerts(), /api/briefing, /api/dashboard-counts and
    // auto-requisition. minStock is the critical floor, not "low".
    prisma.material.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null, reorderPoint: { not: null } },
      select: { id: true, name: true, unit: true, reorderPoint: true,
        stockItems: { where: { AND: [{ location: { deletedAt: null, companyId: company.id } }, await scopeWhere("StockLocationItem")] }, select: { qty: true } } }}),
    prisma.purchaseOrder.findMany({
      where: { ...await scopeWhere("PurchaseOrder"), companyId: company.id, status: "DRAFT", createdById: { not: userId } },
      orderBy: { createdAt: "desc" }, take: 5,
      include: { supplier: { select: { name: true } } }}),
    prisma.materialRequisition.findMany({
      where: {...await scopeWhere("MaterialRequisition"),  project: { companyId: company.id }, status: "SUBMITTED", requestedById: { not: userId } },
      orderBy: { createdAt: "desc" }, take: 5,
      include: { project: { select: { name: true } }, lines: { select: { qtyRequested: true } } }}),
    prisma.purchaseOrder.findMany({
      where: { ...await scopeWhere("PurchaseOrder"), companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } },
      orderBy: { expectedDate: "asc" }, take: 5,
      include: { supplier: { select: { name: true } } }}),
    prisma.assetSale.findMany({
      where: {...await scopeWhere("AssetSale"),  companyId: company.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" }, take: 10,
      include: { customer: { select: { name: true } }, payments: { where: { status: { not: "VOID" } }, select: { amount: true, interestAmount: true } } }}),
    prisma.stockCount.findMany({
      where: {
        AND: [
          { location: { companyId: company.id } },
          await scopeWhere("StockCount"),
          { status: { in: ["DRAFT", "COUNTED"] } },
        ],
      },
      orderBy: { countDate: "desc" }, take: 5,
      include: { location: { select: { name: true } } }}),
    prisma.builtUnit.findMany({
      where: {...await scopeWhere("BuiltUnit"),  project: { companyId: company.id }, deletedAt: null, status: "AVAILABLE" },
      orderBy: { updatedAt: "desc" }, take: 5,
      include: { project: { select: { name: true } } }}),
    prisma.materialRequisition.findMany({
      where: {...await scopeWhere("MaterialRequisition"),  project: { companyId: company.id }, status: "APPROVED" },
      orderBy: { approvedAt: "asc" as const }, take: 5,
      include: { project: { select: { name: true } } }}),
    prisma.purchaseOrder.findMany({
      where: { ...await scopeWhere("PurchaseOrder"), companyId: company.id, status: "APPROVED" },
      orderBy: { approvedAt: "asc" as const }, take: 5,
      include: { supplier: { select: { name: true } } }}),
    prisma.purchaseOrder.findMany({
      take: 200,
      where: { ...await scopeWhere("PurchaseOrder"),
        companyId: company.id,
        status: { not: "CANCELLED" },
        orderDate: { gte: sixMonthsAgo }},
      select: { orderDate: true, total: true },
      orderBy: { orderDate: "asc" }}),
    isDevBypass ? null : prisma.auditLog.groupBy({
      by: ["action"], where: { userId },
      _count: { action: true }, orderBy: { _count: { action: "desc" } }, take: 12}),
    isDevBypass ? [] : prisma.auditLog.findMany({
      where: { userId }, orderBy: { timestamp: "desc" }, take: 10}),
    // ── Other approval-queue categories the Today queue was missing ──
    // These mirror /approvals exactly so "N things need you" no longer
    // excludes DPRs, gate passes, expenses, claims and RA bills.
    canApproveGatePass
      ? prisma.gatePass.findMany({
          where: { ...await scopeWhere("GatePass"), companyId: company.id, status: "PENDING", createdById: { not: userId } },
          orderBy: { createdAt: "desc" }, take: 5,
          include: { location: { select: { name: true } } }})
      : [],
    dprApprovalStatuses.length > 0
      ? prisma.dailyProgressReport.findMany({
          where: {...await scopeWhere("DailyProgressReport"),  companyId: company.id, approvalStatus: { in: dprApprovalStatuses }, submittedById: { not: userId }, date: { lte: now } },
          orderBy: { date: "desc" }, take: 5,
          include: { project: { select: { name: true } } }})
      : [],
    canApproveExpense
      ? prisma.expense.findMany({
          where: { ...await scopeWhere("Expense"), companyId: company.id, status: "PENDING", submittedById: { not: userId } },
          orderBy: { createdAt: "desc" }, take: 5,
          include: { project: { select: { name: true } } }})
      : [],
    canApproveExpense
      ? prisma.expenseClaim.findMany({
          where: { ...await scopeWhere("ExpenseClaim"), companyId: company.id, status: "SUBMITTED", claimantId: { not: userId } },
          orderBy: { createdAt: "desc" }, take: 5,
          include: { project: { select: { name: true } }, claimant: { select: { name: true } } }})
      : [],
    canApproveRaBill
      ? prisma.raBill.findMany({
          where: { ...await scopeWhere("RaBill"), companyId: company.id, status: "SUBMITTED", createdById: { not: userId }, submittedById: { not: userId } },
          orderBy: { createdAt: "desc" }, take: 5,
          include: { project: { select: { name: true } }, workOrder: { select: { workOrderNumber: true } } }})
      : [],
    // Pending-clearance cheques — money keyed in but not yet banked. On the
    // dashboard because a stale cheque is invisible until someone reconciles.
    canSeeSales
      ? prisma.assetSalePayment.findMany({
          where: { chequeStatus: "PENDING", assetSale: { companyId: company.id, status: { not: "CANCELLED" } } },
          orderBy: { paymentDate: "asc" }, take: 5,
          include: { assetSale: { select: { id: true, saleNumber: true, customer: { select: { name: true } } } } }})
      : [],
    // Past-due schedule items = the collections queue — a customer who owes
    // money TODAY is far more urgent than a sales-balance aggregate.
    canSeeSales
      ? prisma.paymentScheduleItem.findMany({
          where: {
            status: { in: ["DUE", "PARTIAL"] },
            dueDate: { lt: new Date() },
            paymentSchedule: { assetSale: { companyId: company.id, status: { not: "CANCELLED" } } },
          },
          orderBy: { dueDate: "asc" },
          take: 5,
          include: {
            paymentSchedule: {
              include: { assetSale: { include: { customer: { select: { name: true } } } } },
            },
          }})
      : [],
  ]);

  // ── Owner Financial Dashboard data (OWNER/ADMIN only) ───────────
  const isOwnerOrAdmin = role === "OWNER" || role === "ADMIN";
  let cashPosition: CashPositionData | null = null;
  let projectProfitRows: ProjectProfitRow[] = [];
  // Day-1 setup checklist — a fresh company sees zeros with no direction.
  // Count the primitives a construction business must seed before real work;
  // the card disappears once everything exists.
  let setupSteps: { label: string; href: string; done: boolean }[] = [];

  if (isOwnerOrAdmin) {
    const [tb, projects, invVal, employeeCount, materialCount, supplierCount, customerCount, openingCash, stockLocationItemCount] = await Promise.all([
      trialBalance(company.id),
      prisma.project.findMany({
        take: 200,
        where: { ...await scopeWhere("Project"), companyId: company.id, deletedAt: null },
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" }}),
      materialInventoryValue(company.id),
      prisma.employee.count({ where: { companyId: company.id } }),
      prisma.material.count({ where: { companyId: company.id, deletedAt: null } }),
      prisma.supplier.count({ where: { companyId: company.id } }),
      prisma.customer.count({ where: { companyId: company.id } }),
      prisma.journalEntry.findFirst({
        where: { companyId: company.id, sourceType: "OPENING", sourceId: "cash-bank", status: "POSTED", reversalOfId: null },
        select: { id: true },
      }),
      prisma.stockLocationItem.count({ where: { location: { companyId: company.id } } }),
    ]);

    // Opening balance counts as set whenever cash actually has a balance —
    // the marker entry is only one path in (migrations and bulk imports
    // arrive with cash already in the books).
    const cashAccount = tb.accounts.find((a) => a.code === "1000");
    const cashAlreadyFunded = cashAccount !== undefined && toNum(cashAccount.balance) !== 0;

    setupSteps = [
      { label: "Create your first project", href: "/projects", done: projects.length > 0 },
      { label: "Add your team", href: "/hr/employees", done: employeeCount > 0 },
      { label: "Add materials or import CSV", href: "/materials", done: materialCount > 0 },
      { label: "Add your suppliers", href: "/suppliers", done: supplierCount > 0 },
      { label: "Add your customers", href: "/customers", done: customerCount > 0 },
      { label: "Set opening bank balance", href: "/gl", done: openingCash !== null || cashAlreadyFunded },
      { label: "Load opening stock", href: "/stock", done: stockLocationItemCount > 0 },
    ];

    // Extract key account balances from trial balance
    const findBalance = (code: string) => {
      const acct = tb.accounts.find((a) => a.code === code);
      return acct ? toNum(acct.balance) : 0;
    };
    cashPosition = {
      cashBalance: findBalance("1000"),
      arBalance: findBalance("1200"),
      apBalance: findBalance("2000"),
      inventoryValue: toNum(invVal)};

    // Compute P&L per project (limit to 10 for performance) — batched into 5
    // grouped queries instead of 5 per project (was ~50 queries per load).
    const top10 = projects.slice(0, 10);
    const pnlMap = await projectPnlBatch(top10.map((p) => p.id));
    projectProfitRows = top10.map((p) => {
      const pnl = pnlMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        revenue: toNum(pnl?.revenue),
        cost: toNum(pnl?.total),
        profit: toNum(pnl?.profit),
        margin: toNum(pnl?.margin)} satisfies ProjectProfitRow;
    });
  }

  // ── Low stock computation (reorder point, matching lowStockAlerts) ─
  const lowStock = lowStockItems
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const reorderPoint = toNum(m.reorderPoint);
      return { name: m.name, unit: m.unit, totalQty, reorderPoint, shortfall: reorderPoint - totalQty };
    })
    .filter((m) => toNum(m.totalQty) <= toNum(m.reorderPoint))
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 5);

  // ── Stock health (full counts, not sliced) ───────────────────────
  const lowStockFull = lowStockItems.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    return { totalQty, reorderPoint: toNum(m.reorderPoint) };
  });
  const lowStockCount = lowStockFull.filter((m) => toNum(m.totalQty) <= toNum(m.reorderPoint)).length;
  const healthyStockCount = lowStockFull.length - lowStockCount;
  const stockHealth = healthyStockCount > 0 || lowStockCount > 0
    ? [
        { label: "In stock", value: healthyStockCount, color: "var(--color-success)" },
        { label: "Low stock", value: lowStockCount, color: "var(--color-warning)" },
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
  const totalPOs6mo = procurementTrend.reduce((s, m) => s + toNum(m.count), 0);
  const totalSpend6mo = procurementTrend.reduce((s, m) => s + toNum(m.value), 0);
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
    items: pendingRequisitions.map((r) => ({ label: r.project?.name ?? "N/A", sub: `${formatNumber(r.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0), 0)} units requested`, href: `/requisitions?req=${r.id}` }))});
  if (canApprovePO && draftPOs.length > 0) queues.push({
    key: "po", title: "Purchase orders to approve",
    consequence: "Nothing is ordered from the supplier until these are signed off",
    count: draftPOs.length, href: "/approvals", cta: "Review", urgency: "blocking", icon: "clipboardCheck",
    items: draftPOs.map((po) => ({ label: po.poNumber, sub: po.supplier.name, href: `/procurement/${po.id}` }))});
  if (canApproveGatePass && pendingGatePasses.length > 0) queues.push({
    key: "gp", title: "Gate passes waiting for approval",
    consequence: "Material can't leave the site until these are signed off",
    count: pendingGatePasses.length, href: "/approvals", cta: "Review", urgency: "blocking", icon: "doorOpen",
    items: pendingGatePasses.map((g) => ({ label: g.gatePassNumber, sub: g.location?.name ?? "—" }))});
  if (pendingDprs.length > 0) queues.push({
    key: "dpr", title: "Daily progress reports to approve",
    consequence: "Site work stays unverified until DPRs are approved",
    count: pendingDprs.length, href: "/approvals", cta: "Review", urgency: "blocking", icon: "fileText",
    items: pendingDprs.map((d) => ({ label: d.project?.name ?? "N/A", sub: formatDate(d.date) }))});
  if (canApproveExpense && pendingExpenses.length > 0) queues.push({
    key: "expense", title: "Expenses waiting for approval",
    consequence: "Books stay open until these are approved or rejected",
    count: pendingExpenses.length, href: "/approvals", cta: "Review", urgency: "blocking", icon: "wallet",
    items: pendingExpenses.map((e) => ({ label: e.project?.name ?? "Company", sub: formatDate(e.createdAt) }))});
  if (canApproveExpense && pendingClaims.length > 0) queues.push({
    key: "claim", title: "Expense claims waiting for approval",
    consequence: "Team is waiting on reimbursements",
    count: pendingClaims.length, href: "/approvals", cta: "Review", urgency: "blocking", icon: "wallet",
    items: pendingClaims.map((c) => ({ label: c.claimant?.name ?? "N/A", sub: c.project?.name ?? "Company" }))});
  if (canApproveRaBill && pendingRaBills.length > 0) queues.push({
    key: "ra-bill", title: "RA bills waiting for approval",
    consequence: "Contractor payment is held up until these are certified",
    count: pendingRaBills.length, href: "/approvals", cta: "Review", urgency: "blocking", icon: "calculator",
    items: pendingRaBills.map((b) => ({ label: b.project?.name ?? "N/A", sub: b.workOrder?.workOrderNumber ?? "—" }))});
  if (canSeeProcurement && overduePOs.length > 0) queues.push({
    key: "overdue", title: "Deliveries past their date",
    // Chasing is procurement's job — a site user with view-only access should
    // see the lateness and act on receipt, not be told to call the supplier.
    consequence: canManageProcurement
      ? "Call the supplier and update the delivery date — site is waiting on this material"
      : canManageStock
        ? "Site is waiting on this material — receive it when the truck arrives, or flag it to procurement"
        : "Site is waiting on this material — flag it to procurement",
    count: overduePOs.length, href: "/procurement",
    cta: canManageProcurement ? "Chase" : canManageStock ? "Receive" : "View",
    urgency: "blocking", icon: "truck",
    items: overduePOs.map((po) => ({ label: po.poNumber, sub: `${po.supplier.name} · due ${po.expectedDate ? formatDate(po.expectedDate) : "—"}`, href: `/procurement/${po.id}` }))});
  if (canSeeStock && lowStock.length > 0) queues.push({
    key: "low", title: "Materials below their reorder point",
    consequence: "Raise an indent before site runs out",
    count: lowStock.length, href: "/materials", cta: __effPerms.includes(PERM.PROCUREMENT_MANAGE) || canApproveReq ? "Reorder" : "View", urgency: "soon", icon: "package",
    items: lowStock.map((m) => ({ label: m.name, sub: `${formatNumber(m.totalQty, 0)} ${m.unit} left · need ${formatNumber(m.reorderPoint, 0)}` }))});
  if (canApproveReq && approvedReqs.length > 0) queues.push({
    key: "approved-req", title: "Approved indents ready to order",
    consequence: "Convert these to purchase orders so the supplier can be engaged",
    count: approvedReqs.length, href: "/requisitions", cta: "Convert", urgency: "soon", icon: "clipboardList",
    items: approvedReqs.map((r) => ({ label: r.reqNumber ?? r.id.slice(0, 8), sub: r.project?.name ?? "N/A", href: `/requisitions?req=${r.id}` }))});
  if (canApprovePO && approvedPOs.length > 0) queues.push({
    key: "approved-po", title: "Approved POs ready to send",
    consequence: "Mark these as ordered so the supplier starts fulfilling",
    count: approvedPOs.length, href: "/procurement", cta: "Order", urgency: "soon", icon: "clipboardCheck",
    items: approvedPOs.map((po) => ({ label: po.poNumber, sub: po.supplier.name, href: `/procurement/${po.id}` }))});
  const salesWithBalance = activeSales.filter((s) => s.paymentStatus === "PENDING" || s.paymentStatus === "PARTIAL");
  if (canSeeSales && salesWithBalance.length > 0) queues.push({
    key: "sales-balance", title: "Sales awaiting payment",
    consequence: "Collect outstanding balances from customers",
    // Land on the bookings board (where the sale and its Record Payment action
    // live) — `/sales` opens the leads pipeline, which is a different job.
    count: salesWithBalance.length, href: "/sales?tab=sales", cta: "Collect", urgency: "soon", icon: "dollarSign",
    items: salesWithBalance.map((s) => {
      const due = saleDues({
        salePrice: toNum(s.salePrice),
        gstAmount: toNum(s.gstAmount),
        tdsAmount: toNum(s.tdsAmount),
        payments: s.payments.map((p) => ({ amount: toNum(p.amount), interestAmount: toNum(p.interestAmount) })),
      });
      return { label: s.customer.name, sub: `${formatCurrency(due)} balance due` };
    })});
  // Overdue installments — past dueDate, still unpaid. Blocking urgency: every
  // day late accrues interest AND ages the receivable.
  if (overdueInstallments.length > 0) queues.push({
    key: "overdue-installments", title: "Overdue installments",
    consequence: "Demand payment — interest is accruing at 10.65% p.a.",
    count: overdueInstallments.length, href: "/reports/pending-payments?tab=installments", cta: "Demand", urgency: "blocking", icon: "dollarSign",
    items: overdueInstallments.map((i) => {
      const balance = Math.max(0, toNum(i.totalAmount) - toNum(i.paidAmount));
      const daysLate = Math.floor((now.getTime() - new Date(i.dueDate!).getTime()) / 86400000);
      return { label: i.paymentSchedule.assetSale.customer.name, sub: `#${i.installmentNo} ${formatCurrency(balance)} · ${daysLate}d late`, href: `/sales/${i.paymentSchedule.assetSale.id}` };
    })});
  // Cheques awaiting clearance — a sale "paid" by an uncleared cheque is
  // provisional money; it belongs on the dashboard until the bank confirms.
  if (pendingCheques.length > 0) queues.push({
    key: "pending-cheques", title: "Cheques awaiting clearance",
    consequence: "Confirm clearance or mark bounced — the money isn't usable yet",
    count: pendingCheques.length, href: "/sales", cta: "Clear", urgency: "blocking", icon: "dollarSign",
    items: pendingCheques.map((p) => ({ label: p.assetSale.customer.name, sub: `${formatCurrency(toNum(p.amount))} · ${p.chequeNo ? `chq ${p.chequeNo} · ` : ""}${formatDate(p.paymentDate)}`, href: `/sales/${p.assetSale.id}` }))});
  if (canManageStock && pendingStockCounts.length > 0) queues.push({
    key: "stock-count", title: "Stock inventories to process",
    consequence: "Confirm counts and reconcile variances to keep stock accurate",
    count: pendingStockCounts.length, href: "/stock?tab=counts", cta: "Process", urgency: "soon", icon: "clipboardCheck",
    items: pendingStockCounts.map((c) => ({ label: c.location.name, sub: c.status === "DRAFT" ? "Awaiting confirmation" : "Awaiting reconciliation" }))});
  if (canSeeSales && availableUnits.length > 0) queues.push({
    key: "units-sell", title: "Units ready to sell",
    consequence: "These built units are available — find buyers and close sales",
    count: availableUnits.length, href: "/units", cta: __effPerms.includes(PERM.SALE_CREATE) ? "Sell" : "View", urgency: "soon", icon: "home",
    items: availableUnits.map((u) => ({ label: u.unitNumber, sub: u.project.name }))});

  const blockingQueues = queues.filter((q) => q.urgency === "blocking").reduce((n, q) => n + toNum(q.count), 0);
  const totalQueues = queues.reduce((n, q) => n + toNum(q.count), 0);

  // ── Pending actions by type (for chart) ──────────────────────────
  const pendingActions: { label: string; value: number }[] = [];
  if (canApproveReq && pendingRequisitions.length > 0) pendingActions.push({ label: "Pending indents", value: pendingRequisitions.length });
  if (canApprovePO && draftPOs.length > 0) pendingActions.push({ label: "Draft POs", value: draftPOs.length });
  if (canApproveGatePass && pendingGatePasses.length > 0) pendingActions.push({ label: "Gate passes", value: pendingGatePasses.length });
  if (pendingDprs.length > 0) pendingActions.push({ label: "DPRs", value: pendingDprs.length });
  if (canApproveExpense && pendingExpenses.length > 0) pendingActions.push({ label: "Expenses", value: pendingExpenses.length });
  if (canApproveExpense && pendingClaims.length > 0) pendingActions.push({ label: "Claims", value: pendingClaims.length });
  if (canApproveRaBill && pendingRaBills.length > 0) pendingActions.push({ label: "RA bills", value: pendingRaBills.length });
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
        if (!p.endsWith(".view")) return __effPerms.includes(p);
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
      return { key: action, label, has: __effPerms.includes(perm) };
    })}));

  // ── Activity data ────────────────────────────────────────────────
  const activityCounts: ActivityCount[] = (userActivityCounts ?? []).map((g) => ({
    action: g.action,
    count: g._count.action}));
  const auditLogs: AuditLogEntry[] = userAuditLogs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    timestamp: log.timestamp.toISOString()}));
  const totalActions = activityCounts.reduce((s, g) => s + toNum(g.count), 0);
  const hasActivity = !isDevBypass && activityCounts.length > 0;

  // ── Memberships ──────────────────────────────────────────────────
  // Resolve stored role keys to human labels — a CUSTOM_* membership
  // renders the custom role's label, not the raw key or a normalized
  // "Supervisor" fallback for the user's own role.
  const customLabels = await getCustomRoleLabels([...new Set(memberships.map((m) => m.company.id))]);
  const currentRoleKey = memberships.find((m) => m.company.id === company.id)?.role;
  // The label the user actually holds — CUSTOM_* resolves to its custom
  // label, not the normalizeRole() "Supervisor" fallback. roleDef stays
  // normalized (it's only used for description/capability logic).
  const displayRoleLabel = currentRoleKey
    ? roleDisplayLabel(currentRoleKey, company.id, customLabels)
    : roleDef.label;
  const membershipData: MembershipData[] = memberships.map((m) => ({
    id: m.id,
    company: { id: m.company.id, name: m.company.name, businessType: m.company.businessType },
    role: m.role,
    roleLabel: roleDisplayLabel(m.role, m.company.id, customLabels),
    isCurrent: m.company.id === company.id}));

  // ── Project assignments ──────────────────────────────────────────
  const assignmentData: ProjectAssignmentData[] = projectAssignments.map((a) => ({
    id: a.id,
    scopedRole: a.scopedRole,
    project: { id: a.project.id, name: a.project.name, status: a.project.status }}));

  // ── PageHeader stats — the dashboard's instrument panel ──────────
  const headerStats: { label: string; value: string | number; tone?: "default" | "warning" | "danger" }[] = [
    { label: "Role", value: displayRoleLabel },
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
        description={`${displayRoleLabel} · ${company.name} · ${formatDate(now)}`}
        stats={headerStats}
      />

      {hasHomeOverride && (
        <a
          href={homeWorld.href}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption font-medium text-brand-strong hover:bg-brand/5 transition-colors"
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
        roleLabel={displayRoleLabel}
        roleDescription={roleDef.description}
        canManageCompany={canManageCompany}
        setupSteps={setupSteps}
        queues={queues}
        totalQueues={totalQueues}
        blockingQueues={blockingQueues}
        canApprove={canApprovePO || canApproveReq}
        canSeeTasks={__effPerms.includes(PERM.TASKS_VIEW)}
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
