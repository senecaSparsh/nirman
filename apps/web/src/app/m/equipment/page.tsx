import { prisma } from "@nirman/db";
import { toNum, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatCurrencyCompact } from "@/lib/utils";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileEquipmentList } from "./MobileEquipmentList";
import { MobileEquipmentFab } from "./MobileEquipmentFab";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/equipment — mobile equipment list. Shows all company equipment
 * with status, category, and active assignment. Supervisors need to
 * see what's available, what's assigned, and what's in maintenance.
 */
export default function MobileEquipmentPage() {
  return (
    <MobileListPage managePerm={PERM.ASSETS_MANAGE}>
      {async ({ company, canManage }) => {
        // Scope-aware action permissions (for FAB gating)
        const actions = await getActionPermissions();
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
          <div>
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
              canCreate={canManage}
              canEdit={canManage}
              exportTitle="Equipment"
              exportRows={serialized as unknown as Record<string, unknown>[]}
              exportColumns={
                [
                  { key: "name", label: "Name" },
                  { key: "assetTag", label: "Asset Tag" },
                  { key: "category", label: "Category" },
                  { key: "status", label: "Status" },
                  { key: "currentValue", label: "Value", format: "currency" },
                  { key: "assignedProjectName", label: "Assigned To" },
                ] as MobileColumnSpec[]
              }
              exportSummary={`${equipment.length} items · ${formatCurrencyCompact(totalValue)} total value`}
            />
            {actions.canCreateEquipment && <MobileEquipmentFab />}
          </div>
        );
      }}
    </MobileListPage>
  );
}
