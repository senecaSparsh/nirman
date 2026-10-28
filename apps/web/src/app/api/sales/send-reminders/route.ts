import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  sendRentDueReminders,
  sendPaymentDueReminders,
  processDueEscalations,
  checkMilestonePayments,
  generateDueRentSchedules,
  markOverdueRentPayments,
  sendDemandNotice,
} from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sales/send-reminders
 *
 * Manually trigger payment/rent reminders and escalations.
 * Unlike /api/cron/reminders (which uses CRON_SECRET for scheduler auth),
 * this route uses normal RBAC — requires SALES_MANAGE permission.
 *
 * Runs the same sweeps as the cron route:
 * 1. checkMilestonePayments — mark completed WBS-linked installments as DUE
 * 2. processDueEscalations — apply yearly rent increases that are due
 * 3. generateDueRentSchedules — create due rent schedule items
 * 4. sendRentDueReminders — WhatsApp/Email tenants with overdue rent
 * 5. sendPaymentDueReminders — WhatsApp/Email customers with due BBA payments
 */
export const POST = apiHandler(async (_req: NextRequest) => {
  const _user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();

  // 1. Check THIS company's active projects for milestone completions → mark
  // payments DUE. Without the company filter a sales manager in one tenant
  // would trigger sweeps — and customer-facing reminders — for every tenant.
  const activeProjects = await prisma.project.findMany({
    where: { deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] }, companyId: company.id },
    select: { id: true },
  });
  let milestoneChecked = 0;
  let milestoneTriggered = 0;
  const newlyDueIds: string[] = [];
  for (const p of activeProjects) {
    try {
      const result = await checkMilestonePayments(p.id);
      milestoneChecked += result.checked;
      milestoneTriggered += result.newlyDue;
      newlyDueIds.push(...result.newlyDueIds);
    } catch {
      // Skip failed project checks
    }
  }

  // Milestone-triggered demand dispatch — a completed WBS milestone means the
  // buyer owes NOW, not whenever someone notices. One demand per newly-due
  // installment; failures are counted, never fatal to the sweep.
  let demandsSent = 0;
  let demandsFailed = 0;
  for (const itemId of newlyDueIds) {
    try {
      await sendDemandNotice(itemId, company.id, _user.id);
      demandsSent += 1;
    } catch {
      demandsFailed += 1;
    }
  }

  // 2-5. Run remaining sweeps in parallel
  const [escalations, rentSchedule, rentReminders, saleReminders] = await Promise.all([
    processDueEscalations(company.id).catch(() => ({ checked: 0, escalated: 0 })),
    generateDueRentSchedules(company.id).catch(() => ({ checked: 0, created: 0 })),
    // Flip freshly-past dues to OVERDUE before reminding — see cron/reminders.
    markOverdueRentPayments(company.id)
      .catch(() => ({ marked: 0 }))
      .then((mark) => sendRentDueReminders(company.id).catch(() => ({ checked: 0, sent: 0 })).then((remind) => ({ mark, remind }))),
    sendPaymentDueReminders(company.id).catch(() => ({ checked: 0, sent: 0 })),
  ]);

  return json({
    ok: true,
    ranAt: new Date().toISOString(),
    milestones: { checked: milestoneChecked, triggered: milestoneTriggered },
    demands: { sent: demandsSent, failed: demandsFailed },
    escalations,
    rentSchedule,
    rentReminders,
    saleReminders,
  });
});
