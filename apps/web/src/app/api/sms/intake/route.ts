import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { ingestSmsBatch } from "@nirman/services";
import { jsonBody, apiHandler, json } from "@/lib/server";

/**
 * POST /api/sms/intake — device-authenticated SMS intake for forwarder
 * apps (SMS Forwarder, Tasker, the native shell). The company phone
 * posts each bank message here; the parser + matcher runs identically
 * to the manual-paste path.
 *
 * Auth: `x-sms-key: <token>` header (preferred) or `?key=` query param
 * (cheap forwarder apps that only support URL targets). The token is
 * a per-device SmsIngestToken — revoke it in Settings without rotating
 * the rest.
 *
 * Body: { sender, message, receivedAt? } or { messages: [...] }.
 * Intentionally returns the same summary shape as POST /api/sms.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const key = req.headers.get("x-sms-key") ?? new URL(req.url).searchParams.get("key");
  if (!key) {
    return json({ error: "Missing x-sms-key header" }, { status: 401 });
  }

  const token = await prisma.smsIngestToken.findFirst({
    where: { token: key, revokedAt: null },
    select: { id: true, companyId: true },
  });
  if (!token) {
    return json({ error: "Invalid or revoked key" }, { status: 401 });
  }

  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const messages = Array.isArray(body.messages) ? body.messages : [body];
  if (messages.length === 0 || messages.some((m: { sender?: string; message?: string }) => !m?.sender || !m?.message)) {
    return json({ error: "Each message needs sender + message" }, { status: 400 });
  }

  const results = await ingestSmsBatch(
    messages.slice(0, 100).map((m: { sender: string; message: string; receivedAt?: string }) => ({
      companyId: token.companyId,
      sender: m.sender,
      message: m.message,
      receivedAt: m.receivedAt ? new Date(m.receivedAt) : undefined,
    })),
  );

  // Fire-and-forget usage stamp — never block the forwarder's ACK.
  void prisma.smsIngestToken.update({
    where: { id: token.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return json({
    summary: {
      total: results.length,
      matched: results.filter((r) => r.status === "MATCHED").length,
      unmatched: results.filter((r) => r.status === "UNMATCHED").length,
      duplicates: results.filter((r) => r.duplicate).length,
    },
  }, { status: 201 });
}, { skipSession: true });
