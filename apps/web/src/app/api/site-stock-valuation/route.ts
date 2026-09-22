import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getSiteStockValuation } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  // The service takes a bare projectId — verify it belongs to this company
  // before returning per-location stock values (a foreign project's stock is
  // a direct cross-tenant leak).
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  const valuations = await getSiteStockValuation(projectId);
  return json(valuations.map((v) => ({
    ...v,
    totalValue: v.totalValue.toNumber(),
    items: v.items.map((i) => ({
      ...i,
      qty: i.qty.toNumber(),
      mac: i.mac.toNumber(),
      value: i.value.toNumber(),
    })),
  })));
});
