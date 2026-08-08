import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Recycle, Plus } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { hasPermission, PERM } from "@/lib/roles";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileSearchBar,
  MobileRefreshButton,
  MobileFab,
} from "@/components/mobile/mobile-primitives";
import { MobileScrapGenerationsList } from "./MobileScrapGenerationsList";

/**
 * /m/scrap-generations — mobile scrap generation list. Supervisors and
 * managers need to see scrap generated from DPR variance analysis and
 * manual entries, as this feeds the cost recovery flow.
 */
export default function MobileScrapGenerationsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileScrapGenerationsContent />
    </Suspense>
  );
}

async function MobileScrapGenerationsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.INVENTORY_MANAGE);

  const scraps = await prisma.scrapGeneration.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      scrapNumber: true,
      generationDate: true,
      notes: true,
      toLocation: { select: { name: true } },
      project: { select: { name: true } },
      lines: {
        select: {
          qty: true,
          unitCost: true,
          material: { select: { name: true, unit: true } },
        },
      },
    },
  });

  const totalLines = scraps.reduce((s, sc) => s + sc.lines.length, 0);
  const totalValue = scraps.reduce(
    (s, sc) => s + sc.lines.reduce((ls, l) => ls + toNum(l.qty) * toNum(l.unitCost), 0),
    0,
  );

  // Serialize for the client component — Decimal → number
  const serialized = scraps.map((sc) => ({
    id: sc.id,
    scrapNumber: sc.scrapNumber,
    generationDate: sc.generationDate.toISOString(),
    notes: sc.notes,
    toLocationName: sc.toLocation.name,
    projectName: sc.project?.name ?? null,
    lineCount: sc.lines.length,
    totalValue: sc.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
    materials: sc.lines.map((l) => l.material.name).slice(0, 2),
    moreCount: Math.max(0, sc.lines.length - 2),
  }));

  return (
    <div>
      <MobilePageHeader
        title="Scrap Generations"
        subtitle={`${scraps.length} slips · ${totalLines} line items`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        <MobileStatCard label="Total Slips" value={String(scraps.length)} icon={Recycle} />
        <MobileStatCard label="Line Items" value={String(totalLines)} icon={Recycle} />
        <MobileStatCard label="Scrap Value" value={formatCurrency(totalValue)} icon={Recycle} tone="success" />
      </div>

      <MobileScrapGenerationsList items={serialized} />

      {scraps.length === 0 && (
        <>
          <MobileSectionTitle>Recent Scrap</MobileSectionTitle>
          <MobileEmptyState
            icon={Recycle}
            title="No scrap generated"
            hint="Scrap is auto-detected from DPR variance analysis, or add it manually from the desktop Stock section"
          />
        </>
      )}

      {canCreate && <MobileFab href="/scrap-generations" icon={Plus} label="New Scrap" />}
    </div>
  );
}
