import { NextRequest } from "next/server";
import { removeWbsDependency } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WBS_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.wbsDependency.findFirst({ where: { id, predecessor: { project: { companyId: company.id } } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  try {
    await removeWbsDependency(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
