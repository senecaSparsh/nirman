import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wrench, Calendar, IndianRupee, MapPin, User, Settings, Package } from "lucide-react";
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
    where: { id, companyId: company.id },
    include: {
      project: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      maintenanceRecords: { orderBy: { date: "desc" }, take: 10 },
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

  const canManage = hasPermission(role, PERM.EQUIPMENT_MANAGE);

  return (
    <div>
      <MobileDetailHeader
        title={equipment.name}
        subtitle={equipment.code ?? "no code"}
        backHref="/m/equipment"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Wrench} title="Category" value={equipment.category} />
        <MobileInfoRow icon={Settings} title="Status" value={equipment.status} />
        {equipment.project && (
          <MobileInfoRow icon={MapPin} title="Project" value={equipment.project.name} />
        )}
        {equipment.assignedTo && (
          <MobileInfoRow icon={User} title="Assigned To" value={equipment.assignedTo.name} />
        )}
        <MobileInfoRow icon={Calendar} title="Purchase Date" value={formatDate(equipment.purchaseDate)} />
      </div>

      <MobileSectionTitle>Valuation</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Purchase Cost"
          value={formatCurrency(toNum(equipment.purchaseCost))}
          icon={IndianRupee}
        />
        <MobileStatCard
          label="Current Value"
          value={formatCurrency(toNum(equipment.currentValue))}
          icon={IndianRupee}
          tone="brand"
        />
      </div>

      {equipment.maintenanceRecords.length > 0 && (
        <>
          <MobileSectionTitle>Recent Maintenance</MobileSectionTitle>
          <div>
            {equipment.maintenanceRecords.map((m) => (
              <MobileRow
                key={m.id}
                icon={Settings}
                title={m.description}
                subtitle={`${formatDate(m.date)}${m.cost ? " · " + formatCurrency(toNum(m.cost)) : ""}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
