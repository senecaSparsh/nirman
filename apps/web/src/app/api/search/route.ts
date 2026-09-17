import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getUserPermissions, json, requireUser, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

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
  const perms = await getUserPermissions();
  const has = (perm: string) => perms.includes("*") || perms.includes(perm);
  const contains = { contains: q, mode: "insensitive" as const };
  // Location-scope filters for project/department-scoped users — search must
  // not become a side-channel that reveals records outside their scope.
  const [scopeProject, scopePO, scopeReq, scopeUnit, scopeLand, scopeDPR, scopeEmployee, scopeSale] =
    await Promise.all([
      scopeWhere("Project"),
      scopeWhere("PurchaseOrder"),
      scopeWhere("MaterialRequisition"),
      scopeWhere("BuiltUnit"),
      scopeWhere("LandParcel"),
      scopeWhere("DailyProgressReport"),
      scopeWhere("Employee"),
      scopeWhere("MaterialSale"),
    ]);
  // Desktop routes differ from mobile per type (some entities have no desktop
  // detail page — link those to the list instead of a dead /m/ deep link).
  const desktop = req.nextUrl.searchParams.get("surface") === "desktop";
  const HREF = {
    po: (id: string) => (desktop ? `/procurement/${id}` : `/m/procurement/${id}`),
    requisition: (id: string) => (desktop ? `/requisitions` : `/m/requisitions/${id}`),
    project: (id: string) => (desktop ? `/projects/${id}` : `/m/projects/${id}`),
    material: (id: string) => (desktop ? `/materials/${id}` : `/m/materials/${id}`),
    supplier: (id: string) => (desktop ? `/suppliers/${id}` : `/m/suppliers/${id}`),
    customer: (id: string) => (desktop ? `/customers` : `/m/customers/${id}`),
    unit: (id: string) => (desktop ? `/units` : `/m/units/${id}`),
    land: (id: string) => (desktop ? `/land/${id}` : `/m/land/${id}`),
    dpr: (id: string) => (desktop ? `/hr/dprs` : `/m/dprs/${id}`),
    employee: (id: string) => (desktop ? `/hr/employees/${id}` : `/m/hr/employees/${id}`),
    equipment: (id: string) => (desktop ? `/equipment` : `/m/equipment/${id}`),
    sale: (id: string) => (desktop ? `/material-sales` : `/m/material-sales/${id}`),
    transfer: (id: string) => (desktop ? `/transfers` : `/m/transfers/${id}`),
  };

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
    !has(PERM.PROJECTS_VIEW) ? [] : prisma.project.findMany({
      where: { companyId, name: contains, deletedAt: null, ...scopeProject },
      take: 5,
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true },
    }),
    !has(PERM.PROCUREMENT_VIEW) ? [] : prisma.purchaseOrder.findMany({
      where: { companyId, poNumber: contains, ...scopePO },
      take: 5,
      select: { id: true, poNumber: true, status: true },
    }),
    !has(PERM.PROCUREMENT_VIEW) ? [] : prisma.materialRequisition.findMany({
      where: {
        reqNumber: contains,
        OR: [
          { project: { companyId } },
          { department: { companyId } },
        ],
        ...scopeReq,
      },
      take: 5,
      select: { id: true, reqNumber: true, status: true },
    }),
    prisma.customer.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true, phone: true },
    }),
    !has(PERM.PROJECTS_VIEW) ? [] : prisma.builtUnit.findMany({
      where: { unitNumber: contains, project: { companyId }, deletedAt: null, ...scopeUnit },
      take: 5,
      select: { id: true, unitNumber: true, status: true, project: { select: { name: true } } },
    }),
    !has(PERM.PROJECTS_VIEW) ? [] : prisma.landParcel.findMany({
      where: { number: contains, landPurchase: { companyId }, deletedAt: null, ...scopeLand },
      take: 5,
      select: { id: true, number: true, landPurchase: { select: { sellerName: true, registryNo: true } } },
    }),
    !has(PERM.PROJECTS_VIEW) ? [] : prisma.dailyProgressReport.findMany({
      where: { companyId, project: { name: contains }, ...scopeDPR },
      take: 5,
      select: { id: true, date: true, project: { select: { name: true } } },
    }),
    !has(PERM.HR_VIEW) ? [] : prisma.employee.findMany({
      where: { companyId, name: contains, deletedAt: null, ...scopeEmployee },
      take: 5,
      select: { id: true, name: true, designation: true },
    }),
    prisma.equipment.findMany({
      where: { companyId, name: contains, deletedAt: null },
      take: 5,
      select: { id: true, name: true, status: true },
    }),
    !has(PERM.FINANCE_VIEW) ? [] : prisma.materialSale.findMany({
      where: { companyId, saleNumber: contains, ...scopeSale },
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
      href: HREF.po(p.id),
    })),
    ...requisitions.map((r) => ({
      type: "requisition", id: r.id, label: r.reqNumber, sublabel: r.status,
      href: HREF.requisition(r.id),
    })),
    ...projects.map((p) => ({
      type: "project", id: p.id, label: p.name, sublabel: "Project",
      href: HREF.project(p.id),
    })),
    ...materials.map((m) => ({
      type: "material", id: m.id, label: m.name, sublabel: `${m.code} · ${m.unit}`,
      href: HREF.material(m.id),
    })),
    ...suppliers.map((s) => ({
      type: "supplier", id: s.id, label: s.name, sublabel: "Supplier",
      href: HREF.supplier(s.id),
    })),
    ...customers.map((c) => ({
      type: "customer", id: c.id, label: c.name, sublabel: c.phone ?? "Customer",
      href: HREF.customer(c.id),
    })),
    ...units.map((u) => ({
      type: "unit", id: u.id, label: u.unitNumber, sublabel: `${u.project.name} · ${u.status}`,
      href: HREF.unit(u.id),
    })),
    ...landParcels.map((l) => ({
      type: "land", id: l.id, label: l.number, sublabel: l.landPurchase.sellerName ?? l.landPurchase.registryNo ?? "Land parcel",
      href: HREF.land(l.id),
    })),
    ...dprs.map((d) => ({
      type: "dpr", id: d.id, label: d.project.name,
      sublabel: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      href: HREF.dpr(d.id),
    })),
    ...employees.map((e) => ({
      type: "employee", id: e.id, label: e.name, sublabel: e.designation ?? "Employee",
      href: HREF.employee(e.id),
    })),
    ...equipment.map((e) => ({
      type: "equipment", id: e.id, label: e.name, sublabel: e.status,
      href: HREF.equipment(e.id),
    })),
    ...materialSales.map((s) => ({
      type: "sale", id: s.id, label: s.saleNumber, sublabel: s.status,
      href: HREF.sale(s.id),
    })),
    ...transfers.map((t) => ({
      type: "transfer", id: t.id,
      label: `${t.fromLocation.name} → ${t.toLocation.name}`,
      sublabel: t.status,
      href: HREF.transfer(t.id),
    })),
  ];

  return json({ materials, projects, suppliers, purchaseOrders, results });
});
