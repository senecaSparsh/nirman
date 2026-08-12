import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
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
      dprAutoScrap: { select: { id: true } },
      lines: {
        select: {
          qty: true,
          unitCost: true,
          material: { select: { name: true, unit: true } },
        },
      },
    },
  });

  const totalValue = scraps.reduce(
    (s, sc) => s + sc.lines.reduce((ls, l) => ls + toNum(l.qty) * toNum(l.unitCost), 0),
    0,
  );

  const serialized = scraps.map((sc) => ({
    id: sc.id,
    scrapNumber: sc.scrapNumber,
    generationDate: sc.generationDate.toISOString(),
    notes: sc.notes,
    toLocationName: sc.toLocation.name,
    projectName: sc.project?.name ?? null,
    isAuto: !!sc.dprAutoScrap,
    lineCount: sc.lines.length,
    totalValue: sc.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
    materials: sc.lines.map((l) => l.material.name).slice(0, 2),
  }));

  return (
    <MobileScrapGenerationsList
      items={serialized}
      totalValue={totalValue}
      canCreate={canCreate}
    />
  );
}
