import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { apiHandler, json } from "@/lib/server";
import { ServiceError, emitNotificationEvent, NotificationEventType } from "@nirman/services";

/**
 * POST /api/enquiries — PUBLIC lead capture. No auth: a buyer on the public
 * properties page self-registers. Rate-limited per-IP; the company must have
 * publicListingsEnabled on. Lands as a PORTAL-source lead + a notification
 * to the sales team.
 */
const schema = z.object({
  companyId: z.string().min(1),
  interestedUnitId: z.string().optional().nullable(),
  name: z.string().min(1).max(120),
  phone: z.string().min(8).max(20),
  email: z.string().email().max(160).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  // Honeypot — bots fill hidden fields, humans don't.
  website: z.string().optional(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Please check your details" }, { status: 400 });
  const input = parsed.data;
  if (input.website) return json({ ok: true }); // honeypot hit — pretend success

  const company = await prisma.company.findFirst({
    where: { id: input.companyId, deletedAt: null },
    select: { id: true, publicListingsEnabled: true },
  });
  if (!company?.publicListingsEnabled) throw new ServiceError("Not found", 404);

  // Resolve the interested unit → its project (server-side, never trust the client).
  let projectId: string | null = null;
  if (input.interestedUnitId) {
    const unit = await prisma.builtUnit.findFirst({
      where: { id: input.interestedUnitId, project: { companyId: company.id } },
      select: { projectId: true },
    });
    projectId = unit?.projectId ?? null;
  }

  // Dedupe — same phone + company within 24h updates notes instead of a dup lead.
  const existing = await prisma.lead.findFirst({
    where: { companyId: company.id, phone: input.phone, createdAt: { gte: new Date(Date.now() - 86400000) } },
  });
  const lead = existing
    ? await prisma.lead.update({
        where: { id: existing.id },
        data: { notes: input.notes ?? existing.notes, updatedAt: new Date() },
      })
    : await prisma.lead.create({
        data: {
          companyId: company.id,
          projectId,
          interestedUnitId: input.interestedUnitId ?? null,
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          source: "PORTAL",
          notes: input.notes ?? null,
        },
      });

  void emitNotificationEvent({
    eventType: NotificationEventType.LEAD_CREATED,
    companyId: company.id,
    entityType: "Lead",
    entityId: lead.id,
    variables: { leadName: input.name, source: "properties page" },
    timestamp: new Date(),
  });

  return json({ ok: true });
}, { skipSession: true, rateLimit: "auth" });
