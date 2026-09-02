import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { saveRecording } from "@/lib/recording-storage";
import { logAction } from "@nirman/services";

/**
 * POST /api/calls/[id]/recording/upload — upload a recording file for a
 * manual call. Requires CALL_CREATE.
 *
 * Accepts multipart/form-data with:
 *   - file: the audio file (Blob/File)
 *   - durationSec?: number (optional, defaults to 0)
 *   - format?: string (optional, inferred from file extension)
 *
 * Saves the file to /data/recordings/ with a UUID filename and creates a
 * CallRecording row linked to the call.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.CALL_CREATE);
  const company = await getCompany();
  const { id } = await params;

  const call = await prisma.callLog.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!call) return json({ error: "Call not found" }, { status: 404 });

  // Check if a recording already exists for this call
  if (call.recordingId) {
    return json({ error: "A recording already exists for this call" }, { status: 409 });
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return json({ error: "Expected multipart/form-data with a 'file' field" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return json({ error: "A 'file' field is required" }, { status: 400 });
  }

  // Determine format from the filename extension
  const filename = file.name || "recording.mp3";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "mp3";
  const format = (formData.get("format") as string) ?? ext;

  // Read the file into a buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save to disk
  const { url, checksum, size } = await saveRecording(buffer, format);

  // Get optional duration
  const durationSec = parseInt(formData.get("durationSec") as string, 10) || 0;

  // Create the CallRecording row
  const recording = await prisma.callRecording.create({
    data: {
      callLogId: id,
      storageUrl: url,
      storageProvider: "local",
      fileSizeBytes: size,
      format,
      durationSec,
      checksum,
    },
  });

  // Link the recording to the call log
  await prisma.callLog.update({
    where: { id },
    data: { recordingId: recording.id },
  });

  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: "CALL_RECORDING_UPLOAD",
    entityType: "CallLog",
    entityId: id,
    after: { recordingId: recording.id, format, size },
  });

  return json(recording, { status: 201 });
});
