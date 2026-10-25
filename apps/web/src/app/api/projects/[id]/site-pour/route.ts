import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, canAccessProject, getCompany, json, requireUser } from "@/lib/server";
import { loadSiteProgress } from "@/lib/site-pour-server";

/**
 * GET /api/projects/[id]/site-pour — live site-progress card data: blended
 * progress (certified MB > WBS > DPR), forecast finish vs plan, and the
 * next construction-linked buyer demand. Polled by the project page so
 * the card moves as real work and approvals land — no reload needed.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const company = await getCompany();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!project || !(await canAccessProject(id))) return json({ error: "Project not found" }, { status: 404 });

  return json({ sitePour: await loadSiteProgress(id) });
});
