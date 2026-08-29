import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { manualMatchSms } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sms/match — manually link an unmatched SMS to a sale/tenancy
 * Body: { smsId, entityType: "ASSET_SALE"|"MATERIAL_SALE"|"TENANCY", entityId }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const body = await req.json();

  if (!body.smsId || !body.entityType || !body.entityId) {
    return json({ error: "smsId, entityType, and entityId are required" }, { status: 400 });
  }

  try {
    const result = await manualMatchSms({
      smsId: body.smsId,
      companyId: company.id,
      entityType: body.entityType,
      entityId: body.entityId,
      userId: user.id,
    });
    revalidatePath("/sms");
    revalidatePath("/m/sms");
    return json({ ok: true, id: result.id, status: result.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to match SMS") }, { status: 400 });
  }
});
