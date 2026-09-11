import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { addRenovationCost, ServiceError } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, renovationCostSchema, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.renovationProject.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = renovationCostSchema.safeParse({ ...body, renovationProjectId: id });
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const cost = await addRenovationCost({
      renovationProjectId: id,
      costType: parsed.data.costType,
      amount: parsed.data.amount,
      vendor: parsed.data.vendor ?? undefined,
      notes: parsed.data.notes ?? undefined,
      receiptUrl: parsed.data.receiptUrl ?? undefined,
      userId: user.id,
    });
    revalidatePath("/renovations");
    revalidatePath("/m/renovations");
    revalidatePath(`/renovations/${id}`);
    revalidatePath("/gl");
    return json({ ok: true, id: cost.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof ServiceError ? err.message : "Failed to add renovation cost";
    return json({ error: message }, { status: err instanceof ServiceError ? err.status : 400 });
  }
});
