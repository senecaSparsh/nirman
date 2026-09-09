import { prisma } from "@nirman/db";
import { toNum, scopeWhere, getActionPermissions, filterOptionsByScope } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { Wrench } from "lucide-react";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileWorkOrdersList } from "./MobileWorkOrdersList";
import { MobileWorkOrdersFab } from "./MobileWorkOrdersFab";
import { MobileWorkOrdersEmptyState } from "./MobileWorkOrdersEmptyState";

/**
 * /m/work-orders — mobile subcontractor work order management.
 * Issued work orders to subcontractors with BOQ-scoped scope and RA bill tracking.
 */
export default function MobileWorkOrdersPage() {
  return (
    <MobileListPage managePerm={PERM.ASSETS_MANAGE}>
      {async ({ company, canManage }) => {
        // Scope-aware action permissions (for FAB gating)
        const actions = await getActionPermissions();
        const [workOrders, projects, subcontractors] = await Promise.all([
          prisma.subcontractorWorkOrder.findMany({
            where: {...await scopeWhere("SubcontractorWorkOrder"),  companyId: company.id },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              subcontractor: { select: { id: true, name: true, trade: true } },
              project: { select: { id: true, name: true } },
              _count: { select: { raBills: true, lines: true } },
            },
          }),
          actions.canCreateWorkOrder
            ? filterOptionsByScope(
                await prisma.project.findMany({
                  where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
                  orderBy: { name: "asc" },
                  select: { id: true, name: true },
                }),
                actions.allowedProjectIds,
              )
            : [],
          actions.canCreateWorkOrder
            ? prisma.subcontractor.findMany({
                where: { companyId: company.id, deletedAt: null },
                orderBy: { name: "asc" },
                select: { id: true, name: true, trade: true },
              })
            : [],
        ]);

        const draft = workOrders.filter((w) => w.status === "DRAFT").length;
        const active = workOrders.filter((w) => w.status === "ACTIVE" || w.status === "ISSUED").length;
        const completed = workOrders.filter((w) => w.status === "COMPLETED" || w.status === "CLOSED").length;

        const serialized = workOrders.map((w) => ({
          id: w.id,
          workOrderNumber: w.workOrderNumber,
          workTitle: w.workTitle,
          status: w.status,
          subcontractorName: w.subcontractor.name,
          subcontractorTrade: w.subcontractor.trade ?? null,
          projectName: w.project.name,
          lineCount: w._count.lines,
          raBillCount: w._count.raBills,
          startDate: w.startDate?.toISOString() ?? null,
          endDate: w.endDate?.toISOString() ?? null,
          retentionPct: toNum(w.retentionPct),
          advanceAmount: w.advanceAmount ? toNum(w.advanceAmount) : null,
        }));

        return (
          <div>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              <MobileStatCard label="Draft" value={String(draft)} icon={Wrench} tone={draft > 0 ? "signal" : "neutral"} />
              <MobileStatCard label="Active" value={String(active)} icon={Wrench} tone={active > 0 ? "go" : "neutral"} />
              <MobileStatCard label="Completed" value={String(completed)} icon={Wrench} />
            </div>

            <MobileWorkOrdersList
              items={serialized}
              exportTitle="Work Orders"
              exportRows={serialized as unknown as Record<string, unknown>[]}
              exportColumns={[
                { key: "workOrderNumber", label: "WO Number" },
                { key: "subcontractorName", label: "Subcontractor" },
                { key: "projectName", label: "Project" },
                { key: "workTitle", label: "Scope" },
                { key: "status", label: "Status" },
                { key: "advanceAmount", label: "Advance", format: "currency" },
              ] as MobileColumnSpec[]}
              exportSummary={`${serialized.length} work orders`}
            />

            {workOrders.length === 0 && (
              <MobileWorkOrdersEmptyState
                canManage={canManage}
                hasProjects={projects.length > 0}
                hasSubcontractors={subcontractors.length > 0}
              />
            )}

            {actions.canCreateWorkOrder && projects.length > 0 && subcontractors.length > 0 && (
              <MobileWorkOrdersFab projects={projects} subcontractors={subcontractors} />
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
