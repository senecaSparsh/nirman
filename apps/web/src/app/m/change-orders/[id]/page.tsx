import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { notFound } from "next/navigation";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobileChangeOrderDetailClient } from "./MobileChangeOrderDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

export default async function MobileChangeOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} managePerm={PERM.WO_MANAGE} skeletonSections={6}>
      {async ({ id, company, canManage }) => {
        const co = await prisma.changeOrder.findUnique({
          where: { id },
          include: {
            project: { select: { id: true, name: true, totalBudget: true } },
            phase: { select: { id: true, name: true } },
            lines: {
              orderBy: { sortOrder: "asc" },
              include: {
                boqItem: { select: { id: true, serialNo: true, description: true, unit: true } },
              },
            },
            submittedBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
            implementedBy: { select: { id: true, name: true } },
          },
        });

        if (!co || co.companyId !== company.id) notFound();

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
            notes: l.notes,
          })),
        };

        return (
          <PageContextProvider value={{
            entityType: "changeOrder",
            status: co.status,
            label: co.changeOrderNo,
            subtitle: co.project.name,
            recordId: co.id,
          }}>
            <MobileChangeOrderDetailClient co={serialized} canManage={canManage} />
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
