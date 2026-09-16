import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { createInAppNotification } from "@nirman/services";
import { withTimeout } from "@/lib/timeout";

/**
 * POST /api/cron/daily-digest — the morning briefing, pushed.
 *
 * Runs once daily (scheduler loop). For every company, sends ONE in-app
 * notification to each executive member (OWNER / ADMIN / PROJECT_DIRECTOR,
 * plus active delegates) summarizing what the day looks like:
 *
 *   "Good morning — 3 approvals waiting · 12 on site · 2 deliveries due ·
 *    ₹4.2L payments overdue · Skyline hasn't filed a DPR"
 *
 * The briefing API is pull-based — a busy owner may never open the app
 * until a problem is on fire. This pushes the same facts to their
 * notifications once a day so nothing hides.
 *
 * Deduped per calendar day (not a 24h window): the scheduler's interval
 * timing drifts, but the digest must never arrive twice in a day.
 *
 * Auth: requires x-cron-secret header (same as /api/cron/backup).
 */

export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!(process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return withTimeout(run(), 60_000, "daily-digest timed out");
}, { skipSession: true, rateLimit: false });

async function run(): Promise<Response> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  const results: { companyId: string; notified: number }[] = [];

  for (const company of companies) {
    try {
      // ── Compose the day's facts ──
      const [poCount, reqCount, gpCount, claimCount, expenseCount, leaveCount, dprPending] = await Promise.all([
        prisma.purchaseOrder.count({ where: { companyId: company.id, status: "DRAFT" } }),
        prisma.materialRequisition.count({ where: { project: { companyId: company.id }, status: "SUBMITTED" } }),
        prisma.gatePass.count({ where: { companyId: company.id, status: "PENDING" } }),
        prisma.expenseClaim.count({ where: { companyId: company.id, status: "SUBMITTED" } }),
        prisma.expense.count({ where: { companyId: company.id, status: "PENDING" } }),
        prisma.leaveRequest.count({ where: { companyId: company.id, status: "PENDING" } }),
        prisma.dailyProgressReport.count({ where: { companyId: company.id, approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] } } }),
      ]);
      const approvalsTotal = poCount + reqCount + gpCount + claimCount + expenseCount + leaveCount + dprPending;

      const checkedIn = await prisma.workerAttendance.count({
        where: { companyId: company.id, date: { gte: startOfToday }, checkIn: { not: null } },
      });

      const deliveries = await prisma.purchaseOrder.count({
        where: {
          companyId: company.id,
          status: "APPROVED",
          expectedDate: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86_400_000) },
        },
      }).catch(() => 0);

      // Overdue POs — goods expected in the past, still not resolved. Same
      // definition the briefing's paymentsDue uses.
      const paymentsDue = await prisma.purchaseOrder.count({
        where: { companyId: company.id, status: "APPROVED", expectedDate: { lt: startOfToday } },
      }).catch(() => 0);

      // Sites with no DPR filed today
      const activeProjects = await prisma.project.findMany({
        where: { companyId: company.id, deletedAt: null, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      const reported = new Set(
        (await prisma.dailyProgressReport.findMany({
          where: { projectId: { in: activeProjects.map((p) => p.id) }, date: { gte: startOfToday } },
          select: { projectId: true },
        })).map((d) => d.projectId),
      );
      const silentSites = activeProjects.filter((p) => !reported.has(p.id)).map((p) => p.name);

      // ── Recipients: exec tier + active delegates ──
      const execs = await prisma.userCompany.findMany({
        where: {
          companyId: company.id,
          active: true,
          role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "FINANCE_HEAD"] },
          user: { active: true },
        },
        select: { userId: true, approvalsDelegatedToId: true, delegationEndsAt: true },
      });
      const userIds = new Set(execs.map((e) => e.userId));
      const now = new Date();
      const delegateIds = execs
        .filter((e) => e.approvalsDelegatedToId && e.delegationEndsAt && e.delegationEndsAt > now)
        .map((e) => e.approvalsDelegatedToId!);
      if (delegateIds.length) {
        const delegates = await prisma.userCompany.findMany({
          where: { id: { in: delegateIds }, active: true },
          select: { userId: true },
        });
        delegates.forEach((d) => userIds.add(d.userId));
      }

      // ── Build the digest line ──
      const parts: string[] = [];
      if (approvalsTotal) parts.push(`${approvalsTotal} approval${approvalsTotal > 1 ? "s" : ""} waiting`);
      if (checkedIn) parts.push(`${checkedIn} on site`);
      if (deliveries) parts.push(`${deliveries} deliver${deliveries > 1 ? "ies" : "y"} due today`);
      if (paymentsDue) parts.push(`${paymentsDue} overdue PO${paymentsDue > 1 ? "s" : ""}`);
      if (silentSites.length) parts.push(`${silentSites.join(", ")} — no DPR yet`);
      if (parts.length === 0) parts.push("All clear — no pending approvals or alerts");

      let notified = 0;
      for (const userId of userIds) {
        // Per-calendar-day dedupe — the scheduler interval drifts.
        const sent = await prisma.inAppNotification.findFirst({
          where: { userId, eventType: "daily.digest", createdAt: { gte: startOfToday } },
          select: { id: true },
        });
        if (sent) continue;
        await createInAppNotification({
          companyId: company.id,
          userId,
          eventType: "daily.digest",
          title: "Morning briefing",
          message: parts.join(" · "),
          link: "/m/home",
        }).catch(() => {});
        notified += 1;
      }

      results.push({ companyId: company.id, notified });
    } catch (err) {
      console.error(`[cron/daily-digest] failed for company ${company.id}:`, err);
      results.push({ companyId: company.id, notified: -1 });
    }
  }

  return json({ ok: true, results });
}
