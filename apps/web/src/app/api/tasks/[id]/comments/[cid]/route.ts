import { NextRequest } from "next/server";
import { deleteComment } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, requireUser, getCompany, json } from "@/lib/server";

/**
 * DELETE /api/tasks/[id]/comments/[cid] — delete a comment (own comments only).
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) => {
  const user = await requireUser();
  const { cid } = await params;

  const company = await getCompany();
  const existing = await prisma.taskComment.findFirst({ where: { id: cid, task: { assignedTo: { memberships: { some: { companyId: company.id } } } } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  await deleteComment(cid, user.id);
  return json({ ok: true });
});
