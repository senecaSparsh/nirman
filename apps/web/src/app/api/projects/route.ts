import { NextRequest } from "next/server";
import { prisma, type ProjectType, type ProjectStatus } from "@nirman/db";
import { apiHandler, getCompany, json, projectSchema, requirePermission, requireAnyPermission, scopeWhere, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  // Projects are the target pick-list for DPRs, issues-to-project,
  // requisitions, tasks, safety/QC and measurement forms — a role holding
  // any of those action perms must be able to read the list. Writes stay
  // gated on projects.manage below.
  await requireAnyPermission(
    PERM.PROJECTS_VIEW, PERM.DPR_SUBMIT, PERM.DPR_VIEW, PERM.STOCK_ISSUE,
    PERM.STOCK_TRANSFER, PERM.REQUISITION_CREATE, PERM.TASKS_VIEW,
    PERM.SAFETY_VIEW, PERM.QC_VIEW, PERM.MB_VIEW, PERM.BOQ_VIEW,
  );
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
      ...await scopeWhere("Project"),
      ...(type ? { type: type as ProjectType } : {}),
      ...(status ? { status: status as ProjectStatus } : {}),
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

  // Every project needs a site store — without one, GRNs and material issues
  // at the site have no receiving location and the workflow dead-ends until
  // someone digs through settings. Auto-create like the ATS legal doc.
  await prisma.stockLocation.create({
    data: {
      companyId: company.id,
      projectId: created.id,
      type: "PROJECT_SITE",
      name: `${created.name} Site Store`,
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
