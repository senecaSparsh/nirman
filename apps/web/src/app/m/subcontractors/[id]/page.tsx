import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobileSubcontractorDetailClient } from "./MobileSubcontractorDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

/**
 * /m/subcontractors/[id] — subcontractor detail.
 *
 * Purpose: a site manager or procurement user opens this to see who the
 * subcontractor is, what trade they do, their work orders (scope + billing),
 * project costs recorded against them, and material issues they received.
 *
 * The subcontractor is the anchor; their work orders, costs, and issues
 * radiate from here.
 */
export default function MobileSubcontractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} managePerm={PERM.PROCUREMENT_MANAGE}>
      {async ({ id, company, canManage }) => {
        const subcontractor = await prisma.subcontractor.findFirst({
          where: { id, companyId: company.id, deletedAt: null },
          include: {
            workOrders: {
              orderBy: { createdAt: "desc" },
              take: 20,
              include: { project: { select: { id: true, name: true } } },
            },
            projectCosts: {
              orderBy: { createdAt: "desc" },
              take: 20,
              include: { project: { select: { id: true, name: true } } },
            },
            materialIssues: {
              orderBy: { createdAt: "desc" },
              take: 10,
              include: { project: { select: { id: true, name: true } } },
            },
          },
        });

        if (!subcontractor) {
          return (
            <MobileSubcontractorDetailClient notFound canManage={canManage} />
          );
        }

        // ── Work orders ──
        const workOrders = subcontractor.workOrders.map((w) => ({
          id: w.id,
          workOrderNumber: w.workOrderNumber,
          workTitle: w.workTitle,
          status: w.status,
          issueDate: w.issueDate.toISOString(),
          projectName: w.project?.name ?? "Standalone",
          totalWorkDone: toNum(w.totalWorkDone),
          totalPaid: toNum(w.totalPaid),
          retentionBalance: toNum(w.retentionBalance),
        }));

        // ── Project costs ──
        const projectCosts = subcontractor.projectCosts.map((c) => ({
          id: c.id,
          costType: c.costType,
          amount: toNum(c.amount),
          date: c.date.toISOString(),
          vendor: c.vendor ?? null,
          notes: c.notes ?? null,
          projectName: c.project?.name ?? "Standalone",
        }));

        // ── Material issues ──
        const materialIssues = subcontractor.materialIssues.map((m) => ({
          id: m.id,
          issueNumber: m.issueNumber ?? null,
          issueDate: m.issueDate.toISOString(),
          status: m.status,
          totalCost: toNum(m.totalCost),
          projectName: m.project?.name ?? null,
        }));

        const totalWorkDone = workOrders.reduce((s, w) => s + w.totalWorkDone, 0);
        const totalPaid = workOrders.reduce((s, w) => s + w.totalPaid, 0);
        const totalCosts = projectCosts.reduce((s, c) => s + c.amount, 0);
        const activeJobs = workOrders.filter(
          (w) => w.status === "ACTIVE" || w.status === "ISSUED",
        ).length;

        const data = {
          id: subcontractor.id,
          name: subcontractor.name,
          phone: subcontractor.phone,
          email: subcontractor.email,
          gstin: subcontractor.gstin,
          address: subcontractor.address,
          trade: subcontractor.trade,
          createdAt: subcontractor.createdAt.toISOString(),
          workOrders,
          projectCosts,
          materialIssues,
          totals: {
            totalWorkDone,
            totalPaid,
            totalCosts,
            activeJobs,
            workOrderCount: workOrders.length,
          },
        };

        return (
          <PageContextProvider value={{
            entityType: "subcontractor",
            label: subcontractor.name,
            subtitle: subcontractor.trade ?? undefined,
            recordId: subcontractor.id,
          }}>
          <MobileSubcontractorDetailClient
            data={data}
            canManage={canManage}
          />
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
