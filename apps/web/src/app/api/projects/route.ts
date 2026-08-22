import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, projectSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROJECTS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim() ?? "";

  const projects = await prisma.project.findMany({
    take: 100,
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(type ? { type: type as any } : {}),
      ...(status ? { status: status as any } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          builtUnits: { where: { deletedAt: null } },
          stockLocations: { where: { deletedAt: null } },
          phases: true,
        },
      },
    },
  });
  return json(
    projects.map((p) => ({
      ...p,
      totalBudget: toNum(p.totalBudget),
      costPerSqft: toNum(p.costPerSqft),
      totalProjectCost: toNum(p.totalProjectCost),
      totalSellableArea: toNum(p.totalSellableArea),
      unitCount: p._count.builtUnits,
      locationCount: p._count.stockLocations,
      phaseCount: p._count.phases,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROJECTS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Extract ATS + registry fields — not stored on Project, used to auto-create legal docs
  const {
    startDate, endDate, totalBudget,
    isATS, atsRegistrationAmount, atsExpectedRegistryDate, registryNo,
    reraNumber, reraRegistrationDate, reraValidityDate, reraWebsiteUrl,
    ...rest
  } = parsed.data;
  const created = await prisma.project.create({
    data: {
      ...rest,
      companyId: company.id,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      totalBudget: totalBudget ?? null,
      reraNumber: reraNumber || null,
      reraRegistrationDate: reraRegistrationDate ? new Date(reraRegistrationDate) : null,
      reraValidityDate: reraValidityDate ? new Date(reraValidityDate) : null,
      reraWebsiteUrl: reraWebsiteUrl || null,
    },
  });

  // Auto-create an AGREEMENT_TO_SELL legal doc if ATS is selected
  if (isATS) {
    await prisma.legalDocument.create({
      data: {
        companyId: company.id,
        projectId: created.id,
        type: "AGREEMENT_TO_SELL",
        title: "Agreement to Sell (ATS)",
        authority: "Sub-Registrar / Revenue Department",
        status: "APPROVED",
        appliesTo: "BOTH",
        sortOrder: 4,
        prerequisiteType: "OWNERSHIP_CERTIFICATE",
        obtained: true,
        amount: atsRegistrationAmount ?? null,
        expectedRegistryDate: atsExpectedRegistryDate ? new Date(atsExpectedRegistryDate) : null,
        notes: "Auto-created from project form — registry deferred, ATS recorded as substitute.",
        createdById: user.id,
      },
    });
  } else if (registryNo && registryNo.trim()) {
    // ATS = No and a registry number was provided → auto-create an OWNERSHIP_CERTIFICATE
    await prisma.legalDocument.create({
      data: {
        companyId: company.id,
        projectId: created.id,
        type: "OWNERSHIP_CERTIFICATE",
        title: "Ownership Certificate / Sale Deed",
        authority: "Sub-Registrar / Revenue Department",
        status: "APPROVED",
        appliesTo: "BOTH",
        sortOrder: 0,
        prerequisiteType: null,
        obtained: true,
        docNumber: registryNo.trim(),
        notes: "Auto-created from project form — registry completed.",
        createdById: user.id,
      },
    });
  }

  // Auto-create a RERA_REGISTRATION legal doc if a RERA number was provided
  if (reraNumber && reraNumber.trim()) {
    await prisma.legalDocument.create({
      data: {
        companyId: company.id,
        projectId: created.id,
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

  return json(created, { status: 201 });
});
