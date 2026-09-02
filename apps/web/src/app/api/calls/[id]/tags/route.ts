import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";

/**
 * POST /api/calls/[id]/tags — add a tag to a call by name.
 * If the tag doesn't exist for the company, it is created.
 * Requires CALL_EDIT.
 *
 * Body: { name: string, color?: string }
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
  const { name, color } = body as { name?: string; color?: string };

  if (!name || typeof name !== "string" || !name.trim()) {
    return json({ error: "Tag name is required" }, { status: 400 });
  }

  const tagName = name.trim();

  // Find or create the CallTag for this company
  let tag = await prisma.callTag.findUnique({
    where: { companyId_name: { companyId: company.id, name: tagName } },
  });

  if (!tag) {
    tag = await prisma.callTag.create({
      data: {
        companyId: company.id,
        name: tagName,
        color: color ?? "#6b7280",
      },
    });
  }

  // Link the tag to the call (upsert — ignore if already linked)
  const existingLink = await prisma.callLogTag.findUnique({
    where: { callLogId_callTagId: { callLogId: id, callTagId: tag.id } },
  });

  if (existingLink) {
    return json({ ok: true, tag, message: "Tag already applied" });
  }

  await prisma.callLogTag.create({
    data: { callLogId: id, callTagId: tag.id },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "CALL_TAG_ADD",
    entityType: "CallLog",
    entityId: id,
    after: { tag: tagName },
  });

  return json({ ok: true, tag }, { status: 201 });
});

/**
 * DELETE /api/calls/[id]/tags — remove a tag from a call.
 * Requires CALL_EDIT.
 *
 * Accepts tag identification via:
 *   - Query param: ?tagId=xxx  or  ?name=xxx
 *   - Body: { name: string }  or  { tagId: string }
 */
export const DELETE = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.CALL_EDIT);
  const company = await getCompany();
  const { id } = await params;

  const url = new URL(req.url);
  const queryTagId = url.searchParams.get("tagId");
  const queryName = url.searchParams.get("name");

  // Try body first, fall back to query params
  let bodyTagId: string | undefined;
  let bodyName: string | undefined;
  try {
    const body = await req.json();
    bodyTagId = body.tagId;
    bodyName = body.name;
  } catch {
    // No body — use query params
  }

  const tagId = queryTagId ?? bodyTagId;
  const name = queryName ?? bodyName;

  if (!tagId && !name) {
    return json({ error: "Tag name or tagId is required (via query param or body)" }, { status: 400 });
  }

  let tag = null as null | { id: string; name: string };
  if (tagId) {
    tag = await prisma.callTag.findFirst({
      where: { id: tagId, companyId: company.id },
      select: { id: true, name: true },
    });
  } else if (name) {
    tag = await prisma.callTag.findUnique({
      where: { companyId_name: { companyId: company.id, name: name.trim() } },
      select: { id: true, name: true },
    });
  }

  if (!tag) return json({ error: "Tag not found" }, { status: 404 });

  await prisma.callLogTag.deleteMany({
    where: { callLogId: id, callTagId: tag.id },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "CALL_TAG_REMOVE",
    entityType: "CallLog",
    entityId: id,
    after: { tag: tag.name },
  });

  return json({ ok: true });
});
