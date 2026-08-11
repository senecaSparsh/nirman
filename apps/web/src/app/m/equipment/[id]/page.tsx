import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wrench, Calendar, IndianRupee, MapPin, Settings } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

export default function MobileEquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileEquipmentDetailContent params={params} />
    </Suspense>
  );
}

async function MobileEquipmentDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const equipment = await prisma.equipment.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      assignments: {
        where: { status: "ACTIVE" },
        include: { project: { select: { id: true, name: true } } },
        take: 1,
      },
      maintenance: { orderBy: { startDate: "desc" }, take: 10 },
    },
  });

  if (!equipment) {
    return (
      <div>
        <MobileDetailHeader title="Equipment" backHref="/m/equipment" />
        <MobileEmptyState icon={Wrench} title="Equipment not found" />
      </div>
    );
  }

  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);
  const activeAssignment = equipment.assignments[0];

  return (
    <div>
      <MobileDetailHeader
        title={equipment.name}
        subtitle={equipment.assetTag}
        backHref="/m/equipment"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Wrench} title="Category" value={equipment.category ?? "—"} />
        <MobileInfoRow icon={Settings} title="Status" value={<MobileStatusBadge status={equipment.status} />} />
        {activeAssignment?.project && (
          <MobileInfoRow icon={MapPin} title="Project" value={activeAssignment.project.name} />
        )}
        {equipment.purchaseDate && (
          <MobileInfoRow icon={Calendar} title="Purchase Date" value={formatDate(equipment.purchaseDate)} />
        )}
      </div>

      <MobileSectionTitle>Valuation</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Acquisition Cost"
          value={formatCurrency(toNum(equipment.acquisitionCost))}
          icon={IndianRupee}
        />
        <MobileStatCard
          label="Current Value"
          value={formatCurrency(toNum(equipment.currentValue))}
          icon={IndianRupee}
          tone="brand"
        />
      </div>

      {equipment.maintenance.length > 0 && (
        <>
          <MobileSectionTitle>Recent Maintenance</MobileSectionTitle>
          <div>
            {equipment.maintenance.map((m) => (
              <MobileRow
                key={m.id}
                icon={Settings}
                title={m.type}
                subtitle={`${formatDate(m.startDate)}${toNum(m.cost) > 0 ? " · " + formatCurrency(toNum(m.cost)) : ""}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
