import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ScanLine, Plus } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
  MobileFab,
} from "@/components/mobile/mobile-primitives";
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
    where: { location: { companyId: company.id } },
    orderBy: { countDate: "desc" },
    take: 80,
    include: {
      location: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });

  const draft = counts.filter((c) => c.status === "DRAFT");
  const counted = counts.filter((c) => c.status === "COUNTED");
  const reconciled = counts.filter((c) => c.status === "RECONCILED");

  // Serialize for client component
  const serialized = counts.map((c) => ({
    id: c.id,
    status: c.status,
    countDate: c.countDate.toISOString(),
    locationName: c.location.name,
    lineCount: c._count.lines,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Stock Counts"
        subtitle={`${counts.length} total · ${draft.length} pending`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        <MobileStatCard label="Draft" value={String(draft.length)} icon={ScanLine} tone={draft.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="Counted" value={String(counted.length)} icon={ScanLine} />
        <MobileStatCard label="Reconciled" value={String(reconciled.length)} icon={ScanLine} tone="success" />
      </div>

      <MobileStockCountsList items={serialized} />

      {counts.length === 0 && (
        <>
          <MobileSectionTitle>Recent</MobileSectionTitle>
          <MobileEmptyState
            icon={ScanLine}
            title="No stock counts"
            hint="Start a physical verification from the desktop Stock section"
          />
        </>
      )}

      {canCreate && <MobileFab href="/stock-counts" icon={Plus} label="New Count" />}
    </div>
  );
}
