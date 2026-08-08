import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wrench } from "lucide-react";
import { getCompany } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileEquipmentList } from "./MobileEquipmentList";

/**
 * /m/equipment — mobile equipment list. Replaces every desktop
 * `/equipment` link from the mobile surface.
 */
export default function MobileEquipmentPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileEquipmentContent />
    </Suspense>
  );
}

async function MobileEquipmentContent() {
  await connection();
  const company = await getCompany();

  const equipment = await prisma.equipment.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    take: 60,
    select: {
      id: true,
      name: true,
      status: true,
      category: true,
      assetTag: true,
      assignments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: { project: { select: { name: true } } },
      },
    },
  });

  const active = equipment.filter((e) => e.status !== "RETIRED");
  const available = active.filter((e) => e.status === "AVAILABLE");
  const inMaintenance = active.filter((e) => e.status === "IN_MAINTENANCE");
  const retired = equipment.filter((e) => e.status === "RETIRED");

  // Serialize for the client component (search + filter chips + badges)
  const serialized = equipment.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    category: e.category ?? null,
    assetTag: e.assetTag,
    assignedProjectName: e.assignments[0]?.project?.name ?? null,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Equipment"
        subtitle={`${active.length} active · ${equipment.length} total`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Available" value={formatNumber(available.length, 0)} icon={Wrench} tone="success" />
        <MobileStatCard label="In Maintenance" value={formatNumber(inMaintenance.length, 0)} icon={Wrench} tone={inMaintenance.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="Retired" value={formatNumber(retired.length, 0)} icon={Wrench} />
        <MobileStatCard label="Total" value={formatNumber(equipment.length, 0)} icon={Wrench} />
      </div>

      <MobileEquipmentList items={serialized} />

      {equipment.length === 0 && (
        <>
          <MobileSectionTitle>All Equipment</MobileSectionTitle>
          <MobileEmptyState icon={Wrench} title="No equipment" hint="Add equipment from the desktop Setup" />
        </>
      )}
    </div>
  );
}
