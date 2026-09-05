import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { getPortalCustomer } from "@/lib/portal-auth";

/**
 * GET /api/portal/projects — list projects the customer has bookings in,
 * with construction progress (DPR-based updates + photos).
 */
export const GET = async (_req: NextRequest) => {
  const customer = await getPortalCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  // Get the customer's sales to find their projects
  const sales = await prisma.assetSale.findMany({
    where: { customerId: customer.id, status: "ACTIVE", projectId: { not: null } },
    select: { projectId: true },
    distinct: ["projectId"],
  });

  const projectIds = [...new Set(sales.map((s) => s.projectId).filter(Boolean))] as string[];
  if (projectIds.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      address: true,
      _count: { select: { builtUnits: true } },
    },
  });

  // Get DPRs for these projects (last 10 per project, only approved ones for customer view)
  const dprs = await prisma.dailyProgressReport.findMany({
    where: { projectId: { in: projectIds }, approvalStatus: "APPROVED" },
    orderBy: { date: "desc" },
    take: 30,
    select: {
      id: true,
      date: true,
      workSummary: true,
      progressPct: true,
      photoUrls: true,
      projectId: true,
    },
  });

  // Group DPRs by project
  const dprsByProject = new Map<string, typeof dprs>();
  for (const dpr of dprs) {
    const arr = dprsByProject.get(dpr.projectId) ?? [];
    arr.push(dpr);
    dprsByProject.set(dpr.projectId, arr);
  }

  return NextResponse.json({
    projects: projects.map((p) => {
      const projectDprs = dprsByProject.get(p.id) ?? [];
      const latestProgress = projectDprs[0]?.progressPct
        ? Number(projectDprs[0].progressPct)
        : 0;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        startDate: p.startDate?.toISOString() ?? null,
        endDate: p.endDate?.toISOString() ?? null,
        address: p.address,
        totalUnits: p._count.builtUnits,
        progressPct: latestProgress,
        latestUpdates: projectDprs.slice(0, 5).map((d) => ({
          id: d.id,
          date: d.date.toISOString(),
          summary: d.workSummary,
          photos: d.photoUrls.slice(0, 4),
        })),
      };
    }),
  });
};
