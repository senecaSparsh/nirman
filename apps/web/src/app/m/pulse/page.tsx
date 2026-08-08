import { Suspense } from "react";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { materialInventoryValue, unsoldAssetValue } from "@nirman/services";
import { ClipboardCheck, TrendingUp, Package, Building2, Wallet, AlertTriangle } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  MobileRefreshButton,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";

/**
 * Executive persona home — "Pulse".
 * OWNER / ADMIN. Glance at company health + jump into approvals.
 */
export default function PulsePage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <PulseContent />
    </Suspense>
  );
}

async function PulseContent() {
  await connection();
  const company = await getCompany();

  const [inventoryVal, unsoldAssets, activeProjects, draftPOs, pendingReqs, overduePOs, recentSales, unsoldUnitCount, unsoldParcelCount] = await Promise.all([
    materialInventoryValue(company.id),
    unsoldAssetValue(company.id),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      select: { id: true, name: true, status: true, _count: { select: { builtUnits: true } } },
      orderBy: { name: "asc" },
      take: 5,
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } },
      orderBy: { expectedDate: "asc" },
      take: 5,
      include: { supplier: { select: { name: true } } },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: { select: { name: true } } },
    }),
    prisma.builtUnit.count({
      where: { deletedAt: null, status: { in: ["AVAILABLE", "HOLD", "PLANNED", "UNDER_CONSTRUCTION"] }, project: { companyId: company.id, deletedAt: null } },
    }),
    prisma.landParcel.count({
      where: { deletedAt: null, status: { in: ["AVAILABLE", "HOLD"] }, landPurchase: { companyId: company.id } },
    }),
  ]);

  const approvalCount = draftPOs.length + pendingReqs.length;
  const overdueCount = overduePOs.length;

  return (
    <div>
      <MobilePageHeader title="Pulse" subtitle={company.name} right={<MobileRefreshButton />} />

      {/* ── KPI grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Inventory Value" value={formatCurrency(toNum(inventoryVal))} icon={Package} />
        <MobileStatCard label="Unsold Assets" value={formatCurrency(toNum(unsoldAssets.total))} icon={Building2} />
        <MobileStatCard
          label="Active Projects"
          value={formatNumber(activeProjects.length, 0)}
          hint={`${unsoldUnitCount + unsoldParcelCount} unsold units/parcels`}
          icon={Building2}
        />
        <MobileStatCard
          label="Pending Sales"
          value={formatNumber(recentSales.length, 0)}
          hint="active deals"
          icon={TrendingUp}
        />
      </div>

      {/* ── Approvals CTA ────────────────────────────────── */}
      <div className="px-4">
        <MobileCta href="/m/pulse/approvals" icon={ClipboardCheck}>
          {approvalCount > 0 ? `Approvals queue · ${approvalCount}` : "Approvals queue"}
        </MobileCta>
      </div>

      {/* ── Alerts ───────────────────────────────────────── */}
      {overdueCount > 0 && (
        <>
          <MobileSectionTitle>Overdue POs</MobileSectionTitle>
          <div>
            {overduePOs.map((po) => (
              <MobileRow
                key={po.id}
                href={`/procurement`}
                icon={AlertTriangle}
                title={po.supplier.name}
                subtitle={`PO ${po.poNumber} · expected ${formatDate(po.expectedDate)}`}
                meta="overdue"
                tone="danger"
              />
            ))}
          </div>
        </>
      )}

      {/* ── Active projects ──────────────────────────────── */}
      <MobileSectionTitle>Active Projects</MobileSectionTitle>
      {activeProjects.length === 0 ? (
        <MobileEmptyState icon={Building2} title="No active projects" hint="Projects show here once planned/active" />
      ) : (
        <div>
          {activeProjects.map((p) => (
            <MobileRow
              key={p.id}
              href={`/projects`}
              icon={Building2}
              title={p.name}
              subtitle={`${p._count.builtUnits} units`}
              badge={<MobileStatusBadge status={p.status} />}
            />
          ))}
        </div>
      )}

      {/* ── Recent sales ─────────────────────────────────── */}
      <MobileSectionTitle>Recent Sales</MobileSectionTitle>
      {recentSales.length === 0 ? (
        <MobileEmptyState icon={TrendingUp} title="No active sales" />
      ) : (
        <div>
          {recentSales.map((s) => (
            <MobileRow
              key={s.id}
              href={`/sales`}
              icon={Wallet}
              title={s.customer.name}
              subtitle={formatDate(s.createdAt)}
              meta={formatCurrency(toNum(s.salePrice))}
              tone="success"
            />
          ))}
        </div>
      )}

      {/* ── Reports shortcut ─────────────────────────────── */}
      <MobileSectionTitle>Reports</MobileSectionTitle>
      <div className="px-4 pb-4">
        <MobileCta href="/m/pulse/reports" icon={TrendingUp} variant="outline">
          View analytics
        </MobileCta>
      </div>
    </div>
  );
}
