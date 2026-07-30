import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, stockLocationSchema, toNum } from "@/lib/server";

export const GET = apiHandler(async () => {
  const company = await getCompany();
  const locations = await prisma.stockLocation.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
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
      stockValue,
      itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
    };
  });
  return json(rows);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const company = await getCompany();
  const body = await req.json();
  const parsed = stockLocationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // PROJECT_SITE must reference a project; COMPANY_WAREHOUSE must not
  if (parsed.data.type === "PROJECT_SITE" && !parsed.data.projectId) {
    return json({ error: "A project site must be linked to a project" }, { status: 400 });
  }
  if (parsed.data.type === "COMPANY_WAREHOUSE" && parsed.data.projectId) {
    parsed.data.projectId = null;
  }
  const created = await prisma.stockLocation.create({
    data: {
      ...parsed.data,
      companyId: company.id,
      projectId: parsed.data.projectId ?? null,
    },
  });
  return json(created, { status: 201 });
});
