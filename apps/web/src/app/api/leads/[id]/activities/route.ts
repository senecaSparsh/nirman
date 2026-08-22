import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordLeadActivity } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

const activitySchema = z.object({
  type: z.enum(["CALL", "EMAIL", "WHATSAPP", "MEETING", "SITE_VISIT", "NOTE"]),
  note: z.string().trim().max(2000).optional(),
  outcome: z.string().trim().max(500).optional(),
  occurredAt: z.coerce.date().optional(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
}).refine((value) => Boolean(value.note || value.outcome), {
  message: "Add a note or outcome",
  path: ["note"],
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const parsed = activitySchema.safeParse(await req.json());
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const result = await recordLeadActivity({
    leadId: id,
    companyId: company.id,
    type: parsed.data.type,
    note: parsed.data.note,
    outcome: parsed.data.outcome,
    occurredAt: parsed.data.occurredAt,
    nextFollowUpAt: parsed.data.nextFollowUpAt ?? undefined,
    userId: user.id,
  });
  revalidatePath("/sales");
  return json({ id: result.activity.id, score: result.score }, { status: 201 });
});
