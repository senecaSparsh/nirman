import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Recycle, FileText, Building2, Package } from "lucide-react";
import { toNum } from "@/lib/server";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/mobile-primitives";

/**
 * /m/scrap-generations/[id] — scrap generation slip detail. Shows
 * the slip header, line items with scrap valuation, and totals.
 * ScrapGeneration is a transactional (immutable) record — no
 * edit/cancel actions. Linked entities (project, source material,
 * line materials) are clickable to their mobile detail pages.
 */
export default function MobileScrapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileScrapDetailContent params={params} />
    </Suspense>
  );
}

async function MobileScrapDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const scrap = await prisma.scrapGeneration.findUnique({
    where: { id },
    include: {
      toLocation: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      sourceMaterial: { select: { id: true, name: true, code: true } },
      lines: {
        include: { material: { select: { id: true, name: true, unit: true, code: true } } },
      },
    },
  });

  if (!scrap) {
    return (
      <div>
        <MobileDetailHeader title="Scrap Generation" backHref="/m/scrap-generations" />
        <MobileEmptyState icon={Recycle} title="Scrap slip not found" />
      </div>
    );
  }

  const totalValue = scrap.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0);
  const totalQty = scrap.lines.reduce((s, l) => s + toNum(l.qty), 0);

  return (
    <div>
      <MobileDetailHeader
        title={scrap.scrapNumber}
        subtitle={`${scrap.toLocation.name} · ${formatDate(scrap.generationDate)}`}
        backHref="/m/scrap-generations"
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Total Qty" value={formatNumber(totalQty, 0)} icon={Recycle} />
        <MobileStatCard label="Scrap Value" value={formatCurrency(totalValue)} icon={Recycle} tone="success" />
      </div>

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Package} title="Destination" value={scrap.toLocation.name} />
        <MobileInfoRow icon={FileText} title="Date" value={formatDate(scrap.generationDate)} />
        {scrap.project && (
          <Link
            href={`/m/projects/${scrap.project.id}`}
            className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-body">Project</div>
            </div>
            <span className="shrink-0 text-body font-semibold tnum text-foreground">{scrap.project.name}</span>
          </Link>
        )}
        {scrap.sourceMaterial && (
          <Link
            href={`/m/materials/${scrap.sourceMaterial.id}`}
            className="flex min-h-11 items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2 transition-colors active:bg-accent"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Recycle className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-body">Source Material</div>
            </div>
            <span className="shrink-0 text-body font-semibold tnum text-foreground">
              {scrap.sourceMaterial.code} · {scrap.sourceMaterial.name}
            </span>
          </Link>
        )}
        {scrap.notes && <MobileInfoRow icon={FileText} title="Notes" value={scrap.notes} />}
      </div>

      <MobileSectionTitle>Line Items ({scrap.lines.length})</MobileSectionTitle>
      {scrap.lines.length === 0 ? (
        <MobileEmptyState icon={Recycle} title="No line items" />
      ) : (
        <div>
          {scrap.lines.map((l) => (
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
                  {l.material.code} · {formatCurrency(toNum(l.unitCost))}/{l.material.unit}
                </div>
              </div>
              <span className="shrink-0 text-body font-semibold tnum text-foreground">
                {formatNumber(toNum(l.qty), 0)} {l.material.unit}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
