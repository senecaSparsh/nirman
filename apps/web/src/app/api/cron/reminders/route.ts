import { NextRequest } from "next/server";
import { toNum } from "@/lib/utils";
import { prisma } from "@nirman/db";
import { sendRentDueReminders, sendPaymentDueReminders, processDueEscalations, checkMilestonePayments, processPendingNotifications, generateDueRentSchedules, markOverdueRentPayments, generateDueRecurringExpenses, checkExpiringLegalDocs, checkExpiringEmploymentTerms, checkExpiringEmployeeDocs, checkDueSupplierInvoices,
  checkStaleTransfers,
  checkApprovalBacklog,
  checkReraValidity, checkOverdueCapas, checkStaleStockCounts, checkEquipmentMaintenanceDue, checkRateContractExpiry, checkStatutoryDeadlines } from "@nirman/services";
import { apiHandler, json } from "@/lib/server";

/**
 * POST /api/cron/reminders — cron-triggered reminder + escalation job.
 *
 * Runs the full 15-minute sweep set: milestone→DUE marking, rent escalation,
 * rent-schedule minting, overdue marking + rent/BBA reminders, notification
 * flush, recurring expenses, doc-expiry warnings (legal/employment/employee),
 * supplier-invoice + CAPA + stale-stock-count + equipment + transfer + approval
 * backlogs, RERA validity, rate-contract expiry. Books-health is NOT here —
 * /api/cron/reconciliation covers it nightly.
 *
 * Every sweep reports failure by name (console.error + failed flag); the
 * response sets `ok:false` + `failedSweeps` so a monitor can alert on partial
 * failure instead of reading a dead DB as an idle run.
 *
 * Auth: requires a valid CRON_SECRET header (or AUTH_BYPASS in dev).
 * This route is NOT behind the normal RBAC — it's meant for a scheduler.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  // In dev with AUTH_BYPASS, allow without secret. In prod, require the secret.
  // The NODE_ENV check ensures AUTH_BYPASS can never skip the secret in production.
  if (!(process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 1. Check all active projects for milestone completions → mark payments DUE
  const failures: string[] = [];
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
    } catch (err) {
      console.error(`[cron/reminders] milestone check failed for project ${p.id}:`, err);
      failures.push(`milestones:${p.id}`);
    }
  }

  // Every sweep reports its own failure — a thrown error used to collapse into
  // zeros identical to an idle run, so a dead DB looked exactly like a quiet
  // day. `sweep` logs the real error and flags the result; the response's
  // `ok`/`failedSweeps` lets an external monitor alert on partial failure.
  async function sweep<T extends object>(name: string, fallback: T, fn: () => Promise<T>): Promise<T & { failed?: true }> {
    try {
      return await fn();
    } catch (err) {
      console.error(`[cron/reminders] ${name} failed:`, err);
      failures.push(name);
      return { ...fallback, failed: true };
    }
  }

  // 2-6. Run remaining sweeps in parallel
  const [escalations, rentSchedule, rentReminders, saleReminders, notifications, recurringExpenses, legalDocs, employmentTerms, employeeDocs, supplierInvoices, overdueCapas, staleStockCounts, equipmentMaintenance, staleTransfers, approvalBacklog, reraValidity, rateContracts, statutoryDue] = await Promise.all([
    sweep("escalations", { checked: 0, escalated: 0, failed: 0 }, () => processDueEscalations()),
    sweep("rentSchedule", { checked: 0, created: 0 }, () => generateDueRentSchedules()),
    // Flip freshly-past dues to OVERDUE before reminding — the reminder sweep
    // only sees OVERDUE rows, and PENDING→OVERDUE never transitions without this.
    sweep("markOverdueRent", { marked: 0 }, () => markOverdueRentPayments())
      .then(async (mark) => ({
        mark,
        remind: await sweep("rentReminders", { checked: 0, sent: 0 }, () => sendRentDueReminders()),
      })),
    sweep("saleReminders", { checked: 0, sent: 0 }, () => sendPaymentDueReminders()),
    sweep("notifications", { processed: 0, sent: 0, failed: 0 }, () => processPendingNotifications()),
    // Generate due recurring expenses for all companies
    sweep("recurringExpenses", { generated: 0 }, () =>
      prisma.company.findMany({ select: { id: true } })
        .then((companies) => Promise.all(
          companies.map((c) => generateDueRecurringExpenses(c.id).catch((err) => {
            console.error(`[cron/reminders] recurringExpenses failed for company ${c.id}:`, err);
            failures.push(`recurringExpenses:${c.id}`);
            return { count: 0 };
          })),
        ))
        .then((results) => ({ generated: results.reduce((sum, r) => sum + toNum(r.count), 0) }))),
    // Check for legal documents expiring in the next 30 days
    sweep("legalDocs", { checked: 0, expiring: 0, notified: 0 }, () => checkExpiringLegalDocs(30)),
    // Contract / probation end dates approaching — HR needs the heads-up
    sweep("employmentTerms", { checked: 0, expiring: 0, notified: 0 }, () => checkExpiringEmploymentTerms(30)),
    // Employee compliance docs (medical certs, licences) expiring — same audience
    sweep("employeeDocs", { checked: 0, expiring: 0, notified: 0 }, () => checkExpiringEmployeeDocs(30)),
    // Supplier bills past dueDate unpaid — finance needs the escalation
    sweep("supplierInvoices", { checked: 0, due: 0, notified: 0 }, () => checkDueSupplierInvoices()),
    // Open CAPAs past corrective/preventive due date — QC needs the escalation
    sweep("overdueCapas", { checked: 0, overdue: 0, notified: 0 }, () => checkOverdueCapas()),
    // Stock counts left in DRAFT/COUNTED >24h — a half-finished count blocks stock truth
    sweep("staleStockCounts", { checked: 0, stale: 0, notified: 0 }, () => checkStaleStockCounts()),
    // Machines whose run-hours crossed their service interval — maintenance before breakdown
    sweep("equipmentMaintenance", { checked: 0, due: 0, notified: 0 }, () => checkEquipmentMaintenanceDue()),
    // Transfers dispatched >48h with no receive — stock in no-man's-land
    sweep("staleTransfers", { checked: 0, stale: 0, notified: 0 }, () => checkStaleTransfers()),
    // Approval queues stuck >48h — the truck waits at the gate otherwise
    sweep("approvalBacklog", { companies: 0, flagged: 0 }, () => checkApprovalBacklog()),
    // RERA validity — selling past the registration date is a legal failure
    sweep("reraValidity", { companies: 0, flagged: 0 }, () => checkReraValidity()),
    // Rate contracts lapsing silently = POs quietly buying at market rate
    sweep("rateContracts", { flagged: 0, expired: 0 }, () => checkRateContractExpiry()),
    // Statutory deposits/filings (TDS 7th, PF/ESI 15th, GSTR-3B 20th) —
    // missing them accrues interest automatically, so unremitted
    // payable balances must surface as reminders before the deadline.
    sweep("statutoryDue", { checked: 0, due: 0, notified: 0 }, () => checkStatutoryDeadlines()),
  ]);

  return json({
    // checkBooksHealth deliberately absent — /api/cron/reconciliation runs the
    // same ~20 heavy queries nightly; 96 extra runs/day here was pure DB cost.
    ok: failures.length === 0,
    ranAt: new Date().toISOString(),
    failedSweeps: failures.length ? failures : undefined,
    milestones: { checked: milestoneChecked, triggered: milestoneTriggered },
    escalations,
    rentSchedule,
    rentReminders,
    saleReminders,
    notifications,
    recurringExpenses,
    legalDocs,
    employmentTerms,
    employeeDocs,
    supplierInvoices,
    overdueCapas,
    staleStockCounts,
    equipmentMaintenance,
    staleTransfers,
    approvalBacklog,
    reraValidity,
    rateContracts,
    statutoryDue,
  });
}, { skipSession: true, rateLimit: false });
