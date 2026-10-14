import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { digestFor, digestText, missingSitesFor } from "@/lib/approval-digest";
import { loadApprovalDigestInputs } from "@/lib/approval-digest-load";
import { createInAppNotification } from "@nirman/services";
import { withTimeout } from "@/lib/timeout";
import { startOfDayIST } from "@/lib/utils";

/**
 * POST /api/cron/approval-aging — escalation nudge for stalled approvals.
 *
 * Runs daily (scheduler sidecar, apps/web/scripts/scheduler.sh). For every company, finds
 * items that have been waiting for approval > 48h — draft POs, submitted
 * indents, DPRs awaiting sub-admin/admin approval, submitted expense
 * claims — and sends each approver ONE digest of only what they can act on:
 * their own scope and projects, their own permissions, and the same
 * self-approval and PO value rules the approve endpoints enforce. Nothing
 * silently stalls while a manager is busy or away.
 *
 * Deduped: a member gets at most one aging digest per 24h.
 *
 * Also doubles as the daily hygiene sweep: resolved ErrorLog rows older
 * than 30 days are pruned (open signatures are never touched — they may
 * still be live bugs).
 *
 * Auth: requires x-cron-secret header (same as /api/cron/backup).
 */

const DEFAULT_AGING_HOURS = 48;
const DEDUPE_HOURS = 24;
const ERRORLOG_RETENTION_DAYS = 30;
const READ_NOTIFICATION_RETENTION_DAYS = 30;
const NOTIFICATION_RETENTION_DAYS = 180;
const NOTIFICATION_LOG_RETENTION_DAYS = 90;
const PENDING_NOTIFICATION_DEAD_DAYS = 7;

export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!(process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return withTimeout(run(), 60_000, "approval-aging timed out");
}, { skipSession: true, rateLimit: false });

async function run(): Promise<Response> {
  const dedupeCutoff = new Date(Date.now() - DEDUPE_HOURS * 3600_000);
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      approvalAgingHours: true,
      poApprovalThresholdManager: true,
      poApprovalThresholdAdmin: true,
    },
  });

  const results: { companyId: string; aged: number; notified: number }[] = [];

  for (const company of companies) {
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() - (company.approvalAgingHours ?? DEFAULT_AGING_HOURS) * 3600_000);
      const inputs = await loadApprovalDigestInputs({
        companyId: company.id,
        now,
        cutoff,
        startOfToday: startOfDayIST(),
        managerThreshold: company.poApprovalThresholdManager,
        adminThreshold: company.poApprovalThresholdAdmin,
      });

      let notified = 0;
      for (const m of inputs.members) {
        const text = digestText(digestFor(m, inputs.items, inputs.thresholds), missingSitesFor(m, inputs.missingSites), now);
        if (!text) continue;
        // Skip if this user got an aging digest in the last 24h.
        const recent = await prisma.inAppNotification.findFirst({
          where: {
            userId: m.userId,
            eventType: "approval.aging",
            createdAt: { gt: dedupeCutoff },
          },
          select: { id: true },
        });
        if (recent) continue;
        await createInAppNotification({
          companyId: company.id,
          userId: m.userId,
          eventType: "approval.aging",
          title: text.title,
          message: text.message,
          link: "/m/approvals",
        }).catch(() => {});
        notified += 1;
      }

      // Nudge the site's own engineers — they're the ones who file the DPR.
      // Separate eventType so the exec-digest dedupe doesn't swallow it.
      for (const project of inputs.missingSites) {
        const engineers = await prisma.employee.findMany({
          where: {
            activeProjectId: project.id,
            active: true,
            deletedAt: null,
            userId: { not: null },
          },
          select: { userId: true },
        });
        for (const eng of engineers) {
          const recent = await prisma.inAppNotification.findFirst({
            where: { userId: eng.userId!, eventType: "dpr.missing", createdAt: { gt: dedupeCutoff } },
            select: { id: true },
          });
          if (recent) continue;
          await createInAppNotification({
            companyId: company.id,
            userId: eng.userId!,
            eventType: "dpr.missing",
            title: "Today's DPR not filed",
            message: `${project.name} has no progress report for today — file it before end of shift.`,
            link: "/m/dprs",
          }).catch(() => {});
        }
      }

      results.push({ companyId: company.id, aged: inputs.items.length, notified });
    } catch (err) {
      console.error(`[cron/approval-aging] failed for company ${company.id}:`, err);
      results.push({ companyId: company.id, aged: -1, notified: 0 });
    }
  }

  // ── Hygiene sweep: resolved error signatures are evidence that a fix
  //    worked — after 30 days they've served their purpose. Open rows are
  //    never pruned; a still-open signature is a still-live bug. ──
  let prunedErrors = 0;
  try {
    const pruned = await prisma.errorLog.deleteMany({
      where: {
        resolvedAt: { not: null, lt: new Date(Date.now() - ERRORLOG_RETENTION_DAYS * 86_400_000) },
      },
    });
    prunedErrors = pruned.count;
  } catch (err) {
    console.error("[cron/approval-aging] error-log prune failed:", err);
  }

  // ── Notification-table hygiene — both tables are append-only and would
  //    otherwise grow without bound. InAppNotification: read rows past 30d
  //    are noise; unread rows get 180d before they're stale enough to be
  //    meaningless. NotificationLog: terminal rows past 90d are pure audit
  //    bulk; PENDING rows older than 7d are wedged (every flush either sends
  //    or fails in the same pass — quiet-hours deferral is <12h), so they're
  //    dead-lettered instead of retried forever. ──
  let prunedNotifications = 0;
  let deadPending = 0;
  let prunedLogs = 0;
  try {
    const now = Date.now();
    const [readPruned, stalePruned, wedged, logPruned] = await Promise.all([
      prisma.inAppNotification.deleteMany({
        where: { isRead: true, createdAt: { lt: new Date(now - READ_NOTIFICATION_RETENTION_DAYS * 86_400_000) } },
      }),
      prisma.inAppNotification.deleteMany({
        where: { createdAt: { lt: new Date(now - NOTIFICATION_RETENTION_DAYS * 86_400_000) } },
      }),
      prisma.notificationLog.updateMany({
        where: { status: "PENDING", createdAt: { lt: new Date(now - PENDING_NOTIFICATION_DEAD_DAYS * 86_400_000) } },
        data: { status: "FAILED", errorMessage: "Dead-lettered — never delivered within 7 days", error: "Dead-lettered" },
      }),
      prisma.notificationLog.deleteMany({
        where: { createdAt: { lt: new Date(now - NOTIFICATION_LOG_RETENTION_DAYS * 86_400_000) } },
      }),
    ]);
    prunedNotifications = readPruned.count + stalePruned.count;
    deadPending = wedged.count;
    prunedLogs = logPruned.count;
  } catch (err) {
    console.error("[cron/approval-aging] notification prune failed:", err);
  }

  return json({ ok: true, companies: results, prunedErrors, prunedNotifications, deadPending, prunedLogs });
}
