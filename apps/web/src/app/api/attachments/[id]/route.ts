import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, getCompany, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * DELETE /api/attachments/[id]
 *
 * Removes an attachment link (does NOT delete the underlying upload file).
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ATTACHMENT_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const attachment = await prisma.entityAttachment.findFirst({
    where: { id, companyId: company.id },
  });

  if (!attachment) {
    return json({ error: "Attachment not found" }, { status: 404 });
  }

  await prisma.entityAttachment.delete({ where: { id } });

  return json({ deleted: true });
});
