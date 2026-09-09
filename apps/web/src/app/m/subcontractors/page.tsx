import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { getActionPermissions } from "@/lib/server";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {type MobileColumnSpec} from "@/components/mobile/v2/export-share-bar";
import { MobileSubcontractorsList, type SubcontractorListItem } from "./MobileSubcontractorsList";

/**
 * /m/subcontractors — mobile subcontractor directory. Shows trade,
 * work order counts, and contact info so site managers and procurement
 * can quickly find the right subcontractor for a job.
 */
export default function MobileSubcontractorsPage() {
  return (
    <MobileListPage managePerm={PERM.PROCUREMENT_MANAGE}>
      {async ({ company, canManage }) => {
        const actions = await getActionPermissions();
        const canCreate = actions?.canCreateSubcontractor ?? canManage;
        const subcontractors = await prisma.subcontractor.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: { name: "asc" },
          take: 80,
          include: {
            _count: {
              select: {
                workOrders: true,
                materialIssues: true,
                projectCosts: true,
              },
            },
          },
        });

        const rows: SubcontractorListItem[] = subcontractors.map((s) => ({
          id: s.id,
          name: s.name,
          gstin: s.gstin ?? null,
          phone: s.phone ?? null,
          trade: s.trade ?? null,
          workOrderCount: s._count.workOrders,
          materialIssueCount: s._count.materialIssues,
          projectCostCount: s._count.projectCosts,
        }));

        const totalWorkOrders = rows.reduce((s, sub) => s + sub.workOrderCount, 0);
        const activeTrades = new Set(rows.map((r) => r.trade).filter(Boolean)).size;

        const exportColumns: MobileColumnSpec[] = [
          { key: "name", label: "Name" },
          { key: "trade", label: "Trade" },
          { key: "phone", label: "Phone" },
          { key: "gstin", label: "GSTIN" },
          { key: "workOrderCount", label: "Work Orders" },
        ];

        return (
          <div>
            <MobileSubcontractorsList
              items={rows}
              totalWorkOrders={totalWorkOrders}
              activeTrades={activeTrades}
              canCreate={canCreate}
              exportTitle="Subcontractors"
              exportRows={rows as unknown as Record<string, unknown>[]}
              exportColumns={exportColumns}
              exportSummary={`${rows.length} subcontractors · ${activeTrades} trades · ${totalWorkOrders} work orders`}
            />
          </div>
        );
      }}
    </MobileListPage>
  );
}
