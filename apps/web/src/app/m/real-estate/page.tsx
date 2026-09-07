import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileHubPage } from "@/components/mobile/v2/hub-page";
import { MobileRealEstateHubTabs } from "../MobileRealEstateHubTabs";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

// ── List components (reused from their existing pages, unchanged) ──
import { MobileLandList } from "../land/MobileLandList";
import { MobileProjectsList, type ProjectListItem } from "../projects/MobileProjectsList";
import { MobileUnitsList, type UnitListItem } from "../units/MobileUnitsList";
import { MobileBrokersList, type BrokerListItem } from "../brokers/MobileBrokersList";
import { MobileRentalsList, type RentalListItem } from "../rentals/MobileRentalsList";
import { MobileCustomersLeadsTabs } from "../customers/MobileCustomersLeadsTabs";
import type { ComponentProps } from "react";

// Extract types from components that don't export their item types
type LandPurchaseItem = ComponentProps<typeof MobileLandList>["items"][number];
type Portfolio = ComponentProps<typeof MobileLandList>["portfolio"];

/**
 * /m/real-estate — Real Estate hub. Groups Projects, Built Units, Land,
 * Customers, Brokers, and Rentals into one tabbed page — same pattern
 * as /m/stock.
 */
export default function MobileRealEstateHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <MobileHubPage>
      {async () => {
        const { tab } = await searchParams;

  const validTabs = ["projects", "units", "land", "customers", "brokers", "rentals"];
  const activeTab = validTabs.includes(tab ?? "") ? tab! : "projects";

  let content: React.ReactNode;
  if (activeTab === "units") {
    content = <RealEstateUnitsTab />;
  } else if (activeTab === "land") {
    content = <RealEstateLandTab />;
  } else if (activeTab === "customers") {
    content = <RealEstateCustomersTab />;
  } else if (activeTab === "brokers") {
    content = <RealEstateBrokersTab />;
  } else if (activeTab === "rentals") {
    content = <RealEstateRentalsTab />;
  } else {
    content = <RealEstateProjectsTab />;
  }

  return (
    <MobileRealEstateHubTabs activeTab={activeTab}>
      {content}
    </MobileRealEstateHubTabs>
  );
      }}
    </MobileHubPage>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB CONTENT COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Projects tab — mirrors /m/projects */
async function RealEstateProjectsTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.PROJECTS_MANAGE);

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, status: true, type: true,
      totalBudget: true, totalProjectCost: true, costPerSqft: true,
      reraNumber: true,
      _count: { select: { builtUnits: { where: { deletedAt: null } } } },
    },
  });

  const items: ProjectListItem[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    type: p.type,
    totalBudget: p.totalBudget ? toNum(p.totalBudget) : null,
    reraNumber: p.reraNumber,
    unitCount: p._count.builtUnits,
  }));

  return (
    <MobileProjectsList
      items={items}
      canManage={canManage}
      exportTitle="Projects"
      exportRows={items as unknown as Record<string, unknown>[]}
      exportColumns={[
        { key: "name", label: "Project" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "unitCount", label: "Units" },
        { key: "totalBudget", label: "Budget", format: "currency" },
      ] as MobileColumnSpec[]}
      exportSummary={`${items.length} projects`}
    />
  );
}

/** Units tab — mirrors /m/units */
async function RealEstateUnitsTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);

  const [units, _projects] = await Promise.all([
    prisma.builtUnit.findMany({
      where: { deletedAt: null, project: { companyId: company.id, deletedAt: null } },
      orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
      take: 200,
      include: { project: { select: { id: true, name: true } } },
    }),
    canManage
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const items: UnitListItem[] = units.map((u) => ({
    id: u.id,
    unitNumber: u.unitNumber,
    unitType: u.unitType,
    status: u.status,
    area: toNum(u.area),
    areaUnit: u.areaUnit,
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
    projectId: u.project.id,
    projectName: u.project.name,
  }));

  return (
    <MobileUnitsList
      items={items}
      exportTitle="Built Units"
      exportRows={items as unknown as Record<string, unknown>[]}
      exportColumns={[
        { key: "unitNumber", label: "Unit" },
        { key: "projectName", label: "Project" },
        { key: "unitType", label: "Type" },
        { key: "status", label: "Status" },
        { key: "area", label: "Area" },
        { key: "askingPrice", label: "Asking Price", format: "currency" },
      ] as MobileColumnSpec[]}
      exportSummary={`${items.length} units`}
    />
  );
}

/** Land tab — mirrors /m/land */
async function RealEstateLandTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);

  const [landPurchases, projects, sellers] = await Promise.all([
    prisma.landPurchase.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        parcels: {
          where: { deletedAt: null },
          select: {
            id: true, number: true, status: true, area: true,
            purpose: true, acquisitionCost: true, currentValuation: true,
            askingPrice: true, parentParcelId: true,
            sale: { select: { id: true } },
            _count: { select: { children: true } },
          },
        },
      },
    }),
    canManage
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
    canManage
      ? prisma.landSeller.findMany({
          where: { companyId: company.id, deletedAt: null },
          select: { id: true, name: true, phone: true },
          orderBy: { name: "asc" },
        })
      : [],
  ]);

  const items: LandPurchaseItem[] = landPurchases.map((lp) => {
    const availableCount = lp.parcels.filter((p) => p.status === "AVAILABLE").length;
    const holdCount = lp.parcels.filter((p) => p.status === "HOLD").length;
    const soldCount = lp.parcels.filter((p) => p.status === "SOLD").length;
    const partitionedCount = lp.parcels.filter((p) => p._count.children > 0).length;
    const availableArea = lp.parcels
      .filter((p) => p.status === "AVAILABLE")
      .reduce((s, p) => s + toNum(p.area), 0);
    const unsoldValue = lp.parcels
      .filter((p) => p.status === "AVAILABLE")
      .reduce((s, p) => s + toNum(p.currentValuation), 0);
    const costBasis = lp.parcels.reduce((s, p) => s + toNum(p.acquisitionCost), 0);
    const valuationGain = unsoldValue - costBasis;

    return {
      id: lp.id,
      sellerName: lp.sellerName,
      sellerContact: lp.sellerContact ?? null,
      purchaseDate: lp.purchaseDate.toISOString(),
      totalArea: toNum(lp.totalArea),
      areaUnit: lp.areaUnit,
      totalCost: toNum(lp.totalCost),
      registryNo: lp.registryNo ?? null,
      location: lp.location ?? null,
      projectId: lp.project?.id ?? null,
      projectName: lp.project?.name ?? null,
      mode: lp.mode,
      landType: lp.landType,
      purchaseStage: lp.purchaseStage,
      isPossessed: lp.isPossessed,
      parcelCount: lp.parcels.length,
      availableCount,
      holdCount,
      soldCount,
      partitionedCount,
      availableArea,
      unsoldValue,
      costBasis,
      valuationGain,
      parcels: lp.parcels.map((p) => ({
        id: p.id,
        number: p.number,
        status: p.status,
        purpose: p.purpose,
        area: toNum(p.area),
        currentValuation: toNum(p.currentValuation),
        askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
        parentParcelId: p.parentParcelId,
        childCount: p._count.children,
      })),
    };
  });

  const portfolio: Portfolio = {
    purchaseCount: landPurchases.length,
    totalArea: items.reduce((s, i) => s + i.totalArea, 0),
    areaUnit: items[0]?.areaUnit ?? "SQ_FT",
    parcelCount: items.reduce((s, i) => s + i.parcelCount, 0),
    availableCount: items.reduce((s, i) => s + i.availableCount, 0),
    holdCount: items.reduce((s, i) => s + i.holdCount, 0),
    soldCount: items.reduce((s, i) => s + i.soldCount, 0),
    partitionedCount: items.reduce((s, i) => s + i.partitionedCount, 0),
    availableArea: items.reduce((s, i) => s + i.availableArea, 0),
    unsoldValue: items.reduce((s, i) => s + i.unsoldValue, 0),
    costBasis: items.reduce((s, i) => s + i.costBasis, 0),
  };

  return (
    <MobileLandList
      items={items}
      portfolio={portfolio}
      canManage={canManage}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      sellers={sellers.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
      company={{ id: company.id, name: company.name }}
    />
  );
}

/** Customers tab — mirrors /m/customers */
async function RealEstateCustomersTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.SALE_CREATE);
  const canEdit = hasPermission(role, PERM.SALE_CREATE);
  const canDelete = hasPermission(role, PERM.SALES_MANAGE);

  const [customers, leads] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      take: 200,
      include: {
        assetSales: {
          where: { companyId: company.id, status: "ACTIVE" },
          select: { salePrice: true, gstAmount: true, paymentStatus: true,
            payments: { where: { status: "RECEIVED" }, select: { amount: true } } },
        },
        materialSales: {
          where: { companyId: company.id, status: "ACTIVE" },
          select: { totalAmount: true, paymentStatus: true,
            payments: { select: { amount: true } } },
        },
      },
    }),
    prisma.lead.findMany({
      where: { companyId: company.id, deletedAt: null, stage: { not: "LOST" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, name: true, phone: true, email: true,
        source: true, stage: true, priority: true, score: true,
        nextFollowUpAt: true, lastContactAt: true, convertedAt: true,
        createdAt: true, budgetMin: true, budgetMax: true,
        interestedUnitType: true,
        project: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  const customerStats = {
    customerCount: customers.length,
    withDues: 0,
    totalOutstanding: 0,
    pipelineValue: 0,
  };

  return (
    <MobileCustomersLeadsTabs
      customers={customers as unknown as ComponentProps<typeof MobileCustomersLeadsTabs>["customers"]}
      leads={leads as unknown as ComponentProps<typeof MobileCustomersLeadsTabs>["leads"]}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
      customerStats={customerStats}
      leadCount={leads.length}
    />
  );
}

/** Brokers tab — mirrors /m/brokers */
async function RealEstateBrokersTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.SALES_MANAGE);
  const canEdit = hasPermission(role, PERM.SALES_MANAGE);
  const canDelete = hasPermission(role, PERM.SALES_MANAGE);

  const brokers = await prisma.broker.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    take: 100,
    include: { _count: { select: { assetSales: true } } },
  });

  const items: BrokerListItem[] = brokers.map((b) => ({
    id: b.id,
    name: b.name,
    phone: b.phone,
    agency: b.agency,
    defaultCommissionPercent: b.defaultCommissionPercent ? toNum(b.defaultCommissionPercent) : null,
    notes: b.notes,
    dealCount: b._count.assetSales,
  }));

  return (
    <MobileBrokersList
      items={items}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  );
}

/** Rentals tab — mirrors /m/rentals */
async function RealEstateRentalsTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);

  const [tenancies, unitAssets, parcelAssets, customers] = await Promise.all([
    prisma.tenancy.findMany({
      where: { companyId: company.id, status: { in: ["ACTIVE", "PENDING"] } },
      orderBy: [{ status: "asc" }, { endDate: "asc" }],
      include: {
        payments: { orderBy: { dueDate: "desc" }, select: { amount: true, dueDate: true, status: true, paymentDate: true } },
      },
    }),
    prisma.builtUnit.findMany({
      where: { project: { companyId: company.id }, deletedAt: null, status: { in: ["AVAILABLE", "UNDER_CONSTRUCTION"] } },
      select: { id: true, unitNumber: true, project: { select: { name: true } } },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, landPurchase: { companyId: company.id }, status: "AVAILABLE" },
      select: { id: true, number: true, landPurchase: { select: { sellerName: true, location: true } } },
    }),
    prisma.customer.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const unitMap = new Map(unitAssets.map((u) => [u.id, { label: u.unitNumber, project: u.project.name }]));
  const parcelMap = new Map(parcelAssets.map((p) => [p.id, { label: `Parcel ${p.number}`, project: p.landPurchase.location ?? p.landPurchase.sellerName }]));
  const now = new Date();

  const items: RentalListItem[] = tenancies.map((t) => {
    const unit = t.builtUnitId ? unitMap.get(t.builtUnitId) : null;
    const parcel = t.landParcelId ? parcelMap.get(t.landParcelId) : null;
    const assetLabel = unit?.label ?? parcel?.label ?? "—";
    const projectName = unit?.project ?? parcel?.project ?? null;

    const totalReceived = t.payments
      .filter((p) => p.status === "RECEIVED")
      .reduce((s, p) => s + toNum(p.amount), 0);
    const overduePayments = t.payments.filter((p) => p.status === "OVERDUE");
    const overdueAmount = overduePayments.reduce((s, p) => s + toNum(p.amount), 0);
    const nextDue = t.payments.find((p) => p.status === "PENDING" || p.status === "OVERDUE");
    const daysToExpiry = Math.ceil((new Date(t.endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    return {
      id: t.id,
      tenantName: t.tenantName,
      tenantPhone: t.tenantPhone,
      tenantEmail: t.tenantEmail,
      status: t.status,
      assetLabel,
      projectName,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      monthlyRent: toNum(t.monthlyRent),
      securityDeposit: toNum(t.securityDeposit),
      rentAgreementNo: t.rentAgreementNo ?? null,
      totalReceived,
      overdueAmount,
      overdueCount: overduePayments.length,
      nextDueDate: nextDue?.dueDate.toISOString() ?? null,
      nextDueAmount: nextDue ? toNum(nextDue.amount) : null,
      daysToExpiry,
      expiringSoon: daysToExpiry <= 30 && daysToExpiry >= 0,
      expired: daysToExpiry < 0,
      paymentCount: t.payments.length,
    };
  });

  const stats = {
    totalMonthlyRent: items.reduce((s, i) => s + i.monthlyRent, 0),
    totalReceived: items.reduce((s, i) => s + i.totalReceived, 0),
    totalOverdue: items.reduce((s, i) => s + i.overdueAmount, 0),
    activeCount: items.filter((i) => i.status === "ACTIVE").length,
    pendingCount: items.filter((i) => i.status === "PENDING").length,
    expiringCount: items.filter((i) => i.expiringSoon).length,
  };

  return (
    <MobileRentalsList
      items={items}
      stats={stats}
      canManage={canManage}
      unitAssets={unitAssets.map((u) => ({ id: u.id, label: `${u.unitNumber} (${u.project.name})` }))}
      parcelAssets={parcelAssets.map((p) => ({ id: p.id, label: `${p.number} (${p.landPurchase.sellerName})` }))}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      exportTitle="Rentals"
      exportRows={items as unknown as Record<string, unknown>[]}
      exportColumns={[
        { key: "tenantName", label: "Tenant" },
        { key: "assetLabel", label: "Asset" },
        { key: "status", label: "Status" },
        { key: "monthlyRent", label: "Monthly Rent", format: "currency" },
        { key: "totalReceived", label: "Received", format: "currency" },
        { key: "overdueAmount", label: "Overdue", format: "currency" },
        { key: "endDate", label: "End Date", format: "date" },
      ] as MobileColumnSpec[]}
      exportSummary={`${items.length} tenancies`}
    />
  );
}
