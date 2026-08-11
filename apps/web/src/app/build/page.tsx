import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { materialInventoryValue, lowStockAlerts } from "@nirman/services";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PageLoading } from "@/components/page-loading";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { PipelineOverview, type StageData, type StageItemData } from "@/components/build/pipeline-overview";

import { NoAccess } from "@/components/no-access";

export default function BuildPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading pipeline…" variant="cards" />}>
        <BuildContent />
      </Suspense>
    </div>
  );
}

async function BuildContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  // Every role can see the pipeline overview — it's role-adaptive.
  // But if somehow none of the 5 stages are visible, show NoAccess.
  const canSeeAnyBuildStage =
    hasPermission(role, PERM.PROJECTS_VIEW) ||
    hasPermission(role, PERM.PROCUREMENT_VIEW) ||
    hasPermission(role, PERM.INVENTORY_VIEW) ||
    hasPermission(role, PERM.SALES_VIEW);

  if (!canSeeAnyBuildStage) {
    return <NoAccess what="the Build pipeline" />;
  }

  // ── Fetch lightweight counts per stage ────────────────────────────
  const [
    landParcels,
    suppliers,
    rateContracts,
    openRequisitions,
    openPOs,
    overduePOs,
    pendingReturns,
    inventoryVal,
    lowStock,
    materialCount,
    equipmentCount,
    activeProjects,
    openWorkOrders,
    availableUnits,
    soldUnits,
    activeSales,
    activeTenancies,
    portalListings,
  ] = await Promise.all([
    // Acquire — Supplier has no companyId; scope via purchaseOrders relation
    prisma.landParcel.count({ where: { deletedAt: null } }),
    prisma.supplier.count({ where: { deletedAt: null, purchaseOrders: { some: { companyId: company.id } } } }),
    prisma.rateContract.count({ where: { companyId: company.id, status: "ACTIVE" } }),
    // Procure
    prisma.materialRequisition.count({ where: { project: { companyId: company.id }, status: "SUBMITTED" } }),
    prisma.purchaseOrder.count({ where: { companyId: company.id, status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } } }),
    prisma.purchaseOrder.count({ where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } } }),
    prisma.supplierReturn.count({ where: { companyId: company.id, status: { in: ["DRAFT", "SUBMITTED"] } } }),
    // Stock
    materialInventoryValue(company.id),
    lowStockAlerts(company.id),
    prisma.material.count({ where: { deletedAt: null } }),
    prisma.equipment.count({ where: { companyId: company.id, deletedAt: null, status: { not: "RETIRED" } } }),
    // Construct
    prisma.project.count({ where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } } }),
    prisma.subcontractorWorkOrder.count({ where: { companyId: company.id, status: "ACTIVE" } }),
    // Sell
    prisma.builtUnit.count({ where: { deletedAt: null, status: "AVAILABLE" } }),
    prisma.builtUnit.count({ where: { deletedAt: null, status: "SOLD" } }),
    prisma.assetSale.count({ where: { companyId: company.id, paymentStatus: { in: ["PENDING", "PARTIAL"] } } }),
    prisma.tenancy.count({ where: { companyId: company.id, status: "ACTIVE" } }),
    prisma.portalListing.count({ where: { companyId: company.id, status: "LISTED" } }),
  ]);

  // ── Build stage data, filtered by role ────────────────────────────
  const stages: StageData[] = [];

  // ── Acquire ───────────────────────────────────────────────────────
  const acquireItems: StageItemData[] = [];
  if (hasPermission(role, PERM.SALES_VIEW)) {
    acquireItems.push({
      label: "Land Parcels",
      href: "/land",
      hint: "What land you own, what it cost, and how it's been subdivided",
      count: landParcels,
    });
  }
  if (hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    acquireItems.push({
      label: "Suppliers",
      href: "/suppliers",
      hint: "Who you buy from, what you owe them, and how they've performed",
      count: suppliers,
    });
  }
  if (hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    acquireItems.push({
      label: "Rate Contracts",
      href: "/rate-contracts",
      hint: "Pre-negotiated framework agreements with suppliers at fixed rates",
      count: rateContracts,
    });
  }
  if (acquireItems.length > 0) {
    stages.push({
      key: "acquire",
      label: "Acquire",
      tagline: "Land, suppliers and rate contracts",
      metric: { label: "Land parcels", value: formatNumber(landParcels, 0) },
      items: acquireItems,
    });
  }

  // ── Procure ───────────────────────────────────────────────────────
  const procureItems: StageItemData[] = [];
  if (hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    procureItems.push({
      label: "Material Indents",
      href: "/requisitions",
      hint: "Site raises an indent for material. Approve it, then convert it to a purchase order",
      count: openRequisitions,
      tone: openRequisitions > 0 ? "warning" : "default",
    });
    procureItems.push({
      label: "Purchase Orders",
      href: "/procurement",
      hint: "What you've ordered, from whom, and what's still to arrive at site",
      count: openPOs,
    });
    procureItems.push({
      label: "GRN / Receive",
      href: "/field",
      hint: "Make a goods receipt note (GRN) by scanning the delivery from your phone",
    });
    procureItems.push({
      label: "Purchase Returns",
      href: "/supplier-returns",
      hint: "Send defective or excess stock back to a supplier and track the debit note",
      count: pendingReturns,
      tone: pendingReturns > 0 ? "warning" : "default",
    });
  }
  if (procureItems.length > 0) {
    stages.push({
      key: "procure",
      label: "Procure",
      tagline: "Indents, POs, goods receipt and returns",
      metric: {
        label: "Open POs",
        value: formatNumber(openPOs, 0),
        sub: overduePOs > 0 ? `${overduePOs} overdue` : undefined,
        tone: overduePOs > 0 ? "danger" : "default",
      },
      items: procureItems,
    });
  }

  // ── Stock ─────────────────────────────────────────────────────────
  const stockItems: StageItemData[] = [];
  if (hasPermission(role, PERM.INVENTORY_VIEW)) {
    stockItems.push({
      label: "Stock Ledger",
      href: "/stock",
      hint: "The full stock lifecycle — on-hand by location, every movement, transfers, issues, scrap, and counts",
    });
    stockItems.push({
      label: "Material Catalogue",
      href: "/materials",
      hint: "Every item you buy — its unit, reorder level and current cost",
      count: materialCount,
    });
    stockItems.push({
      label: "Equipment",
      href: "/equipment",
      hint: "Machines and tools — where they are, who has them, and when they were last serviced",
      count: equipmentCount,
    });
    stockItems.push({
      label: "Consumption Benchmarks",
      href: "/standard-consumptions",
      hint: "Define standard material consumption rates per work type — the system auto-detects over-consumption and scrap",
    });
    stockItems.push({
      label: "Material Reconciliation",
      href: "/material-reconciliation",
      hint: "Required vs issued vs consumed vs stock — wastage flags and tolerance alerts per project",
    });
  }
  if (stockItems.length > 0) {
    stages.push({
      key: "stock",
      label: "Stock",
      tagline: "On-hand, transfers, issues, scrap and counts",
      metric: {
        label: "Inventory value",
        value: formatCurrency(toNum(inventoryVal)),
        sub: lowStock.length > 0 ? `${lowStock.length} low stock` : undefined,
        tone: lowStock.length > 0 ? "warning" : "default",
      },
      items: stockItems,
    });
  }

  // ── Construct ─────────────────────────────────────────────────────
  const constructItems: StageItemData[] = [];
  if (hasPermission(role, PERM.PROJECTS_VIEW)) {
    constructItems.push({
      label: "Projects",
      href: "/projects",
      hint: "Each site: its phases, its spend, and its cost per sq.ft",
      count: activeProjects,
    });
  }
  if (hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    constructItems.push({
      label: "BOQ",
      href: "/boq",
      hint: "Bill of Quantities — the project cost budget, item by item",
    });
    constructItems.push({
      label: "Schedule (WBS)",
      href: "/wbs",
      hint: "Work Breakdown Structure — activities, dependencies, critical path",
    });
  }
  if (hasPermission(role, PERM.PROJECTS_VIEW)) {
    constructItems.push({
      label: "Measurement Book",
      href: "/measurement-book",
      hint: "Site engineer's verified record of actual quantities executed",
    });
  }
  if (hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    constructItems.push({
      label: "Work Orders",
      href: "/work-orders",
      hint: "Subcontractor work orders and RA bills with TDS and retention",
      count: openWorkOrders,
    });
  }
  if (constructItems.length > 0) {
    stages.push({
      key: "construct",
      label: "Construct",
      tagline: "Projects, BOQ, WBS, measurement book and work orders",
      metric: { label: "Active projects", value: formatNumber(activeProjects, 0) },
      items: constructItems,
    });
  }

  // ── Sell ──────────────────────────────────────────────────────────
  const sellItems: StageItemData[] = [];
  if (hasPermission(role, PERM.SALES_VIEW)) {
    sellItems.push({
      label: "Built Units",
      href: "/units",
      hint: "Flats, shops, plots — what's available, booked, or sold",
      count: availableUnits,
      tone: availableUnits > 0 ? "success" : "default",
    });
    sellItems.push({
      label: "Sales",
      href: "/sales",
      hint: "Bookings, payment plans and what's still to collect",
      count: activeSales,
    });
    sellItems.push({
      label: "Rentals",
      href: "/rentals",
      hint: "Units you've rented out and the rent due each month",
      count: activeTenancies,
    });
    sellItems.push({
      label: "Material Sales",
      href: "/material-sales",
      hint: "Sell surplus or scrap material — revenue recovers project cost when linked to a project",
    });
    sellItems.push({
      label: "Portal Listings",
      href: "/portal-listings",
      hint: "Sync available built units to 99acres, MagicBricks and Housing.com",
      count: portalListings,
    });
  }
  if (sellItems.length > 0) {
    stages.push({
      key: "sell",
      label: "Sell",
      tagline: "Units, sales, rentals, material sales and portal listings",
      metric: {
        label: "Available",
        value: formatNumber(availableUnits, 0),
        sub: `${soldUnits} sold`,
      },
      items: sellItems,
    });
  }

  return (
    <>
      <PageHeader
        title="Build"
        description="The asset lifecycle — acquire land, buy material, build, sell. Click a stage to expand it; pin two open to compare side-by-side."
        stats={[
          { label: "Stages", value: stages.length },
          { label: "Active projects", value: activeProjects },
          { label: "Inventory", value: formatCurrency(toNum(inventoryVal)) },
          { label: "Available units", value: availableUnits, tone: availableUnits > 0 ? "success" : "default" },
        ]}
        action={<RefreshButton />}
      />
      <PipelineOverview stages={stages} />
    </>
  );
}
