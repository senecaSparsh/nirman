import { NextRequest } from "next/server";
import { deleteRenovationCost, ServiceError } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string; costId: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { costId } = await params;

  const company = await getCompany();
  const existing = await prisma.renovationCost.findFirst({ where: { id: costId, renovationProject: { companyId: company.id } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  try {
    await deleteRenovationCost(costId, user.id);
    return json({ ok: true });
  } catch (err) {
    const message = err instanceof ServiceError ? err.message : "Failed to delete renovation cost";
    return json({ error: message }, { status: err instanceof ServiceError ? err.status : 400 });
  }
});
