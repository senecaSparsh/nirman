import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete, logAction } from "@nirman/services";
import { apiHandler, getCompany, json, projectSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROJECTS_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      phases: { orderBy: { sortOrder: "asc" } },
      stockLocations: { where: { deletedAt: null }, orderBy: { name: "asc" } },
      builtUnits: {
        where: { deletedAt: null },
        select: { id: true, unitNumber: true, area: true },
        orderBy: { unitNumber: "asc" },
      },
      _count: {
        select: {
          builtUnits: { where: { deletedAt: null } },
          materialIssues: {},
          purchaseOrders: {},
          landParcels: { where: { deletedAt: null } },
        },
      },
    },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  return json({
    ...project,
    totalBudget: toNum(project.totalBudget),
    costPerSqft: toNum(project.costPerSqft),
    totalProjectCost: toNum(project.totalProjectCost),
    totalSellableArea: toNum(project.totalSellableArea),
    units: project.builtUnits.map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      builtAreaSqft: u.area ? Number(u.area) : null,
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROJECTS_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.project.findFirst({ where: { id, companyId: company.id, deletedAt: null } });
  if (!existing) return json({ error: "Project not found" }, { status: 404 });
  const {
    startDate, endDate, totalBudget,
    isATS, atsRegistrationAmount, atsExpectedRegistryDate, registryNo,
    reraNumber, reraRegistrationDate, reraValidityDate, reraWebsiteUrl,
    ...rest
  } = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    const proj = await tx.project.update({
      where: { id },
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        totalBudget: totalBudget ?? null,
        reraNumber: reraNumber || null,
        reraRegistrationDate: reraRegistrationDate ? new Date(reraRegistrationDate) : null,
        reraValidityDate: reraValidityDate ? new Date(reraValidityDate) : null,
        reraWebsiteUrl: reraWebsiteUrl || null,
      },
    });

    // Sync RERA legal doc: create if RERA number added, update if exists, delete if removed
    const existingReraDoc = await tx.legalDocument.findFirst({
      where: { projectId: id, type: "RERA_REGISTRATION", deletedAt: null },
    });
    if (reraNumber && reraNumber.trim()) {
      if (existingReraDoc) {
        // Update existing RERA legal doc
        await tx.legalDocument.update({
          where: { id: existingReraDoc.id },
          data: {
            docNumber: reraNumber.trim(),
            issueDate: reraRegistrationDate ? new Date(reraRegistrationDate) : null,
            validTill: reraValidityDate ? new Date(reraValidityDate) : null,
            notes: reraWebsiteUrl
              ? `Auto-updated from project form. RERA website: ${reraWebsiteUrl}`
              : "Auto-updated from project form.",
          },
        });
      } else {
        // Create new RERA legal doc
        await tx.legalDocument.create({
          data: {
            companyId: company.id,
            projectId: id,
            type: "RERA_REGISTRATION",
            title: "RERA Registration",
            authority: "State RERA Authority",
            status: "APPROVED",
            appliesTo: "PROJECT",
            sortOrder: 10,
            prerequisiteType: "COMMENCEMENT_CERTIFICATE",
            obtained: true,
            docNumber: reraNumber.trim(),
            issueDate: reraRegistrationDate ? new Date(reraRegistrationDate) : null,
            validTill: reraValidityDate ? new Date(reraValidityDate) : null,
            notes: reraWebsiteUrl
              ? `Auto-created from project form. RERA website: ${reraWebsiteUrl}`
              : "Auto-created from project form.",
            createdById: user.id,
          },
        });
      }
    } else if (!reraNumber && existingReraDoc) {
      // RERA number removed — soft-delete the legal doc
      await tx.legalDocument.update({
        where: { id: existingReraDoc.id },
        data: { deletedAt: new Date() },
      });
    }

    await logAction(tx, {
      userId: user.id,
      action: "PROJECT_UPDATE",
      entityType: "Project",
      entityId: id,
      after: parsed.data,
    });
    return proj;
  });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROJECTS_MANAGE);
  const { id } = await ctx.params;
  try {
    await softDelete("Project", id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete project") }, { status: 400 });
  }
});
