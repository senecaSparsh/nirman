import { NextRequest } from "next/server";
import { listNotificationTemplates, upsertNotificationTemplate, getNotificationStats } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/notifications/templates
 * List notification templates + stats for the current company.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const [templates, stats] = await Promise.all([
    listNotificationTemplates(company.id),
    getNotificationStats(company.id),
  ]);
  return json({ templates, stats });
});

const upsertSchema = z.object({
  eventType: z.string().min(1),
  channel: z.enum(["WHATSAPP", "EMAIL", "IN_APP"]),
  template: z.string().min(1),
  isActive: z.boolean().optional().default(true),
});

/**
 * POST /api/notifications/templates
 * Create or update a notification template.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = upsertSchema.parse(body);

  const t = await upsertNotificationTemplate(
    company.id,
    parsed.eventType,
    parsed.channel,
    parsed.template,
    parsed.isActive,
    user.id,
  );

  return json({ id: t.id }, { status: 201 });
});
