import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, requireUser } from "@/lib/server";

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
    const user = await requireUser();
    const company = await getCompany();
    const { id } = await ctx.params;

    const upload = await prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    // Authorization: the uploader can always access their own files;
    // otherwise the file must belong to the user's current company.
    const isUploader = upload.uploadedById === user.id;
    const sameCompany = upload.companyId === company.id;
    const isSuperuser = user.role === "OWNER" || user.role === "ADMIN" || user.role === "DEVELOPER";
    if (!isUploader && !sameCompany && !isSuperuser) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
  // Use read rate limiting but don't auto-add Cache-Control (we set our own)
  { rateLimit: "read" },
);
