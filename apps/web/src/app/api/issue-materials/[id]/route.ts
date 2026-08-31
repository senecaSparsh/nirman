import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { cancelMaterialIssue, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/issue-materials/[id] — fetch a single material issue by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const issue = await prisma.materialIssue.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, code: true } },
      fromLocation: { select: { id: true, name: true } },
      subcontractor: { select: { id: true, name: true } },
      issuedBy: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
    },
  });
  if (!issue) return json({ error: "Material issue not found" }, { status: 404 });
  return json(issue);
});

/**
 * PATCH /api/issue-materials/[id] — cancel a material issue.
 * Reverses stock (ADJUSTMENT_IN), GL entries, and project cost reallocation.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  if (action === "cancel") {
    try {
      const result = await cancelMaterialIssue(id, user.id);
      return json({ id: result.id, status: result.status });
    } catch (err: unknown) {
      return json({ error: err instanceof ServiceError ? err.message : "Failed to cancel issue" }, { status: err instanceof ServiceError ? err.status : 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
});
