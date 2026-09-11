import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/inventory/cross-company
 *
 * Returns aggregated stock across all child companies of the current
 * (parent) company. Only accessible to parent company users with
 * INVENTORY_VIEW permission. Groups stock by material across all
 * child companies, showing per-company quantities and a total.
 *
 * Query params:
 *  - search: filter by material name/code
 *  - categoryId: filter by material category
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();

  // Only parent companies can see cross-company inventory
  const childCompanies = await prisma.company.findMany({
    where: { parentCompanyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });

  if (childCompanies.length === 0) {
    return json({ error: "This company has no child companies. Cross-company view is only available to parent companies." }, { status: 400 });
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.toLowerCase();
  const categoryId = url.searchParams.get("categoryId");

  const childCompanyIds = childCompanies.map((c) => c.id);

  // Fetch all stock items across child companies
  const stockItems = await prisma.stockLocationItem.findMany({
    where: {
      location: {
        companyId: { in: childCompanyIds },
        deletedAt: null,
      },
      qty: { gt: 0 },
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          code: true,
          unit: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
        },
      },
      location: {
        select: {
          id: true,
          name: true,
          companyId: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Filter by search/category if provided
  const filtered = stockItems.filter((item) => {
    if (categoryId && item.material.categoryId !== categoryId) return false;
    if (search) {
      const matches = item.material.name.toLowerCase().includes(search) ||
        (item.material.code?.toLowerCase().includes(search) ?? false);
      if (!matches) return false;
    }
    return true;
  });

  // Group by material → then by company
  const byMaterial = new Map<string, {
    materialId: string;
    materialName: string;
    materialCode: string | null;
    unit: string;
    categoryName: string | null;
    totalQty: number;
    totalValue: number;
    companies: { companyId: string; companyName: string; qty: number; value: number }[];
  }>();

  for (const item of filtered) {
    const mat = item.material;
    if (!byMaterial.has(mat.id)) {
      byMaterial.set(mat.id, {
        materialId: mat.id,
        materialName: mat.name,
        materialCode: mat.code,
        unit: mat.unit,
        categoryName: mat.category?.name ?? null,
        totalQty: 0,
        totalValue: 0,
        companies: [],
      });
    }
    const entry = byMaterial.get(mat.id)!;
    const qty = Number(item.qty);
    const value = Number(item.qty) * Number(item.movingAvgCost ?? 0);
    entry.totalQty += qty;
    entry.totalValue += value;

    // Aggregate per company
    const companyId = item.location.companyId;
    let companyRow = entry.companies.find((c) => c.companyId === companyId);
    if (!companyRow) {
      companyRow = { companyId, companyName: item.location.company?.name ?? "Unknown", qty: 0, value: 0 };
      entry.companies.push(companyRow);
    }
    companyRow.qty += qty;
    companyRow.value += value;
  }

  const result = Array.from(byMaterial.values()).sort((a, b) => b.totalValue - a.totalValue);

  return json({
    companies: childCompanies,
    materials: result,
    summary: {
      totalMaterials: result.length,
      totalValue: result.reduce((sum, m) => sum + m.totalValue, 0),
      totalQty: result.length,
    },
  });
});
