import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCompanyGroupIds, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  Badge,
} from "@/components/mobile/v2/primitives";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { InventoryInteractive } from "./inventory-interactive";
import {
  InventoryHierarchy,
  type InventoryCompanyNode,
  type InventoryLocationNode,
  type InventoryProjectNode,
  type InventoryTreeData,
} from "./InventoryHierarchy";

/**
 * Inventory module home — the first tab.
 *
 * Visual architecture:
 *   1. Attention banner carousel
 *   2. Raw Material / Real Estate toggle + quick actions
 *   3. Company-group inventory tree (parent → subsidiaries → warehouses / projects)
 *   4. Pending indents
 */
export default function InventoryHomePage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <InventoryContent />
    </Suspense>
  );
}

async function InventoryContent() {
  await connection();
  const company = await getCompany();

  const [draftPOs, pendingReqs, recentRequisitions, materials, inventoryTree] =
    await Promise.all([
      prisma.purchaseOrder.count({
        where: { companyId: company.id, status: "DRAFT" },
      }),
      prisma.materialRequisition.count({
        where: { project: { companyId: company.id }, status: "SUBMITTED" },
      }),
      prisma.materialRequisition.findMany({
        where: { project: { companyId: company.id }, status: "SUBMITTED" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { project: { select: { name: true } } },
      }),
      prisma.material.findMany({
        where: {
          deletedAt: null,
          OR: [
            { stockItems: { some: { location: { companyId: company.id } } } },
            { reorderPoint: { not: null } },
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          minStock: true,
          reorderPoint: true,
          category: { select: { name: true } },
          stockItems: {
            where: { location: { companyId: company.id } },
            select: { qty: true, movingAvgCost: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      loadInventoryTree({
        id: company.id,
        parentCompanyId: company.parentCompanyId,
        name: company.name,
      }),
    ]);

  const approvalCount = draftPOs + pendingReqs;

  // ── Derive stock health metrics ──
  const materialRows = materials.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    const stockValue = m.stockItems.reduce(
      (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
      0,
    );
    const minStock = m.minStock ? toNum(m.minStock) : null;
    const reorderPoint = m.reorderPoint ? toNum(m.reorderPoint) : null;
    const isLow = reorderPoint != null && totalQty <= reorderPoint;
    const isOut = totalQty <= 0;
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      categoryName: m.category.name,
      totalQty,
      stockValue,
      minStock,
      reorderPoint,
      isLow,
      isOut,
    };
  });

  const totalStockValue = materialRows.reduce((s, m) => s + m.stockValue, 0);

  // ── Build attention banners for the carousel ──
  // Show out-of-stock first (red), then low-stock (amber), then pending
  // approvals (amber), then a summary banner (blue) if everything is healthy.
  const attentionBanners: AttentionBanner[] = [];

  for (const m of materialRows.filter((m) => m.isOut)) {
    attentionBanners.push({
      id: m.id,
      title: m.name,
      subtitle: `Out of stock · reorder at ${formatNumber(m.reorderPoint ?? 0, 0)} ${m.unit}`,
      href: `/m/materials/${m.id}`,
      severity: "out",
      qtyText: "0",
      category: m.categoryName,
    });
  }
  for (const m of materialRows.filter((m) => m.isLow && !m.isOut)) {
    attentionBanners.push({
      id: m.id,
      title: m.name,
      subtitle: `Low stock · ${formatNumber(m.totalQty, 0)} ${m.unit} left (reorder at ${formatNumber(m.reorderPoint ?? 0, 0)})`,
      href: `/m/materials/${m.id}`,
      severity: "low",
      qtyText: formatNumber(m.totalQty, 0),
      category: m.categoryName,
    });
  }
  // Pending approvals banner
  if (approvalCount > 0) {
    attentionBanners.push({
      id: "approvals",
      title: `${approvalCount} approval${approvalCount !== 1 ? "s" : ""} waiting`,
      subtitle: `${draftPOs} draft Purchase Order${draftPOs !== 1 ? "s" : ""} · ${pendingReqs} pending requisition${pendingReqs !== 1 ? "s" : ""}`,
      href: "/m/pulse/approvals",
      severity: "low",
      qtyText: String(approvalCount),
      category: "Approvals",
    });
  }
  // If no alerts, show a green "all caught up" banner
  if (attentionBanners.length === 0) {
    attentionBanners.push({
      id: "clear",
      title: "All caught up!",
      subtitle: `${materialRows.length} materials healthy · ${formatCurrency(totalStockValue)} in stock · no pending approvals`,
      href: "/m/materials",
      severity: "clear",
      qtyText: "✓",
      category: "Everything looks good",
    });
  }

  return (
    <div>
      {/* ── Attention banner carousel — auto-scrolling needs-attention items ── */}
      <AttentionBannerCarousel
        banners={attentionBanners}
        approvalsCount={approvalCount}
      />

      {/* ── Category tabs + quick actions (Raw Material / Real Estate) ── */}
      <InventoryInteractive />

      {/* ── Group inventory tree — parent → children → projects ── */}
      <InventoryHierarchy tree={inventoryTree} />

      {/* ── Pending indents ── */}
      {recentRequisitions.length > 0 ? (
        <>
          <MobileSectionTitle>Pending indents</MobileSectionTitle>
          <div className="flex flex-col gap-2.5">
            {recentRequisitions.map((req) => (
              <MobileRow
                key={req.id}
                href={`/m/requisitions/${req.id}`}
                title={`REQ-${req.reqNumber ?? req.id.slice(-6)}`}
                subtitle={req.project?.name ?? "—"}
                meta="SUBMITTED"
                badge={<Badge tone="signal">pending</Badge>}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

async function loadInventoryTree(current: {
  id: string;
  parentCompanyId: string | null;
  name: string;
}): Promise<InventoryTreeData> {
  const groupIds = await getCompanyGroupIds(current);
  const companies = await prisma.company.findMany({
    where: { id: { in: groupIds }, deletedAt: null },
    select: {
      id: true,
      name: true,
      businessType: true,
      parentCompanyId: true,
    },
    orderBy: { name: "asc" },
  });

  const [locations, projects] = await Promise.all([
    prisma.stockLocation.findMany({
      where: { companyId: { in: groupIds }, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        companyId: true,
        projectId: true,
        stockItems: {
          where: { qty: { not: 0 } },
          select: { qty: true, movingAvgCost: true, materialId: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { companyId: { in: groupIds }, deletedAt: null },
      select: { id: true, name: true, status: true, companyId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  function locNode(loc: (typeof locations)[number]): InventoryLocationNode {
    const stockValue = loc.stockItems.reduce(
      (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
      0,
    );
    return {
      id: loc.id,
      name: loc.name,
      type: loc.type,
      stockValue,
      skuCount: new Set(loc.stockItems.map((i) => i.materialId)).size,
    };
  }

  const groupIdSet = new Set(groupIds);
  const nodes = new Map<string, InventoryCompanyNode>();

  for (const c of companies) {
    const ownLocs = locations.filter((l) => l.companyId === c.id);
    const warehouses = ownLocs.filter((l) => !l.projectId).map(locNode);
    const ownProjects: InventoryProjectNode[] = projects
      .filter((p) => p.companyId === c.id)
      .map((p) => {
        const projectLocs = ownLocs.filter((l) => l.projectId === p.id).map(locNode);
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          stockValue: projectLocs.reduce((s, l) => s + l.stockValue, 0),
          skuCount: projectLocs.reduce((s, l) => s + l.skuCount, 0),
          locations: projectLocs,
        };
      });
    const warehouseValue = warehouses.reduce((s, l) => s + l.stockValue, 0);
    const ownValue = warehouseValue + ownProjects.reduce((s, p) => s + p.stockValue, 0);
    const ownSkus = warehouses.reduce((s, l) => s + l.skuCount, 0)
      + ownProjects.reduce((s, p) => s + p.skuCount, 0);
    nodes.set(c.id, {
      id: c.id,
      name: c.name,
      businessType: c.businessType,
      isCurrent: c.id === current.id,
      warehouseValue,
      stockValue: ownValue,
      skuCount: ownSkus,
      warehouses,
      projects: ownProjects,
      subsidiaries: [],
    });
  }

  const roots: InventoryCompanyNode[] = [];
  for (const c of companies) {
    const node = nodes.get(c.id);
    if (!node) continue;
    const parentId = c.parentCompanyId;
    if (parentId && groupIdSet.has(parentId)) {
      nodes.get(parentId)?.subsidiaries.push(node);
    } else {
      roots.push(node);
    }
  }

  function rollup(node: InventoryCompanyNode) {
    for (const sub of node.subsidiaries) rollup(sub);
    node.stockValue += node.subsidiaries.reduce((s, sub) => s + sub.stockValue, 0);
    node.skuCount += node.subsidiaries.reduce((s, sub) => s + sub.skuCount, 0);
    node.subsidiaries.sort((a, b) => a.name.localeCompare(b.name));
  }
  for (const root of roots) rollup(root);
  roots.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const rootName = roots.length === 1
    ? roots[0]!.name
    : current.parentCompanyId
      ? (nodes.get(current.parentCompanyId)?.name ?? current.name)
      : current.name;

  return {
    rootName,
    totalValue: roots.reduce((s, n) => s + n.stockValue, 0),
    companyCount: companies.length,
    locationCount: locations.length,
    skuCount: roots.reduce((s, n) => s + n.skuCount, 0),
    companies: roots,
  };
}
