import { NextRequest } from "next/server";
import { writeFile, unlink, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, requireUser } from "@/lib/server";
import { PERM } from "@/lib/roles";

// Files are stored OUTSIDE public/ so they are not served as static assets.
// Access is mediated by GET /api/uploads/[id] which checks auth + company ownership.
const UPLOAD_DIR = join(process.cwd(), "storage", "uploads");
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

// Strict allow-list of MIME types. We do NOT allow:
//   - application/octet-stream (catch-all that bypasses the allow-list)
//   - text/html, text/javascript (stored XSS when served from the app origin)
//   - application/json (can be rendered as HTML in some browsers)
//   - SVG (can carry embedded <script>)
const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  // Documents
  "application/pdf",
  // Office
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/msword",
  "application/vnd.ms-powerpoint",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  // Plain text (explicit — NOT text/html or text/javascript)
  "text/plain",
  "text/csv",
  "application/csv",
]);

function isAllowed(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime.toLowerCase());
}

/** Sanitize a filename: strip path components, replace unsafe chars. */
function sanitize(name: string): string {
  const base = name.replace(/^.*[\\/]/, "");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
}

/**
 * POST /api/uploads  (multipart/form-data, field name: "file")
 * Stores the file on disk in storage/uploads/ (outside public/) and
 * creates an Upload record tracking ownership. Returns the auth-gated URL
 * (/api/uploads/<id>) + metadata.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany(); // may be a synthetic company in AUTH_BYPASS
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return json({ error: "Invalid form data. Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return json({ error: "No file provided (field name must be 'file')." }, { status: 400 });
  }
  if (file.size === 0) {
    return json({ error: "File is empty." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return json({ error: `File too large (max ${Math.round(MAX_SIZE / 1024 / 1024)} MB).` }, { status: 413 });
  }
  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!isAllowed(mime)) {
    return json({ error: `File type "${mime}" is not allowed. If you need this file type, contact your administrator.` }, { status: 415 });
  }

  // Ensure upload dir exists
  try { await stat(UPLOAD_DIR); } catch { await mkdir(UPLOAD_DIR, { recursive: true }); }

  const uuid = randomUUID();
  const safeName = sanitize(file.name);
  const storedName = `${uuid}-${safeName}`;
  const filePath = join(UPLOAD_DIR, storedName);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(filePath, bytes);

  // Create the Upload record for ownership tracking + auth-gated serving.
  const upload = await prisma.upload.create({
    data: {
      storedName,
      originalName: file.name,
      mimeType: mime,
      size: file.size,
      url: "", // placeholder — set below after we have the id
      companyId: company.id,
      uploadedById: user.id,
    },
  });

  // Update the url to the auth-gated endpoint.
  const url = `/api/uploads/${upload.id}`;
  await prisma.upload.update({ where: { id: upload.id }, data: { url } });

  return json({
    url,
    fileName: file.name, // original name (for display)
    mimeType: mime,
    size: file.size,
    uploadId: upload.id,
  }, { status: 201 });
});

/**
 * DELETE /api/uploads?id=<uploadId>
 * Removes a file from disk + deletes the Upload record.
 * Only the uploader or a company admin can delete.
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const uploadId = req.nextUrl.searchParams.get("id");
  if (!uploadId) {
    return json({ error: "Upload id is required." }, { status: 400 });
  }

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload) {
    return json({ error: "Upload not found." }, { status: 404 });
  }

  // Authorization: uploader or company admin can delete.
  const isUploader = upload.uploadedById === user.id;
  const isCompanyAdmin =
    upload.companyId === company.id &&
    (user.role === "OWNER" || user.role === "ADMIN");
  const hasManagePerm = await requirePermission(PERM.COMPANY_MANAGE).then(() => true).catch(() => false);
  if (!isUploader && !isCompanyAdmin && !hasManagePerm) {
    return json({ error: "Forbidden — you can only delete your own uploads." }, { status: 403 });
  }

  // Remove from disk (best-effort) + delete the record.
  const filePath = join(UPLOAD_DIR, upload.storedName);
  try {
    await unlink(filePath);
  } catch {
    // Already deleted or never existed — treat as success
  }
  await prisma.upload.delete({ where: { id: uploadId } });
  return json({ ok: true });
});
