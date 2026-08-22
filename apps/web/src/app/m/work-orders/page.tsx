import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wrench, Plus } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileWorkOrdersList } from "./MobileWorkOrdersList";
import { MobileWorkOrdersFab } from "./MobileWorkOrdersFab";

/**
 * /m/work-orders — mobile subcontractor work order management.
 * Issued work orders to subcontractors with BOQ-scoped scope and RA bill tracking.
 */
export default function MobileWorkOrdersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileWorkOrdersContent />
    </Suspense>
  );
}

async function MobileWorkOrdersContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.ASSETS_MANAGE);

  const [workOrders, projects, subcontractors] = await Promise.all([
    prisma.subcontractorWorkOrder.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        subcontractor: { select: { id: true, name: true, trade: true } },
        project: { select: { id: true, name: true } },
        _count: { select: { raBills: true, lines: true } },
      },
    }),
    canManage
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
    canManage
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
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <MobileStatCard label="Draft" value={String(draft)} icon={Wrench} tone={draft > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Active" value={String(active)} icon={Wrench} tone={active > 0 ? "go" : "neutral"} />
        <MobileStatCard label="Completed" value={String(completed)} icon={Wrench} />
      </div>

      <MobileExportShareBar
        title="Work Orders"
        rows={serialized as unknown as Record<string, unknown>[]}
        columns={[
          { key: "workOrderNumber", label: "WO Number" },
          { key: "subcontractorName", label: "Subcontractor" },
          { key: "projectName", label: "Project" },
          { key: "workTitle", label: "Scope" },
          { key: "status", label: "Status" },
          { key: "advanceAmount", label: "Advance", format: "currency" },
        ] as MobileColumnSpec[]}
        summary={`${serialized.length} work orders`}
      />

      <MobileWorkOrdersList items={serialized} />

      {workOrders.length === 0 && (
        <MobileEmptyState
          icon={Wrench}
          title="No work orders"
          hint={
            canManage
              ? projects.length === 0
                ? "Create a project first, then issue work orders to subcontractors"
                : subcontractors.length === 0
                  ? "Add subcontractor suppliers first, then issue work orders"
                  : "Tap + to issue a work order to a subcontractor"
              : "Work orders will appear here"
          }
          action={
            canManage ? (
              projects.length === 0 ? (
                <MobileCta href="/m/projects" icon={Plus} variant="primary">Go to Projects</MobileCta>
              ) : subcontractors.length === 0 ? (
                <MobileCta href="/m/suppliers/new" icon={Plus} variant="primary">Add Subcontractor</MobileCta>
              ) : undefined
            ) : undefined
          }
        />
      )}

      {canManage && projects.length > 0 && subcontractors.length > 0 && (
        <MobileWorkOrdersFab projects={projects} subcontractors={subcontractors} />
      )}
    </div>
  );
}
