import { NextRequest } from "next/server";
import { deleteComment } from "@nirman/services";
import { apiHandler, getCurrentUser, json } from "@/lib/server";

/**
 * DELETE /api/tasks/[id]/comments/[cid] — delete a comment (own comments only).
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { cid } = await params;

  await deleteComment(cid, user.id);
  return json({ ok: true });
});
