import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { VehiclesView, type VehicleRow } from "@/components/vehicles/vehicles-view";

export const dynamic = "force-dynamic";

export default function VehiclesPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading vehicles…" variant="list" />}>
      <VehiclesContent />
    </Suspense>
  );
}

async function VehiclesContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="vehicles" />;
  }

  const vehicles = await prisma.vehicle.findMany({
    take: 500,
    where: { companyId: company.id, deletedAt: null },
    orderBy: { lastUsedAt: "desc" },
    include: {
      trips: {
        orderBy: { timestamp: "desc" },
        take: 1,
        include: {
          fromLocation: { select: { name: true } },
          toLocation: { select: { name: true } },
        },
      },
    },
  });

  const rows: VehicleRow[] = vehicles.map((v) => ({
    id: v.id,
    vehicleNumber: v.vehicleNumber,
    vehicleType: v.vehicleType,
    photoUrl: v.photoUrl,
    driverName: v.driverName,
    driverPhone: v.driverPhone,
    transporterName: v.transporterName,
    tripCount: v.tripCount,
    lastUsedAt: v.lastUsedAt?.toISOString() ?? null,
    lastLocationName: v.trips[0]?.toLocation?.name ?? v.trips[0]?.fromLocation?.name ?? null,
  }));

  const totalTrips = rows.reduce((s, v) => s + v.tripCount, 0);
  const uniqueDrivers = new Set(rows.map((v) => v.driverName).filter(Boolean)).size;
  const uniqueTransporters = new Set(rows.map((v) => v.transporterName).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Auto-built vehicle master — every goods movement (receive, issue, transfer, sale) logs a trip. Track vehicle numbers, drivers, transporters, and trip history."
        stats={[
          { label: "Vehicles", value: rows.length, hint: "Distinct vehicles in the master, auto-built from goods movement trips." },
          { label: "Total Trips", value: totalTrips, hint: "Cumulative trips logged across all vehicles (receives, issues, transfers, sales)." },
          { label: "Drivers", value: uniqueDrivers, hint: "Unique drivers recorded across all vehicle trips." },
          { label: "Transporters", value: uniqueTransporters, hint: "Unique transporters recorded across all vehicle trips." },
        ]}
      />
      <VehiclesView vehicles={rows} />
    </>
  );
}
