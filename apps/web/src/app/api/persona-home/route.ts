import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  apiHandler,
  getCompany,
  getUserPermissions,
  json,
  requireUser,
  scopeWhere,
  toNum,
  getOwnRole } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { roleToPersona } from "@/lib/mobile-nav-v2";

/**
 * GET /api/persona-home
 *
 * Feeds the SIGNATURE component on /m/home — the per-persona equivalent of
 * the executive's OrbitNavigator. Each persona gets a payload shaped around
 * the axis that role actually thinks in, not a generic counter bundle:
 *
 *   field       → time. A shift timeline for today.
 *   ops         → comparison. Project health small-multiples.
 *   procurement → stage progression. The requisition→invoice pipeline.
 *   sales       → funnel + money. Lead stages weighted by budget.
 *   finance     → money over time. Inflow/outflow + payables aging.
 *   hr          → people present now. Today's muster by site.
 *
 * The executive persona is intentionally NOT served here — it renders the
 * OrbitNavigator, which has its own `/api/orbit` hierarchy endpoint.
 *
 * Every section is permission-gated independently, so a user holding a
 * narrow grant gets a smaller dashboard rather than a 403. The response is
 * always `{ persona, ...sections }` so the client can render partially.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const perms = await getUserPermissions();
  const persona = roleToPersona(await getOwnRole());

  const has = (p: string) => perms.includes(p);

  // Day boundaries — same UTC-normalised convention as /api/briefing so the
  // two surfaces never disagree about what "today" means.
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
  const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

  switch (persona) {
    case "field":
      return json({ persona, shift: await buildShift() });
    case "ops":
      return json({ persona, pulse: await buildPulse() });
    case "procurement":
      return json({ persona, pipeline: await buildPipeline() });
    case "sales":
      return json({ persona, funnel: await buildFunnel() });
    case "finance":
      return json({ persona, cash: await buildCash() });
    case "hr":
      return json({ persona, muster: await buildMuster() });
    default:
      // Executive renders the OrbitNavigator — nothing to compute here.
      return json({ persona });
  }

  /* ═════════════════════════════════════════════════════════════════════
     FIELD — "Shift Rail": everything that happens today, on a time axis.
     ═════════════════════════════════════════════════════════════════════ */
  async function buildShift() {
    const employee = await prisma.employee.findFirst({
      where: {
        userId: user.id,
        companyId: company.id,
        deletedAt: null,
        active: true,
      },
      select: {
        id: true,
        name: true,
        activeProjectId: true,
        activeProject: { select: { id: true, name: true } },
      },
    });

    const [attendance, tasks] = await Promise.all([
      employee
        ? prisma.workerAttendance.findFirst({
            where: {
              employeeId: employee.id,
              date: { gte: startOfToday, lt: endOfToday },
            },
            select: {
              checkIn: true,
              checkOut: true,
              status: true,
              hoursWorked: true,
              checkInLocation: true,
            },
          })
        : null,
      has(PERM.TASKS_VIEW)
        ? prisma.task.findMany({
            where: {
              assignedToId: user.id,
              status: { in: ["PENDING", "IN_PROGRESS"] },
            },
            orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
            take: 6,
            select: {
              id: true,
              title: true,
              dueDate: true,
              priority: true,
              status: true,
            },
          })
        : [],
    ]);

    // Today's DPR for the worker's active site — the single most important
    // "did I close the loop" signal for a site engineer.
    const dpr =
      employee?.activeProjectId && has(PERM.DPR_VIEW)
        ? await prisma.dailyProgressReport.findFirst({
            where: {
              projectId: employee.activeProjectId,
              date: { gte: startOfToday, lt: endOfToday },
            },
            select: { id: true, approvalStatus: true },
          })
        : null;

    // Deliveries landing at site today — what the engineer must be present
    // to receive. ORDERED/APPROVED only: DRAFT isn't coming, RECEIVED is done.
    const deliveries = has(PERM.PROCUREMENT_VIEW)
      ? await prisma.purchaseOrder.findMany({
          where: {
            companyId: company.id,
            status: { in: ["APPROVED", "ORDERED", "PARTIAL"] },
            expectedDate: { gte: startOfToday, lt: endOfToday },
            ...(employee?.activeProjectId
              ? { projectId: employee.activeProjectId }
              : {}),
          },
          orderBy: { expectedDate: "asc" },
          take: 5,
          select: {
            id: true,
            poNumber: true,
            expectedDate: true,
            supplier: { select: { name: true } },
          },
        })
      : [];

    return {
      employee: employee
        ? { id: employee.id, name: employee.name }
        : null,
      // Capability flags — the rail renders steps only for actions the
      // caller can actually take (e.g. a SECURITY_GUARD checks in but
      // never files a DPR and never marks crew attendance).
      can: {
        dpr: has(PERM.DPR_VIEW) || has(PERM.DPR_SUBMIT),
        attendanceLog: has(PERM.HR_VIEW) || has(PERM.ATTENDANCE_LOG),
      },
      site: employee?.activeProject
        ? { id: employee.activeProject.id, name: employee.activeProject.name }
        : null,
      attendance: attendance
        ? {
            checkIn: attendance.checkIn?.toISOString() ?? null,
            checkOut: attendance.checkOut?.toISOString() ?? null,
            status: attendance.status,
            hoursWorked: attendance.hoursWorked
              ? toNum(attendance.hoursWorked)
              : null,
            location: attendance.checkInLocation,
          }
        : null,
      dpr: { submitted: !!dpr, status: dpr?.approvalStatus ?? null, id: dpr?.id ?? null },
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate?.toISOString() ?? null,
        priority: t.priority,
        overdue: !!t.dueDate && t.dueDate < now,
      })),
      deliveries: deliveries.map((d) => ({
        id: d.id,
        poNumber: d.poNumber,
        supplierName: d.supplier.name,
        expectedDate: d.expectedDate?.toISOString() ?? null,
      })),
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     OPS — "Project Pulse": one health card per site, sorted by risk.
     ═════════════════════════════════════════════════════════════════════ */
  async function buildPulse() {
    if (!has(PERM.PROJECTS_VIEW)) return { projects: [], totals: null };

    const projectScope = await scopeWhere("Project", {
      companyId: company.id,
      deletedAt: null,
      status: { in: ["PLANNED", "ACTIVE"] },
    });

    const projects = await prisma.project.findMany({
      where: projectScope,
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        status: true,
        totalBudget: true,
        totalProjectCost: true,
        startDate: true,
        endDate: true,
      },
    });
    if (projects.length === 0) return { projects: [], totals: null };

    const ids = projects.map((p) => p.id);

    // Three signals per project, each a single grouped query rather than
    // N queries per card.
    const [openReqs, pendingDprs, presentToday] = await Promise.all([
      prisma.materialRequisition.groupBy({
        by: ["projectId"],
        where: { projectId: { in: ids }, status: { in: ["SUBMITTED", "APPROVED"] } },
        _count: { _all: true },
      }),
      prisma.dailyProgressReport.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: ids },
          approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] },
        },
        _count: { _all: true },
      }),
      prisma.workerAttendance.groupBy({
        by: ["projectId"],
        where: {
          projectId: { in: ids },
          date: { gte: startOfToday, lt: endOfToday },
          status: { in: ["PRESENT", "OVERTIME", "HALF_DAY", "LATE"] },
        },
        _count: { _all: true },
      }),
    ]);

    const countOf = (
      rows: { projectId: string | null; _count: { _all: number } }[],
      id: string,
    ) => rows.find((r) => r.projectId === id)?._count._all ?? 0;

    const cards = projects.map((p) => {
      const budget = toNum(p.totalBudget);
      const spent = toNum(p.totalProjectCost);
      // Burn = how much of the budget is consumed. >100% is an overrun.
      const burn = budget > 0 ? Math.round((spent / budget) * 100) : null;

      // Schedule position — where we are between start and end, by time.
      let schedule: number | null = null;
      if (p.startDate && p.endDate) {
        const span = p.endDate.getTime() - p.startDate.getTime();
        schedule =
          span > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  Math.round(
                    ((now.getTime() - p.startDate.getTime()) / span) * 100,
                  ),
                ),
              )
            : null;
      }

      const dprBacklog = countOf(pendingDprs, p.id);
      const reqBacklog = countOf(openReqs, p.id);
      const crew = countOf(presentToday, p.id);

      // Risk is what sorts the grid: budget overrun dominates, then an
      // unapproved-DPR backlog (progress not being signed off), then
      // requisitions waiting, then a site with nobody on it.
      const overBudget = burn != null && burn > 100;
      const burnAhead =
        burn != null && schedule != null && burn - schedule > 15;
      const risk =
        (overBudget ? 100 : 0) +
        (burnAhead ? 40 : 0) +
        Math.min(dprBacklog, 10) * 3 +
        Math.min(reqBacklog, 10) * 2 +
        (crew === 0 ? 8 : 0);

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        budget,
        spent,
        burn,
        schedule,
        dprBacklog,
        reqBacklog,
        crew,
        risk,
        flag: overBudget
          ? ("over" as const)
          : burnAhead
            ? ("watch" as const)
            : ("ok" as const),
      };
    });

    cards.sort((a, b) => b.risk - a.risk);

    return {
      projects: cards,
      totals: {
        budget: cards.reduce((s, c) => s + c.budget, 0),
        spent: cards.reduce((s, c) => s + c.spent, 0),
        crew: cards.reduce((s, c) => s + c.crew, 0),
        atRisk: cards.filter((c) => c.flag !== "ok").length,
      },
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     PROCUREMENT — "Pipeline Flow": requisition → invoice, with aging.
     ═════════════════════════════════════════════════════════════════════ */
  async function buildPipeline() {
    if (!has(PERM.PROCUREMENT_VIEW)) return { stages: [] };

    const reqScope = await scopeWhere("MaterialRequisition", {
      status: "SUBMITTED",
    });

    // Each stage reports a count AND its oldest item, because a pipeline's
    // real problem is never the count — it's the thing that has been stuck
    // in one stage for three weeks.
    const [
      reqCount,
      reqOldest,
      rfqCount,
      rfqOldest,
      poApprovalCount,
      poApprovalOldest,
      inTransitCount,
      inTransitOldest,
      inspectCount,
      inspectOldest,
      invoiceCount,
      invoiceOldest,
    ] = await Promise.all([
      prisma.materialRequisition.count({ where: reqScope }),
      prisma.materialRequisition.findFirst({
        where: reqScope,
        orderBy: { requestDate: "asc" },
        select: { reqNumber: true, requestDate: true },
      }),
      prisma.quotationRequest.count({
        where: { companyId: company.id, status: { in: ["OPEN", "QUOTES_COLLECTED"] } },
      }),
      prisma.quotationRequest.findFirst({
        where: { companyId: company.id, status: { in: ["OPEN", "QUOTES_COLLECTED"] } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.purchaseOrder.count({
        where: { companyId: company.id, status: "DRAFT" },
      }),
      prisma.purchaseOrder.findFirst({
        where: { companyId: company.id, status: "DRAFT" },
        orderBy: { orderDate: "asc" },
        select: { poNumber: true, orderDate: true },
      }),
      prisma.purchaseOrder.count({
        where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] } },
      }),
      prisma.purchaseOrder.findFirst({
        where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] } },
        orderBy: { orderDate: "asc" },
        select: { poNumber: true, orderDate: true },
      }),
      prisma.goodsReceipt.count({
        where: {
          purchaseOrder: { companyId: company.id },
          inspectionStatus: "PENDING",
        },
      }),
      prisma.goodsReceipt.findFirst({
        where: {
          purchaseOrder: { companyId: company.id },
          inspectionStatus: "PENDING",
        },
        orderBy: { receiptDate: "asc" },
        select: { receiptDate: true },
      }),
      prisma.supplierInvoice.count({
        where: { companyId: company.id, status: { in: ["PENDING", "DISPUTED"] } },
      }),
      prisma.supplierInvoice.findFirst({
        where: { companyId: company.id, status: { in: ["PENDING", "DISPUTED"] } },
        orderBy: { invoiceDate: "asc" },
        select: { invoiceNumber: true, invoiceDate: true },
      }),
    ]);

    const ageDays = (d: Date | null | undefined) =>
      d ? Math.floor((now.getTime() - d.getTime()) / 86_400_000) : null;

    const stages = [
      {
        id: "requisitions",
        label: "Requisitions",
        sub: "Awaiting approval",
        count: reqCount,
        oldestDays: ageDays(reqOldest?.requestDate),
        oldestRef: reqOldest?.reqNumber ?? null,
        href: "/m/requisitions",
      },
      {
        id: "quotes",
        label: "Quotes",
        sub: "Collecting rates",
        count: rfqCount,
        oldestDays: ageDays(rfqOldest?.createdAt),
        oldestRef: null,
        href: "/m/quotations",
      },
      {
        id: "po-approval",
        label: "PO approval",
        sub: "Draft, unsigned",
        count: poApprovalCount,
        oldestDays: ageDays(poApprovalOldest?.orderDate),
        oldestRef: poApprovalOldest?.poNumber ?? null,
        href: "/m/procurement",
      },
      {
        id: "in-transit",
        label: "In transit",
        sub: "Ordered, not received",
        count: inTransitCount,
        oldestDays: ageDays(inTransitOldest?.orderDate),
        oldestRef: inTransitOldest?.poNumber ?? null,
        href: "/m/procurement",
      },
      {
        id: "inspection",
        label: "Inspection",
        sub: "Received, unchecked",
        count: inspectCount,
        oldestDays: ageDays(inspectOldest?.receiptDate),
        oldestRef: null,
        // No standalone GRN list exists in the manifest — receipts are
        // reached through their purchase order.
        href: "/m/procurement",
      },
      {
        id: "invoices",
        label: "Invoices",
        sub: "Unmatched bills",
        count: invoiceCount,
        oldestDays: ageDays(invoiceOldest?.invoiceDate),
        oldestRef: invoiceOldest?.invoiceNumber ?? null,
        href: "/m/books/finance",
      },
    ];

    return { stages };
  }

  /* ═════════════════════════════════════════════════════════════════════
     SALES — "Deal Funnel": stages weighted by budget, plus follow-ups.
     ═════════════════════════════════════════════════════════════════════ */
  async function buildFunnel() {
    if (!has(PERM.SALES_VIEW))
      return { stages: [], lost: 0, followUps: [], won: null };

    const base = { companyId: company.id, deletedAt: null };

    const [grouped, value, overdueFollowUps, wonThisMonth] = await Promise.all([
      prisma.lead.groupBy({
        by: ["stage"],
        where: base,
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["stage"],
        where: base,
        _sum: { budgetMax: true },
      }),
      prisma.lead.findMany({
        where: {
          ...base,
          stage: { notIn: ["BOOKED", "LOST"] },
          nextFollowUpAt: { lt: endOfToday },
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: 6,
        select: {
          id: true,
          name: true,
          phone: true,
          stage: true,
          priority: true,
          nextFollowUpAt: true,
        },
      }),
      prisma.assetSale.aggregate({
        where: { companyId: company.id, saleDate: { gte: startOfMonth } },
        _sum: { salePrice: true },
        _count: { _all: true },
      }),
    ]);

    // Ordered pipeline — LOST is excluded from the funnel body and reported
    // separately, because a funnel that includes its own leak reads wrong.
    const ORDER = ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "BOOKED"] as const;
    const LABELS: Record<string, string> = {
      NEW: "New",
      CONTACTED: "Contacted",
      SITE_VISIT: "Site visit",
      NEGOTIATION: "Negotiation",
      BOOKED: "Booked",
    };

    const stages = ORDER.map((stage) => ({
      id: stage,
      label: LABELS[stage]!,
      count: grouped.find((g) => g.stage === stage)?._count._all ?? 0,
      value: toNum(value.find((g) => g.stage === stage)?._sum.budgetMax),
    }));

    return {
      stages,
      lost: grouped.find((g) => g.stage === "LOST")?._count._all ?? 0,
      followUps: overdueFollowUps.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        stage: l.stage,
        priority: l.priority,
        dueAt: l.nextFollowUpAt?.toISOString() ?? null,
        overdue: !!l.nextFollowUpAt && l.nextFollowUpAt < startOfToday,
      })),
      won: {
        count: wonThisMonth._count._all,
        value: toNum(wonThisMonth._sum.salePrice),
      },
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     FINANCE — "Cash Position": money in vs out, and what's owed when.
     ═════════════════════════════════════════════════════════════════════ */
  async function buildCash() {
    if (!has(PERM.FINANCE_VIEW))
      return {
        inflow: 0,
        outflow: 0,
        net: 0,
        breakdown: { sales: 0, rent: 0, expenses: 0, suppliers: 0 },
        aging: [],
        payableTotal: 0,
        pending: null,
      };

    const [saleIn, rentIn, expenseOut, supplierOut, openInvoices, pendingExpenses] =
      await Promise.all([
        prisma.assetSalePayment.aggregate({
          where: {
            assetSale: { companyId: company.id },
            paymentDate: { gte: startOfMonth },
            status: "RECEIVED",
          },
          _sum: { amount: true },
        }),
        prisma.rentalPayment.aggregate({
          where: {
            tenancy: { companyId: company.id },
            paymentDate: { gte: startOfMonth },
            status: "RECEIVED",
          },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: {
            companyId: company.id,
            status: "APPROVED",
            date: { gte: startOfMonth },
          },
          _sum: { amount: true },
        }),
        prisma.supplierPayment.aggregate({
          where: { companyId: company.id, paymentDate: { gte: startOfMonth } },
          _sum: { amount: true },
        }),
        prisma.supplierInvoice.findMany({
          where: {
            companyId: company.id,
            status: { in: ["PENDING", "MATCHED", "APPROVED", "DISPUTED"] },
          },
          select: { totalAmount: true, dueDate: true, invoiceDate: true },
        }),
        prisma.expense.count({
          where: { companyId: company.id, status: "PENDING" },
        }),
      ]);

    // Payables aging ladder — the classic 0/30/60/90 buckets, but anchored
    // on dueDate (falling back to invoiceDate) so "overdue" means overdue.
    const buckets = [
      { id: "due", label: "Not due", amount: 0, count: 0 },
      { id: "d30", label: "1-30d", amount: 0, count: 0 },
      { id: "d60", label: "31-60d", amount: 0, count: 0 },
      { id: "d90", label: "60d+", amount: 0, count: 0 },
    ];
    for (const inv of openInvoices) {
      const due = inv.dueDate ?? inv.invoiceDate;
      const overdueDays = Math.floor(
        (now.getTime() - due.getTime()) / 86_400_000,
      );
      const slot =
        overdueDays <= 0 ? 0 : overdueDays <= 30 ? 1 : overdueDays <= 60 ? 2 : 3;
      buckets[slot]!.amount += toNum(inv.totalAmount);
      buckets[slot]!.count += 1;
    }

    const inflow = toNum(saleIn._sum.amount) + toNum(rentIn._sum.amount);
    const outflow =
      toNum(expenseOut._sum.amount) + toNum(supplierOut._sum.amount);

    return {
      inflow,
      outflow,
      net: inflow - outflow,
      breakdown: {
        sales: toNum(saleIn._sum.amount),
        rent: toNum(rentIn._sum.amount),
        expenses: toNum(expenseOut._sum.amount),
        suppliers: toNum(supplierOut._sum.amount),
      },
      aging: buckets,
      payableTotal: buckets.reduce((s, b) => s + b.amount, 0),
      pending: { expenses: pendingExpenses },
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     HR — "Muster Ring": who is on site right now, by site.
     ═════════════════════════════════════════════════════════════════════ */
  async function buildMuster() {
    if (!has(PERM.HR_VIEW)) return { headcount: null, sites: [], pending: null };

    const empScope = await scopeWhere("Employee", {
      companyId: company.id,
      deletedAt: null,
      active: true,
    });

    const [totalActive, byStatus, bySite, projects, pendingLeaves] =
      await Promise.all([
        prisma.employee.count({ where: empScope }),
        prisma.workerAttendance.groupBy({
          by: ["status"],
          where: {
            companyId: company.id,
            date: { gte: startOfToday, lt: endOfToday },
          },
          _count: { _all: true },
        }),
        prisma.workerAttendance.groupBy({
          by: ["projectId", "status"],
          where: {
            companyId: company.id,
            date: { gte: startOfToday, lt: endOfToday },
          },
          _count: { _all: true },
        }),
        prisma.project.findMany({
          where: {
            companyId: company.id,
            deletedAt: null,
            status: { in: ["PLANNED", "ACTIVE"] },
          },
          select: { id: true, name: true },
        }),
        prisma.leaveRequest.count({
          where: { companyId: company.id, status: "PENDING" },
        }),
      ]);

    const countFor = (statuses: string[]) =>
      byStatus
        .filter((r) => statuses.includes(r.status))
        .reduce((s, r) => s + r._count._all, 0);

    const present = countFor(["PRESENT", "OVERTIME", "LATE"]);
    const half = countFor(["HALF_DAY"]);
    const leave = countFor(["LEAVE", "PAID_LEAVE", "NON_PAID_LEAVE"]);
    const absent = countFor(["ABSENT"]);
    // Anyone with no row at all today simply hasn't been marked yet — that
    // is a distinct state from ABSENT and the ring must show it as a gap,
    // not silently fold it into "present".
    const marked = present + half + leave + absent;
    const unmarked = Math.max(0, totalActive - marked);

    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const siteMap = new Map<
      string,
      { id: string; name: string; present: number; absent: number; leave: number }
    >();
    for (const row of bySite) {
      if (!row.projectId) continue;
      const entry = siteMap.get(row.projectId) ?? {
        id: row.projectId,
        name: projectName.get(row.projectId) ?? "Unassigned",
        present: 0,
        absent: 0,
        leave: 0,
      };
      if (["PRESENT", "OVERTIME", "LATE", "HALF_DAY"].includes(row.status)) {
        entry.present += row._count._all;
      } else if (row.status === "ABSENT") {
        entry.absent += row._count._all;
      } else {
        entry.leave += row._count._all;
      }
      siteMap.set(row.projectId, entry);
    }

    const sites = Array.from(siteMap.values()).sort(
      (a, b) => b.present - a.present,
    );

    return {
      headcount: { totalActive, present, half, leave, absent, unmarked },
      sites,
      pending: { leaves: pendingLeaves },
    };
  }
});
