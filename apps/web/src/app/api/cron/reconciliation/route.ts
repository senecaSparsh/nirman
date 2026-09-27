import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { runBookReconciliation, createInAppNotification } from "@nirman/services";
import { withTimeout } from "@/lib/timeout";

/**
 * POST /api/cron/reconciliation — nightly self-audit of the books.
 *
 * The app's deepest trust promise is that the numbers a business depends on
 * are correct: stock-on-hand equals the movement ledger, the GL Inventory
 * account equals stock value, and Σ debits = Σ credits (double-entry). If
 * any of these drift — a missed posting, a double-count, a manual DB edit —
 * the books quietly stop matching reality and the owner only finds out at
 * audit time.
 *
 * `runBookReconciliation` is read-only (it NEVER mutates). This job runs it
 * per company each night and, when any check fails, pushes ONE notification
 * to every tier-1 member (OWNER/ADMIN/PROJECT_DIRECTOR/FINANCE_HEAD) naming
 * the failing check — so the app catches its own ledger corruption before a
 * human does. An all-clear run sends nothing (no daily "all good" spam; a
 * pass is the expected state).
 *
 * Auth: x-cron-secret header (same as /api/cron/backup). Scheduled daily by
 * the scheduler sidecar.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!(process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return withTimeout(run(), 180_000, "reconciliation timed out");
}, { skipSession: true, rateLimit: false });

async function run(): Promise<Response> {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  const results: { companyId: string; allPass: boolean; failed: number; notified: number }[] = [];

  for (const company of companies) {
    try {
      const report = await runBookReconciliation(company.id);

      let notified = 0;
      if (!report.allPass) {
        // Name the failing/drifted checks so the alert is actionable.
        const bad = report.checks.filter((c) => c.status !== "PASS");
        const detail = bad
          .slice(0, 4)
          .map((c) => `${c.name}: ${c.status}`)
          .join(" · ");
        const summary = `Books out of balance — ${report.summary.failed} check${report.summary.failed !== 1 ? "s" : ""} failed${report.summary.warned ? `, ${report.summary.warned} drifted` : ""}. ${detail}`;

        // Notify tier-1 members — only the people who can act on it.
        const execs = await prisma.userCompany.findMany({
          where: {
            companyId: company.id,
            active: true,
            role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "FINANCE_HEAD"] },
            user: { active: true },
          },
          select: { userId: true },
        });

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        for (const { userId } of execs) {
          // Dedupe per day — a persistently-failing check shouldn't spam.
          const sent = await prisma.inAppNotification.findFirst({
            where: { userId, eventType: "reconciliation.drift", createdAt: { gte: startOfToday } },
            select: { id: true },
          });
          if (sent) continue;
          await createInAppNotification({
            companyId: company.id,
            userId,
            eventType: "reconciliation.drift",
            title: "Ledger reconciliation failed",
            message: summary,
            link: "/m/books",
          }).catch(() => {});
          notified += 1;
        }
      }

      results.push({ companyId: company.id, allPass: report.allPass, failed: report.summary.failed, notified });
    } catch (err) {
      console.error(`[cron/reconciliation] failed for company ${company.id}:`, err);
      results.push({ companyId: company.id, allPass: false, failed: -1, notified: -1 });
    }
  }

  return json({ ok: true, results });
}
