import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCurrentUser, json } from "@/lib/server";
import { normalizePhone } from "@/lib/phone-otp";

/**
 * POST /api/calls/sync — batch-sync the device's native call log.
 *
 * Companion-app path: a mobile client (native wrapper / PWA-sidecar)
 * reads the device call log and posts entries here so calls made on the
 * phone's regular dialer still show up in the platform — with number,
 * direction, time, and duration (no audio — the OS can't provide it).
 *
 * Dedup: a device can re-sync overlapping windows safely. Entries are
 * deduplicated on (callerUserId, normalized other-number, startedAt
 * within ±60s) so re-syncs don't create duplicates.
 *
 * Body: { calls: [{ direction: "INBOUND"|"OUTBOUND"|"MISSED", otherNumber,
 *                   startedAt, durationSec? }] }  — max 200 per batch.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const company = await getCompany();

  const body = await req.json().catch(() => ({}));
  const calls = (body as { calls?: unknown[] }).calls;
  if (!Array.isArray(calls) || calls.length === 0) {
    return json({ error: "calls[] is required" }, { status: 400 });
  }
  if (calls.length > 200) {
    return json({ error: "Max 200 calls per sync" }, { status: 400 });
  }

  const staffNorm = normalizePhone(user.phone ?? "") || null;
  let created = 0, skipped = 0;

  for (const raw of calls) {
    const c = raw as { direction?: string; otherNumber?: string; startedAt?: string; durationSec?: number };
    const dir = c.direction?.toUpperCase();
    const other = c.otherNumber ? normalizePhone(c.otherNumber) : null;
    const startedAt = c.startedAt ? new Date(c.startedAt) : null;
    if (!other || !startedAt || isNaN(startedAt.getTime()) || !dir) { skipped++; continue; }

    // INBOUND: other → staff. OUTBOUND: staff → other. MISSED: inbound.
    const missed = dir === "MISSED";
    const direction = dir === "OUTBOUND" ? "OUTBOUND" : "INBOUND";
    const status = missed ? "MISSED" : (c.durationSec ?? 0) > 0 ? "ANSWERED" : "MISSED";

    // Dedup — same user, same other-number, within ±60s window
    const existing = await prisma.callLog.findFirst({
      where: {
        companyId: company.id,
        callerUserId: user.id,
        deletedAt: null,
        startedAt: { gte: new Date(startedAt.getTime() - 60_000), lte: new Date(startedAt.getTime() + 60_000) },
        OR: [{ fromNumber: other }, { toNumber: other }],
      },
      select: { id: true },
    });
    if (existing) { skipped++; continue; }

    // Match the other party to a customer/supplier (same last-10 logic as webhooks)
    const last10 = other.slice(-10);
    const [customer, supplier] = await Promise.all([
      prisma.customer.findFirst({
        where: { companyId: company.id, deletedAt: null, OR: [{ phone: other }, ...(last10.length >= 10 ? [{ phone: { contains: last10 } }] : [])] },
        select: { id: true },
      }).catch(() => null),
      prisma.supplier.findFirst({
        where: { companyId: company.id, deletedAt: null, OR: [{ phone: other }, ...(last10.length >= 10 ? [{ phone: { contains: last10 } }] : [])] },
        select: { id: true },
      }).catch(() => null),
    ]);

    await prisma.callLog.create({
      data: {
        companyId: company.id,
        direction,
        fromNumber: direction === "INBOUND" ? other : staffNorm ?? "unknown",
        toNumber: direction === "INBOUND" ? staffNorm ?? "unknown" : other,
        callerUserId: user.id,
        status,
        startedAt,
        durationSec: c.durationSec ?? 0,
        source: "APP",
        relatedCustomerId: customer?.id ?? null,
        relatedSupplierId: supplier?.id ?? null,
      },
    });
    created++;
  }

  return json({ created, skipped });
});
