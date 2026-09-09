import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma, type ProjectType } from "@nirman/db";
import { z } from "zod";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction, reallocateProjectCosts, withSerializableTransaction } from "@nirman/services";

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
  const user = await requirePermission(PERM.PROJECTS_MANAGE);
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
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("LandPurchase", {}) },
    include: { parcels: { where: { deletedAt: null } } },
  });

  if (!landPurchase) {
    return json({ error: "Land purchase not found" }, { status: 404 });
  }

  if (landPurchase.projectId) {
    return json({ error: "This land is already linked to a project" }, { status: 400 });
  }

  // Gate: subdivided land must have at least one parcel available before
  // creating a project. BOOKED land must be completed (registry uploaded).
  if (landPurchase.mode === "BOOKED" && !landPurchase.registryDocumentUrl) {
    return json({ error: "Cannot create project from booked land until registry is complete" }, { status: 400 });
  }
  if (landPurchase.mode === "SUBDIVIDED" && landPurchase.parcels.length === 0) {
    return json({ error: "Cannot create project from subdivided land with no parcels" }, { status: 400 });
  }

  // Create the project and link the land purchase in a transaction
  const project = await withSerializableTransaction(async (tx) => {
    const proj = await tx.project.create({
      data: {
        companyId: company.id,
        name: parsed.data.name,
        type: (parsed.data.type ?? "RESIDENTIAL") as ProjectType,
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

    // Link all land parcels to the project and set purpose = PROJECT
    if (landPurchase.parcels.length > 0) {
      await tx.landParcel.updateMany({
        where: { id: { in: landPurchase.parcels.map((p) => p.id) } },
        data: { projectId: proj.id, purpose: "PROJECT" },
      });
    }

    // Reallocate project costs so costPerSqft reflects the land cost immediately
    try {
      await reallocateProjectCosts(tx, proj.id);
    } catch {
      // Reallocation may fail if no sellable area yet — that's fine, it'll
      // run again when built units are created.
    }

    // Audit log
    await logAction(tx, {
      userId: user.id,
      companyId: company.id,
      action: "PROJECT_CREATE_FROM_LAND",
      entityType: "Project",
      entityId: proj.id,
      after: {
        projectName: proj.name,
        landPurchaseId: landPurchase.id,
        totalBudget: landPurchase.totalCost.toString(),
      },
    });

    return proj;
  });

  revalidatePath("/land");
  revalidatePath("/m/land");
    revalidatePath("/m/real-estate?tab=land");
  revalidatePath("/projects");
  revalidatePath(`/land/${landPurchase.id}`);
  return json({ ok: true, id: project.id, name: project.name }, { status: 201 });
});
