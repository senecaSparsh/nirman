import { NextRequest } from "next/server";
import { cancelMaterialSale } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  if (body?.action !== "cancel") {
    return json({ error: "Unknown action. Use 'cancel'." }, { status: 400 });
  }
  try {
    const sale = await cancelMaterialSale(id, company.id, user.id);
    return json({ ok: true, id: sale.id, status: sale.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to cancel material sale") }, { status: 400 });
  }
});
