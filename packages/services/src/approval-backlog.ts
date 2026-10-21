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

const STALE_MS = 48 * 60 * 60 * 1000;

export async function checkApprovalBacklog(): Promise<{ companies: number; flagged: number }> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_MS);
  const dedupeSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  let flagged = 0;

  for (const company of companies) {
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
