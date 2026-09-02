import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Recording storage helpers — manage audio recording files on the local
 * filesystem under `/data/recordings/`.
 *
 * The storage URL returned by `saveRecording` is a relative path
 * (`/data/recordings/<uuid>.<format>`) that can be served by the
 * `/api/calls/[id]/recording` route (which reads from disk and streams
 * the file). This keeps the storage provider abstracted — a future S3
 * implementation would return an `s3://` URL instead.
 */

const RECORDINGS_DIR = join(process.cwd(), "data", "recordings");

/** Ensure the recordings directory exists. */
function ensureDir(): void {
  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
}

/**
 * Save a recording buffer to disk.
 * @param buffer  The raw audio bytes.
 * @param format  File extension without the dot (e.g. "mp3", "wav", "ogg").
 * @returns `{ url, checksum, size }` — url is the relative storage path,
 *          checksum is a SHA-256 hex digest, size is the byte count.
 */
export async function saveRecording(
  buffer: Buffer,
  format: string,
): Promise<{ url: string; checksum: string; size: number }> {
  ensureDir();
  const ext = format.replace(/^\./, "").toLowerCase() || "mp3";
  const filename = `${randomUUID()}.${ext}`;
  const filepath = join(RECORDINGS_DIR, filename);
  writeFileSync(filepath, buffer);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  return {
    url: `/data/recordings/${filename}`,
    checksum,
    size: buffer.length,
  };
}

/**
 * Convert a storage URL (e.g. `/data/recordings/abc.mp3`) to an absolute
 * filesystem path. Only handles `local` storage URLs that start with
 * `/data/recordings/`.
 */
export function getRecordingPath(url: string): string {
  // The URL is relative to the project root: /data/recordings/<file>
  const filename = url.replace(/^\/data\/recordings\//, "");
  return join(RECORDINGS_DIR, filename);
}

/**
 * Read a recording file from disk as a Buffer.
 * Throws if the file does not exist.
 */
export function readRecording(url: string): Buffer {
  const filepath = getRecordingPath(url);
  if (!existsSync(filepath)) {
    throw new Error("Recording file not found on disk");
  }
  return readFileSync(filepath);
}

/**
 * Delete a recording file from disk. No-op if the file doesn't exist.
 */
export async function deleteRecording(url: string): Promise<void> {
  const filepath = getRecordingPath(url);
  if (existsSync(filepath)) {
    unlinkSync(filepath);
  }
}

/**
 * Get the MIME type for a recording format.
 */
export function recordingMimeType(format: string): string {
  const ext = format.replace(/^\./, "").toLowerCase();
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "m4a":
      return "audio/mp4";
    case "webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

/**
 * Extract the format/extension from a storage URL.
 */
export function recordingFormatFromUrl(url: string): string {
  return extname(url).replace(/^\./, "").toLowerCase() || "mp3";
}
