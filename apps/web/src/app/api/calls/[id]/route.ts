import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";

/**
 * GET /api/calls/[id] — call detail with recording, notes, tags, voicemail.
 * Requires CALL_VIEW.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.CALL_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const call = await prisma.callLog.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      companyPhone: { select: { id: true, phoneNumber: true, label: true, department: true } },
      caller: { select: { id: true, name: true, email: true } },
      callee: { select: { id: true, name: true, email: true } },
      recording: {
        select: {
          id: true,
          storageUrl: true,
          format: true,
          durationSec: true,
          fileSizeBytes: true,
          transcriptStatus: true,
          transcriptText: true,
          uploadedAt: true,
        },
      },
      voicemail: { select: { id: true, audioUrl: true, durationSec: true, transcription: true, listenedAt: true } },
      callNotes: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
      tags: { include: { callTag: { select: { id: true, name: true, color: true } } } },
    },
  });

  if (!call) return json({ error: "Call not found" }, { status: 404 });

  // Permission scope: if user lacks CALL_VIEW_ALL, they can only see their own calls
  const { getUserPermissions } = await import("@/lib/server");
  const perms = await getUserPermissions();
  const canViewAll = perms.includes(PERM.CALL_VIEW_ALL);
  if (!canViewAll && call.callerUserId !== user.id && call.calleeUserId !== user.id) {
    return json({ error: "Call not found" }, { status: 404 });
  }

  return json(call);
});

/**
 * PATCH /api/calls/[id] — update disposition, notes, linked entities, legalHold.
 * Requires CALL_EDIT.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.CALL_EDIT);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.callLog.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) return json({ error: "Call not found" }, { status: 404 });

  const body = await req.json();
  const {
    disposition,
    notes,
    relatedCustomerId,
    relatedSupplierId,
    relatedProjectId,
    legalHold,
    status,
  } = body as {
    disposition?: string;
    notes?: string;
    relatedCustomerId?: string | null;
    relatedSupplierId?: string | null;
    relatedProjectId?: string | null;
    legalHold?: boolean;
    status?: string;
  };

  const data: Record<string, unknown> = {};
  if (disposition !== undefined) data.disposition = disposition;
  if (notes !== undefined) data.notes = notes;
  if (relatedCustomerId !== undefined) data.relatedCustomerId = relatedCustomerId;
  if (relatedSupplierId !== undefined) data.relatedSupplierId = relatedSupplierId;
  if (relatedProjectId !== undefined) data.relatedProjectId = relatedProjectId;
  if (legalHold !== undefined) data.legalHold = legalHold;
  if (status !== undefined) data.status = status;

  const updated = await prisma.callLog.update({
    where: { id },
    data,
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "CALL_LOG_UPDATE",
    entityType: "CallLog",
    entityId: id,
    before: {
      disposition: existing.disposition,
      notes: existing.notes,
      legalHold: existing.legalHold,
    },
    after: data,
  });

  return json(updated);
});

/**
 * DELETE /api/calls/[id] — soft delete a call log.
 * Requires CALL_DELETE. Sets deletedAt = now().
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.CALL_DELETE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.callLog.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) return json({ error: "Call not found" }, { status: 404 });

  await prisma.callLog.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "CALL_LOG_DELETE",
    entityType: "CallLog",
    entityId: id,
  });

  return json({ ok: true });
});
