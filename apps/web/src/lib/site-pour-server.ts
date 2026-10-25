import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { deriveSitePour, forecastFinish, summarizeDemands, type SiteProgress } from "@/lib/site-pour";

export type { SiteProgress };

/**
 * Everything the project's site-progress card shows, from the full project
 * record (no list truncation): how far along, when it will finish, and
 * which buyer demand the next milestone raises. Caller has already
 * authorised access to the project.
 */
export async function loadSiteProgress(projectId: string): Promise<SiteProgress | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { startDate: true, endDate: true, stockLocations: { where: { deletedAt: null }, select: { id: true } } },
  });
  if (!project) return null;
  const locationIds = project.stockLocations.map((l) => l.id);

  const [boqItems, wbsNodes, mbEntries, dprs, cement, clpItems] = await Promise.all([
    prisma.boqItem.findMany({
      where: { projectId, type: "LINE_ITEM" },
      select: { id: true, estimatedQty: true, rate: true, estimatedAmount: true },
    }),
    prisma.wbsNode.findMany({
      where: { projectId },
      select: { type: true, boqItemId: true, progressPct: true, plannedStart: true, plannedEnd: true },
    }),
    prisma.measurementBookEntry.findMany({
      where: { projectId, status: "APPROVED" },
      select: { boqItemId: true, measuredQty: true, status: true },
    }),
    prisma.dailyProgressReport.findMany({
      where: { projectId },
      orderBy: { date: "asc" },
      select: { date: true, progressPct: true },
    }),
    locationIds.length
      ? prisma.stockMovement.aggregate({
          _sum: { qty: true },
          where: {
            movementType: "ISSUE_TO_PROJECT",
            toLocationId: { in: locationIds },
            material: {
              OR: [
                { name: { contains: "cement", mode: "insensitive" } },
                { category: { name: { contains: "cement", mode: "insensitive" } } },
              ],
            },
          },
        })
      : Promise.resolve({ _sum: { qty: null } }),
    prisma.paymentScheduleItem.findMany({
      where: {
        status: { in: ["PENDING", "DUE", "PARTIAL"] },
        paymentSchedule: { type: "CLP", assetSale: { projectId, status: { not: "CANCELLED" } } },
      },
      select: {
        status: true,
        totalAmount: true,
        paidAmount: true,
        wbsNodeId: true,
        wbsNode: { select: { name: true, progressPct: true } },
        paymentSchedule: { select: { assetSaleId: true } },
      },
    }),
  ]);

  const dprHistory = dprs.map((d) => ({ date: d.date, progressPct: toNum(d.progressPct) }));
  const pour = deriveSitePour({
    boqItems: boqItems.map((b) => ({
      id: b.id,
      estimatedQty: b.estimatedQty == null ? null : toNum(b.estimatedQty),
      rate: b.rate == null ? null : toNum(b.rate),
      estimatedAmount: b.estimatedAmount == null ? null : toNum(b.estimatedAmount),
    })),
    wbsNodes: wbsNodes.map((n) => ({
      type: n.type,
      boqItemId: n.boqItemId,
      progressPct: toNum(n.progressPct),
      plannedStart: n.plannedStart,
      plannedEnd: n.plannedEnd,
    })),
    mbEntries: mbEntries.map((m) => ({ boqItemId: m.boqItemId, measuredQty: toNum(m.measuredQty), status: m.status })),
    dprs: dprHistory,
    cementQty: cement._sum.qty ? toNum(cement._sum.qty) : 0,
  });
  if (!pour) return null;

  return {
    ...pour,
    schedule: forecastFinish({
      progress: pour.progress,
      history: dprHistory,
      plannedStart: project.startDate,
      plannedEnd: project.endDate,
    }),
    demands: summarizeDemands(
      clpItems.map((i) => ({
        status: i.status,
        totalAmount: toNum(i.totalAmount),
        paidAmount: toNum(i.paidAmount),
        assetSaleId: i.paymentSchedule.assetSaleId,
        wbsNodeId: i.wbsNodeId,
        milestone: i.wbsNode?.name ?? null,
        milestoneProgress: i.wbsNode ? toNum(i.wbsNode.progressPct) : null,
      })),
    ),
  };
}
