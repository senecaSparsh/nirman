import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";

/**
 * GET /api/telephony/providers — list provider configs for the company.
 * Requires TELEPHONY_MANAGE.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

  const [configs, total] = await Promise.all([
    prisma.telephonyProviderConfig.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.telephonyProviderConfig.count({ where: { companyId: company.id, deletedAt: null } }),
  ]);

  return json({ data: configs, total, page, limit });
});

/**
 * POST /api/telephony/providers — add a provider config.
 * Requires TELEPHONY_MANAGE.
 *
 * Body: { provider, apiKey?, apiSecret?, apiKeyRef?, apiSecretRef?, webhookUrl?, settings?, active? }
 *
 * Accepts either raw API keys (apiKey/apiSecret) or pre-existing encrypted
 * references (apiKeyRef/apiSecretRef). When raw keys are provided, they are
 * stored as references (in production, these would be encrypted via KMS).
 * The webhookUrl is auto-generated if not provided.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.TELEPHONY_MANAGE);
  const company = await getCompany();

  const body = await req.json();
  const { provider, apiKey, apiSecret, apiKeyRef, apiSecretRef, webhookUrl, settings, active } = body as {
    provider?: string;
    apiKey?: string;
    apiSecret?: string;
    apiKeyRef?: string;
    apiSecretRef?: string;
    webhookUrl?: string;
    settings?: unknown;
    active?: boolean;
  };

  if (!provider || typeof provider !== "string" || !provider.trim()) {
    return json({ error: "provider is required" }, { status: 400 });
  }

  // Accept either raw keys or pre-existing refs
  const finalApiKeyRef = apiKeyRef ?? (apiKey ? `raw:${apiKey}` : null);
  const finalApiSecretRef = apiSecretRef ?? (apiSecret ? `raw:${apiSecret}` : null);

  if (!finalApiKeyRef) {
    return json({ error: "apiKey or apiKeyRef is required" }, { status: 400 });
  }
  if (!finalApiSecretRef) {
    return json({ error: "apiSecret or apiSecretRef is required" }, { status: 400 });
  }

  // Auto-generate webhook URL if not provided
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const finalWebhookUrl = webhookUrl ?? `${baseURL}/api/telephony/webhook?provider=${provider.trim()}&companyId=${company.id}`;

  // Check for existing active config with the same provider
  const existing = await prisma.telephonyProviderConfig.findFirst({
    where: { companyId: company.id, provider: provider.trim(), deletedAt: null },
  });
  if (existing) {
    return json({ error: `A config for provider "${provider}" already exists for this company` }, { status: 409 });
  }

  const config = await prisma.telephonyProviderConfig.create({
    data: {
      companyId: company.id,
      provider: provider.trim(),
      apiKeyRef: finalApiKeyRef,
      apiSecretRef: finalApiSecretRef,
      webhookUrl: finalWebhookUrl,
      settings: settings ?? undefined,
      active: active ?? true,
    },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "TELEPHONY_PROVIDER_CREATE",
    entityType: "TelephonyProviderConfig",
    entityId: config.id,
    after: { provider: config.provider },
  });

  return json(config, { status: 201 });
});
