import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, getCompanyGroupIds, json, requirePermission, stockLocationSchema, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { withSerializableTransaction } from "@nirman/services";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const includeGroup = url.searchParams.get("group") === "true";

  const companyIds = includeGroup ? await getCompanyGroupIds() : [company.id];
  const locations = await prisma.stockLocation.findMany({
    take: 500,
    where: { companyId: { in: companyIds }, deletedAt: null },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      stockItems: { select: { qty: true, movingAvgCost: true } },
    },
  });
  const rows = locations.map((l) => {
    const stockValue = l.stockItems.reduce(
      (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
      0,
    );
    return {
      id: l.id,
      type: l.type,
      name: l.name,
      address: l.address,
      projectId: l.projectId,
      projectName: l.project?.name ?? null,
      companyId: l.companyId,
      companyName: l.company?.name ?? null,
      stockValue,
      itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
      lat: l.lat,
      lng: l.lng,
      geoRadius: l.geoRadius,
    };
  });
  return json(rows);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = stockLocationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // ── Scope validation based on type ──
  // PROJECT_SITE must reference a project; all other types must NOT have a project.
  if (parsed.data.type === "PROJECT_SITE" && !parsed.data.projectId) {
    return json({ error: "A project site must be linked to a project" }, { status: 400 });
  }
  if (parsed.data.type !== "PROJECT_SITE" && parsed.data.projectId) {
    parsed.data.projectId = null;
  }

  // ── Target company ──
  // The owner of a parent company can create stock locations for child companies.
  // Defaults to the current company. Must be in the company group (self or children).
  const groupIds = await getCompanyGroupIds(company);
  const targetCompanyId = body.targetCompanyId && body.targetCompanyId !== company.id
    ? body.targetCompanyId
    : company.id;
  if (targetCompanyId !== company.id && !groupIds.includes(targetCompanyId)) {
    return json({ error: "You can only create stock locations for your own company or its children" }, { status: 403 });
  }

  // ── Duplicate check ──
  // Warn if a stock location with the same name already exists in the target company
  // (case-insensitive). The user can override by passing `force: true`.
  const force = body.force === true;
  if (!force) {
    const existing = await prisma.stockLocation.findFirst({
      where: {
        companyId: targetCompanyId,
        deletedAt: null,
        name: { equals: parsed.data.name, mode: "insensitive" },
      },
      select: { id: true, name: true, type: true, projectId: true },
    });
    if (existing) {
      return json(
        {
          warning: "duplicate",
          message: `A stock location named "${existing.name}" already exists${existing.type === "PROJECT_SITE" ? " (project site)" : ""}. Create anyway?`,
          existing: { id: existing.id, name: existing.name, type: existing.type },
        },
        { status: 409 },
      );
    }
  }

  const created = await withSerializableTransaction(async (tx) => {
    const loc = await tx.stockLocation.create({
      data: {
        ...parsed.data,
        companyId: targetCompanyId,
        projectId: parsed.data.projectId ?? null,
      },
    });
    await logAction(tx, {
      userId: user.id,
      action: "STOCK_LOCATION_CREATE",
      entityType: "StockLocation",
      entityId: loc.id,
      after: { name: loc.name, type: loc.type, projectId: loc.projectId, companyId: targetCompanyId },
    });
    return loc;
  });
  revalidatePath("/stock-locations");
  revalidatePath("/m/stock-locations");
  return json(created, { status: 201 });
});
