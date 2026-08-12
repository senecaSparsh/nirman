import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import {
  ShoppingCart,
  Wrench,
  Plus,
  ScanLine,
  PackageCheck,
} from "lucide-react";
import { prisma } from "@nirman/db";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  Badge,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { MaterialIllustration } from "@/components/mobile/v2/material-illustration";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { InventoryInteractive } from "./inventory-interactive";

/**
 * Inventory module home — the first tab.
 *
 * Visual architecture matches nirman-os:
 *   1. Stock health summary card (4 colored wash tiles)
 *   2. Category cards (Raw Material / Real Estate) — tap to open popup
 *   3. Portfolio KPI strip
 *   4. Quick actions (3-col compact grid)
 *   5. Needs attention (2-col grid, tap for detail popup)
 *   6. Pending indents
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

  const [draftPOs, pendingReqs, recentRequisitions, materials, categoryCounts] =
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
      // Category counts for the "Top categories" horizontal strip
      prisma.materialCategory.findMany({
        where: {
          deletedAt: null,
          materials: {
            some: {
              deletedAt: null,
              stockItems: { some: { location: { companyId: company.id } } },
            },
          },
        },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              materials: {
                where: {
                  deletedAt: null,
                  stockItems: { some: { location: { companyId: company.id } } },
                },
              },
            },
          },
        },
        orderBy: { name: "asc" },
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
      subtitle: `${draftPOs} draft PO${draftPOs !== 1 ? "s" : ""} · ${pendingReqs} pending requisition${pendingReqs !== 1 ? "s" : ""}`,
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

  // Popular materials — top 6 by stock value (qty × MAC), showing healthy stock first
  const popularMaterials = materialRows
    .filter((m) => !m.isOut)
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 6);

  return (
    <div>
      {/* ── Attention banner carousel — auto-scrolling needs-attention items ── */}
      <AttentionBannerCarousel
        banners={attentionBanners}
        approvalsCount={approvalCount}
      />

      {/* ── Category cards (Raw Material / Real Estate) ── */}
      <InventoryInteractive />

      {/* ── Quick actions — 3-col compact grid ── */}
      <SectionHead title="Quick actions" />
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <QuickActionTile href="/m/requisitions" icon={ShoppingCart} label="Requisition" />
        <QuickActionTile href="/m/site/receive" icon={ScanLine} label="Receive" />
        <QuickActionTile href="/m/site/issue" icon={PackageCheck} label="Issue" />
        <QuickActionTile href="/m/sales/new" icon={Plus} label="New Sale" />
        <QuickActionTile href="/m/scrap-generations" icon={Wrench} label="Scrap" />
        <QuickActionTile href="/m/site/field" icon={ScanLine} label="Barcode" />
      </div>

      {/* ── Top categories — horizontal scroll of circular chips ── */}
      {categoryCounts.length > 0 ? (
        <div className="mb-3">
          <SectionHead title="Top categories" />
          <div className="-mx-3.5 px-3.5 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 w-max">
              {categoryCounts.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/m/materials?category=${encodeURIComponent(cat.name)}`}
                  className="flex flex-col items-center gap-1 shrink-0 active:opacity-70"
                >
                  <div
                    className="w-12 h-12 rounded-full border-2 grid place-items-center p-1.5 overflow-hidden"
                    style={{
                      borderColor: "var(--color-line)",
                      backgroundColor: "var(--color-paper)",
                    }}
                  >
                    <MaterialIllustration categoryName={cat.name} />
                  </div>
                  <span
                    className="text-[0.5625rem] font-semibold text-center leading-tight max-w-[3.5rem] truncate"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {cat.name}
                  </span>
                  <span
                    className="text-[0.5rem]"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {cat._count.materials} item{cat._count.materials !== 1 ? "s" : ""}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Popular materials — 3-col grid with illustrations ── */}
      {popularMaterials.length > 0 ? (
        <div className="mb-3">
          <SectionHead
            title="Popular materials"
            action={
              <Link
                href="/m/materials"
                className="text-[0.625rem] font-semibold underline underline-offset-2"
                style={{ color: "var(--color-steel)" }}
              >
                View all →
              </Link>
            }
          />
          <div className="grid grid-cols-3 gap-1.5">
            {popularMaterials.map((m) => (
              <PopularMaterialCard key={m.id} material={m} />
            ))}
          </div>
        </div>
      ) : null}

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

/* ── Quick action tile ── */
function QuickActionTile({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-center gap-1 rounded-[0.625rem] border p-2 press"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <span
        className="grid place-items-center w-7 h-7 rounded-[0.375rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Icon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
      </span>
      <span
        className="font-semibold text-[0.625rem] text-center"
        style={{ color: "var(--color-ink-950)" }}
      >
        {label}
      </span>
    </a>
  );
}

/* ── Popular material card — 3-col grid card with SVG illustration ── */
/* Adapted from nirman-os ProductCard, but shows stock info instead of
   price/cart — this is inventory management, not e-commerce. */
function PopularMaterialCard({
  material,
}: {
  material: {
    id: string;
    code: string;
    name: string;
    unit: string;
    categoryName: string;
    totalQty: number;
    stockValue: number;
    isLow: boolean;
    isOut: boolean;
  };
}) {
  const statusColor = material.isOut
    ? "var(--color-stop)"
    : material.isLow
      ? "var(--color-signal-dark)"
      : "var(--color-go)";
  const statusLabel = material.isOut
    ? "OUT"
    : material.isLow
      ? "LOW"
      : "OK";

  return (
    <Link
      href={`/m/materials/${material.id}`}
      className="block rounded-[0.625rem] border overflow-hidden active:scale-[0.98] transition-transform"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Illustration area */}
      <div
        className="aspect-square relative"
        style={{ backgroundColor: "var(--color-paper-2)" }}
      >
        <MaterialIllustration
          categoryName={material.categoryName}
          materialName={material.name}
        />
        {/* Status dot */}
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      {/* Content */}
      <div className="p-1.5">
        <p
          className="text-[0.5rem] font-semibold uppercase tracking-wide truncate"
          style={{ color: "var(--color-steel)" }}
        >
          {material.categoryName}
        </p>
        <p
          className="font-semibold text-[0.625rem] leading-snug mt-0.5 line-clamp-2 min-h-[2em]"
          style={{ color: "var(--color-ink-950)" }}
        >
          {material.name}
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-1">
          <div className="min-w-0">
            <p
              className="numeric text-[0.625rem] font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              {formatNumber(material.totalQty, 0)} {material.unit}
            </p>
            <p
              className="numeric text-[0.5rem]"
              style={{ color: "var(--color-ink-500)" }}
            >
              {formatCurrency(material.stockValue)}
            </p>
          </div>
          <span
            className="text-[0.5rem] font-bold uppercase shrink-0"
            style={{ color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}
