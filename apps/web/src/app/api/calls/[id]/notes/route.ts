import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";

/**
 * POST /api/calls/[id]/notes — add a note to a call log.
 * Requires CALL_EDIT.
 *
 * Body: { note: string }
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.CALL_EDIT);
  const company = await getCompany();
  const { id } = await params;

  const call = await prisma.callLog.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!call) return json({ error: "Call not found" }, { status: 404 });

  const body = await req.json();
  const { note } = body as { note?: string };

  if (!note || typeof note !== "string" || !note.trim()) {
    return json({ error: "Note text is required" }, { status: 400 });
  }

  const callNote = await prisma.callNote.create({
    data: {
      callLogId: id,
      userId: user.id,
      note: note.trim(),
    },
    include: { user: { select: { id: true, name: true } } },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "CALL_NOTE_CREATE",
    entityType: "CallLog",
    entityId: id,
  });

  return json(callNote, { status: 201 });
});
