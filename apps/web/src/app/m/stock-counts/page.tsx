import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileStockCountsList } from "./MobileStockCountsList";

/**
 * /m/stock-counts — mobile stock count / physical verification list.
 * Supervisors need to see pending and recent counts while on site.
 */
export default function MobileStockCountsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileStockCountsContent />
    </Suspense>
  );
}

async function MobileStockCountsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.INVENTORY_MANAGE);

  const counts = await prisma.stockCount.findMany({
    where: { location: { companyId: company.id, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      location: { select: { id: true, name: true, type: true } },
      lines: { select: { variance: true, materialId: true } },
    },
  });

  const draft = counts.filter((c) => c.status === "DRAFT");
  const counted = counts.filter((c) => c.status === "COUNTED");
  const reconciled = counts.filter((c) => c.status === "RECONCILED");

  // Serialize for client component
  const serialized = counts.map((c) => {
    const totalVariance = c.lines.reduce((s, l) => s + toNum(l.variance), 0);
    const itemsWithVariance = c.lines.filter((l) => {
      const v = toNum(l.variance);
      return v > 0.001 || v < -0.001;
    }).length;
    return {
      id: c.id,
      status: c.status,
      countDate: c.countDate.toISOString(),
      createdAt: c.createdAt.toISOString(),
      locationId: c.location.id,
      locationName: c.location.name,
      locationType: c.location.type,
      lineCount: c.lines.length,
      totalVariance,
      itemsWithVariance,
    };
  });

  return (
    <MobileStockCountsList
      items={serialized}
      counts={{
        total: counts.length,
        draft: draft.length,
        counted: counted.length,
        reconciled: reconciled.length,
      }}
      canCreate={canCreate}
    />
  );
}
