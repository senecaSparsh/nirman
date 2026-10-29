import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { sendNotification } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/notifications/log/[id]/resend — redeliver a FAILED (or stuck
 * PENDING) notification through the same channel. The log row is reused
 * (sendNotification's logId path) so the audit trail shows one row going
 * FAILED → SENT rather than a pile of duplicate attempts.
 */
export const POST = apiHandler(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const log = await prisma.notificationLog.findFirst({
    where: { id, companyId: company.id },
  });
  if (!log) return json({ error: "Notification not found" }, { status: 404 });
  if (log.status === "SENT") {
    return json({ error: "Already delivered — nothing to resend" }, { status: 400 });
  }

  const updated = await sendNotification({
    companyId: company.id,
    eventType: log.eventType,
    channel: log.channel as "WHATSAPP" | "EMAIL" | "IN_APP" | "SMS",
    recipient: log.recipient,
    recipientName: log.recipientName ?? undefined,
    subject: log.subject ?? undefined,
    message: log.message,
    metadata: (log.metadata as Record<string, unknown> | null) ?? undefined,
    logId: log.id,
  });

  return json({ ok: updated.status === "SENT", status: updated.status, error: updated.errorMessage });
});
