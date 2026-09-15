import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * GET /api/search?q=… — unified entity search.
 *
 * Serves two consumers:
 *  - Command palette (desktop): reads the named arrays (materials,
 *    projects, suppliers, purchaseOrders).
 *  - MobileGlobalSearch (/m): reads `results` — a flat list of
 *    { type, id, label, sublabel, badge?, href } covering every entity
 *    type the mobile search UI groups by.
 *
 * Each entity type is capped at `take: 5`. Short queries (< 2 chars)
 * short-circuit to empty results so we don't hit the DB on every
 * space/backspace.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (q.trim().length < 2) {
    return json({ materials: [], projects: [], suppliers: [], purchaseOrders: [], results: [] });
  }

  const companyId = company.id;
  const contains = { contains: q, mode: "insensitive" as const };

  const [
    materials,
    projects,
    suppliers,
    purchaseOrders,
    requisitions,
    customers,
    units,
    landParcels,
    dprs,
    employees,
    equipment,
    materialSales,
    transfers,
  ] = await Promise.all([
    // Material is company-scoped (Material.companyId). Filter directly.
    prisma.material.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true, code: true, unit: true },
    }),
    prisma.project.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId, poNumber: contains },
      take: 5,
      select: { id: true, poNumber: true, status: true },
    }),
    prisma.materialRequisition.findMany({
      where: {
        reqNumber: contains,
        OR: [
          { project: { companyId } },
          { department: { companyId } },
        ],
      },
      take: 5,
      select: { id: true, reqNumber: true, status: true },
    }),
    prisma.customer.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true, phone: true },
    }),
    prisma.builtUnit.findMany({
      where: { unitNumber: contains, project: { companyId } },
      take: 5,
      select: { id: true, unitNumber: true, status: true, project: { select: { name: true } } },
    }),
    prisma.landParcel.findMany({
      where: { number: contains, landPurchase: { companyId } },
      take: 5,
      select: { id: true, number: true, landPurchase: { select: { sellerName: true, registryNo: true } } },
    }),
    prisma.dailyProgressReport.findMany({
      where: { companyId, project: { name: contains } },
      take: 5,
      select: { id: true, date: true, project: { select: { name: true } } },
    }),
    prisma.employee.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true, designation: true },
    }),
    prisma.equipment.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true, status: true },
    }),
    prisma.materialSale.findMany({
      where: { companyId, saleNumber: contains },
      take: 5,
      select: { id: true, saleNumber: true, status: true },
    }),
    prisma.stockTransfer.findMany({
      where: {
        OR: [
          { fromLocation: { companyId, name: contains } },
          { toLocation: { companyId, name: contains } },
        ],
      },
      take: 5,
      select: {
        id: true,
        status: true,
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    }),
  ]);

  const results = [
    ...purchaseOrders.map((p) => ({
      type: "po", id: p.id, label: p.poNumber, sublabel: p.status,
      href: `/m/procurement/${p.id}`,
    })),
    ...requisitions.map((r) => ({
      type: "requisition", id: r.id, label: r.reqNumber, sublabel: r.status,
      href: `/m/requisitions/${r.id}`,
    })),
    ...projects.map((p) => ({
      type: "project", id: p.id, label: p.name, sublabel: "Project",
      href: `/m/projects/${p.id}`,
    })),
    ...materials.map((m) => ({
      type: "material", id: m.id, label: m.name, sublabel: `${m.code} · ${m.unit}`,
      href: `/m/materials/${m.id}`,
    })),
    ...suppliers.map((s) => ({
      type: "supplier", id: s.id, label: s.name, sublabel: "Supplier",
      href: `/m/suppliers/${s.id}`,
    })),
    ...customers.map((c) => ({
      type: "customer", id: c.id, label: c.name, sublabel: c.phone ?? "Customer",
      href: `/m/customers/${c.id}`,
    })),
    ...units.map((u) => ({
      type: "unit", id: u.id, label: u.unitNumber, sublabel: `${u.project.name} · ${u.status}`,
      href: `/m/units/${u.id}`,
    })),
    ...landParcels.map((l) => ({
      type: "land", id: l.id, label: l.number, sublabel: l.landPurchase.sellerName ?? l.landPurchase.registryNo ?? "Land parcel",
      href: `/m/land/${l.id}`,
    })),
    ...dprs.map((d) => ({
      type: "dpr", id: d.id, label: d.project.name,
      sublabel: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      href: `/m/dprs/${d.id}`,
    })),
    ...employees.map((e) => ({
      type: "employee", id: e.id, label: e.name, sublabel: e.designation ?? "Employee",
      href: `/m/hr/employees/${e.id}`,
    })),
    ...equipment.map((e) => ({
      type: "equipment", id: e.id, label: e.name, sublabel: e.status,
      href: `/m/equipment/${e.id}`,
    })),
    ...materialSales.map((s) => ({
      type: "sale", id: s.id, label: s.saleNumber, sublabel: s.status,
      href: `/m/material-sales/${s.id}`,
    })),
    ...transfers.map((t) => ({
      type: "transfer", id: t.id,
      label: `${t.fromLocation.name} → ${t.toLocation.name}`,
      sublabel: t.status,
      href: `/m/transfers/${t.id}`,
    })),
  ];

  return json({ materials, projects, suppliers, purchaseOrders, results });
});
