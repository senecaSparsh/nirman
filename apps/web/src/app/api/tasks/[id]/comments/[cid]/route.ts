import { NextRequest } from "next/server";
import { deleteComment } from "@nirman/services";
import { apiHandler, requireUser, json } from "@/lib/server";

/**
 * DELETE /api/tasks/[id]/comments/[cid] — delete a comment (own comments only).
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) => {
  const user = await requireUser();
  const { cid } = await params;

  await deleteComment(cid, user.id);
  return json({ ok: true });
});
