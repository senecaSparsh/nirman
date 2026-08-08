import { NextRequest } from "next/server";
import { sendNotification } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * POST /api/notifications/test
 * Send a test notification to verify the WhatsApp/email provider is working.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();

  const schema = z.object({
    channel: z.enum(["WHATSAPP", "EMAIL", "IN_APP"]),
    recipient: z.string().min(1),
    message: z.string().min(1).optional(),
  });

  const parsed = schema.parse(body);

  const log = await sendNotification({
    companyId: company.id,
    eventType: "TEST",
    channel: parsed.channel,
    recipient: parsed.recipient,
    message: parsed.message ?? `Test notification from ${company.name} — ${new Date().toISOString()}`,
  });

  return json({ id: log.id, status: log.status, error: log.errorMessage });
});
