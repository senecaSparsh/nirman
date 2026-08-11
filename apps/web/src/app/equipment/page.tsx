import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { EquipmentView } from "@/components/equipment/equipment-view";
import { PageLoading } from "@/components/page-loading";
import type {
  EquipmentRow, StockLocationRow, ProjectOption,
} from "@/lib/types";

import { NoAccess } from "@/components/no-access";
export default function EquipmentPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading equipment…" variant="board" />}>
        <EquipmentContent />
      </Suspense>
    </div>
  );
}

async function EquipmentContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return (
      <NoAccess what="equipment" />
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.ASSETS_MANAGE),
    canEdit: hasPermission(role, PERM.ASSETS_MANAGE),
  };

  const [equipment, locations, projects] = await Promise.all([
    prisma.equipment.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        assignments: {
          where: { status: "ACTIVE" },
          take: 1,
          include: {
            location: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        stockItems: { select: { qty: true, movingAvgCost: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);

  const equipmentRows: EquipmentRow[] = equipment.map((e) => {
    const active = e.assignments[0] ?? null;
    return {
      id: e.id,
      assetTag: e.assetTag,
      name: e.name,
      model: e.model,
      serialNumber: e.serialNumber,
      category: e.category,
      status: e.status,
      acquisitionCost: toNum(e.acquisitionCost),
      currentValue: toNum(e.currentValue),
      purchaseDate: e.purchaseDate?.toISOString() ?? null,
      notes: e.notes,
      activeAssignment: active
        ? {
            id: active.id,
            locationId: active.locationId,
            locationName: active.location.name,
            projectId: active.projectId,
            projectName: active.project?.name ?? null,
            assignedAt: active.assignedAt.toISOString(),
          }
        : null,
    };
  });

  const locationRows: StockLocationRow[] = locations.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    address: l.address,
    projectId: l.projectId,
    projectName: l.project?.name ?? null,
    stockValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
    companyId: company.id,
    companyName: company.name,
  }));

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
  }));

  const available = equipmentRows.filter((e) => e.status === "AVAILABLE").length;
  const assigned = equipmentRows.filter((e) => e.status === "ASSIGNED").length;
  const maintenance = equipmentRows.filter((e) => e.status === "IN_MAINTENANCE").length;
  const totalValue = equipmentRows.reduce((s, e) => s + e.currentValue, 0);

  return (
    <>
      <PageHeader
        title="Equipment"
        description="Trackable assets — machinery, tools, and vehicles. Track assignments, maintenance, and depreciation."
        stats={[
          { label: "Total", value: equipmentRows.length },
          { label: "Available", value: available },
          { label: "Assigned", value: assigned },
          { label: "Maintenance", value: maintenance },
          { label: "Value", value: formatCurrency(totalValue) },
        ]}
      />
      <EquipmentView
        equipment={equipmentRows}
        locations={locationRows}
        projects={projectRows}
        permissions={perms}
      />
    </>
  );
}
