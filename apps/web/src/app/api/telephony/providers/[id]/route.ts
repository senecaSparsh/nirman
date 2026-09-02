import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";

/**
 * PATCH /api/telephony/providers/[id] — update a provider config.
 * Requires TELEPHONY_MANAGE.
 *
 * Body: { apiKeyRef?, apiSecretRef?, webhookUrl?, settings?, active? }
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.telephonyProviderConfig.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) return json({ error: "Provider config not found" }, { status: 404 });

  const body = await req.json();
  const { apiKeyRef, apiSecretRef, webhookUrl, settings, active } = body as {
    apiKeyRef?: string;
    apiSecretRef?: string;
    webhookUrl?: string;
    settings?: unknown;
    active?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (apiKeyRef !== undefined) data.apiKeyRef = apiKeyRef;
  if (apiSecretRef !== undefined) data.apiSecretRef = apiSecretRef;
  if (webhookUrl !== undefined) data.webhookUrl = webhookUrl;
  if (settings !== undefined) data.settings = settings;
  if (active !== undefined) data.active = active;

  const updated = await prisma.telephonyProviderConfig.update({
    where: { id },
    data,
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "TELEPHONY_PROVIDER_UPDATE",
    entityType: "TelephonyProviderConfig",
    entityId: id,
    before: { active: existing.active, webhookUrl: existing.webhookUrl },
    after: data,
  });

  return json(updated);
});

/**
 * DELETE /api/telephony/providers/[id] — soft delete a provider config.
 * Requires TELEPHONY_MANAGE.
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.telephonyProviderConfig.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) return json({ error: "Provider config not found" }, { status: 404 });

  await prisma.telephonyProviderConfig.update({
    where: { id },
    data: { deletedAt: new Date(), active: false },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "TELEPHONY_PROVIDER_DELETE",
    entityType: "TelephonyProviderConfig",
    entityId: id,
  });

  return json({ ok: true });
});
