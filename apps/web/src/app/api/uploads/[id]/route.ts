import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCurrentUser } from "@/lib/server";
import { getPortalCustomer } from "@/lib/portal-auth";

// Honor the UPLOAD_DIR env var (must match the POST route's resolution)
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? (isAbsolute(process.env.UPLOAD_DIR) ? process.env.UPLOAD_DIR : join(process.cwd(), process.env.UPLOAD_DIR))
  : join(process.cwd(), "storage", "uploads");

// MIME types that are safe to inline (display in <img> or browser PDF viewer).
// Everything else is served with Content-Disposition: attachment.
const INLINE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

/**
 * GET /api/uploads/[id] — serve an uploaded file with auth + company checks.
 *
 * This is the ONLY way to access files stored via /api/uploads. Files live
 * outside public/ so they cannot be accessed as static assets. Every request
 * is authenticated and the Upload record's companyId is checked against the
 * user's current company (or the user is the uploader).
 *
 * Wrapped in apiHandler for rate limiting, Sentry error capture, and
 * Prisma error mapping. The handler returns a NextResponse with the file
 * buffer (not JSON), which apiHandler passes through.
 *
 * Query params:
 *   - download=true → force Content-Disposition: attachment (download instead of inline)
 */
export const GET = apiHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const user = await getCurrentUser();

    const upload = await prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    if (user) {
      const company = await getCompany();
      // Authorization: the uploader can always access their own files;
      // otherwise the file must belong to the user's current company.
      const isUploader = upload.uploadedById === user.id;
      const sameCompany = upload.companyId === company.id;
      // A user may also read files belonging to any company they hold an
      // ACTIVE membership in (owner moving between group entities), without
      // switching context. DEVELOPER bypasses for platform support only.
      const memberOfFileCompany = upload.companyId && upload.companyId !== company.id
        ? await prisma.userCompany.findFirst({
            where: { userId: user.id, companyId: upload.companyId, active: true },
            select: { id: true },
          })
        : null;
      const isSuperuser = user.role === "DEVELOPER";
      if (!isUploader && !sameCompany && !memberOfFileCompany && !isSuperuser) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    } else {
      // Customer portal: a logged-in customer may download a file only if it
      // is attached to one of their own sales' document fields.
      const customer = await getPortalCustomer();
      if (!customer) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      const linked = await prisma.assetSale.findFirst({
        where: {
          customerId: customer.id,
          OR: [
            { atsDocumentUrl: { contains: `/api/uploads/${id}` } },
            { bbaDocumentUrl: { contains: `/api/uploads/${id}` } },
            { registryDocumentUrl: { contains: `/api/uploads/${id}` } },
            { allotmentDocumentUrl: { contains: `/api/uploads/${id}` } },
            { draftDocumentUrl: { contains: `/api/uploads/${id}` } },
          ],
        },
        select: { id: true },
      });
      if (!linked) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }

    const filePath = join(UPLOAD_DIR, upload.storedName);
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "File not found on disk." }, { status: 404 });
    }

    const fileBuffer = await readFile(filePath);
    const forceDownload = req.nextUrl.searchParams.get("download") === "true";
    const shouldInline = INLINE_MIME_TYPES.has(upload.mimeType) && !forceDownload;

    const response = new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": upload.mimeType,
        "Content-Length": String(upload.size),
        "Content-Disposition": `${shouldInline ? "inline" : "attachment"}; filename="${encodeURIComponent(upload.originalName)}"`,
        // Prevent script execution for any non-inline content type
        "X-Content-Type-Options": "nosniff",
        // Cache control — uploads are immutable per ID but should not be
        // cached by intermediate proxies since they're auth-gated.
        "Cache-Control": "private, max-age=3600",
      },
    });

    return response;
  },
  // Use read rate limiting but don't auto-add Cache-Control (we set our own).
  // skipSession: the handler performs its own authorization — a staff session
  // OR a customer-portal cookie whose customer owns the linked sale document.
  { rateLimit: "read", skipSession: true },
);
