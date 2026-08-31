import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getUserPermissions, json, requireUser, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/briefing
 *
 * Returns the "morning briefing" — a glanceable summary of what needs
 * attention today. Role-personalized: managers see approvals + alerts,
 * field workers see their attendance + DPR + tasks.
 *
 * Response sections:
 * - approvals: { poCount, reqCount, gpCount, dprCount, total }
 * - lowStock: [{ materialName, qty, unit, reorderPoint }]
 * - deliveriesToday: [{ poNumber, supplierName, projectName, total }]
 * - paymentsDue: [{ description, amount, dueDate, type }]
 * - myTasks: [{ title, projectName, dueDate, priority }]
 * - myDpr: { submitted: boolean, date }
 * - myAttendance: { checkedIn: boolean, status }
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const perms = await getUserPermissions();

  const canApprovePo = perms.includes(PERM.PO_APPROVE);
  const canApproveReq = perms.includes(PERM.REQUISITION_APPROVE);
  const canApproveGp = perms.includes(PERM.GATE_PASS_APPROVE);
  const canApproveDpr = perms.includes(PERM.DPR_APPROVE_SUB_ADMIN) || perms.includes(PERM.DPR_APPROVE_ADMIN);
  const canViewInventory = perms.includes(PERM.INVENTORY_VIEW);
  const canViewFinance = perms.includes(PERM.FINANCE_VIEW);

  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  // ── 1. Approvals waiting on YOU ──
  const [poCount, reqCount, gpCount, dprCount] = await Promise.all([
    canApprovePo
      ? prisma.purchaseOrder.count({ where: { companyId: company.id, status: "DRAFT" } })
      : 0,
    canApproveReq
      ? prisma.materialRequisition.count({
          where: { project: { companyId: company.id }, status: "SUBMITTED" },
        })
      : 0,
    canApproveGp
      ? prisma.gatePass.count({ where: { companyId: company.id, status: "PENDING" } })
      : 0,
    canApproveDpr
      ? prisma.dailyProgressReport.count({
          where: {
            project: { companyId: company.id },
            approvalStatus: "SUBMITTED",
          },
        })
      : 0,
  ]);

  const approvalsTotal = poCount + reqCount + gpCount + dprCount;

  // ── 2. Low-stock alerts (triggered overnight) ──
  let lowStock: Array<{ materialId: string; materialName: string; materialCode: string; qty: number; unit: string; reorderPoint: number | null }> = [];
  if (canViewInventory) {
    const lowStockItems = await prisma.stockLocationItem.findMany({
      where: {
        location: { companyId: company.id, deletedAt: null },
        material: { deletedAt: null, reorderPoint: { not: null } },
      },
      include: {
        material: { select: { id: true, name: true, code: true, unit: true, reorderPoint: true } },
      },
    });
    // Aggregate by material across locations
    const byMaterial = new Map<string, { materialId: string; materialName: string; materialCode: string; qty: number; unit: string; reorderPoint: number | null }>();
    for (const item of lowStockItems) {
      const existing = byMaterial.get(item.materialId);
      const qty = toNum(item.qty);
      if (existing) {
        existing.qty += qty;
      } else {
        byMaterial.set(item.materialId, {
          materialId: item.materialId,
          materialName: item.material.name,
          materialCode: item.material.code,
          qty,
          unit: item.material.unit,
          reorderPoint: item.material.reorderPoint ? toNum(item.material.reorderPoint) : null,
        });
      }
    }
    lowStock = Array.from(byMaterial.values())
      .filter((m) => m.reorderPoint != null && m.qty < m.reorderPoint)
      .sort((a, b) => (a.reorderPoint! - a.qty) / a.reorderPoint! - (b.reorderPoint! - b.qty) / b.reorderPoint!)
      .slice(0, 5);
  }

  // ── 3. Deliveries expected today ──
  let deliveriesToday: Array<{ poNumber: string; supplierName: string; projectName: string | null; total: number }> = [];
  if (canViewInventory) {
    const deliveries = await prisma.purchaseOrder.findMany({
      where: {
        companyId: company.id,
        status: "APPROVED",
        expectedDate: { gte: startOfToday, lt: endOfToday },
      },
      include: {
        supplier: { select: { name: true } },
        project: { select: { name: true } },
      },
      take: 5,
    });
    deliveriesToday = deliveries.map((d) => ({
      poNumber: d.poNumber,
      supplierName: d.supplier.name,
      projectName: d.project?.name ?? null,
      total: toNum(d.total),
    }));
  }

  // ── 4. Payments due today / overdue ──
  let paymentsDue: Array<{ description: string; amount: number; dueDate: string; type: string }> = [];
  if (canViewFinance) {
    // Overdue purchase orders (goods received but not paid)
    const overduePos = await prisma.purchaseOrder.findMany({
      where: {
        companyId: company.id,
        status: "APPROVED",
        // POs that have been received but have outstanding balance
        // Simplified: POs with expectedDate in the past that are still APPROVED
        expectedDate: { lt: startOfToday },
      },
      include: {
        supplier: { select: { name: true } },
      },
      take: 5,
    });
    paymentsDue = overduePos.map((po) => ({
      description: `PO ${po.poNumber} — ${po.supplier.name}`,
      amount: toNum(po.total),
      dueDate: po.expectedDate?.toISOString() ?? po.createdAt.toISOString(),
      type: "purchase_order",
    }));
  }

  // ── 5. My tasks (for field workers) ──
  const myEmployee = await prisma.employee.findFirst({
    where: { userId: user.id, companyId: company.id, deletedAt: null, active: true },
    select: { id: true, name: true, activeProjectId: true },
  });

  let myTasks: Array<{ id: string; title: string; projectName: string | null; dueDate: string | null; priority: string }> = [];
  let myDpr: { submitted: boolean; date: string | null } = { submitted: false, date: null };
  let myAttendance: { checkedIn: boolean; status: string | null } = { checkedIn: false, status: null };

  if (myEmployee) {
    // Today's attendance
    const attendance = await prisma.workerAttendance.findFirst({
      where: {
        employeeId: myEmployee.id,
        date: { gte: startOfToday, lt: endOfToday },
      },
      select: { checkIn: true, status: true },
    });
    myAttendance = {
      checkedIn: !!attendance?.checkIn,
      status: attendance?.status ?? null,
    };

    // Today's DPR for active project
    if (myEmployee.activeProjectId) {
      const dpr = await prisma.dailyProgressReport.findFirst({
        where: {
          projectId: myEmployee.activeProjectId,
          date: { gte: startOfToday, lt: endOfToday },
        },
        select: { id: true, date: true, approvalStatus: true },
      });
      myDpr = {
        submitted: !!dpr,
        date: dpr?.date.toISOString() ?? null,
      };
    }

    // Tasks assigned to me
    const tasks = await prisma.task.findMany({
      where: {
        assignedToId: user.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 5,
    });
    myTasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectName: null,
      dueDate: t.dueDate?.toISOString() ?? null,
      priority: t.priority,
    }));
  }

  // ── 6. Summary counts ──
  const [activeProjects, activeEmployees, pendingDprsTotal] = await Promise.all([
    prisma.project.count({ where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } } }),
    prisma.employee.count({ where: { companyId: company.id, deletedAt: null, active: true } }),
    prisma.dailyProgressReport.count({
      where: {
        project: { companyId: company.id },
        approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] },
      },
    }),
  ]);

  return json({
    date: today.toISOString().split("T")[0],
    user: { id: user.id, name: user.name, role: user.role },
    approvals: {
      poCount,
      reqCount,
      gpCount,
      dprCount,
      total: approvalsTotal,
      canApprovePo,
      canApproveReq,
      canApproveGp,
      canApproveDpr,
    },
    lowStock,
    deliveriesToday,
    paymentsDue,
    myTasks,
    myDpr,
    myAttendance,
    summary: {
      activeProjects,
      activeEmployees,
      pendingDprsTotal,
    },
  });
});
