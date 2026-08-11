import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Recycle, FileText, Building2, User } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
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
 * /m/material-sales/[id] — material/scrap sale detail. Shows the
 * sale header, line items, profit, and payment status. Inline
 * cancel action is RBAC-gated by `sales.manage`; print links to
 * the existing `/print/material-sale/[id]` page.
 */
export default function MobileMaterialSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileMaterialSaleDetailContent params={params} />
    </Suspense>
  );
}

async function MobileMaterialSaleDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const sale = await prisma.materialSale.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, name: true, unit: true, code: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!sale) {
    return (
      <div>
        <MobileDetailHeader title="Material Sale" backHref="/m/material-sales" />
        <MobileEmptyState icon={Recycle} title="Sale not found" />
      </div>
    );
  }

  // ── RBAC ──────────────────────────────────────────────────
  const canManage = hasPermission(role, PERM.SALES_MANAGE);
  const isCancellable = sale.status !== "CANCELLED";

  const actions = canManage && isCancellable
    ? [
        {
          label: "Cancel Sale",
          icon: "XCircle",
          method: "POST" as const,
          endpoint: `/api/material-sales/${sale.id}`,
          body: { action: "cancel" },
          successMsg: `Sale ${sale.saleNumber} cancelled`,
          variant: "danger" as const,
          confirm: "Cancel this material sale? Stock will be reversed. This cannot be undone.",
        },
      ]
    : [];

  const links = [
    {
      label: "Print Invoice",
      icon: "Printer",
      href: `/print/material-sale/${sale.id}`,
      variant: "outline" as const,
    },
  ];

  return (
    <div>
      <MobileDetailHeader
        title={sale.saleNumber}
        subtitle={`${sale.customer?.name ?? "—"} · ${formatDate(sale.saleDate)}`}
        backHref="/m/material-sales"
        right={
          <div className="flex flex-col items-end gap-1">
            <MobileStatusBadge status={sale.status} />
            <MobileStatusBadge status={sale.paymentStatus} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Total Amount" value={formatCurrency(toNum(sale.totalAmount))} icon={Recycle} tone="success" />
        <MobileStatCard label="Gross Profit" value={formatCurrency(toNum(sale.grossProfit))} icon={Recycle} tone={toNum(sale.grossProfit) >= 0 ? "success" : "danger"} />
        {toNum(sale.scrapSubtotal) > 0 && (
          <MobileStatCard label="Scrap Recovery" value={formatCurrency(toNum(sale.scrapSubtotal))} icon={Recycle} hint="Cost recovered" />
        )}
        <MobileStatCard label="Total Cost" value={formatCurrency(toNum(sale.totalCost))} icon={Recycle} />
      </div>

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        {sale.customer ? (
          <Link
            href={`/m/customers/${sale.customer.id}`}
            className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <User className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-body">Customer</div>
            </div>
            <span className="shrink-0 text-body font-semibold tnum text-foreground">{sale.customer.name}</span>
          </Link>
        ) : (
          <MobileInfoRow icon={User} title="Customer" value="—" />
        )}
        {sale.project && (
          <Link
            href={`/m/projects/${sale.project.id}`}
            className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-body">Project</div>
            </div>
            <span className="shrink-0 text-body font-semibold tnum text-foreground">{sale.project.name}</span>
          </Link>
        )}
        <MobileInfoRow icon={FileText} title="Sale Date" value={formatDate(sale.saleDate)} />
        <MobileInfoRow icon={FileText} title="Subtotal" value={formatCurrency(toNum(sale.subtotal))} />
        <MobileInfoRow icon={FileText} title="GST" value={formatCurrency(toNum(sale.gstTotal))} />
        {sale.paymentMode && <MobileInfoRow icon={FileText} title="Payment Mode" value={sale.paymentMode} />}
        {sale.notes && <MobileInfoRow icon={FileText} title="Notes" value={sale.notes} />}
      </div>

      <MobileSectionTitle>Line Items ({sale.lines.length})</MobileSectionTitle>
      {sale.lines.length === 0 ? (
        <MobileEmptyState icon={Recycle} title="No line items" />
      ) : (
        <div>
          {sale.lines.map((l) => (
            <Link
              key={l.id}
              href={`/m/materials/${l.material.id}`}
              className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Recycle className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-body">{l.material.name}</div>
                <div className="truncate text-caption text-muted-foreground">
                  {l.material.code} · {l.location.name} · {formatCurrency(toNum(l.unitPrice))}/{l.material.unit}
                </div>
              </div>
              <span className="shrink-0 text-body font-semibold tnum text-foreground">
                {formatNumber(toNum(l.qty), 0)} {l.material.unit} = {formatCurrency(toNum(l.lineTotal))}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Inline actions + print ─────────────────────────────── */}
      <MobileDetailActions actions={actions} links={links} />
    </div>
  );
}
