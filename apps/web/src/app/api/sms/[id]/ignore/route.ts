import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { ignoreSms } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sms/[id]/ignore — dismiss an SMS that is not a receivable
 * payment (personal credits, duplicates, noise). Mirrors the creator-side
 * dismiss actions used by gate passes and indents.
 */
export const POST = apiHandler(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const { id } = await params;

  try {
    await ignoreSms({ smsId: id, companyId: company.id, userId: user.id });
    revalidatePath("/sms");
    revalidatePath("/m/sms");
    return json({ ok: true, status: "IGNORED" });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to ignore SMS") }, { status: 400 });
  }
});
