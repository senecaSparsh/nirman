import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { sendRentDueReminders, sendPaymentDueReminders, processDueEscalations, checkMilestonePayments, processPendingNotifications, generateDueRentSchedules, generateDueRecurringExpenses, checkExpiringLegalDocs } from "@nirman/services";
import { apiHandler, json } from "@/lib/server";

/**
 * POST /api/cron/reminders — cron-triggered reminder + escalation job.
 *
 * Runs four sweeps:
 * 1. checkMilestonePayments — for every active project, check if WBS nodes
 *    linked to CLP payment schedule items have reached 100% progress and
 *    mark the corresponding installments as DUE
 * 2. processDueEscalations — apply yearly rent increases that are due
 * 3. sendRentDueReminders — WhatsApp/Email tenants with overdue rent
 * 4. sendPaymentDueReminders — WhatsApp/Email customers with due BBA milestone payments
 *
 * Auth: requires a valid CRON_SECRET header (or AUTH_BYPASS in dev).
 * This route is NOT behind the normal RBAC — it's meant for a scheduler.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  // In dev with AUTH_BYPASS, allow without secret. In prod, require the secret.
  if (process.env.AUTH_BYPASS !== "true") {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 1. Check all active projects for milestone completions → mark payments DUE
  const activeProjects = await prisma.project.findMany({
    where: { deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
    select: { id: true },
  });
  let milestoneChecked = 0;
  let milestoneTriggered = 0;
  for (const p of activeProjects) {
    try {
      const result = await checkMilestonePayments(p.id);
      milestoneChecked += result.checked;
      milestoneTriggered += result.newlyDue;
    } catch {
      // Skip failed project checks
    }
  }

  // 2-6. Run remaining sweeps in parallel
  const [escalations, rentSchedule, rentReminders, saleReminders, notifications, recurringExpenses, legalDocs] = await Promise.all([
    processDueEscalations().catch(() => ({ checked: 0, escalated: 0 })),
    generateDueRentSchedules().catch(() => ({ checked: 0, created: 0 })),
    sendRentDueReminders().catch(() => ({ checked: 0, sent: 0 })),
    sendPaymentDueReminders().catch(() => ({ checked: 0, sent: 0 })),
    processPendingNotifications().catch(() => ({ processed: 0, sent: 0, failed: 0 })),
    // Generate due recurring expenses for all companies
    prisma.company.findMany({ select: { id: true } })
      .then((companies) => Promise.all(
        companies.map((c) => generateDueRecurringExpenses(c.id).catch(() => ({ count: 0 }))),
      ))
      .then((results) => ({ generated: results.reduce((sum, r) => sum + r.count, 0) }))
      .catch(() => ({ generated: 0 })),
    // Check for legal documents expiring in the next 30 days
    checkExpiringLegalDocs(30).catch(() => ({ checked: 0, expiring: 0, notified: 0 })),
  ]);

  return json({
    ok: true,
    ranAt: new Date().toISOString(),
    milestones: { checked: milestoneChecked, triggered: milestoneTriggered },
    escalations,
    rentSchedule,
    rentReminders,
    saleReminders,
    notifications,
    recurringExpenses,
    legalDocs,
  });
});
