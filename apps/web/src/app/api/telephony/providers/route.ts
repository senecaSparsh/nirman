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
 * Body: { provider, apiKeyRef, apiSecretRef, webhookUrl?, settings?, active? }
 *
 * Stores REFERENCES to API keys (e.g. "env:EXOTEL_API_KEY", "kms:key-123"),
 * never the raw key material. In production, raw apiKey/apiSecret values
 * are REJECTED — they must be stored in env vars or a KMS-backed secret
 * manager and referenced here. In dev, raw keys are accepted with a
 * warning (prefixed with "raw:") for quick testing.
 *
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

  const validProviders = ["EXOTEL", "KNOWLARITY", "TWILIO"];
  if (!validProviders.includes(provider.trim())) {
    return json({ error: `provider must be one of: ${validProviders.join(", ")}` }, { status: 400 });
  }

  // In production, REJECT raw API keys — they must be stored in env vars
  // or a KMS-backed secret manager and referenced via apiKeyRef/apiSecretRef.
  // Storing raw keys in the DB (even with a "raw:" prefix) is a security gap
  // because the DB may be backed up, logged, or exposed via Prisma Studio.
  if (process.env.NODE_ENV === "production" && (apiKey || apiSecret)) {
    return json(
      { error: "Raw API keys are not allowed in production. Store them in environment variables or KMS and provide apiKeyRef/apiSecretRef references (e.g. 'env:EXOTEL_API_KEY')." },
      { status: 400 },
    );
  }

  // Accept either raw keys (dev only) or pre-existing refs.
  // In dev, raw keys are stored with a "raw:" prefix for quick testing.
  const finalApiKeyRef = apiKeyRef ?? (apiKey ? `raw:${apiKey}` : null);
  const finalApiSecretRef = apiSecretRef ?? (apiSecret ? `raw:${apiSecret}` : null);

  if (!finalApiKeyRef) {
    return json({ error: "apiKeyRef is required (or apiKey in dev mode)" }, { status: 400 });
  }
  if (!finalApiSecretRef) {
    return json({ error: "apiSecretRef is required (or apiSecret in dev mode)" }, { status: 400 });
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
