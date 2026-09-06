import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, json, getCompany, requireUser, requirePermission, getCurrentUser } from "@/lib/server";
import { PERM } from "@/lib/roles";
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
    createdAt: a.createdAt,
    upload: a.upload,
  }));

  if (usePagination) {
    const { items, nextCursor, hasMore } = buildCursorResponse(mapped, take, (r) => ({
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      id: r.id,
    }));
    return NextResponse.json({ items, nextCursor, hasMore });
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
  // Most users can attach documents — use a broad permission
  await requirePermission(PERM.ATTACHMENT_MANAGE);
  const company = await getCompany();
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id;
  const body = await req.json();

  const { entityType, entityId, uploadId, category, label } = body;

  if (!entityType || !entityId || !uploadId) {
    return json({ error: "entityType, entityId, and uploadId are required" }, { status: 400 });
  }

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
    createdAt: attachment.createdAt,
    upload: attachment.upload,
  });
});
