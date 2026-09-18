import { NextRequest } from "next/server";
import { prisma, type DprApprovalStatus } from "@nirman/db";
import { apiHandler, json, getCompany, requireUser, toNum, scopeWhere, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/dashboard-counts — lightweight counts for dashboard polling.
 *
 * Returns just the numbers the KPI strip and queue cards need, so the
 * dashboard can poll every 30 seconds without re-rendering the entire
 * server component. This is the 80/20 alternative to SSE (§2D).
 *
 * Response shape:
 *   {
 *     queues: { key, count, urgency }[],
 *     totalQueues: number,
 *     blockingQueues: number,
 *     kpis: {
 *       totalPOs6mo: number,
 *       totalSpend6mo: number,
 *       lowStockCount: number,
 *       healthyStockCount: number,
 *       pendingActions: { label, value }[],
 *     }
 *   }
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const __effPerms = await getUserPermissions();

  const canApprovePO = __effPerms.includes(PERM.PO_APPROVE);
  const canApproveReq = __effPerms.includes(PERM.REQUISITION_APPROVE);
  const canApproveGatePass = __effPerms.includes(PERM.GATE_PASS_APPROVE);
  const canApproveDprSubAdmin = __effPerms.includes(PERM.DPR_APPROVE_SUB_ADMIN);
  const canApproveDprAdmin = __effPerms.includes(PERM.DPR_APPROVE_ADMIN);
  const canApproveExpense = __effPerms.includes(PERM.EXPENSE_APPROVE);
  const canApproveRaBill = __effPerms.includes(PERM.RA_APPROVE);
  const canSeeStock = __effPerms.includes(PERM.INVENTORY_VIEW);
  const canSeeProcurement = __effPerms.includes(PERM.PROCUREMENT_VIEW);
  const canSeeSales = __effPerms.includes(PERM.SALES_VIEW);
  const canManageStock = __effPerms.includes(PERM.INVENTORY_MANAGE);

  // Same status set as /approvals and the Today page.
  const dprApprovalStatuses: DprApprovalStatus[] = [];
  if (canApproveDprSubAdmin) dprApprovalStatuses.push("SUBMITTED");
  if (canApproveDprAdmin) dprApprovalStatuses.push("SUB_ADMIN_APPROVED");

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Pre-compute scope filters for scoped models (maintains Promise.all parallelism)
  const reqScope = await scopeWhere("MaterialRequisition", {});
  const assetSaleScope = await scopeWhere("AssetSale", {});
  const builtUnitScope = await scopeWhere("BuiltUnit", {});
  const poScope = await scopeWhere("PurchaseOrder", {});
  const dprScope = await scopeWhere("DailyProgressReport", {});
  const gpScope = await scopeWhere("GatePass", {});

  const [
    lowStockItems,
    stockByMaterial,
    draftPOs,
    pendingRequisitions,
    overduePOs,
    activeSales,
    pendingStockCounts,
    availableUnits,
    approvedReqs,
    approvedPOs,
    poTrendOrders,
    pendingGatePasses,
    pendingDprs,
    pendingExpenses,
    pendingClaims,
    pendingRaBills,
  ] = await Promise.all([
    prisma.material.findMany({
      where: { companyId: company.id, deletedAt: null, minStock: { not: null } },
      select: { id: true, minStock: true },
    }),
    // DB-side per-material stock totals — replaces hydrating every
    // StockLocationItem per material just to compute two counts, and
    // removes the old take:1000 silent truncation.
    prisma.stockLocationItem.groupBy({
      by: ["materialId"],
      where: { location: { deletedAt: null, companyId: company.id } },
      _sum: { qty: true },
    }),
    // Excludes items the user created — the Today queue only shows what
    // needs *their* approval, so the polled count must exclude them too
    // (otherwise the total jumps up 30s after load for self-created work).
    prisma.purchaseOrder.count({ where: { companyId: company.id, status: "DRAFT", createdById: { not: user.id }, ...poScope } }),
    prisma.materialRequisition.count({ where: { project: { companyId: company.id }, status: "SUBMITTED", requestedById: { not: user.id }, ...reqScope } }),
    prisma.purchaseOrder.count({ where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() }, ...poScope } }),
    prisma.assetSale.findMany({
      take: 1000,
      where: { companyId: company.id, status: "ACTIVE", ...assetSaleScope },
      select: { id: true, paymentStatus: true },
    }),
    prisma.stockCount.count({ where: { location: { companyId: company.id }, status: { in: ["DRAFT", "COUNTED"] } } }),
    prisma.builtUnit.count({ where: { project: { companyId: company.id }, deletedAt: null, status: "AVAILABLE", ...builtUnitScope } }),
    prisma.materialRequisition.count({ where: { project: { companyId: company.id }, status: "APPROVED", ...reqScope } }),
    prisma.purchaseOrder.count({ where: { companyId: company.id, status: "APPROVED", ...poScope } }),
    prisma.purchaseOrder.findMany({
      take: 1000,
      where: { companyId: company.id, status: { not: "CANCELLED" }, orderDate: { gte: sixMonthsAgo }, ...poScope },
      select: { orderDate: true, total: true },
      orderBy: { orderDate: "asc" },
    }),
    // ── The other approval-queue categories (mirrors /approvals + page.tsx) ──
    canApproveGatePass
      ? prisma.gatePass.count({ where: { companyId: company.id, status: "PENDING", createdById: { not: user.id }, ...gpScope } })
      : Promise.resolve(0),
    dprApprovalStatuses.length > 0
      ? prisma.dailyProgressReport.count({ where: { companyId: company.id, approvalStatus: { in: dprApprovalStatuses }, submittedById: { not: user.id }, ...dprScope } })
      : Promise.resolve(0),
    canApproveExpense
      ? prisma.expense.count({ where: { companyId: company.id, status: "PENDING", submittedById: { not: user.id } } })
      : Promise.resolve(0),
    canApproveExpense
      ? prisma.expenseClaim.count({ where: { companyId: company.id, status: "SUBMITTED", claimantId: { not: user.id } } })
      : Promise.resolve(0),
    canApproveRaBill
      ? prisma.raBill.count({ where: { companyId: company.id, status: "SUBMITTED", createdById: { not: user.id }, submittedById: { not: user.id } } })
      : Promise.resolve(0),
  ]);

  // ── Low stock computation ──
  const qtyByMaterial = new Map(
    stockByMaterial.map((s) => [s.materialId, toNum(s._sum.qty ?? 0)]),
  );
  const lowStockFull = lowStockItems.map((m) => {
    const totalQty = qtyByMaterial.get(m.id) ?? 0;
    return { totalQty, minStock: toNum(m.minStock) };
  });
  const lowStockCount = lowStockFull.filter((m) => m.totalQty < m.minStock).length;
  const healthyStockCount = lowStockFull.length - lowStockCount;

  // ── Procurement trend (6 months) ──
  let totalPOs6mo = 0;
  let totalSpend6mo = 0;
  for (const o of poTrendOrders) {
    totalPOs6mo += 1;
    totalSpend6mo += toNum(o.total);
  }

  // ── Queues (counts only — no item lists for polling) ──
  const queues: { key: string; count: number; urgency: "blocking" | "soon" }[] = [];
  const pendingActions: { label: string; value: number }[] = [];

  if (canApproveReq && pendingRequisitions > 0) {
    queues.push({ key: "req", count: pendingRequisitions, urgency: "blocking" });
    pendingActions.push({ label: "Pending reqs", value: pendingRequisitions });
  }
  if (canApprovePO && draftPOs > 0) {
    queues.push({ key: "po", count: draftPOs, urgency: "blocking" });
    pendingActions.push({ label: "Draft POs", value: draftPOs });
  }
  if (canApproveGatePass && pendingGatePasses > 0) {
    queues.push({ key: "gp", count: pendingGatePasses, urgency: "blocking" });
    pendingActions.push({ label: "Gate passes", value: pendingGatePasses });
  }
  if (pendingDprs > 0) {
    queues.push({ key: "dpr", count: pendingDprs, urgency: "blocking" });
    pendingActions.push({ label: "DPRs", value: pendingDprs });
  }
  if (canApproveExpense && pendingExpenses > 0) {
    queues.push({ key: "expense", count: pendingExpenses, urgency: "blocking" });
    pendingActions.push({ label: "Expenses", value: pendingExpenses });
  }
  if (canApproveExpense && pendingClaims > 0) {
    queues.push({ key: "claim", count: pendingClaims, urgency: "blocking" });
    pendingActions.push({ label: "Claims", value: pendingClaims });
  }
  if (canApproveRaBill && pendingRaBills > 0) {
    queues.push({ key: "ra-bill", count: pendingRaBills, urgency: "blocking" });
    pendingActions.push({ label: "RA bills", value: pendingRaBills });
  }
  if (canSeeProcurement && overduePOs > 0) {
    queues.push({ key: "overdue", count: overduePOs, urgency: "blocking" });
    pendingActions.push({ label: "Overdue POs", value: overduePOs });
  }
  if (canSeeStock && lowStockCount > 0) {
    queues.push({ key: "low", count: lowStockCount, urgency: "soon" });
    pendingActions.push({ label: "Low stock", value: lowStockCount });
  }
  if (canApproveReq && approvedReqs > 0) {
    queues.push({ key: "approved-req", count: approvedReqs, urgency: "soon" });
    pendingActions.push({ label: "Ready to order", value: approvedReqs });
  }
  if (canApprovePO && approvedPOs > 0) {
    queues.push({ key: "approved-po", count: approvedPOs, urgency: "soon" });
    pendingActions.push({ label: "Ready to send", value: approvedPOs });
  }
  const salesWithBalance = activeSales.filter((s) => s.paymentStatus === "PENDING" || s.paymentStatus === "PARTIAL");
  if (canSeeSales && salesWithBalance.length > 0) {
    queues.push({ key: "sales-balance", count: salesWithBalance.length, urgency: "soon" });
    pendingActions.push({ label: "Sales dues", value: salesWithBalance.length });
  }
  if (canManageStock && pendingStockCounts > 0) {
    queues.push({ key: "stock-count", count: pendingStockCounts, urgency: "soon" });
    pendingActions.push({ label: "Stock inventories", value: pendingStockCounts });
  }
  if (canSeeSales && availableUnits > 0) {
    queues.push({ key: "units-sell", count: availableUnits, urgency: "soon" });
  }

  const blockingQueues = queues.filter((q) => q.urgency === "blocking").reduce((n, q) => n + q.count, 0);
  const totalQueues = queues.reduce((n, q) => n + q.count, 0);

  return json({
    queues,
    totalQueues,
    blockingQueues,
    kpis: {
      totalPOs6mo,
      totalSpend6mo,
      lowStockCount,
      healthyStockCount,
      pendingActions,
    },
  });
}, {
  // Polled every 30s by every open dashboard — serve repeat hits from
  // memory for 15s (halves DB load; staleness is bounded by the poll
  // interval anyway). Keyed per user+company by buildCacheKey.
  cache: { tag: "dashboard", ttlMs: 15_000 },
});
