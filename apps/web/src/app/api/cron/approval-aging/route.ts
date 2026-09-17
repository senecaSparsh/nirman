import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { createInAppNotification } from "@nirman/services";
import { withTimeout } from "@/lib/timeout";

/**
 * POST /api/cron/approval-aging — escalation nudge for stalled approvals.
 *
 * Runs daily (scheduler sidecar, apps/web/scripts/scheduler.sh). For every company, finds
 * items that have been waiting for approval > 48h — draft POs, submitted
 * indents, DPRs awaiting sub-admin/admin approval, submitted expense
 * claims — and sends ONE digest notification to each executive member
 * (OWNER / ADMIN / PROJECT_DIRECTOR) so nothing silently stalls while a
 * manager is busy or away.
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
    select: { id: true, name: true, approvalAgingHours: true },
  });

  const results: { companyId: string; aged: number; notified: number }[] = [];

  for (const company of companies) {
    try {
      const agingHours = company.approvalAgingHours ?? DEFAULT_AGING_HOURS;
      const cutoff = new Date(Date.now() - agingHours * 3600_000);
      const [agedPOs, agedReqs, agedDprs, agedClaims] = await Promise.all([
        prisma.purchaseOrder.count({ where: { companyId: company.id, status: "DRAFT", createdAt: { lt: cutoff } } }),
        prisma.materialRequisition.count({ where: { project: { companyId: company.id }, status: "SUBMITTED", createdAt: { lt: cutoff } } }),
        prisma.dailyProgressReport.count({ where: { companyId: company.id, approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] }, createdAt: { lt: cutoff } } }),
        prisma.expenseClaim.count({ where: { companyId: company.id, status: "SUBMITTED", submittedAt: { lt: cutoff } } }),
      ]);
      // Sites that didn't file today's DPR — a silent site is invisible to
      // management until someone notices. Only ACTIVE projects: a PLANNED
      // site isn't expected to report yet.
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const activeProjects = await prisma.project.findMany({
        where: { companyId: company.id, deletedAt: null, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      const todaysDprs = await prisma.dailyProgressReport.findMany({
        where: {
          projectId: { in: activeProjects.map((p) => p.id) },
          date: { gte: startOfToday },
        },
        select: { projectId: true },
      });
      const reported = new Set(todaysDprs.map((d) => d.projectId));
      const missingDprProjects = activeProjects.filter((p) => !reported.has(p.id));

      const total = agedPOs + agedReqs + agedDprs + agedClaims;
      if (total === 0 && missingDprProjects.length === 0) {
        results.push({ companyId: company.id, aged: 0, notified: 0 });
        continue;
      }

      // Oldest waiting item across queues, for the digest line.
      const [poMin, reqMin, dprMin, claimMin] = await Promise.all([
        prisma.purchaseOrder.aggregate({ where: { companyId: company.id, status: "DRAFT" }, _min: { createdAt: true } }),
        prisma.materialRequisition.aggregate({ where: { project: { companyId: company.id }, status: "SUBMITTED" }, _min: { createdAt: true } }),
        prisma.dailyProgressReport.aggregate({ where: { companyId: company.id, approvalStatus: { in: ["SUBMITTED", "SUB_ADMIN_APPROVED"] } }, _min: { createdAt: true } }),
        prisma.expenseClaim.aggregate({ where: { companyId: company.id, status: "SUBMITTED" }, _min: { submittedAt: true } }),
      ]);
      const oldest = [poMin._min.createdAt, reqMin._min.createdAt, dprMin._min.createdAt, claimMin._min.submittedAt]
        .filter((d): d is Date => d != null)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const oldestDays = oldest ? Math.floor((Date.now() - oldest.getTime()) / 86_400_000) : 0;

      // Executive members of this company (approve authority lives here)
      // PLUS anyone currently holding an active delegation from one.
      const execMemberships = await prisma.userCompany.findMany({
        where: {
          companyId: company.id,
          active: true,
          role: { in: ["OWNER", "ADMIN", "PROJECT_DIRECTOR"] },
          user: { active: true },
        },
        select: {
          userId: true,
          id: true,
          approvalsDelegatedToId: true,
          delegationEndsAt: true,
        },
      });

      const notifyUserIds = new Set(execMemberships.map((m) => m.userId));
      // If an exec has delegated, the delegate should get the nudge too.
      const delegatedToIds = execMemberships
        .filter((m) => m.approvalsDelegatedToId && m.delegationEndsAt && m.delegationEndsAt > new Date())
        .map((m) => m.approvalsDelegatedToId!);
      if (delegatedToIds.length > 0) {
        const delegates = await prisma.userCompany.findMany({
          where: { id: { in: delegatedToIds }, active: true },
          select: { userId: true },
        });
        delegates.forEach((d) => notifyUserIds.add(d.userId));
      }

      const parts: string[] = [];
      if (agedPOs) parts.push(`${agedPOs} PO${agedPOs > 1 ? "s" : ""}`);
      if (agedReqs) parts.push(`${agedReqs} indent${agedReqs > 1 ? "s" : ""}`);
      if (agedDprs) parts.push(`${agedDprs} DPR${agedDprs > 1 ? "s" : ""}`);
      if (agedClaims) parts.push(`${agedClaims} expense claim${agedClaims > 1 ? "s" : ""}`);
      const missingSites = missingDprProjects.map((p) => p.name).join(", ");
      if (missingDprProjects.length) {
        parts.push(`${missingDprProjects.length} site${missingDprProjects.length > 1 ? "s" : ""} (${missingSites}) without today's DPR`);
      }

      let notified = 0;
      for (const userId of notifyUserIds) {
        // Skip if this user got an aging digest in the last 24h.
        const recent = await prisma.inAppNotification.findFirst({
          where: {
            userId,
            eventType: "approval.aging",
            createdAt: { gt: dedupeCutoff },
          },
          select: { id: true },
        });
        if (recent) continue;
        await createInAppNotification({
          companyId: company.id,
          userId,
          eventType: "approval.aging",
          title: total > 0
            ? `${total} approval${total > 1 ? "s" : ""} waiting ${oldestDays >= 1 ? `${oldestDays}d+` : "48h+"}`
            : `${missingDprProjects.length} site${missingDprProjects.length > 1 ? "s" : ""} haven't reported today`,
          message: total > 0
            ? `${parts.join(", ")} ${total > 1 ? "are" : "is"} waiting — oldest ${oldestDays >= 1 ? `${oldestDays} day${oldestDays > 1 ? "s" : ""}` : "2+ days"}.`
            : `${parts.join(", ")} — no progress report filed today.`,
          link: "/m/approvals",
        }).catch(() => {});
        notified += 1;
      }

      // Nudge the site's own engineers — they're the ones who file the DPR.
      // Separate eventType so the exec-digest dedupe doesn't swallow it.
      for (const project of missingDprProjects) {
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

      results.push({ companyId: company.id, aged: total, notified });
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
