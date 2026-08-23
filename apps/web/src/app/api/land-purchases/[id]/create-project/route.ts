import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { z } from "zod";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/land-purchases/[id]/create-project
 *
 * Creates a new Project from a LandPurchase. The project is pre-filled
 * with the land's location and total cost as the initial budget.
 * The LandPurchase.projectId is set to link the land to the project.
 *
 * This is the "Create project from land" button on the land detail page.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROJECTS_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const schema = z.object({
    name: z.string().min(1, "Project name is required").max(200),
    type: z.enum(["RESIDENTIAL", "COMMERCIAL", "WAREHOUSE", "MALL", "LAND", "OTHER"]).optional(),
    description: z.string().max(2000).optional().nullable(),
  });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify the land purchase belongs to this company
  const landPurchase = await prisma.landPurchase.findFirst({
    where: { id, companyId: company.id },
    include: { parcels: { where: { deletedAt: null } } },
  });

  if (!landPurchase) {
    return json({ error: "Land purchase not found" }, { status: 404 });
  }

  if (landPurchase.projectId) {
    return json({ error: "This land is already linked to a project" }, { status: 400 });
  }

  // Create the project and link the land purchase in a transaction
  const project = await prisma.$transaction(async (tx) => {
    const proj = await tx.project.create({
      data: {
        companyId: company.id,
        name: parsed.data.name,
        type: (parsed.data.type ?? "RESIDENTIAL") as any,
        status: "PLANNED",
        address: landPurchase.location ?? null,
        totalBudget: landPurchase.totalCost,
        description: parsed.data.description ?? null,
        startDate: new Date(),
      },
    });

    // Link the land purchase to the project
    await tx.landPurchase.update({
      where: { id: landPurchase.id },
      data: { projectId: proj.id },
    });

    // Link all land parcels to the project
    if (landPurchase.parcels.length > 0) {
      await tx.landParcel.updateMany({
        where: { id: { in: landPurchase.parcels.map((p) => p.id) } },
        data: { projectId: proj.id },
      });
    }

    return proj;
  });

  return json({ ok: true, id: project.id, name: project.name }, { status: 201 });
});
