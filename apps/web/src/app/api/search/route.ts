import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCompanyGroupIds, json, requireUser } from "@/lib/server";

/**
 * GET /api/search?q=...&limit=20
 *
 * Universal search across all entity types for the mobile global search overlay.
 * Searches: PurchaseOrders, Requisitions, Projects, Materials, Suppliers, Customers,
 * BuiltUnits, LandParcels, DPRs, Employees, Equipment, MaterialSales, StockTransfers.
 *
 * Results are grouped by type, company-scoped (where applicable), and soft-delete filtered.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 50);

  if (!q || q.length < 1) {
    return json({ results: [], query: q });
  }

  // Search across the company group (parent + children) for POs,
  // but only the current company for company-scoped entities.
  const groupCompanyIds = await getCompanyGroupIds(company);
  const currentCompanyId = company.id;

  const contains = (field: string) => ({ contains: field, mode: "insensitive" as const });

  const [
    purchaseOrders,
    requisitions,
    projects,
    materials,
    suppliers,
    customers,
    builtUnits,
    landParcels,
    dprs,
    employees,
    equipment,
    materialSales,
    stockTransfers,
  ] = await Promise.all([
    // Purchase Orders — search by poNumber or supplier name
    prisma.purchaseOrder.findMany({
      where: {
        companyId: { in: groupCompanyIds },
        OR: [
          { poNumber: contains(q) },
          { supplier: { name: contains(q) } },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, poNumber: true, status: true, supplier: { select: { name: true } }, subtotal: true },
    }).catch(() => []),

    // Requisitions — scoped via project.companyId; search by reqNumber or project name
    prisma.materialRequisition.findMany({
      where: {
        project: { companyId: { in: groupCompanyIds }, deletedAt: null },
        OR: [
          { reqNumber: contains(q) },
          { project: { name: contains(q) } },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, reqNumber: true, status: true, project: { select: { name: true } } },
    }).catch(() => []),

    // Projects — search by name (no code field in schema)
    prisma.project.findMany({
      where: {
        companyId: currentCompanyId,
        deletedAt: null,
        name: contains(q),
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true },
    }).catch(() => []),

    // Materials — global (no companyId); search by name or code
    prisma.material.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: contains(q) },
          { code: contains(q) },
        ],
      },
      take: limit,
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, unit: true },
    }).catch(() => []),

    // Suppliers — search by name or phone
    prisma.supplier.findMany({
      where: {
        companyId: currentCompanyId,
        deletedAt: null,
        OR: [
          { name: contains(q) },
          { phone: contains(q) },
        ],
      },
      take: limit,
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }).catch(() => []),

    // Customers — search by name or phone
    prisma.customer.findMany({
      where: {
        companyId: currentCompanyId,
        deletedAt: null,
        OR: [
          { name: contains(q) },
          { phone: contains(q) },
        ],
      },
      take: limit,
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }).catch(() => []),

    // Built Units — search by unitNumber or project name
    prisma.builtUnit.findMany({
      where: {
        project: { companyId: currentCompanyId, deletedAt: null },
        OR: [
          { unitNumber: contains(q) },
          { project: { name: contains(q) } },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, unitNumber: true, status: true, project: { select: { id: true, name: true } } },
    }).catch(() => []),

    // Land Parcels — search by number; scoped via landPurchase.companyId
    prisma.landParcel.findMany({
      where: {
        landPurchase: { companyId: currentCompanyId },
        number: contains(q),
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, status: true, area: true },
    }).catch(() => []),

    // DPRs — search by project name; date field is `date`
    prisma.dailyProgressReport.findMany({
      where: {
        companyId: currentCompanyId,
        project: { name: contains(q) },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, date: true, approvalStatus: true, project: { select: { id: true, name: true } } },
    }).catch(() => []),

    // Employees — search by name or employeeCode; scoped via memberships
    prisma.user.findMany({
      where: {
        memberships: { some: { companyId: currentCompanyId } },
        OR: [
          { name: contains(q) },
          { employeeCode: contains(q) },
        ],
      },
      take: limit,
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeCode: true },
    }).catch(() => []),

    // Equipment — search by name or serialNumber
    prisma.equipment.findMany({
      where: {
        companyId: currentCompanyId,
        OR: [
          { name: contains(q) },
          { serialNumber: contains(q) },
        ],
      },
      take: limit,
      orderBy: { name: "asc" },
      select: { id: true, name: true, serialNumber: true, status: true },
    }).catch(() => []),

    // Material Sales — search by saleNumber or customer name
    prisma.materialSale.findMany({
      where: {
        companyId: currentCompanyId,
        OR: [
          { saleNumber: contains(q) },
          { customer: { name: contains(q) } },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: { id: true, saleNumber: true, status: true, customer: { select: { name: true } } },
    }).catch(() => []),

    // Stock Transfers — no transferNumber field; search by from/to location name.
    // Scoped to the company group via fromLocation.companyId (same as other queries).
    prisma.stockTransfer.findMany({
      where: {
        fromLocation: { companyId: { in: groupCompanyIds }, deletedAt: null },
        OR: [
          { fromLocation: { name: contains(q) } },
          { toLocation: { name: contains(q) } },
        ],
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    }).catch(() => []),
  ]);

  // Flatten into a unified result format
  const results: SearchResult[] = [
    ...purchaseOrders.map((po) => ({
      type: "po" as const,
      id: po.id,
      label: po.poNumber,
      sublabel: po.supplier?.name ?? "—",
      badge: po.status,
      href: `/m/procurement/${po.id}`,
    })),
    ...requisitions.map((req) => ({
      type: "requisition" as const,
      id: req.id,
      label: req.reqNumber,
      sublabel: req.project?.name ?? "—",
      badge: req.status,
      href: `/m/requisitions/${req.id}`,
    })),
    ...projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      label: p.name,
      sublabel: "",
      badge: p.status,
      href: `/m/projects/${p.id}`,
    })),
    ...materials.map((m) => ({
      type: "material" as const,
      id: m.id,
      label: m.name,
      sublabel: m.code,
      badge: m.unit,
      href: `/m/materials/${m.id}`,
    })),
    ...suppliers.map((s) => ({
      type: "supplier" as const,
      id: s.id,
      label: s.name,
      sublabel: s.phone ?? "",
      href: `/m/suppliers/${s.id}`,
    })),
    ...customers.map((c) => ({
      type: "customer" as const,
      id: c.id,
      label: c.name,
      sublabel: c.phone ?? "",
      href: `/m/customers/${c.id}`,
    })),
    ...builtUnits.map((u) => ({
      type: "unit" as const,
      id: u.id,
      label: u.unitNumber,
      sublabel: u.project?.name ?? "",
      badge: u.status,
      href: `/m/units/${u.id}`,
    })),
    ...landParcels.map((l) => ({
      type: "land" as const,
      id: l.id,
      label: l.number,
      sublabel: "",
      badge: l.status,
      href: `/m/land/${l.id}`,
    })),
    ...dprs.map((d) => ({
      type: "dpr" as const,
      id: d.id,
      label: `DPR ${d.date.toISOString().slice(0, 10)}`,
      sublabel: d.project?.name ?? "",
      badge: d.approvalStatus,
      href: `/m/dprs/${d.id}`,
    })),
    ...employees.map((e) => ({
      type: "employee" as const,
      id: e.id,
      label: e.name,
      sublabel: e.employeeCode ?? "",
      href: `/m/hr/employees/${e.id}`,
    })),
    ...equipment.map((eq) => ({
      type: "equipment" as const,
      id: eq.id,
      label: eq.name,
      sublabel: eq.serialNumber ?? "",
      badge: eq.status,
      href: `/m/equipment/${eq.id}`,
    })),
    ...materialSales.map((s) => ({
      type: "sale" as const,
      id: s.id,
      label: s.saleNumber,
      sublabel: s.customer?.name ?? "",
      badge: s.status,
      href: `/m/material-sales/${s.id}`,
    })),
    ...stockTransfers.map((t) => ({
      type: "transfer" as const,
      id: t.id,
      label: `${t.fromLocation?.name ?? "?"} → ${t.toLocation?.name ?? "?"}`,
      sublabel: "",
      badge: t.status,
      href: `/m/transfers/${t.id}`,
    })),
  ];

  return json({ results, query: q });
});

interface SearchResult {
  type: string;
  id: string;
  label: string;
  sublabel: string;
  badge?: string;
  href: string;
}
