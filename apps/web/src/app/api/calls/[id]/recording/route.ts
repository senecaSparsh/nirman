import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { readRecording, recordingMimeType, recordingFormatFromUrl } from "@/lib/recording-storage";

/**
 * GET /api/calls/[id]/recording — stream the recording audio file.
 * Requires CALL_RECORDING_LISTEN.
 *
 * Logs the access in RecordingAccessLog for compliance.
 * Returns the raw audio file with appropriate Content-Type header.
 */
export const GET = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.CALL_RECORDING_LISTEN);
  const company = await getCompany();
  const { id } = await params;

  const call = await prisma.callLog.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: { recording: true },
  });

  if (!call) return json({ error: "Call not found" }, { status: 404 });
  if (!call.recording) return json({ error: "No recording available for this call" }, { status: 404 });
  if (call.recording.deletedAt) return json({ error: "Recording has been deleted" }, { status: 410 });

  const recording = call.recording;

  // Read the file from local storage
  let buffer: Buffer;
  try {
    buffer = readRecording(recording.storageUrl);
  } catch {
    return json({ error: "Recording file not found on disk" }, { status: 404 });
  }

  const format = recordingFormatFromUrl(recording.storageUrl);
  const contentType = recordingMimeType(format);

  // Log the access for compliance
  await prisma.recordingAccessLog.create({
    data: {
      recordingId: recording.id,
      userId: user.id,
      action: "PLAYED",
      ipAddress: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  });

  // Increment access count
  await prisma.callRecording.update({
    where: { id: recording.id },
    data: { accessCount: { increment: 1 } },
  });

  // Return the audio file as a streaming response
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `inline; filename="recording-${id}.${format}"`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
});
