import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobileEquipmentDetailClient } from "./MobileEquipmentDetailClient";
import { RecordRecentItem } from "@/components/mobile/v2/record-recent-item";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

/**
 * /m/equipment/[id] — equipment detail. Shows asset info, valuation,
 * active assignment, maintenance history, and action buttons
 * (assign, return, maintenance, retire) RBAC-gated by `assets.manage`.
 */
export default function MobileEquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} managePerm={PERM.ASSETS_MANAGE} skeletonSections={6}>
      {async ({ id, company, canManage }) => {
        const equipment = await prisma.equipment.findFirst({
          where: { id, companyId: company.id, deletedAt: null },
          include: {
            assignments: {
              orderBy: { assignedAt: "desc" },
              take: 10,
              include: {
                location: { select: { id: true, name: true } },
                project: { select: { id: true, name: true } },
              },
            },
            maintenance: {
              orderBy: { startDate: "desc" },
              take: 10,
            },
          },
        });

        if (!equipment) {
          return (
            <>
              <MobileEquipmentDetailClient
                notFound
                canManage={false}
                locations={[]}
                projects={[]}
              />
            </>
          );
        }

        // Fetch locations and projects for assignment modal
        const [locations, projects] = await Promise.all([
          prisma.stockLocation.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true, type: true },
            orderBy: { name: "asc" },
          }),
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        ]);

        const activeAssignment = equipment.assignments.find((a) => a.status === "ACTIVE");

        const serialized = {
          id: equipment.id,
          assetTag: equipment.assetTag,
          name: equipment.name,
          model: equipment.model,
          serialNumber: equipment.serialNumber,
          category: equipment.category,
          status: equipment.status,
          acquisitionCost: toNum(equipment.acquisitionCost),
          currentValue: toNum(equipment.currentValue),
          purchaseDate: equipment.purchaseDate?.toISOString() ?? null,
          notes: equipment.notes,
          activeAssignment: activeAssignment
            ? {
                id: activeAssignment.id,
                locationId: activeAssignment.locationId,
                locationName: activeAssignment.location.name,
                projectId: activeAssignment.projectId,
                projectName: activeAssignment.project?.name ?? null,
                assignedAt: activeAssignment.assignedAt.toISOString(),
              }
            : null,
          assignments: equipment.assignments.map((a) => ({
            id: a.id,
            locationName: a.location.name,
            projectName: a.project?.name ?? null,
            assignedAt: a.assignedAt.toISOString(),
            returnedAt: a.returnedAt?.toISOString() ?? null,
            status: a.status,
          })),
          maintenance: equipment.maintenance.map((m) => ({
            id: m.id,
            type: m.type,
            startDate: m.startDate.toISOString(),
            endDate: m.endDate?.toISOString() ?? null,
            cost: toNum(m.cost),
            vendor: m.vendor,
            notes: m.notes,
          })),
        };

        return (
          <PageContextProvider value={{
            entityType: "equipment",
            status: equipment.status,
            label: equipment.name,
            subtitle: equipment.serialNumber ?? undefined,
            recordId: equipment.id,
          }}>
          <>
            <RecordRecentItem type="equipment" id={serialized.id} label={serialized.name} sublabel={serialized.serialNumber ?? undefined} href={`/m/equipment/${serialized.id}`} />
            <MobileEquipmentDetailClient
              equipment={serialized}
              canManage={canManage}
              locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type }))}
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            />
          </>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
