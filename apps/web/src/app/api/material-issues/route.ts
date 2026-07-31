import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { issueMaterialsToProject } from "@nirman/services";
import { apiHandler, json, issueMaterialsSchema, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const issues = await prisma.materialIssue.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      fromLocation: { select: { id: true, name: true } },
      lines: { include: { material: { select: { name: true } } } },
    },
  });
  return json(
    issues.map((i) => ({
      id: i.id,
      projectId: i.projectId,
      projectName: i.project.name,
      fromLocationId: i.fromLocationId,
      fromLocationName: i.fromLocation.name,
      issueDate: i.issueDate.toISOString(),
      notes: i.notes,
      totalCost: toNum(i.totalCost),
      lineCount: i.lines.length,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const body = await req.json();
  const parsed = issueMaterialsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const result = await issueMaterialsToProject({
      projectId: parsed.data.projectId,
      fromLocationId: parsed.data.fromLocationId,
      issuedById: user.id,
      notes: parsed.data.notes ?? undefined,
      lines: parsed.data.lines.map((l) => ({ materialId: l.materialId, qty: l.qty })),
    });
    return json(
      { ok: true, materialIssueId: result.materialIssue.id, totalCost: toNum(result.totalCost) },
      { status: 201 },
    );
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to issue materials" }, { status: 400 });
  }
});
