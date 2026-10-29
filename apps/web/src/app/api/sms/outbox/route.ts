import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { jsonBody, apiHandler, json } from "@/lib/server";

/**
 * SMS outbox — the device-key-authenticated pull queue that lets a
 * company phone SEND queued SMS on its own SIM. The Nirman app polls
 * this instead of the server pushing to the phone, so no public URL,
 * port-forward, or network config is needed — the phone just calls out.
 *
 * GET  /api/sms/outbox        — claim up to 10 QUEUED messages for the
 *                               key's company (marks them to this device).
 * POST /api/sms/outbox        — ack: { results: [{id, ok, error?}] }.
 *                               ok → SENT; !ok → FAILED with error.
 *
 * Auth: `x-sms-key` header or `?key=` — same SmsIngestToken as intake.
 */

async function tokenFor(req: NextRequest) {
  const key = req.headers.get("x-sms-key") ?? new URL(req.url).searchParams.get("key");
  if (!key) return null;
  return prisma.smsIngestToken.findFirst({
    where: { token: key, revokedAt: null },
    select: { id: true, companyId: true },
  });
}

export const GET = apiHandler(async (req: NextRequest) => {
  const token = await tokenFor(req);
  if (!token) return json({ error: "Invalid or revoked key" }, { status: 401 });

  // Claim the oldest pending items for this device — sets deviceId so a
  // second device doesn't pick the same messages.
  const items = await prisma.$transaction(async (tx) => {
    const pending = await tx.smsOutbox.findMany({
      where: { companyId: token.companyId, status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, toPhone: true, body: true },
    });
    if (pending.length === 0) return pending;
    await tx.smsOutbox.updateMany({
      where: { id: { in: pending.map((i) => i.id) } },
      data: { deviceId: token.id, attempts: { increment: 1 } },
    });
    return pending;
  });

  await prisma.smsIngestToken.update({
    where: { id: token.id },
    data: { lastUsedAt: new Date() },
  });

  return json({ messages: items });
}, { skipSession: true });

export const POST = apiHandler(async (req: NextRequest) => {
  const token = await tokenFor(req);
  if (!token) return json({ error: "Invalid or revoked key" }, { status: 401 });

  const body = await jsonBody(req);
  if (body instanceof Response) return body;
  const results = Array.isArray(body.results) ? body.results : [];
  if (results.length === 0) return json({ error: "results must be a non-empty array" }, { status: 400 });

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (typeof r?.id !== "string") continue;
    const item = await prisma.smsOutbox.findFirst({
      where: { id: r.id, companyId: token.companyId },
      select: { id: true, attempts: true },
    });
    if (!item) continue;
    if (r.ok === true) {
      await prisma.smsOutbox.update({
        where: { id: r.id },
        data: { status: "SENT", sentAt: new Date(), error: null },
      });
      sent += 1;
    } else {
      // Retry while attempts remain — the device re-polls and re-sends.
      const terminal = item.attempts >= 3;
      await prisma.smsOutbox.update({
        where: { id: r.id },
        data: {
          status: terminal ? "FAILED" : "QUEUED",
          error: typeof r.error === "string" ? r.error.slice(0, 500) : "send failed",
        },
      });
      failed += 1;
    }
  }
  return json({ sent, failed });
}, { skipSession: true });
