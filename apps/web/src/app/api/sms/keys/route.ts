import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@nirman/db";
import { jsonBody, apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sms/keys — list this company's SMS-ingest device keys.
 * Tokens are returned masked (last 4 chars); the full key is only
 * visible once, at creation time.
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const keys = await prisma.smsIngestToken.findMany({
    where: { companyId: company.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, token: true, lastUsedAt: true, createdAt: true },
  });
  return json({
    keys: keys.map((k) => ({
      id: k.id,
      label: k.label,
      masked: `…${k.token.slice(-4)}`,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/sms/keys — mint a device key. The full token is returned
 * in this response ONLY — the app never shows it again.
 * Body: { label? }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const body = await jsonBody(req);
  const label = body instanceof Response ? undefined : (body.label?.trim() || undefined);

  const token = randomBytes(24).toString("hex");
  await prisma.smsIngestToken.create({
    data: { companyId: company.id, token, label, createdById: user.id },
  });
  return json({ token, label }, { status: 201 });
});

/**
 * DELETE /api/sms/keys?id=<id> — revoke a device key (lost phone,
 * retired forwarder). Other keys keep working.
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "id is required" }, { status: 400 });

  const row = await prisma.smsIngestToken.findFirst({
    where: { id, companyId: company.id, revokedAt: null },
    select: { id: true },
  });
  if (!row) return json({ error: "Key not found" }, { status: 404 });

  await prisma.smsIngestToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return json({ ok: true });
});
