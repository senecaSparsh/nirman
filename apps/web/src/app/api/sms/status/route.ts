import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sms/status — delivery health for the company's SMS devices.
 *
 * One glance answers "is this actually working":
 *   devices   — registered phones, masked key, last poll/forward time,
 *               `live` when seen within the last 15 minutes.
 *   outbox    — queued/sent/failed counts + recent failures with errors.
 *   connected — true when any device checked in recently (the phone is
 *               polling the outbox or forwarding bank SMS).
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const liveSince = new Date(Date.now() - 15 * 60 * 1000);

  const [devices, queued, sent, failed, lastSent, recentFailures] = await Promise.all([
    prisma.smsIngestToken.findMany({
      where: { companyId: company.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, token: true, lastUsedAt: true, createdAt: true },
    }),
    prisma.smsOutbox.count({ where: { companyId: company.id, status: "QUEUED" } }),
    prisma.smsOutbox.count({ where: { companyId: company.id, status: "SENT" } }),
    prisma.smsOutbox.count({ where: { companyId: company.id, status: "FAILED" } }),
    prisma.smsOutbox.findFirst({
      where: { companyId: company.id, status: "SENT" },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
    prisma.smsOutbox.findMany({
      where: { companyId: company.id, status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, toPhone: true, error: true, updatedAt: true },
    }),
  ]);

  const deviceList = devices.map((d) => ({
    id: d.id,
    label: d.label,
    masked: `…${d.token.slice(-4)}`,
    lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    live: !!d.lastUsedAt && d.lastUsedAt >= liveSince,
  }));

  return json({
    connected: deviceList.some((d) => d.live),
    devices: deviceList,
    outbox: {
      queued,
      sent,
      failed,
      lastSentAt: lastSent?.sentAt?.toISOString() ?? null,
      recentFailures: recentFailures.map((f) => ({
        id: f.id,
        toPhone: f.toPhone,
        error: f.error,
        updatedAt: f.updatedAt.toISOString(),
      })),
    },
  });
});
