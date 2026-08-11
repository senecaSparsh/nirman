import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ScanLine, FileText } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate, formatNumber } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";
import { MobileDetailActions } from "@/components/mobile/mobile-detail-actions";

/**
 * /m/stock-counts/[id] — stock count / physical verification
 * detail. Shows the count header, line items with system vs
 * counted qty and variance, and status. Inline actions (confirm /
 * reconcile) are RBAC-gated by `inventory.manage`.
 */
export default function MobileStockCountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileStockCountDetailContent params={params} />
    </Suspense>
  );
}

async function MobileStockCountDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const count = await prisma.stockCount.findFirst({
    where: { id, location: { companyId: company.id } },
    include: {
      location: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, name: true, unit: true, code: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!count) {
    return (
      <div>
        <MobileDetailHeader title="Stock Count" backHref="/m/stock-counts" />
        <MobileEmptyState icon={ScanLine} title="Stock count not found" />
      </div>
    );
  }

  const totalVariance = count.lines.reduce((s, l) => s + toNum(l.variance), 0);

  // ── RBAC ──────────────────────────────────────────────────
  const canManage = hasPermission(role, PERM.INVENTORY_MANAGE);
  const isDraft = count.status === "DRAFT";
  const isCounted = count.status === "COUNTED";

  const actions = canManage
    ? [
        ...(isDraft
          ? [
              {
                label: "Confirm Count",
                icon: "CheckCircle2",
                endpoint: `/api/stock-counts/${count.id}`,
                body: { action: "confirm" },
                successMsg: `Stock count confirmed`,
                variant: "primary" as const,
                confirm: "Confirm this stock count? This locks the counted quantities.",
              },
            ]
          : []),
        ...(isCounted
          ? [
              {
                label: "Reconcile",
                icon: "Scale",
                endpoint: `/api/stock-counts/${count.id}`,
                body: { action: "reconcile" },
                successMsg: `Stock count reconciled`,
                variant: "primary" as const,
                confirm:
                  "Reconcile this stock count? This will adjust stock levels to match the counted quantities.",
              },
            ]
          : []),
      ]
    : [];

  return (
    <div>
      <MobileDetailHeader
        title={count.location.name}
        subtitle={`${formatDate(count.countDate)} · ${count.lines.length} items`}
        backHref="/m/stock-counts"
        right={<MobileStatusBadge status={count.status} />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Items Counted" value={String(count.lines.length)} icon={ScanLine} />
        <MobileStatCard
          label="Net Variance"
          value={formatNumber(totalVariance, 0)}
          icon={ScanLine}
          tone={totalVariance < 0 ? "danger" : totalVariance > 0 ? "warning" : "success"}
        />
      </div>

      {count.notes && (
        <>
          <MobileSectionTitle>Notes</MobileSectionTitle>
          <div>
            <MobileInfoRow icon={FileText} title="Notes" value={count.notes} />
          </div>
        </>
      )}

      <MobileSectionTitle>Counted Items</MobileSectionTitle>
      {count.lines.length === 0 ? (
        <MobileEmptyState icon={ScanLine} title="No items counted" />
      ) : (
        <div>
          {count.lines.map((l) => {
            const variance = toNum(l.variance);
            const varianceStr = variance > 0 ? `+${formatNumber(variance, 0)}` : formatNumber(variance, 0);
            return (
              <Link
                key={l.id}
                href={`/m/materials/${l.material.id}`}
                className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <ScanLine className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body">{l.material.name}</div>
                  <div className="truncate text-caption text-muted-foreground">
                    {l.material.code} · system {formatNumber(toNum(l.systemQty), 0)} {l.material.unit}
                  </div>
                </div>
                <span
                  className={
                    "shrink-0 text-body font-semibold tnum " +
                    (variance < 0 ? "text-danger" : variance > 0 ? "text-warning" : "text-success")
                  }
                >
                  {formatNumber(toNum(l.countedQty), 0)} {l.material.unit} (Δ {varianceStr})
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Inline actions ────────────────────────────────────── */}
      <MobileDetailActions actions={actions} />
    </div>
  );
}
