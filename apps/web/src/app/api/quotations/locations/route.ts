import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, getCompanyGroupIds, json, requirePermission } from "@/lib/server";

/**
 * GET /api/quotations/locations
 * Returns all stock locations in the company GROUP (current + parent +
 * children), grouped by company. Used by the quotation request form's
 * destination location picker.
 *
 * Response shape:
 *   [
 *     {
 *       companyId, companyName, isParent, isCurrent, isChild,
 *       locations: [{ id, name, type, projectId, projectName }]
 *     }
 *   ]
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.QUOTATION_VIEW);
  const company = await getCompany();
  const groupIds = await getCompanyGroupIds(company);

  const locations = await prisma.stockLocation.findMany({
    where: {
      companyId: { in: groupIds },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      type: true,
      companyId: true,
      projectId: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ companyId: "asc" }, { type: "asc" }, { name: "asc" }],
  });

  // Fetch all companies in the group for name + hierarchy info.
  const companies = await prisma.company.findMany({
    where: { id: { in: groupIds }, deletedAt: null },
    select: { id: true, name: true, parentCompanyId: true },
  });

  // Group locations by company.
  const byCompany = new Map<string, { id: string; name: string; type: string; projectId: string | null; projectName: string | null }[]>();
  for (const loc of locations) {
    const arr = byCompany.get(loc.companyId) ?? [];
    arr.push({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      projectId: loc.projectId,
      projectName: loc.project?.name ?? null,
    });
    byCompany.set(loc.companyId, arr);
  }

  const result = companies.map((c) => ({
    companyId: c.id,
    companyName: c.name,
    isParent: c.id === company.parentCompanyId,
    isCurrent: c.id === company.id,
    isChild: c.parentCompanyId === company.id,
    locations: byCompany.get(c.id) ?? [],
  }));

  // Sort: current company first, then parent, then children (alphabetical).
  result.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    if (a.isParent) return -1;
    if (b.isParent) return 1;
    return a.companyName.localeCompare(b.companyName);
  });

  return json(result);
});
