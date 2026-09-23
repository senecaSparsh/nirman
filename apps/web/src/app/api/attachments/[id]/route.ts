import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, json, getCompany, getCurrentUser, getUserPermissions, ForbiddenError } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { assertAttachmentSubjectAccess, ATTACHMENT_ENTITY_ACCESS } from "@/lib/attachment-access";

/**
 * DELETE /api/attachments/[id]
 *
 * Removes an attachment link (does NOT delete the underlying upload file).
 * Audit-logs the deletion for compliance traceability.
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const company = await getCompany();
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id;
  const { id } = await params;

  const attachment = await prisma.entityAttachment.findFirst({
    where: { id, companyId: company.id },
    include: { upload: { select: { originalName: true } } },
  });

  if (!attachment) {
    return json({ error: "Attachment not found" }, { status: 404 });
  }

  // Same authorization as POST — broad admin perm OR the entity's manage perm.
  const rule = ATTACHMENT_ENTITY_ACCESS[attachment.entityType];
  const perms = await getUserPermissions();
  const hasGlobal = perms.includes(PERM.ATTACHMENT_MANAGE);
  if (!hasGlobal && !(rule?.managePerm && perms.includes(rule.managePerm))) {
    throw new ForbiddenError();
  }

  // Subject check: removing an attachment on a record the caller can't see
  // (H1 dossier, out-of-scope project) is blocked — same rule as listing.
  const denied = await assertAttachmentSubjectAccess(attachment.entityType, attachment.entityId, company.id,
    hasGlobal ? undefined : { perm: rule!.managePerm });
  if (denied) return json({ error: denied.error }, { status: denied.status });

  await prisma.entityAttachment.delete({ where: { id } });

  // Audit-log the attachment removal
  if (userId) {
    await logAction(
      prisma,
      {
        companyId: company.id,
        userId,
        action: "ATTACHMENT_REMOVED",
        entityType: attachment.entityType,
        entityId: attachment.entityId,
        after: {
          attachmentId: id,
          uploadId: attachment.uploadId,
          fileName: attachment.upload.originalName,
          category: attachment.category,
          label: attachment.label,
        },
      },
    ).catch(() => {
      // Audit logging is best-effort — don't fail the request
    });
  }

  // Revalidate pages that commonly show attachments
  revalidatePath("/land");
  revalidatePath("/m/land");
    revalidatePath("/m/real-estate?tab=land");
  revalidatePath("/projects");
  revalidatePath("/m/projects");
    revalidatePath("/m/real-estate?tab=projects");
  revalidatePath("/sales");
  revalidatePath("/m/sales");

  return json({ deleted: true });
});

/**
 * PATCH /api/attachments/[id]
 * Body: { expiresAt?: string | null }
 *
 * Set or clear a document's expiry date — used by the employee dossier so
 * compliance docs (medical certs, licences) feed the reminders cron sweep.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const company = await getCompany();
  const { id } = await params;

  const attachment = await prisma.entityAttachment.findFirst({
    where: { id, companyId: company.id },
    select: { id: true, entityType: true, entityId: true },
  });
  if (!attachment) return json({ error: "Attachment not found" }, { status: 404 });

  const rule = ATTACHMENT_ENTITY_ACCESS[attachment.entityType];
  const perms = await getUserPermissions();
  const hasGlobal = perms.includes(PERM.ATTACHMENT_MANAGE);
  if (!hasGlobal && !(rule?.managePerm && perms.includes(rule.managePerm))) {
    throw new ForbiddenError();
  }
  const denied = await assertAttachmentSubjectAccess(attachment.entityType, attachment.entityId, company.id,
    hasGlobal ? undefined : { perm: rule!.managePerm });
  if (denied) return json({ error: denied.error }, { status: denied.status });

  const body = await req.json().catch(() => ({}));
  const raw = (body as Record<string, unknown>).expiresAt;
  let expiresAt: Date | null = null;
  if (raw != null) {
    const parsed = new Date(String(raw));
    if (Number.isNaN(parsed.getTime())) {
      return json({ error: "expiresAt must be a valid date or null" }, { status: 400 });
    }
    expiresAt = parsed;
  }

  const updated = await prisma.entityAttachment.update({
    where: { id },
    data: { expiresAt },
    select: { id: true, expiresAt: true },
  });
  return json(updated);
});
