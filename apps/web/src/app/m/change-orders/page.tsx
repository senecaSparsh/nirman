import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { GitBranch, Plus } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileChangeOrdersList } from "./MobileChangeOrdersList";
import { MobileChangeOrdersFab } from "./MobileChangeOrdersFab";

/**
 * /m/change-orders — mobile change order management.
 * Track formal modifications to project scope, BOQ, budget, and schedule.
 */
export default function MobileChangeOrdersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileChangeOrdersContent />
    </Suspense>
  );
}

async function MobileChangeOrdersContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const [changeOrders, projects] = await Promise.all([
    prisma.changeOrder.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        project: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
    canManage
      ? prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const draft = changeOrders.filter((c) => c.status === "DRAFT").length;
  const pending = changeOrders.filter((c) => c.status === "SUBMITTED").length;
  const approved = changeOrders.filter((c) => c.status === "APPROVED" || c.status === "IMPLEMENTED").length;

  const serialized = changeOrders.map((c) => ({
    id: c.id,
    changeOrderNo: c.changeOrderNo,
    title: c.title,
    status: c.status,
    type: c.type,
    reason: c.reason,
    projectName: c.project.name,
    phaseName: c.phase?.name ?? null,
    lineCount: c._count.lines,
    costDelta: toNum(c.costDelta),
    scheduleDeltaDays: c.scheduleDeltaDays,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <MobileStatCard label="Draft" value={String(draft)} icon={GitBranch} tone={draft > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Pending" value={String(pending)} icon={GitBranch} tone={pending > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Approved" value={String(approved)} icon={GitBranch} tone={approved > 0 ? "go" : "neutral"} />
      </div>

      <MobileExportShareBar
        title="Change Orders"
        rows={serialized as unknown as Record<string, unknown>[]}
        columns={[
          { key: "changeOrderNo", label: "CO Number" },
          { key: "title", label: "Title" },
          { key: "projectName", label: "Project" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "costDelta", label: "Cost Delta", format: "currency" },
        ] as MobileColumnSpec[]}
        summary={`${serialized.length} change orders`}
      />

      <MobileChangeOrdersList items={serialized} />

      {changeOrders.length === 0 && (
        <MobileEmptyState
          icon={GitBranch}
          title="No change orders"
          hint={
            canManage
              ? projects.length === 0
                ? "Create a project first, then track scope changes here"
                : "Tap + to create a change order for a project"
              : "Change orders will appear here"
          }
          action={
            canManage && projects.length === 0 ? (
              <MobileCta href="/m/projects" icon={Plus} variant="primary">Go to Projects</MobileCta>
            ) : undefined
          }
        />
      )}

      {canManage && projects.length > 0 && (
        <MobileChangeOrdersFab projects={projects} />
      )}
    </div>
  );
}
