import { NextRequest } from "next/server";
import {
  listIntegrationConfigsMasked,
  upsertIntegrationConfig,
  deleteIntegrationConfig,
  INTEGRATION_SCHEMAS,
} from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/integrations
 * List all integration configs for the current company (secrets masked).
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const company = await getCompany();
  const configs = await listIntegrationConfigsMasked(company.id);
  // Merge with schema definitions so the UI knows the field layout
  const result = INTEGRATION_SCHEMAS.map((schema) => {
    const config = configs.find((c) => c.key === schema.key);
    return {
      ...schema,
      configured: !!config,
      enabled: config?.enabled ?? false,
      config: config?.config ?? {},
      lastVerifiedAt: config?.lastVerifiedAt ?? null,
      lastVerifyError: config?.lastVerifyError ?? null,
    };
  });
  return json({ integrations: result });
});

const upsertSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()),
});

/**
 * POST /api/integrations
 * Create or update an integration config.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const company = await getCompany();
  const body = await req.json().catch(() => ({}));
  const parsed = upsertSchema.parse(body);

  const result = await upsertIntegrationConfig({
    companyId: company.id,
    key: parsed.key,
    enabled: parsed.enabled,
    config: parsed.config,
    userId: user.id,
  });

  return json({ success: true, id: result.id });
});

/**
 * DELETE /api/integrations
 * Remove an integration config.
 * Body: { key: string }
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const company = await getCompany();
  const body = await req.json().catch(() => ({}));
  const { key } = z.object({ key: z.string() }).parse(body);

  await deleteIntegrationConfig({
    companyId: company.id,
    key,
    userId: user.id,
  });

  return json({ success: true });
});
