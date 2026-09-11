import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { ServiceError } from "@nirman/services";
import { getPortalCustomer } from "@/lib/portal-auth";
import { json, ForbiddenError, UnauthorizedError } from "@/lib/server";

/**
 * GET /api/portal/projects — list projects the customer has bookings in,
 * with construction progress (DPR-based updates + photos).
 */
export const GET = async (_req: NextRequest) => {
  try {
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
      where: { id: { in: projectIds }, deletedAt: null },
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
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    if (err instanceof SyntaxError && err.message.includes("JSON")) {
      return json({ error: "Malformed JSON in request body" }, { status: 400 });
    }
    if (err instanceof ForbiddenError) {
      return json({ error: err.message }, { status: 403 });
    }
    if (err instanceof UnauthorizedError) {
      return json({ error: err.message }, { status: 401 });
    }
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === "P2024") {
      console.error("[apiHandler] Prisma P2024: connection pool exhausted");
      return json({ error: "Database busy — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "5" } });
    }
    if (prismaCode === "P1001") {
      console.error("[apiHandler] Prisma P1001: database unreachable");
      return json({ error: "Database unreachable — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "10" } });
    }
    if (prismaCode === "P1002") {
      console.error("[apiHandler] Prisma P1002: database timeout");
      return json({ error: "Database request timed out — please retry", retryable: true }, { status: 504 });
    }
    console.error("[apiHandler] Unhandled error:", err);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
