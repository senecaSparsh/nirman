import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { reallocateProjectCosts } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { withSerializableTransaction } from "@nirman/services";

/**
 * POST /api/projects/[id]/reallocate — manually re-run cost reallocation
 * for a project. Recomputes costPerSqft and each built unit's productionCost
 * based on current material issues, project costs, land costs, and scrap
 * generation value. Useful after data corrections or bulk imports.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Verify the project belongs to the company
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });

  const result = await withSerializableTransaction(async (tx) => {
    return reallocateProjectCosts(tx, id, user.id);
  });

  revalidatePath("/projects");
  revalidatePath("/m/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/gl");

  return json({
    ok: true,
    projectId: id,
    costPerSqft: toNum(result.costPerSqft),
    totalProjectCost: toNum(result.totalCost),
    totalSellableArea: toNum(result.totalArea),
  });
});
