import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";

/**
 * Approval backlog sweep — one digest per company per day listing the
 * approval queues that have been sitting >48h. An approver who never opens
 * the approvals page leaves requisitions, gate passes and RA bills to rot;
 * the truck waits at the gate and the subcontractor chases his money.
 * Emitted as a single summary so the digest stays a digest, not a barrage.
 */

export async function checkApprovalBacklog(): Promise<{ companies: number; flagged: number }> {
  const now = new Date();
  const dedupeSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const companies = await prisma.company.findMany({ select: { id: true, name: true, approvalAgingHours: true } });
  let flagged = 0;

  for (const company of companies) {
    // Per-company threshold from settings (default 48h) — a company that sets
    // 2 weeks of slack doesn't want a daily nag at 49 hours.
    const staleBefore = new Date(
      now.getTime() - (company.approvalAgingHours ?? 48) * 60 * 60 * 1000,
    );
    const [pos, reqs, passes, raBills, expenses, claims, leaves] = await Promise.all([
      prisma.purchaseOrder.aggregate({
        where: { companyId: company.id, status: "DRAFT", createdAt: { lt: staleBefore } },
        _count: { _all: true }, _sum: { total: true },
      }),
      prisma.materialRequisition.count({
        where: { project: { companyId: company.id }, status: "SUBMITTED", createdAt: { lt: staleBefore } },
      }),
      prisma.gatePass.count({
        where: { companyId: company.id, status: "PENDING", createdAt: { lt: staleBefore } },
      }),
      prisma.raBill.aggregate({
        where: { companyId: company.id, status: "SUBMITTED", createdAt: { lt: staleBefore } },
        _count: { _all: true }, _sum: { netPayable: true },
      }),
      prisma.expense.count({
        where: { companyId: company.id, status: "PENDING", createdAt: { lt: staleBefore } },
      }),
      prisma.expenseClaim.count({
        where: { companyId: company.id, status: "SUBMITTED", createdAt: { lt: staleBefore } },
      }),
      prisma.leaveRequest.count({
        where: { companyId: company.id, status: "PENDING", createdAt: { lt: staleBefore } },
      }),
    ]);

    const poN = pos._count._all ?? 0;
    const passN = passes ?? 0;
    const billN = raBills._count._all ?? 0;
    const total = poN + reqs + passN + billN + expenses + claims + leaves;
    if (total === 0) continue;

    const stuckValue = new Decimal(pos._sum.total ?? 0)
      .plus(raBills._sum.netPayable ?? 0);

    const recent = await prisma.inAppNotification.findFirst({
      where: {
        companyId: company.id,
        eventType: NotificationEventType.APPROVAL_BACKLOG,
        createdAt: { gte: dedupeSince },
      },
      select: { id: true },
    });
    if (recent) continue;

    const parts: string[] = [];
    if (poN) parts.push(`${poN} draft PO${poN > 1 ? "s" : ""}`);
    if (reqs) parts.push(`${reqs} requisition${reqs > 1 ? "s" : ""}`);
    if (passN) parts.push(`${passN} gate pass${passN > 1 ? "es" : ""}`);
    if (billN) parts.push(`${billN} RA bill${billN > 1 ? "s" : ""}`);
    if (expenses) parts.push(`${expenses} expense${expenses > 1 ? "s" : ""}`);
    if (claims) parts.push(`${claims} claim${claims > 1 ? "s" : ""}`);
    if (leaves) parts.push(`${leaves} leave request${leaves > 1 ? "s" : ""}`);

    void emitNotificationEvent({
      eventType: NotificationEventType.APPROVAL_BACKLOG,
      companyId: company.id,
      entityType: "ApprovalQueue",
      entityId: company.id,
      variables: {
        count: String(total),
        breakdown: parts.join(", "),
        amount: stuckValue.toString(),
      },
      timestamp: now,
    });
    flagged++;
  }

  return { companies: companies.length, flagged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily books-health sweep — runBookReconciliation is the fullest check of
// ledger↔entity truth we have, but it only ran when a human opened the page.
// GL drift found a week later is archaeology; found next morning it's a fix.
// Emits one BOOKS_RECON_FAILED event per company per day while any check fails.
// ─────────────────────────────────────────────────────────────────────────────
export async function checkBooksHealth(): Promise<{ companies: number; failed: number }> {
  const { runBookReconciliation } = await import("./reconciliation-health");
  const now = new Date();
  const dedupeSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const companies = await prisma.company.findMany({ select: { id: true } });
  let failed = 0;

  for (const company of companies) {
    const report = await runBookReconciliation(company.id).catch(() => null);
    if (!report || report.allPass) continue;

    const recent = await prisma.inAppNotification.findFirst({
      where: {
        companyId: company.id,
        eventType: NotificationEventType.BOOKS_RECON_FAILED,
        createdAt: { gte: dedupeSince },
      },
      select: { id: true },
    });
    if (recent) continue;

    const failedChecks = report.checks.filter((c) => c.status === "FAIL").map((c) => c.name).slice(0, 4);
    const warnedChecks = report.checks.filter((c) => c.status === "WARN").map((c) => c.name).slice(0, 2);
    const parts = [...failedChecks.map((n) => `FAIL ${n}`), ...warnedChecks.map((n) => `WARN ${n}`)];
    void emitNotificationEvent({
      eventType: NotificationEventType.BOOKS_RECON_FAILED,
      companyId: company.id,
      entityType: "BooksHealth",
      entityId: company.id,
      variables: {
        count: String(report.summary.failed + report.summary.warned),
        breakdown: parts.join(", ") || "checks failed",
      },
      timestamp: now,
    });
    failed++;
  }
  return { companies: companies.length, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// RERA validity sweep — selling a unit on a project whose registration lapsed
// is a legal problem, not an ops one. Warns weekly at ≤90 days remaining, so
// renewal paperwork has runway before the cutoff.
// ─────────────────────────────────────────────────────────────────────────────
export async function checkReraValidity(): Promise<{ companies: number; flagged: number }> {
  const now = new Date();
  const ninetyDaysOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const projects = await prisma.project.findMany({
    where: {
      reraValidityDate: { not: null, lte: ninetyDaysOut },
      deletedAt: null,
    },
    select: { id: true, name: true, companyId: true, reraValidityDate: true },
  });

  let flagged = 0;
  for (const p of projects) {
    const expiry = p.reraValidityDate!;
    const expired = expiry.getTime() <= now.getTime();
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
    // Dedupe: one warning per 7 days per project; escalate to daily inside
    // the final week and after expiry (the message changes meaning anyway).
    const cooldownMs = daysLeft <= 7 || expired ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const recent = await prisma.inAppNotification.findFirst({
      where: {
        companyId: p.companyId,
        eventType: NotificationEventType.RERA_VALIDITY_EXPIRING,
        link: { contains: p.id },
        createdAt: { gte: new Date(now.getTime() - cooldownMs) },
      },
      select: { id: true },
    });
    if (recent) continue;

    void emitNotificationEvent({
      eventType: NotificationEventType.RERA_VALIDITY_EXPIRING,
      companyId: p.companyId,
      entityType: "Project",
      entityId: p.id,
      variables: {
        projectName: p.name,
        expiryDate: expiry.toISOString().slice(0, 10),
        daysLeft: String(daysLeft),
      },
      timestamp: now,
    });
    flagged++;
  }
  return { companies: 0, flagged };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate-contract expiry sweep — an ACTIVE contract whose validity lapses stops
// protecting the PO rate: procurement keeps ordering at "the usual rate" while
// the supplier quietly charges market. Warns at ≤30d (weekly cadence) and flips
// the row to EXPIRED on the day it lapses so reports stop counting dead cover.
// ─────────────────────────────────────────────────────────────────────────────
export async function checkRateContractExpiry(): Promise<{ flagged: number; expired: number }> {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Flip lapsed contracts to EXPIRED — the PO-time filter already excludes
  // them by date, this is record hygiene for reports and lists.
  const expired = await prisma.rateContract.updateMany({
    where: { status: "ACTIVE", validTo: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const expiring = await prisma.rateContract.findMany({
    where: { status: "ACTIVE", validTo: { gte: now, lte: thirtyDaysOut } },
    select: {
      id: true,
      contractNumber: true,
      validTo: true,
      companyId: true,
      supplier: { select: { name: true } },
      material: { select: { name: true } },
    },
  });

  let flagged = 0;
  for (const c of expiring) {
    const daysLeft = Math.ceil((c.validTo.getTime() - now.getTime()) / 86400000);
    // One warning per contract per week — the buyer needs a nudge to
    // renegotiate, not daily noise.
    const recent = await prisma.inAppNotification.findFirst({
      where: {
        companyId: c.companyId,
        eventType: NotificationEventType.RATE_CONTRACT_EXPIRING,
        link: { contains: c.id },
        createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) continue;

    void emitNotificationEvent({
      eventType: NotificationEventType.RATE_CONTRACT_EXPIRING,
      companyId: c.companyId,
      entityType: "RateContract",
      entityId: c.id,
      variables: {
        contractNumber: c.contractNumber,
        supplierName: c.supplier.name,
        materialName: c.material.name,
        expiryDate: c.validTo.toISOString().slice(0, 10),
        daysLeft: String(daysLeft),
      },
      timestamp: now,
    });
    flagged++;
  }
  return { flagged, expired: expired.count };
}
