import { NextRequest } from "next/server";
import { writeFile, unlink, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { apiHandler, json, requirePermission, requireUser } from "@/lib/server";
import { PERM } from "@/lib/roles";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

// Allowed MIME prefixes — broad enough for docs, images, sheets, PDFs, archives.
const ALLOWED_PREFIXES = [
  "image/", "video/", "audio/",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml",
  "application/vnd.openxmlformats-officedocument.presentationml",
  "application/vnd.oasis.opendocument",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
  "text/",
  "text/csv",
  "application/csv",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/octet-stream",
];

function isAllowed(mime: string): boolean {
  if (ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) return true;
  // octet-stream is a catch-all; allow it (browsers often send it for unknown types)
  return mime === "application/octet-stream";
}

/** Sanitize a filename: strip path components, replace unsafe chars. */
function sanitize(name: string): string {
  const base = name.replace(/^.*[\\/]/, "");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
}

/**
 * POST /api/uploads  (multipart/form-data, field name: "file")
 * Stores the file on disk in public/uploads/ and returns its public URL + metadata.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const formData = await req.formData();
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
  const mime = file.type || "application/octet-stream";
  if (!isAllowed(mime)) {
    return json({ error: `File type "${mime}" is not allowed.` }, { status: 415 });
  }

  // Ensure upload dir exists
  try { await stat(UPLOAD_DIR); } catch { await mkdir(UPLOAD_DIR, { recursive: true }); }

  const uuid = randomUUID();
  const safeName = sanitize(file.name);
  const storedName = `${uuid}-${safeName}`;
  const filePath = join(UPLOAD_DIR, storedName);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(filePath, bytes);

  const url = `/uploads/${storedName}`;
  return json({
    url,
    fileName: file.name, // original name (for display)
    mimeType: mime,
    size: file.size,
  }, { status: 201 });
});

/**
 * DELETE /api/uploads?url=/uploads/xxx
 * Removes a file from disk. Only deletes files inside public/uploads/.
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.COMPANY_MANAGE);
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !url.startsWith("/uploads/")) {
    return json({ error: "Invalid URL." }, { status: 400 });
  }
  const fileName = url.replace("/uploads/", "");
  if (fileName.includes("..") || fileName.includes("/")) {
    return json({ error: "Invalid filename." }, { status: 400 });
  }
  const filePath = join(UPLOAD_DIR, fileName);
  try {
    await unlink(filePath);
  } catch {
    // Already deleted or never existed — treat as success
  }
  return json({ ok: true });
});
