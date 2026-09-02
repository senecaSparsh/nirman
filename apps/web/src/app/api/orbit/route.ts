import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { ServiceError } from "@nirman/services";
import { apiHandler, getCompany, getCompanyGroupIds, getCurrentUser, requireUser, toNum } from "@/lib/server";
import { formatCurrencyCompact, formatNumber, formatDate } from "@/lib/utils";

/**
 * GET /api/orbit?type=company&id=<id>
 *   → Returns the node (center card) + orbit category chips
 *
 * GET /api/orbit?mode=children&parentType=company&parentId=<id>&category=projects
 *   → Returns a list of individual entities for that category
 *
 * This powers the zoomable orbit navigation on /m/home.
 * Each node/child includes a `details` array of {label, value} pairs
 * for quick-but-important info shown on the card.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface DetailField {
  label: string;
  value: string;
}

interface OrbitChild {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  count: number;
  href: string;
}

interface OrbitNode {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  details: DetailField[];
  orbits: OrbitChild[];
}

interface ChildEntity {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  details: DetailField[];
  hasChildren: boolean;
}

// ─── Main handler ───────────────────────────────────────────────────────────

export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "node";
  const company = await getCompany();

  try {
    if (mode === "children") {
      return await getChildren(searchParams, company.id);
    }
    return await getNode(searchParams, company.id, company.id);
  } catch (err) {
    const message = err instanceof ServiceError ? err.message : "Failed to load orbit data";
    return NextResponse.json({ error: message }, { status: err instanceof ServiceError ? err.status : 500 });
  }
});

// ─── Node mode: center card + orbit chips ───────────────────────────────────

async function getNode(searchParams: URLSearchParams, companyId: string, currentCompanyId: string): Promise<Response> {
  const type = searchParams.get("type");
  const id = searchParams.get("id") ?? companyId;

  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  let node: OrbitNode;
  switch (type) {
    case "company": node = await getCompanyNode(id, currentCompanyId); break;
    case "project": node = await getProjectNode(id, companyId); break;
    case "builtUnit": node = await getBuiltUnitNode(id, companyId); break;
    case "landParcel": node = await getLandParcelNode(id, companyId); break;
    case "assetSale": node = await getAssetSaleNode(id, companyId); break;
    default: return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  }
  const res = NextResponse.json(node);
  // Orbit data is aggregate-heavy and changes infrequently — cache 30s.
  res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
  return res;
}

// ─── Children mode: list entities for a category ────────────────────────────
async function getChildren(searchParams: URLSearchParams, companyId: string): Promise<Response> {
  const parentType = searchParams.get("parentType");
  const parentId = searchParams.get("parentId");
  const category = searchParams.get("category");
  if (!parentType || !parentId || !category) {
    return NextResponse.json({ error: "parentType, parentId, category required" }, { status: 400 });
  }

  let children: ChildEntity[] = [];
  switch (category) {
    case "companies": children = await getSubsidiaryChildren(parentId, companyId); break;
    case "projects": children = await getProjectChildren(parentId, companyId); break;
    case "land": children = await getLandPurchaseChildren(parentId, companyId); break;
    case "departments": children = await getDepartmentChildren(parentId, companyId); break;
    case "inventory": children = await getInventoryChildren(parentId, companyId); break;
    case "hr": children = await getEmployeeChildren(parentId, companyId); break;
    case "equipment": children = await getEquipmentChildren(parentId, companyId); break;
    case "suppliers": children = await getSupplierChildren(parentId, companyId); break;
    case "customers": children = await getCustomerChildren(parentId, companyId); break;
    case "vehicles": children = await getVehicleChildren(parentId, companyId); break;
    case "subcontractors": children = await getSubcontractorChildren(parentId, companyId); break;
    case "expenses": children = await getExpenseChildren(parentId, companyId, parentType); break;
    case "leads": children = await getLeadChildren(parentId, companyId); break;
    case "tasks": children = await getTaskChildren(parentId, companyId, parentType); break;
    case "scrapGenerations": children = await getScrapGenerationChildren(parentId, companyId); break;
    case "stockTransfers": children = await getStockTransferChildren(parentId, companyId, parentType); break;
    case "builtUnits": children = await getBuiltUnitChildren(parentId, companyId, parentType); break;
    case "landParcels": children = await getLandParcelChildren(parentId, companyId, parentType); break;
    case "requisitions": children = await getRequisitionChildren(parentId, companyId, parentType); break;
    case "purchaseOrders": children = await getPurchaseOrderChildren(parentId, companyId, parentType); break;
    case "materialIssues": children = await getMaterialIssueChildren(parentId, companyId, parentType); break;
    case "dprs": children = await getDprChildren(parentId, companyId, parentType); break;
    case "projectPhases": children = await getProjectPhaseChildren(parentId, companyId); break;
    case "equipmentAssignments": children = await getEquipmentAssignmentChildren(parentId, companyId, parentType); break;
    case "crews": children = await getCrewChildren(parentId, companyId, parentType); break;
    case "sales": children = await getSaleChildren(parentId, companyId, parentType); break;
    case "portalListings": children = await getPortalListingChildren(parentId, companyId, parentType); break;
    case "tenancies": children = await getTenancyChildren(parentId, companyId, parentType); break;
    case "payments": children = await getPaymentChildren(parentId, companyId); break;
    case "saleExpenses": children = await getSaleExpenseChildren(parentId, companyId); break;
    case "saleTerms": children = await getSaleTermChildren(parentId, companyId); break;
    case "subParcels": children = await getSubParcelChildren(parentId, companyId); break;
    case "partitions": children = await getPartitionChildren(parentId, companyId); break;
    default: return NextResponse.json({ error: `Unknown category: ${category}` }, { status: 400 });
  }
  const res = NextResponse.json({ children });
  res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
//  NODE RESOLVERS — center card + orbit chips
// ═══════════════════════════════════════════════════════════════════════════

async function getCompanyNode(id: string, currentCompanyId: string): Promise<OrbitNode> {
  // Enforce company access — users can view:
  //   1. Their current company
  //   2. Any company they have a UserCompany membership in
  //   3. Any company in their current company's group (parent, siblings, children)
  if (id !== currentCompanyId) {
    const [user, groupIds] = await Promise.all([
      getCurrentUser(),
      getCompanyGroupIds().catch(() => [currentCompanyId]),
    ]);
    const hasMembership = user
      ? await prisma.userCompany.findFirst({
          where: { userId: user.id, companyId: id },
          select: { id: true },
        })
      : null;
    if (!hasMembership && !groupIds.includes(id)) {
      throw new Error("Company not found");
    }
  }
  const c = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, name: true, currency: true, businessType: true,
      gstin: true, pan: true, address: true, parentCompanyId: true,
      _count: {
        select: {
          projects: { where: { deletedAt: null } },
          landPurchases: true,
          departments: { where: { deletedAt: null } },
          stockLocations: { where: { deletedAt: null } },
          employees: { where: { active: true } },
          equipment: true,
          suppliers: { where: { deletedAt: null } },
          customers: true,
          vehicles: true,
          subcontractors: { where: { deletedAt: null } },
          expenses: true,
          leads: true,
          scrapGenerations: true,
          children: { where: { deletedAt: null } },
        },
      },
    },
  });
  if (!c) throw new Error("Company not found");

  // If this is a parent company, aggregate project count across all children too
  let totalProjectsIncludingChildren = c._count.projects;
  if (c._count.children > 0) {
    const childProjectCount = await prisma.project.count({
      where: { company: { parentCompanyId: c.id }, deletedAt: null },
    }).catch(() => 0);
    totalProjectsIncludingChildren += childProjectCount;
  }

  // Count entities not directly related to Company
  const [taskCount, stockTransferCount] = await Promise.all([
    prisma.task.count({
      where: { assignedTo: { companyId: c.id }, status: { not: "COMPLETED" } },
    }).catch(() => 0),
    prisma.stockTransfer.count({
      where: { fromLocation: { companyId: c.id } },
    }).catch(() => 0),
  ]);

  // Aggregate financial data — all 4 queries run in parallel (was sequential).
  const [totalProjectCost, _stockValue, landValue, unitValue, parentCompany] = await Promise.all([
    prisma.project.aggregate({
      where: { companyId: c.id, deletedAt: null, totalProjectCost: { not: null } },
      _sum: { totalProjectCost: true },
    }).catch(() => ({ _sum: { totalProjectCost: null } })),
    prisma.stockLocationItem.aggregate({
      where: { location: { companyId: c.id } },
      _sum: { qty: true },
    }).catch(() => ({ _sum: { qty: null } })),
    prisma.landParcel.aggregate({
      where: { landPurchase: { companyId: c.id }, deletedAt: null },
      _sum: { currentValuation: true },
    }).catch(() => ({ _sum: { currentValuation: null } })),
    prisma.builtUnit.aggregate({
      where: { project: { companyId: c.id }, deletedAt: null },
      _sum: { currentValuation: true },
    }).catch(() => ({ _sum: { currentValuation: null } })),
    c.parentCompanyId
      ? prisma.company.findUnique({ where: { id: c.parentCompanyId }, select: { name: true } }).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Details = company attributes, NOT child counts (those are on orbit chips)
  const details: DetailField[] = [];
  if (c.gstin) details.push({ label: "GSTIN", value: c.gstin });
  if (c.pan) details.push({ label: "PAN", value: c.pan });
  if (parentCompany) details.push({ label: "Parent", value: parentCompany.name });
  if (totalProjectCost._sum.totalProjectCost) {
    details.push({ label: "Project value", value: formatCurrencyCompact(toNum(totalProjectCost._sum.totalProjectCost)) });
  }
  const totalAssets = toNum(landValue._sum.currentValuation) + toNum(unitValue._sum.currentValuation);
  if (totalAssets > 0) details.push({ label: "Asset value", value: formatCurrencyCompact(totalAssets) });

  return {
    id: c.id, type: "company",
    title: c.name,
    subtitle: c.businessType ?? "Construction & Real Estate",
    meta: c.currency === "INR" ? "₹ INR" : c.currency,
    href: "/m/settings",
    details,
    orbits: [
      // If parent company, show subsidiaries first
      ...(c._count.children > 0 ? [
        { id: "companies", type: "category" as const, label: "Companies", subtitle: "Subsidiaries & divisions", count: c._count.children, href: "/m/settings" },
      ] : []),
      { id: "projects", type: "category", label: "Projects", subtitle: "Active developments", count: totalProjectsIncludingChildren, href: "/m/projects" },
      { id: "land", type: "category", label: "Land", subtitle: "Land purchases", count: c._count.landPurchases, href: "/m/land" },
      { id: "departments", type: "category", label: "Departments", subtitle: "Cost centers", count: c._count.departments, href: "/m/departments" },
      { id: "inventory", type: "category", label: "Inventory", subtitle: "Stock locations", count: c._count.stockLocations, href: "/m/inventory" },
      { id: "hr", type: "category", label: "Workforce", subtitle: "Active workers", count: c._count.employees, href: "/m/hr" },
      { id: "equipment", type: "category", label: "Equipment", subtitle: "Machines & tools", count: c._count.equipment, href: "/m/equipment" },
      { id: "suppliers", type: "category", label: "Suppliers", subtitle: "Vendors & vendors", count: c._count.suppliers, href: "/m/suppliers" },
      { id: "customers", type: "category", label: "Customers", subtitle: "Buyers & leads", count: c._count.customers, href: "/m/customers" },
      { id: "vehicles", type: "category", label: "Vehicles", subtitle: "Transport fleet", count: c._count.vehicles, href: "/m/vehicles" },
      { id: "subcontractors", type: "category", label: "Subcontractors", subtitle: "External crews", count: c._count.subcontractors, href: "/m/subcontractors" },
      { id: "expenses", type: "category", label: "Expenses", subtitle: "Direct costs", count: c._count.expenses, href: "/m/expenses" },
      { id: "leads", type: "category", label: "Leads", subtitle: "Sales pipeline", count: c._count.leads, href: "/m/leads" },
      { id: "tasks", type: "category", label: "Tasks", subtitle: "Open work items", count: taskCount, href: "/m/tasks" },
      { id: "scrapGenerations", type: "category", label: "Scrap", subtitle: "Generated material", count: c._count.scrapGenerations, href: "/m/stock?tab=scrap" },
      { id: "stockTransfers", type: "category", label: "Transfers", subtitle: "Inter-location moves", count: stockTransferCount, href: "/m/stock?tab=transfers" },
    ],
  };
}

async function getProjectNode(id: string, _companyId: string): Promise<OrbitNode> {
  // Don't filter by companyId — the user may be viewing a different company's
  // orbit. Access control is enforced at the company node level.
  const p = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, name: true, status: true, type: true,
      totalProjectCost: true, totalSellableArea: true, costPerSqft: true,
      totalBudget: true, address: true,
      _count: {
        select: {
          builtUnits: { where: { deletedAt: null } },
          landParcels: true, materialRequisitions: true,
          purchaseOrders: true, materialIssues: true,
          dailyProgressReports: true,
          phases: true,
          expenses: true,
          equipmentAssignments: true,
          crews: true,
          leads: true,
          scrapGenerations: true,
        },
      },
    },
  });
  if (!p) throw new Error("Project not found");

  const details: DetailField[] = [
    { label: "Status", value: p.status },
    { label: "Type", value: p.type },
  ];
  if (p.totalBudget) details.push({ label: "Budget", value: formatCurrencyCompact(toNum(p.totalBudget)) });
  if (p.totalProjectCost) details.push({ label: "Total cost", value: formatCurrencyCompact(toNum(p.totalProjectCost)) });
  if (p.costPerSqft) details.push({ label: "Cost/sqft", value: formatCurrencyCompact(toNum(p.costPerSqft)) });
  if (p.totalSellableArea) details.push({ label: "Sellable", value: `${formatNumber(toNum(p.totalSellableArea), 0)} sqft` });
  if (p.address) details.push({ label: "Address", value: p.address });

  return {
    id: p.id, type: "project",
    title: p.name,
    subtitle: `${p.status} · ${p.type}`,
    meta: p.totalProjectCost ? formatCurrencyCompact(toNum(p.totalProjectCost)) : "",
    href: `/m/projects/${p.id}`,
    details,
    orbits: [
      { id: "builtUnits", type: "category", label: "Built Units", subtitle: "Units & apartments", count: p._count.builtUnits, href: "" },
      { id: "landParcels", type: "category", label: "Land Parcels", subtitle: "Plots & partitions", count: p._count.landParcels, href: "" },
      { id: "requisitions", type: "category", label: "Indents", subtitle: "Material requests", count: p._count.materialRequisitions, href: "" },
      { id: "purchaseOrders", type: "category", label: "Purchase Orders", subtitle: "Procurement", count: p._count.purchaseOrders, href: "" },
      { id: "materialIssues", type: "category", label: "Material Issues", subtitle: "Materials consumed", count: p._count.materialIssues, href: "" },
      { id: "dprs", type: "category", label: "DPRs", subtitle: "Daily progress reports", count: p._count.dailyProgressReports, href: "" },
      { id: "projectPhases", type: "category", label: "Phases", subtitle: "Project milestones", count: p._count.phases, href: "" },
      { id: "expenses", type: "category", label: "Expenses", subtitle: "Project costs", count: p._count.expenses, href: "" },
      { id: "equipmentAssignments", type: "category", label: "Equipment", subtitle: "Assigned machines", count: p._count.equipmentAssignments, href: "" },
      { id: "crews", type: "category", label: "Crews", subtitle: "Work teams", count: p._count.crews, href: "" },
      { id: "leads", type: "category", label: "Leads", subtitle: "Sales pipeline", count: p._count.leads, href: "" },
      { id: "scrapGenerations", type: "category", label: "Scrap", subtitle: "Generated material", count: p._count.scrapGenerations, href: "" },
    ],
  };
}

async function getBuiltUnitNode(id: string, _companyId: string): Promise<OrbitNode> {
  const u = await prisma.builtUnit.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, unitNumber: true, unitType: true, status: true,
      area: true, areaUnit: true, floor: true, wing: true,
      productionCost: true, askingPrice: true, currentValuation: true,
      projectId: true,
      _count: { select: { materialIssues: true, portalListings: true, assetSales: true } },
    },
  });
  if (!u) throw new Error("Built unit not found");

  const tenancyCount = await prisma.tenancy.count({
    where: { builtUnitId: u.id },
  }).catch(() => 0);

  const details: DetailField[] = [
    { label: "Type", value: u.unitType },
    { label: "Status", value: u.status },
    { label: "Area", value: `${formatNumber(toNum(u.area), 0)} ${u.areaUnit}` },
  ];
  if (u.floor != null) details.push({ label: "Floor", value: String(u.floor) });
  if (u.wing) details.push({ label: "Wing", value: u.wing });
  if (toNum(u.productionCost) > 0) details.push({ label: "Production cost", value: formatCurrencyCompact(toNum(u.productionCost)) });
  if (u.askingPrice) details.push({ label: "Asking price", value: formatCurrencyCompact(toNum(u.askingPrice)) });
  if (toNum(u.currentValuation) > 0) details.push({ label: "Valuation", value: formatCurrencyCompact(toNum(u.currentValuation)) });

  return {
    id: u.id, type: "builtUnit",
    title: `Unit ${u.unitNumber}`,
    subtitle: `${u.unitType} · ${u.status}`,
    meta: u.askingPrice ? formatCurrencyCompact(toNum(u.askingPrice)) : formatCurrencyCompact(toNum(u.productionCost)),
    href: `/m/units/${u.id}`,
    details,
    orbits: [
      { id: "sales", type: "category", label: "Sales", subtitle: "Offers & payments", count: u._count.assetSales, href: "" },
      { id: "materialIssues", type: "category", label: "Material Issues", subtitle: "Materials consumed", count: u._count.materialIssues, href: "" },
      { id: "portalListings", type: "category", label: "Portal Listings", subtitle: "99acres, MagicBricks", count: u._count.portalListings, href: "" },
      { id: "tenancies", type: "category", label: "Tenancies", subtitle: "Rental agreements", count: tenancyCount, href: "" },
    ],
  };
}

async function getLandParcelNode(id: string, _companyId: string): Promise<OrbitNode> {
  const l = await prisma.landParcel.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, number: true, area: true, areaUnit: true,
      status: true, acquisitionCost: true, currentValuation: true,
      askingPrice: true, isInfrastructure: true, landPurchaseId: true,
      _count: { select: { children: true, builtUnits: { where: { deletedAt: null } }, partitions: true } },
    },
  });
  if (!l) throw new Error("Land parcel not found");

  const salesCount = await prisma.assetSale.count({ where: { landParcelId: l.id } }).catch(() => 0);

  const details: DetailField[] = [
    { label: "Area", value: `${formatNumber(toNum(l.area), 0)} ${l.areaUnit}` },
    { label: "Status", value: l.status },
  ];
  if (l.isInfrastructure) details.push({ label: "Type", value: "Infrastructure" });
  details.push({ label: "Acquisition", value: formatCurrencyCompact(toNum(l.acquisitionCost)) });
  if (toNum(l.currentValuation) > 0) details.push({ label: "Valuation", value: formatCurrencyCompact(toNum(l.currentValuation)) });
  if (l.askingPrice) details.push({ label: "Asking", value: formatCurrencyCompact(toNum(l.askingPrice)) });

  return {
    id: l.id, type: "landParcel",
    title: `Plot ${l.number}`,
    subtitle: `${formatNumber(toNum(l.area), 0)} ${l.areaUnit} · ${l.status}`,
    meta: formatCurrencyCompact(toNum(l.currentValuation || l.acquisitionCost)),
    href: `/m/land/${l.id}`,
    details,
    orbits: [
      { id: "subParcels", type: "category", label: "Sub-parcels", subtitle: "After partition", count: l._count.children, href: "" },
      { id: "builtUnits", type: "category", label: "Built Units", subtitle: "On this plot", count: l._count.builtUnits, href: "" },
      { id: "sales", type: "category", label: "Land Sales", subtitle: "Offers & deals", count: salesCount, href: "" },
      { id: "partitions", type: "category", label: "Partitions", subtitle: "Division history", count: l._count.partitions, href: "" },
    ],
  };
}

async function getAssetSaleNode(id: string, _companyId: string): Promise<OrbitNode> {
  const s = await prisma.assetSale.findFirst({
    where: { id },
    select: {
      id: true, saleNumber: true, salePrice: true, paymentStatus: true,
      saleStage: true, depositAmount: true, profit: true, costBasis: true,
      saleDate: true, finalSaleDate: true,
      builtUnitId: true, landParcelId: true, projectId: true,
      customer: { select: { name: true, phone: true } },
      _count: { select: { payments: true, expenses: true, terms: true } },
    },
  });
  if (!s) throw new Error("Sale not found");

  const details: DetailField[] = [
    { label: "Customer", value: s.customer.name },
    { label: "Stage", value: s.saleStage },
    { label: "Payment", value: s.paymentStatus },
  ];
  if (s.customer.phone) details.push({ label: "Phone", value: s.customer.phone });
  details.push({ label: "Sale price", value: formatCurrencyCompact(toNum(s.salePrice)) });
  if (toNum(s.costBasis) > 0) details.push({ label: "Cost basis", value: formatCurrencyCompact(toNum(s.costBasis)) });
  if (toNum(s.profit) !== 0) details.push({ label: "Profit", value: formatCurrencyCompact(toNum(s.profit)) });
  if (s.depositAmount) details.push({ label: "Deposit", value: formatCurrencyCompact(toNum(s.depositAmount)) });
  details.push({ label: "Sale date", value: formatDate(s.saleDate) });

  return {
    id: s.id, type: "assetSale",
    title: `Sale ${s.saleNumber}`,
    subtitle: `${s.customer.name} · ${s.paymentStatus}`,
    meta: formatCurrencyCompact(toNum(s.salePrice)),
    href: `/m/sales`,
    details,
    orbits: [
      { id: "payments", type: "category", label: "Payments", subtitle: "Received installments", count: s._count.payments, href: "" },
      { id: "saleExpenses", type: "category", label: "Expenses", subtitle: "Registry, stamp duty", count: s._count.expenses, href: "" },
      { id: "saleTerms", type: "category", label: "Terms", subtitle: "Sale conditions", count: s._count.terms, href: "" },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHILDREN RESOLVERS — return lists of individual entities with details
// ═══════════════════════════════════════════════════════════════════════════

async function getProjectChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.project.findMany({
    where: { companyId, deletedAt: null },
    select: {
      id: true, name: true, status: true, type: true,
      totalProjectCost: true, costPerSqft: true, totalSellableArea: true,
      _count: { select: { builtUnits: { where: { deletedAt: null } } } },
    },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((p) => {
    const details: DetailField[] = [
      { label: "Status", value: p.status },
      { label: "Units", value: String(p._count.builtUnits) },
    ];
    if (p.totalProjectCost) details.push({ label: "Cost", value: formatCurrencyCompact(toNum(p.totalProjectCost)) });
    if (p.costPerSqft) details.push({ label: "/sqft", value: formatCurrencyCompact(toNum(p.costPerSqft)) });
    return {
      id: p.id, type: "project",
      title: p.name,
      subtitle: `${p.status} · ${p.type}`,
      meta: p.totalProjectCost ? formatCurrencyCompact(toNum(p.totalProjectCost)) : "",
      href: `/m/projects/${p.id}`,
      details,
      hasChildren: true,
    };
  });
}

async function getLandPurchaseChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.landPurchase.findMany({
    where: { companyId },
    select: {
      id: true, sellerName: true, totalArea: true, areaUnit: true,
      totalCost: true, purchaseDate: true, location: true,
      _count: { select: { parcels: true } },
    },
    orderBy: { createdAt: "desc" }, take: 50,
  });
  return items.map((l) => {
    const details: DetailField[] = [
      { label: "Area", value: `${formatNumber(toNum(l.totalArea), 0)} ${l.areaUnit ?? "SQFT"}` },
      { label: "Parcels", value: String(l._count.parcels) },
    ];
    if (l.location) details.push({ label: "Location", value: l.location });
    details.push({ label: "Cost", value: formatCurrencyCompact(toNum(l.totalCost)) });
    details.push({ label: "Date", value: formatDate(l.purchaseDate) });
    return {
      id: l.id, type: "landPurchase",
      title: l.sellerName,
      subtitle: `${formatNumber(toNum(l.totalArea), 0)} ${l.areaUnit ?? "SQFT"}`,
      meta: formatCurrencyCompact(toNum(l.totalCost)),
      href: `/m/land/${l.id}`,
      details,
      hasChildren: true,
    };
  });
}

async function getDepartmentChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.department.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, code: true, name: true, description: true },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((d) => ({
    id: d.id, type: "department",
    title: d.name,
    subtitle: d.code,
    meta: "",
    href: `/m/hr`,
    details: d.description ? [{ label: "About", value: d.description }] : [],
    hasChildren: false,
  }));
}

async function getInventoryChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.stockLocation.findMany({
    where: { companyId, deletedAt: null },
    select: {
      id: true, name: true, type: true,
      project: { select: { name: true } },
      _count: { select: { stockItems: true } },
    },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((l) => {
    const details: DetailField[] = [
      { label: "Type", value: String(l.type) },
      { label: "Items", value: String(l._count.stockItems) },
    ];
    if (l.project) details.push({ label: "Project", value: l.project.name });
    return {
      id: l.id, type: "stockLocation",
      title: l.name,
      subtitle: String(l.type),
      meta: `${l._count.stockItems} items`,
      href: `/m/stock?locationId=${l.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getEmployeeChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.employee.findMany({
    where: { companyId, active: true },
    select: {
      id: true, name: true, trade: true, designation: true,
      phone: true, dailyRate: true, activeProject: { select: { name: true } },
    },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((e) => {
    const details: DetailField[] = [];
    if (e.trade) details.push({ label: "Trade", value: e.trade });
    if (e.designation) details.push({ label: "Role", value: e.designation });
    if (e.phone) details.push({ label: "Phone", value: e.phone });
    if (toNum(e.dailyRate) > 0) details.push({ label: "Daily rate", value: formatCurrencyCompact(toNum(e.dailyRate)) });
    if (e.activeProject) details.push({ label: "Project", value: e.activeProject.name });
    return {
      id: e.id, type: "employee",
      title: e.name,
      subtitle: e.trade ?? e.designation ?? "Worker",
      meta: e.phone ?? "",
      href: `/m/hr/employees/${e.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getEquipmentChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.equipment.findMany({
    where: { companyId },
    select: {
      id: true, name: true, status: true, category: true,
      acquisitionCost: true, currentValue: true, assetTag: true,
    },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((e) => {
    const details: DetailField[] = [
      { label: "Status", value: String(e.status) },
    ];
    if (e.category) details.push({ label: "Category", value: e.category });
    if (e.assetTag) details.push({ label: "Tag", value: e.assetTag });
    if (toNum(e.acquisitionCost) > 0) details.push({ label: "Acquired", value: formatCurrencyCompact(toNum(e.acquisitionCost)) });
    if (toNum(e.currentValue) > 0) details.push({ label: "Current", value: formatCurrencyCompact(toNum(e.currentValue)) });
    return {
      id: e.id, type: "equipment",
      title: e.name,
      subtitle: e.category ?? "Equipment",
      meta: String(e.status),
      href: `/m/equipment/${e.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getBuiltUnitChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project"
    ? { projectId: parentId, deletedAt: null }
    : parentType === "landParcel"
      ? { landParcelId: parentId, deletedAt: null }
      : { project: { companyId }, deletedAt: null };
  const items = await prisma.builtUnit.findMany({
    where,
    select: {
      id: true, unitNumber: true, unitType: true, status: true,
      area: true, areaUnit: true, floor: true, wing: true,
      askingPrice: true, productionCost: true, projectId: true,
    },
    orderBy: { unitNumber: "asc" }, take: 50,
  });
  return items.map((u) => {
    const details: DetailField[] = [
      { label: "Area", value: `${formatNumber(toNum(u.area), 0)} ${u.areaUnit}` },
      { label: "Status", value: u.status },
    ];
    if (u.floor != null) details.push({ label: "Floor", value: String(u.floor) });
    if (u.wing) details.push({ label: "Wing", value: u.wing });
    if (u.askingPrice) details.push({ label: "Asking", value: formatCurrencyCompact(toNum(u.askingPrice)) });
    if (toNum(u.productionCost) > 0) details.push({ label: "Cost", value: formatCurrencyCompact(toNum(u.productionCost)) });
    return {
      id: u.id, type: "builtUnit",
      title: `Unit ${u.unitNumber}`,
      subtitle: `${u.unitType} · ${u.status}`,
      meta: u.askingPrice ? formatCurrencyCompact(toNum(u.askingPrice)) : `${formatNumber(toNum(u.area), 0)} ${u.areaUnit}`,
      href: `/m/units/${u.id}`,
      details,
      hasChildren: true,
    };
  });
}

async function getLandParcelChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project"
    ? { projectId: parentId, deletedAt: null }
    : parentType === "landPurchase"
      ? { landPurchaseId: parentId, deletedAt: null }
      : { landPurchase: { companyId }, deletedAt: null };
  const items = await prisma.landParcel.findMany({
    where,
    select: {
      id: true, number: true, area: true, areaUnit: true,
      status: true, currentValuation: true, acquisitionCost: true,
      isInfrastructure: true, landPurchaseId: true,
    },
    orderBy: { number: "asc" }, take: 50,
  });
  return items.map((l) => {
    const details: DetailField[] = [
      { label: "Area", value: `${formatNumber(toNum(l.area), 0)} ${l.areaUnit}` },
      { label: "Status", value: l.status },
    ];
    if (l.isInfrastructure) details.push({ label: "Type", value: "Infrastructure" });
    details.push({ label: "Acquisition", value: formatCurrencyCompact(toNum(l.acquisitionCost)) });
    if (toNum(l.currentValuation) > 0) details.push({ label: "Valuation", value: formatCurrencyCompact(toNum(l.currentValuation)) });
    return {
      id: l.id, type: "landParcel",
      title: `Plot ${l.number}`,
      subtitle: `${formatNumber(toNum(l.area), 0)} ${l.areaUnit} · ${l.status}`,
      meta: formatCurrencyCompact(toNum(l.currentValuation)),
      href: `/m/land/${l.id}`,
      details,
      hasChildren: true,
    };
  });
}

async function getRequisitionChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project"
    ? { projectId: parentId }
    : { project: { companyId } };
  const items = await prisma.materialRequisition.findMany({
    where,
    select: {
      id: true, reqNumber: true, status: true, createdAt: true,
      neededByDate: true, project: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" }, take: 30,
  });
  return items.map((r) => {
    const details: DetailField[] = [
      { label: "Status", value: r.status },
      { label: "Date", value: formatDate(r.createdAt) },
    ];
    if (r.neededByDate) details.push({ label: "Needed by", value: formatDate(r.neededByDate) });
    if (r.project) details.push({ label: "Project", value: r.project.name });
    return {
      id: r.id, type: "requisition",
      title: `REQ-${r.reqNumber ?? r.id.slice(-6)}`,
      subtitle: r.project?.name ?? "—",
      meta: r.status,
      href: `/m/requisitions/${r.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getPurchaseOrderChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project" ? { projectId: parentId } : { companyId };
  const items = await prisma.purchaseOrder.findMany({
    where,
    select: {
      id: true, poNumber: true, status: true, total: true,
      orderDate: true, expectedDate: true,
      supplier: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" }, take: 30,
  });
  return items.map((p) => {
    const details: DetailField[] = [
      { label: "Status", value: p.status },
      { label: "Supplier", value: p.supplier?.name ?? "—" },
      { label: "Date", value: formatDate(p.orderDate) },
    ];
    if (p.expectedDate) details.push({ label: "Expected", value: formatDate(p.expectedDate) });
    if (p.total) details.push({ label: "Total", value: formatCurrencyCompact(toNum(p.total)) });
    return {
      id: p.id, type: "purchaseOrder",
      title: `PO-${p.poNumber ?? p.id.slice(-6)}`,
      subtitle: p.supplier?.name ?? "—",
      meta: p.total ? formatCurrencyCompact(toNum(p.total)) : p.status,
      href: `/m/procurement/${p.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getMaterialIssueChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project"
    ? { projectId: parentId }
    : parentType === "builtUnit"
      ? { builtUnitId: parentId }
      : { project: { companyId } };
  const items = await prisma.materialIssue.findMany({
    where,
    select: {
      id: true, issueNumber: true, createdAt: true, totalCost: true,
      project: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" }, take: 30,
  });
  return items.map((m) => {
    const details: DetailField[] = [
      { label: "Date", value: formatDate(m.createdAt) },
    ];
    if (m.project) details.push({ label: "Project", value: m.project.name });
    if (toNum(m.totalCost) > 0) details.push({ label: "Cost", value: formatCurrencyCompact(toNum(m.totalCost)) });
    return {
      id: m.id, type: "materialIssue",
      title: `SA-${m.issueNumber ?? m.id.slice(-6)}`,
      subtitle: formatDate(m.createdAt),
      meta: m.project?.name ?? "—",
      href: `/m/site/issue`,
      details,
      hasChildren: false,
    };
  });
}

async function getDprChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project"
    ? { projectId: parentId }
    : { project: { companyId } };
  const items = await prisma.dailyProgressReport.findMany({
    where,
    select: {
      id: true, date: true, approvalStatus: true, progressPct: true,
      workSummary: true, project: { select: { name: true } },
    },
    orderBy: { date: "desc" }, take: 30,
  });
  return items.map((d) => {
    const details: DetailField[] = [
      { label: "Date", value: formatDate(d.date) },
      { label: "Approval", value: d.approvalStatus },
    ];
    if (toNum(d.progressPct) > 0) details.push({ label: "Progress", value: `${formatNumber(toNum(d.progressPct), 1)}%` });
    if (d.project) details.push({ label: "Project", value: d.project.name });
    return {
      id: d.id, type: "dpr",
      title: `DPR ${formatDate(d.date)}`,
      subtitle: d.project?.name ?? "—",
      meta: d.approvalStatus,
      href: `/m/dprs/${d.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getSaleChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "builtUnit"
    ? { builtUnitId: parentId, companyId }
    : parentType === "landParcel"
      ? { landParcelId: parentId, companyId }
      : { companyId };
  const items = await prisma.assetSale.findMany({
    where,
    select: {
      id: true, saleNumber: true, salePrice: true, paymentStatus: true,
      saleStage: true, profit: true, saleDate: true,
      customer: { select: { name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" }, take: 30,
  });
  return items.map((s) => {
    const details: DetailField[] = [
      { label: "Customer", value: s.customer.name },
      { label: "Stage", value: s.saleStage },
      { label: "Payment", value: s.paymentStatus },
    ];
    if (s.customer.phone) details.push({ label: "Phone", value: s.customer.phone });
    details.push({ label: "Price", value: formatCurrencyCompact(toNum(s.salePrice)) });
    if (toNum(s.profit) !== 0) details.push({ label: "Profit", value: formatCurrencyCompact(toNum(s.profit)) });
    details.push({ label: "Date", value: formatDate(s.saleDate) });
    return {
      id: s.id, type: "assetSale",
      title: `Sale ${s.saleNumber}`,
      subtitle: s.customer.name,
      meta: formatCurrencyCompact(toNum(s.salePrice)),
      href: `/m/sales`,
      details,
      hasChildren: true,
    };
  });
}

async function getPortalListingChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "builtUnit"
    ? { builtUnitId: parentId }
    : { builtUnit: { project: { companyId } } };
  const items = await prisma.portalListing.findMany({
    where,
    select: { id: true, portalName: true, title: true, status: true, askingPrice: true, listingUrl: true },
    orderBy: { createdAt: "desc" }, take: 30,
  });
  return items.map((l) => ({
    id: l.id, type: "portalListing",
    title: l.title,
    subtitle: l.portalName,
    meta: l.askingPrice ? formatCurrencyCompact(toNum(l.askingPrice)) : l.status,
    href: l.listingUrl ?? `/m/portal-listings/${l.id}`,
    details: [
      { label: "Portal", value: l.portalName },
      { label: "Status", value: l.status },
      { label: "Asking", value: formatCurrencyCompact(toNum(l.askingPrice)) },
    ],
    hasChildren: false,
  }));
}

async function getPaymentChildren(saleId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.assetSalePayment.findMany({
    where: { assetSaleId: saleId },
    select: { id: true, amount: true, paymentDate: true, mode: true, reference: true, status: true },
    orderBy: { paymentDate: "desc" }, take: 30,
  });
  return items.map((p) => {
    const details: DetailField[] = [
      { label: "Date", value: formatDate(p.paymentDate) },
      { label: "Mode", value: p.mode },
      { label: "Status", value: p.status },
    ];
    if (p.reference) details.push({ label: "Ref", value: p.reference });
    return {
      id: p.id, type: "payment",
      title: formatCurrencyCompact(toNum(p.amount)),
      subtitle: formatDate(p.paymentDate),
      meta: p.mode,
      href: `/m/sales`,
      details,
      hasChildren: false,
    };
  });
}

async function getSubParcelChildren(parcelId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.landParcel.findMany({
    where: { parentParcelId: parcelId, deletedAt: null },
    select: { id: true, number: true, area: true, areaUnit: true, status: true, currentValuation: true, isInfrastructure: true },
    orderBy: { number: "asc" }, take: 50,
  });
  return items.map((l) => {
    const details: DetailField[] = [
      { label: "Area", value: `${formatNumber(toNum(l.area), 0)} ${l.areaUnit}` },
      { label: "Status", value: l.status },
    ];
    if (l.isInfrastructure) details.push({ label: "Type", value: "Infrastructure" });
    if (toNum(l.currentValuation) > 0) details.push({ label: "Valuation", value: formatCurrencyCompact(toNum(l.currentValuation)) });
    return {
      id: l.id, type: "landParcel",
      title: `Plot ${l.number}`,
      subtitle: `${formatNumber(toNum(l.area), 0)} ${l.areaUnit} · ${l.status}`,
      meta: formatCurrencyCompact(toNum(l.currentValuation)),
      href: `/m/land/${l.id}`,
      details,
      hasChildren: true,
    };
  });
}

async function getPartitionChildren(parcelId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.landPartition.findMany({
    where: { parentParcelId: parcelId },
    select: { id: true, partitionDate: true, childCount: true, allocationModel: true, notes: true },
    orderBy: { partitionDate: "desc" }, take: 20,
  });
  return items.map((p) => {
    const details: DetailField[] = [
      { label: "Date", value: formatDate(p.partitionDate) },
      { label: "Children", value: String(p.childCount) },
      { label: "Model", value: p.allocationModel },
    ];
    if (p.notes) details.push({ label: "Notes", value: p.notes });
    return {
      id: p.id, type: "partition",
      title: `Partition ${formatDate(p.partitionDate)}`,
      subtitle: `${p.childCount} children`,
      meta: p.allocationModel,
      href: `/m/land/${parcelId}`,
      details,
      hasChildren: false,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXTENDED CHILDREN RESOLVERS — new orbit categories
// ═══════════════════════════════════════════════════════════════════════════

async function getSupplierChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.supplier.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, gstin: true, phone: true, email: true, balanceOwed: true, leadTimeDays: true },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((s) => {
    const details: DetailField[] = [];
    if (s.gstin) details.push({ label: "GSTIN", value: s.gstin });
    if (s.phone) details.push({ label: "Phone", value: s.phone });
    if (s.leadTimeDays) details.push({ label: "Lead", value: `${s.leadTimeDays}d` });
    if (toNum(s.balanceOwed) > 0) details.push({ label: "Owed", value: formatCurrencyCompact(toNum(s.balanceOwed)) });
    return {
      id: s.id, type: "supplier",
      title: s.name,
      subtitle: s.phone ?? s.email ?? "—",
      meta: toNum(s.balanceOwed) > 0 ? formatCurrencyCompact(toNum(s.balanceOwed)) : "",
      href: `/m/suppliers/${s.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getCustomerChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.customer.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, phone: true, email: true, gstin: true, address: true },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((c) => {
    const details: DetailField[] = [];
    if (c.phone) details.push({ label: "Phone", value: c.phone });
    if (c.email) details.push({ label: "Email", value: c.email });
    if (c.gstin) details.push({ label: "GSTIN", value: c.gstin });
    return {
      id: c.id, type: "customer",
      title: c.name,
      subtitle: c.phone ?? "—",
      meta: "",
      href: `/m/customers/${c.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getVehicleChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.vehicle.findMany({
    where: { companyId },
    select: { id: true, vehicleNumber: true, vehicleType: true, driverName: true, driverPhone: true, tripCount: true, lastUsedAt: true },
    orderBy: { vehicleNumber: "asc" }, take: 50,
  });
  return items.map((v) => {
    const details: DetailField[] = [
      { label: "Type", value: v.vehicleType },
      { label: "Trips", value: String(v.tripCount) },
    ];
    if (v.driverName) details.push({ label: "Driver", value: v.driverName });
    if (v.lastUsedAt) details.push({ label: "Last used", value: formatDate(v.lastUsedAt) });
    return {
      id: v.id, type: "vehicle",
      title: v.vehicleNumber,
      subtitle: v.vehicleType,
      meta: v.driverName ?? "",
      href: `/m/vehicles`,
      details,
      hasChildren: false,
    };
  });
}

async function getSubcontractorChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.subcontractor.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, trade: true, phone: true, gstin: true, address: true },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((s) => {
    const details: DetailField[] = [];
    if (s.trade) details.push({ label: "Trade", value: s.trade });
    if (s.phone) details.push({ label: "Phone", value: s.phone });
    if (s.gstin) details.push({ label: "GSTIN", value: s.gstin });
    return {
      id: s.id, type: "subcontractor",
      title: s.name,
      subtitle: s.trade ?? "Subcontractor",
      meta: s.phone ?? "",
      href: `/m/subcontractors/${s.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getExpenseChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project"
    ? { projectId: parentId }
    : { companyId };
  const items = await prisma.expense.findMany({
    where,
    select: { id: true, category: true, amount: true, date: true, notes: true, project: { select: { name: true } } },
    orderBy: { date: "desc" }, take: 30,
  });
  return items.map((e) => {
    const details: DetailField[] = [
      { label: "Date", value: formatDate(e.date) },
      { label: "Category", value: e.category },
    ];
    if (e.project) details.push({ label: "Project", value: e.project.name });
    if (e.notes) details.push({ label: "Notes", value: e.notes.slice(0, 50) });
    return {
      id: e.id, type: "expense",
      title: e.category,
      subtitle: formatDate(e.date),
      meta: formatCurrencyCompact(toNum(e.amount)),
      href: `/m/expenses`,
      details,
      hasChildren: false,
    };
  });
}

async function getLeadChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.lead.findMany({
    where: { companyId },
    select: { id: true, name: true, phone: true, stage: true, priority: true, source: true, nextFollowUpAt: true, project: { select: { name: true } } },
    orderBy: { createdAt: "desc" }, take: 30,
  });
  return items.map((l) => {
    const details: DetailField[] = [
      { label: "Stage", value: String(l.stage) },
      { label: "Priority", value: String(l.priority) },
    ];
    if (l.source) details.push({ label: "Source", value: String(l.source) });
    if (l.project) details.push({ label: "Project", value: l.project.name });
    if (l.nextFollowUpAt) details.push({ label: "Follow up", value: formatDate(l.nextFollowUpAt) });
    return {
      id: l.id, type: "lead",
      title: l.name,
      subtitle: l.phone ?? "—",
      meta: String(l.stage),
      href: `/m/leads/${l.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getTaskChildren(_parentId: string, companyId: string, _parentType: string): Promise<ChildEntity[]> {
  const items = await prisma.task.findMany({
    where: { assignedTo: { companyId } },
    select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedTo: { select: { name: true } } },
    orderBy: { createdAt: "desc" }, take: 30,
  });
  return items.map((t) => {
    const details: DetailField[] = [
      { label: "Status", value: t.status },
      { label: "Priority", value: t.priority },
    ];
    if (t.assignedTo) details.push({ label: "Assignee", value: t.assignedTo.name });
    if (t.dueDate) details.push({ label: "Due", value: formatDate(t.dueDate) });
    return {
      id: t.id, type: "task",
      title: t.title,
      subtitle: t.assignedTo?.name ?? "—",
      meta: t.status,
      href: `/m/site/tasks`,
      details,
      hasChildren: false,
    };
  });
}

async function getScrapGenerationChildren(companyId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.scrapGeneration.findMany({
    where: { companyId, status: "COMPLETED" },
    select: { id: true, scrapNumber: true, generationDate: true, toLocation: { select: { name: true } }, project: { select: { name: true } } },
    orderBy: { generationDate: "desc" }, take: 30,
  });
  return items.map((s) => {
    const details: DetailField[] = [
      { label: "Date", value: formatDate(s.generationDate) },
    ];
    if (s.toLocation) details.push({ label: "Location", value: s.toLocation.name });
    if (s.project) details.push({ label: "Project", value: s.project.name });
    return {
      id: s.id, type: "scrapGeneration",
      title: `SG-${s.scrapNumber}`,
      subtitle: formatDate(s.generationDate),
      meta: s.toLocation?.name ?? "",
      href: `/m/scrap-generations/${s.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getStockTransferChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project"
    ? { fromLocation: { projectId: parentId } }
    : { fromLocation: { companyId } };
  const items = await prisma.stockTransfer.findMany({
    where,
    select: {
      id: true, status: true, transferDate: true, isInterCompany: true, freight: true,
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
    },
    orderBy: { transferDate: "desc" }, take: 30,
  });
  return items.map((t) => {
    const details: DetailField[] = [
      { label: "Date", value: formatDate(t.transferDate) },
      { label: "Status", value: String(t.status) },
    ];
    if (t.fromLocation) details.push({ label: "From", value: t.fromLocation.name });
    if (t.toLocation) details.push({ label: "To", value: t.toLocation.name });
    if (t.isInterCompany) details.push({ label: "Inter-co", value: "Yes" });
    return {
      id: t.id, type: "stockTransfer",
      title: `${t.fromLocation?.name ?? "—"} → ${t.toLocation?.name ?? "—"}`,
      subtitle: formatDate(t.transferDate),
      meta: String(t.status),
      href: `/m/transfers/${t.id}`,
      details,
      hasChildren: false,
    };
  });
}

async function getProjectPhaseChildren(projectId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.projectPhase.findMany({
    where: { projectId },
    select: { id: true, name: true, status: true, startDate: true, endDate: true, budget: true, sortOrder: true },
    orderBy: { sortOrder: "asc" }, take: 50,
  });
  return items.map((ph) => {
    const details: DetailField[] = [
      { label: "Status", value: String(ph.status) },
    ];
    if (ph.startDate) details.push({ label: "Start", value: formatDate(ph.startDate) });
    if (ph.endDate) details.push({ label: "End", value: formatDate(ph.endDate) });
    if (ph.budget) details.push({ label: "Budget", value: formatCurrencyCompact(toNum(ph.budget)) });
    return {
      id: ph.id, type: "projectPhase",
      title: ph.name,
      subtitle: String(ph.status),
      meta: ph.budget ? formatCurrencyCompact(toNum(ph.budget)) : "",
      href: `/m/projects/${projectId}`,
      details,
      hasChildren: false,
    };
  });
}

async function getEquipmentAssignmentChildren(parentId: string, _companyId: string, _parentType: string): Promise<ChildEntity[]> {
  const items = await prisma.equipmentAssignment.findMany({
    where: { projectId: parentId, status: "ACTIVE" },
    select: {
      id: true, status: true, assignedAt: true, notes: true,
      equipment: { select: { name: true, category: true, status: true } },
      location: { select: { name: true } },
    },
    orderBy: { assignedAt: "desc" }, take: 30,
  });
  return items.map((a) => {
    const details: DetailField[] = [
      { label: "Status", value: String(a.status) },
      { label: "Assigned", value: formatDate(a.assignedAt) },
    ];
    if (a.location) details.push({ label: "Location", value: a.location.name });
    if (a.notes) details.push({ label: "Notes", value: a.notes.slice(0, 50) });
    return {
      id: a.id, type: "equipmentAssignment",
      title: a.equipment?.name ?? "Equipment",
      subtitle: a.equipment?.category ?? "",
      meta: String(a.status),
      href: `/m/equipment`,
      details,
      hasChildren: false,
    };
  });
}

async function getCrewChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "project"
    ? { projectId: parentId, active: true }
    : { companyId, active: true };
  const items = await prisma.crew.findMany({
    where,
    select: { id: true, name: true, active: true, supervisor: { select: { name: true } }, project: { select: { name: true } }, _count: { select: { members: true } } },
    orderBy: { name: "asc" }, take: 50,
  });
  return items.map((cr) => {
    const details: DetailField[] = [
      { label: "Members", value: String(cr._count.members) },
    ];
    if (cr.supervisor) details.push({ label: "Supervisor", value: cr.supervisor.name });
    if (cr.project) details.push({ label: "Project", value: cr.project.name });
    return {
      id: cr.id, type: "crew",
      title: cr.name,
      subtitle: `${cr._count.members} members`,
      meta: cr.supervisor?.name ?? "",
      href: `/m/hr`,
      details,
      hasChildren: false,
    };
  });
}

async function getTenancyChildren(parentId: string, companyId: string, parentType: string): Promise<ChildEntity[]> {
  const where = parentType === "builtUnit"
    ? { builtUnitId: parentId }
    : parentType === "landParcel"
      ? { landParcelId: parentId }
      : { companyId };
  const items = await prisma.tenancy.findMany({
    where,
    select: {
      id: true, tenantName: true, tenantPhone: true, status: true,
      startDate: true, endDate: true, monthlyRent: true,
      assetType: true, builtUnitId: true, landParcelId: true,
    },
    orderBy: { startDate: "desc" }, take: 30,
  });
  return items.map((t) => {
    const details: DetailField[] = [
      { label: "Status", value: String(t.status) },
      { label: "Start", value: formatDate(t.startDate) },
    ];
    if (t.endDate) details.push({ label: "End", value: formatDate(t.endDate) });
    if (t.tenantPhone) details.push({ label: "Phone", value: t.tenantPhone });
    if (t.monthlyRent) details.push({ label: "Rent", value: formatCurrencyCompact(toNum(t.monthlyRent)) });
    return {
      id: t.id, type: "tenancy",
      title: t.tenantName,
      subtitle: String(t.assetType),
      meta: t.monthlyRent ? formatCurrencyCompact(toNum(t.monthlyRent)) : String(t.status),
      href: `/m/rent`,
      details,
      hasChildren: false,
    };
  });
}

async function getSaleExpenseChildren(saleId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.saleExpense.findMany({
    where: { assetSaleId: saleId },
    select: { id: true, head: true, label: true, amount: true, borneBy: true, isIncluded: true },
    orderBy: { sortOrder: "asc" }, take: 30,
  });
  return items.map((e) => {
    const details: DetailField[] = [
      { label: "Head", value: String(e.head) },
      { label: "Borne by", value: String(e.borneBy) },
    ];
    if (e.label) details.push({ label: "Label", value: e.label });
    return {
      id: e.id, type: "saleExpense",
      title: e.label ?? String(e.head),
      subtitle: String(e.borneBy),
      meta: formatCurrencyCompact(toNum(e.amount)),
      href: `/m/sales`,
      details,
      hasChildren: false,
    };
  });
}

async function getSaleTermChildren(saleId: string, _c: string): Promise<ChildEntity[]> {
  const items = await prisma.saleTerm.findMany({
    where: { assetSaleId: saleId },
    select: { id: true, description: true, extraAmount: true, isIncluded: true, sortOrder: true },
    orderBy: { sortOrder: "asc" }, take: 30,
  });
  return items.map((t) => {
    const details: DetailField[] = [
      { label: "Included", value: t.isIncluded ? "In deal" : "Extra" },
    ];
    if (t.extraAmount) details.push({ label: "Amount", value: formatCurrencyCompact(toNum(t.extraAmount)) });
    return {
      id: t.id, type: "saleTerm",
      title: t.description.slice(0, 60),
      subtitle: t.isIncluded ? "Included" : "Extra charge",
      meta: t.extraAmount ? formatCurrencyCompact(toNum(t.extraAmount)) : "",
      href: `/m/sales`,
      details,
      hasChildren: false,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUBSIDIARY CHILDREN — child companies under a parent company
//  Each child is a drillable company node (hasChildren: true) so the user
//  can navigate: Parent → Child Company → Projects → Built Units → ...
// ═══════════════════════════════════════════════════════════════════════════

async function getSubsidiaryChildren(parentId: string, _companyId: string): Promise<ChildEntity[]> {
  const items = await prisma.company.findMany({
    where: { parentCompanyId: parentId, deletedAt: null },
    select: {
      id: true, name: true, businessType: true, currency: true,
      _count: {
        select: {
          projects: { where: { deletedAt: null } },
          children: { where: { deletedAt: null } },
          employees: { where: { active: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  return items.map((c) => {
    const details: DetailField[] = [];
    if (c.businessType) details.push({ label: "Type", value: c.businessType });
    details.push({ label: "Projects", value: String(c._count.projects) });
    details.push({ label: "Staff", value: String(c._count.employees) });
    if (c._count.children > 0) details.push({ label: "Subsidiaries", value: String(c._count.children) });
    return {
      id: c.id, type: "company",
      title: c.name,
      subtitle: c.businessType ?? "Subsidiary",
      meta: `${c._count.projects} projects`,
      href: "",
      details,
      hasChildren: true,
    };
  });
}
