import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * GET /api/search?q=… — unified entity search for the Command Palette.
 *
 * Replaces the 4 separate fetches the palette used to fire per keystroke
 * (materials, projects, suppliers, purchase orders) with a single round-trip
 * that runs all four queries in parallel on the server. Each entity type is
 * capped at `take: 5`. Short queries (< 2 chars) short-circuit to empty
 * results so we don't hit the DB on every space/backspace.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (q.trim().length < 2) {
    return json({ materials: [], projects: [], suppliers: [], purchaseOrders: [] });
  }

  const companyId = company.id;

  const [materials, projects, suppliers, purchaseOrders] = await Promise.all([
    // Material is a global catalog entity (no companyId); scoped per-company
    // only via its stockItems → StockLocation.companyId. See /api/materials.
    prisma.material.findMany({
      where: { name: { contains: q, mode: "insensitive" }, deletedAt: null },
      take: 5,
      select: { id: true, name: true, code: true, unit: true },
    }),
    prisma.project.findMany({
      where: { companyId, name: { contains: q, mode: "insensitive" }, deletedAt: null },
      take: 5,
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { companyId, name: { contains: q, mode: "insensitive" }, deletedAt: null },
      take: 5,
      select: { id: true, name: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId, poNumber: { contains: q, mode: "insensitive" } },
      take: 5,
      select: { id: true, poNumber: true, status: true },
    }),
  ]);

  return json({ materials, projects, suppliers, purchaseOrders });
});
