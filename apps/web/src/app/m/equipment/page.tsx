import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileEquipmentList } from "./MobileEquipmentList";

/**
 * /m/equipment — mobile equipment list. Shows all company equipment
 * with status, category, and active assignment. Supervisors need to
 * see what's available, what's assigned, and what's in maintenance.
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
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.ASSETS_MANAGE);

  const equipment = await prisma.equipment.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      status: true,
      category: true,
      assetTag: true,
      model: true,
      currentValue: true,
      assignments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          id: true,
          project: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
  });

  const available = equipment.filter((e) => e.status === "AVAILABLE");
  const assigned = equipment.filter((e) => e.status === "ASSIGNED");
  const inMaintenance = equipment.filter((e) => e.status === "IN_MAINTENANCE");
  const retired = equipment.filter((e) => e.status === "RETIRED");
  const totalValue = equipment.reduce((s, e) => s + toNum(e.currentValue), 0);

  // Serialize for the client component
  const serialized = equipment.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    category: e.category ?? null,
    assetTag: e.assetTag,
    model: e.model ?? null,
    currentValue: toNum(e.currentValue),
    assignmentId: e.assignments[0]?.id ?? null,
    assignedProjectName: e.assignments[0]?.project?.name ?? null,
    assignedLocationName: e.assignments[0]?.location?.name ?? null,
  }));

  return (
    <MobileEquipmentList
      items={serialized}
      counts={{
        total: equipment.length,
        available: available.length,
        assigned: assigned.length,
        inMaintenance: inMaintenance.length,
        retired: retired.length,
        totalValue,
      }}
      canCreate={canCreate}
    />
  );
}
