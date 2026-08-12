import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
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
    revalidatePath("/m/material-sales");
    revalidatePath("/m/sales");
    return json({ ok: true, id: sale.id, status: sale.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to cancel material sale") }, { status: 400 });
  }
});

// PATCH alias for cancel — consistent with all other action endpoints (PO, requisition, etc.)
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  if (body?.action !== "cancel") {
    return json({ error: "Unknown action. Use 'cancel'." }, { status: 400 });
  }
  try {
    const sale = await cancelMaterialSale(id, company.id, user.id);
    revalidatePath("/m/material-sales");
    revalidatePath("/m/sales");
    return json({ ok: true, id: sale.id, status: sale.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to cancel material sale") }, { status: 400 });
  }
});
