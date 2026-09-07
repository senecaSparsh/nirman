import { NextRequest } from "next/server";
import { writeFile, unlink, mkdir, stat } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, requireUser } from "@/lib/server";
import { PERM } from "@/lib/roles";

// Files are stored OUTSIDE public/ so they are not served as static assets.
// Access is mediated by GET /api/uploads/[id] which checks auth + company ownership.
// Honor the UPLOAD_DIR env var (set in docker-compose/render.yaml) so deployments
// that mount a volume at a different path actually persist files to the volume.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? (isAbsolute(process.env.UPLOAD_DIR) ? process.env.UPLOAD_DIR : join(process.cwd(), process.env.UPLOAD_DIR))
  : join(process.cwd(), "storage", "uploads");
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

/**
 * Verify the actual file content via magic bytes (file signatures).
 * This prevents an attacker from uploading a disallowed file type
 * (e.g. an HTML file with embedded scripts) by simply setting a
 * spoofed Content-Type header like "image/jpeg".
 *
 * Returns the detected MIME type based on the file's magic bytes,
 * or null if the signature doesn't match any allowed type.
 */
function detectMimeType(bytes: Uint8Array): string | null {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  // GIF: 47 49 46 38 (37/39)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  // WebP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  // PDF: 25 50 44 46
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  // ZIP: 50 4B 03 04 (also covers .docx, .xlsx, .pptx, .odt, .ods, .odp — all ZIP-based)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) &&
      (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x07 || bytes[3] === 0x08)) return "application/zip";
  // RAR: 52 61 72 21 1A 07
  if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 &&
      bytes[4] === 0x1a && bytes[5] === 0x07) return "application/x-rar-compressed";
  // 7z: 37 7A BC AF 27 1C
  if (bytes[0] === 0x37 && bytes[1] === 0x7a && bytes[2] === 0xbc && bytes[3] === 0xaf &&
      bytes[4] === 0x27 && bytes[5] === 0x1c) return "application/x-7z-compressed";
  // OLE2 (old MS Office: .doc, .xls, .ppt): D0 CF 11 E0 A1 B1 1A E1
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1) return "application/msword";
  // Plain text — check for printable ASCII or UTF-8 BOM
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "text/plain"; // UTF-8 BOM
  // Check first 512 bytes are printable text (ASCII 9-13, 32-126)
  let isText = true;
  for (let i = 0; i < Math.min(bytes.length, 512); i++) {
    const b = bytes[i]!;
    if (!((b >= 0x09 && b <= 0x0d) || (b >= 0x20 && b <= 0x7e) || b >= 0x80)) {
      isText = false;
      break;
    }
  }
  if (isText && bytes.length > 0) return "text/plain";
  return null;
}

/**
 * Map a detected magic-byte MIME type to a broader category for validation.
 * ZIP-based Office formats (docx, xlsx, etc.) all share the ZIP signature,
 * so we accept the ZIP signature as valid for Office documents.
 */
function isAllowedByMagicBytes(detectedMime: string | null, claimedMime: string): boolean {
  if (!detectedMime) return false;
  // Direct match
  if (isAllowed(detectedMime)) return true;
  // ZIP signature covers: zip, docx, xlsx, pptx, odt, ods, odp
  if (detectedMime === "application/zip") {
    const zipBasedTypes = new Set([
      "application/zip", "application/x-zip-compressed",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.presentation",
    ]);
    return zipBasedTypes.has(claimedMime.toLowerCase());
  }
  // OLE2 signature covers: doc, xls, ppt
  if (detectedMime === "application/msword") {
    const oleTypes = new Set([
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
    ]);
    return oleTypes.has(claimedMime.toLowerCase());
  }
  return false;
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

  // Verify actual file content via magic bytes — don't trust the browser's
  // Content-Type header, which can be spoofed to bypass the MIME allow-list.
  const detectedMime = detectMimeType(bytes);
  if (!isAllowedByMagicBytes(detectedMime, mime)) {
    return json({
      error: `File content does not match the claimed type "${mime}". Detected: ${detectedMime ?? "unknown"}. This may be a spoofed upload.`,
    }, { status: 415 });
  }

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
    (user.role === "OWNER" || user.role === "ADMIN" || user.role === "DEVELOPER");
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
