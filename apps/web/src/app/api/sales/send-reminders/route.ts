import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  sendRentDueReminders,
  sendPaymentDueReminders,
  processDueEscalations,
  checkMilestonePayments,
  generateDueRentSchedules,
} from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
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
  await requirePermission(PERM.SALES_MANAGE);

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

  // 2-5. Run remaining sweeps in parallel
  const [escalations, rentSchedule, rentReminders, saleReminders] = await Promise.all([
    processDueEscalations().catch(() => ({ checked: 0, escalated: 0 })),
    generateDueRentSchedules().catch(() => ({ checked: 0, created: 0 })),
    sendRentDueReminders().catch(() => ({ checked: 0, sent: 0 })),
    sendPaymentDueReminders().catch(() => ({ checked: 0, sent: 0 })),
  ]);

  return json({
    ok: true,
    ranAt: new Date().toISOString(),
    milestones: { checked: milestoneChecked, triggered: milestoneTriggered },
    escalations,
    rentSchedule,
    rentReminders,
    saleReminders,
  });
});
