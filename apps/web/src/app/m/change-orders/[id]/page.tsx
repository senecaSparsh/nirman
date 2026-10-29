import { prisma } from "@nirman/db";
import { scopeWhere, toNum, getCurrentUser, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { canAutoApprove } from "@nirman/services";
import { resolveNextAction } from "@/lib/flow-map";
import { NextActionCardView } from "@/components/mobile/v2/guidance";
import { notFound } from "next/navigation";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobileChangeOrderDetailClient } from "./MobileChangeOrderDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

export default async function MobileChangeOrderDetailPage({
  params}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} perm={PERM.ASSETS_VIEW} what="change orders" permission="assets.view" managePerm={PERM.WO_MANAGE} skeletonSections={6} scopeAware>
      {async ({ id, company, role, canManage, actingRole }) => {
        const co = await prisma.changeOrder.findFirst({
          where: { id, companyId: company.id, ...await scopeWhere("ChangeOrder") },
          include: {
            project: { select: { id: true, name: true, totalBudget: true } },
            phase: { select: { id: true, name: true } },
            lines: {
              orderBy: { sortOrder: "asc" },
              include: {
                boqItem: { select: { id: true, serialNo: true, description: true, unit: true } }}},
            submittedBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
            implementedBy: { select: { id: true, name: true } }}});

        if (!co) notFound();

        const currentUser = await getCurrentUser();
        const serialized = {
          id: co.id,
          changeOrderNo: co.changeOrderNo,
          title: co.title,
          description: co.description,
          type: co.type,
          reason: co.reason,
          status: co.status,
          projectName: co.project.name,
          phaseName: co.phase?.name ?? null,
          originalAmount: toNum(co.originalAmount),
          revisedAmount: toNum(co.revisedAmount),
          costDelta: toNum(co.costDelta),
          scheduleDeltaDays: co.scheduleDeltaDays,
          clientApprovalRequired: co.clientApprovalRequired,
          clientApprovedBy: co.clientApprovedBy,
          clientApprovedAt: co.clientApprovedAt?.toISOString() ?? null,
          initiatedBy: co.initiatedBy,
          notes: co.notes,
          rejectReason: co.rejectReason,
          createdAt: co.createdAt.toISOString(),
          submittedAt: co.submittedAt?.toISOString() ?? null,
          approvedAt: co.approvedAt?.toISOString() ?? null,
          implementedAt: co.implementedAt?.toISOString() ?? null,
          submittedByName: co.submittedBy?.name ?? null,
          submittedById: co.submittedBy?.id ?? null,
          approvedByName: co.approvedBy?.name ?? null,
          implementedByName: co.implementedBy?.name ?? null,
          lines: co.lines.map((l) => ({
            id: l.id,
            description: l.description,
            originalQty: toNum(l.originalQty),
            revisedQty: toNum(l.revisedQty),
            unit: l.unit,
            rate: toNum(l.rate),
            originalAmount: toNum(l.originalAmount),
            revisedAmount: toNum(l.revisedAmount),
            amountDelta: toNum(l.amountDelta),
            boqItemSerial: l.boqItem?.serialNo ?? null,
            boqItemDescription: l.boqItem?.description ?? null,
            notes: l.notes}))};

        const overrides = await getUserPermissions();
        let nextAction = resolveNextAction("changeOrder", co.status, role, overrides);
        // The submitter can't approve their own CO unless tier-1 —
        // same suppression the action bar applies.
        if (co.status === "SUBMITTED" && co.submittedById === currentUser?.id && !canAutoApprove(actingRole)) {
          nextAction = undefined;
        }

        return (
          <PageContextProvider value={{
            entityType: "changeOrder",
            flowId: "changeOrder",
            status: co.status,
            label: co.changeOrderNo,
            subtitle: co.project.name,
            recordId: co.id}}>
            {nextAction && (
              <NextActionCardView
                label={nextAction.label}
                actionVerb={nextAction.verb}
                reason={nextAction.reason}
                tone={nextAction.tone ?? "signal"}
                hash={nextAction.action.type === "anchor" ? nextAction.action.hash : undefined}
              />
            )}
            <MobileChangeOrderDetailClient co={serialized} canManage={canManage} currentUserId={currentUser?.id ?? null} canSelfApprove={canAutoApprove(actingRole)} />
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
