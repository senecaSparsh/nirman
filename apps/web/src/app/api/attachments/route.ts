import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, json, getCompany, requireUser, getCurrentUser, getUserPermissions, ForbiddenError } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { assertAttachmentSubjectAccess, ATTACHMENT_ENTITY_ACCESS } from "@/lib/attachment-access";
import { parseCursorParams, cursorToWhere, buildCursorResponse } from "@/lib/cursor-pagination";

/**
 * GET /api/attachments?entityType=X&entityId=Y
 *
 * Returns all attachments for a given entity.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");

  if (!entityType || !entityId) {
    return json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const denied = await assertAttachmentSubjectAccess(entityType, entityId, company.id);
  if (denied) return json({ error: denied.error }, { status: denied.status });

  // Cursor pagination — backward compatible. If `cursor` param is present,
  // return { items, nextCursor, hasMore }. Otherwise return flat array.
  const { take, cursor, skip } = parseCursorParams(req);
  const usePagination = url.searchParams.has("cursor") || url.searchParams.has("take");

  const attachments = await prisma.entityAttachment.findMany({
    where: {
      companyId: company.id,
      entityType,
      entityId,
      ...(cursorToWhere(cursor) ?? {}),
    },
    include: {
      upload: { select: { id: true, url: true, originalName: true, mimeType: true, size: true } },
    },
    orderBy: { createdAt: "desc" },
    take: usePagination ? take + 1 : undefined,
    skip: usePagination ? skip : undefined,
  });

  const mapped = attachments.map((a) => ({
    id: a.id,
    category: a.category,
    label: a.label,
    expiresAt: a.expiresAt,
    createdAt: a.createdAt,
    upload: a.upload,
  }));

  if (usePagination) {
    const { items, nextCursor, hasMore } = buildCursorResponse(mapped, take, (r) => ({
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      id: r.id,
    }));
    return json({ items, nextCursor, hasMore });
  }
  return json(mapped);
});

/**
 * POST /api/attachments
 * Body: { entityType, entityId, uploadId, category?, label? }
 *
 * Links an existing upload to an entity as an attachment.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const { entityType, entityId, uploadId, category, label, expiresAt } = body as Record<string, string | undefined>;

  // expiresAt is optional; when present it must parse as a real date.
  let expiry: Date | null = null;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return json({ error: "expiresAt must be a valid date" }, { status: 400 });
    }
    expiry = parsed;
  }

  if (!entityType || !entityId || !uploadId) {
    return json({ error: "entityType, entityId, and uploadId are required" }, { status: 400 });
  }

  // Either the broad admin perm or the entity's own manage perm authorizes
  // attaching — a module manager (HR for employees, procurement for POs)
  // must be able to attach files to records they manage without a global
  // admin grant. Blanket attachment.manage alone no longer gates every
  // module's uploads.
  const rule = ATTACHMENT_ENTITY_ACCESS[entityType];
  const perms = await getUserPermissions();
  const hasGlobal = perms.includes(PERM.ATTACHMENT_MANAGE);
  if (!hasGlobal && !(rule?.managePerm && perms.includes(rule.managePerm))) {
    throw new ForbiddenError();
  }

  const company = await getCompany();
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id;

  // The caller must be able to see the record they're attaching to —
  // otherwise an ATTACHMENT_MANAGE holder could silently add files to an
  // H1 employee's dossier or an out-of-scope project. When the caller
  // authorized via the entity's manage perm, check the row with that perm
  // too — a manage-only custom role needn't also hold the view perm.
  const denied = await assertAttachmentSubjectAccess(entityType, entityId, company.id,
    hasGlobal ? undefined : { perm: rule!.managePerm });
  if (denied) return json({ error: denied.error }, { status: denied.status });

  // Verify the upload belongs to this company
  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, companyId: company.id },
  });
  if (!upload) {
    return json({ error: "Upload not found" }, { status: 404 });
  }

  let attachment;
  try {
    attachment = await prisma.entityAttachment.create({
      data: {
        companyId: company.id,
        uploadId,
        entityType,
        entityId,
        category: category ?? "other",
        label: label ?? null,
        expiresAt: expiry,
      },
      include: {
        upload: { select: { id: true, url: true, originalName: true, mimeType: true, size: true } },
      },
    });
  } catch (err) {
    // Distinguish unique-constraint violations (P2002) from other DB errors
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return json({ error: "Attachment already exists for this upload+entity" }, { status: 409 });
    }
    return json({ error: "Failed to create attachment" }, { status: 500 });
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

  // Audit-log the attachment creation
  if (userId) {
    await logAction(
      prisma,
      {
        companyId: company.id,
        userId,
        action: "ATTACHMENT_ADDED",
        entityType,
        entityId,
        after: {
          attachmentId: attachment.id,
          uploadId,
          fileName: upload.originalName,
          category: category ?? "other",
          label: label ?? null,
          expiresAt: expiry,
        },
      },
    ).catch(() => {
      // Audit logging is best-effort
    });
  }

  return json({
    id: attachment.id,
    category: attachment.category,
    label: attachment.label,
    expiresAt: attachment.expiresAt,
    createdAt: attachment.createdAt,
    upload: attachment.upload,
  });
});
