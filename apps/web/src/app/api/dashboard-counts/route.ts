import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";

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
  const company = await getCompany();
  const role = await getUserRole();

  const canApprovePO = hasPermission(role, PERM.PO_APPROVE);
  const canApproveReq = hasPermission(role, PERM.REQUISITION_APPROVE);
  const canSeeStock = hasPermission(role, PERM.INVENTORY_VIEW);
  const canSeeProcurement = hasPermission(role, PERM.PROCUREMENT_VIEW);
  const canSeeSales = hasPermission(role, PERM.SALES_VIEW);
  const canManageStock = hasPermission(role, PERM.INVENTORY_MANAGE);

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
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
  ] = await Promise.all([
    prisma.material.findMany({
      where: { deletedAt: null, minStock: { not: null } },
      select: { id: true, minStock: true, stockItems: { where: { location: { deletedAt: null, companyId: company.id } }, select: { qty: true } } },
    }),
    prisma.purchaseOrder.count({ where: { companyId: company.id, status: "DRAFT" } }),
    prisma.materialRequisition.count({ where: { project: { companyId: company.id }, status: "SUBMITTED" } }),
    prisma.purchaseOrder.count({ where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } } }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      select: { id: true, paymentStatus: true },
    }),
    prisma.stockCount.count({ where: { location: { companyId: company.id }, status: { in: ["DRAFT", "COUNTED"] } } }),
    prisma.builtUnit.count({ where: { project: { companyId: company.id }, deletedAt: null, status: "AVAILABLE" } }),
    prisma.materialRequisition.count({ where: { project: { companyId: company.id }, status: "APPROVED" } }),
    prisma.purchaseOrder.count({ where: { companyId: company.id, status: "APPROVED" } }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { not: "CANCELLED" }, orderDate: { gte: sixMonthsAgo } },
      select: { orderDate: true, total: true },
      orderBy: { orderDate: "asc" },
    }),
  ]);

  // ── Low stock computation ──
  const lowStockFull = lowStockItems.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
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
    pendingActions.push({ label: "Stock counts", value: pendingStockCounts });
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
});
