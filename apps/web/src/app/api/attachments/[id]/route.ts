import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, json, getCompany, requirePermission, getCurrentUser } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * DELETE /api/attachments/[id]
 *
 * Removes an attachment link (does NOT delete the underlying upload file).
 * Audit-logs the deletion for compliance traceability.
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ATTACHMENT_MANAGE);
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
