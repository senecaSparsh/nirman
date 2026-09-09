import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, requireUser } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import { CallDetailView } from "@/components/calls/call-detail-view";

export async function CallDetailContent({ id }: { id: string }) {
  const role = await getUserRole();
  const company = await getCompany();
  const user = await requireUser();

  if (!hasPermission(role, PERM.CALL_VIEW)) {
    return <NoAccess what="call details" />;
  }

  const canViewAll = hasPermission(role, PERM.CALL_VIEW_ALL);
  const canViewFullNumber = hasPermission(role, PERM.CALL_VIEW_FULL_NUMBER);
  const canEdit = hasPermission(role, PERM.CALL_EDIT);
  const canListenRecording = hasPermission(role, PERM.CALL_RECORDING_LISTEN);
  const canDelete = hasPermission(role, PERM.CALL_DELETE);
  const canManage = hasPermission(role, PERM.CALL_MANAGE);

  const call = await prisma.callLog.findFirst({
    where: {
      id,
      companyId: company.id,
      deletedAt: null,
      // Without CALL_VIEW_ALL, users only see calls where they are caller or callee
      ...(canViewAll ? {} : { OR: [{ callerUserId: user.id }, { calleeUserId: user.id }] }),
    },
    select: {
      id: true,
      direction: true,
      fromNumber: true,
      toNumber: true,
      status: true,
      startedAt: true,
      connectedAt: true,
      endedAt: true,
      durationSec: true,
      ringDurationSec: true,
      disposition: true,
      notes: true,
      source: true,
      legalHold: true,
      callCost: true,
      provider: true,
      providerCallId: true,
      recordingConsent: true,
      relatedProjectId: true,
      companyPhone: { select: { id: true, phoneNumber: true, label: true } },
      caller: { select: { id: true, name: true, email: true } },
      callee: { select: { id: true, name: true, email: true } },
      recording: {
        select: {
          id: true,
          storageUrl: true,
          format: true,
          durationSec: true,
          fileSizeBytes: true,
          transcriptText: true,
          transcriptStatus: true,
          uploadedAt: true,
          expiresAt: true,
          accessCount: true,
        },
      },
      voicemail: { select: { id: true, audioUrl: true, durationSec: true, transcription: true } },
      callNotes: {
        select: { id: true, note: true, createdAt: true, user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      tags: { include: { callTag: { select: { id: true, name: true, color: true } } } },
    },
  });

  if (!call) {
    notFound();
  }

  // Serialize Date fields to ISO strings for the client component
  const serializedCall = {
    ...call,
    startedAt: call.startedAt.toISOString(),
    connectedAt: call.connectedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    callCost: call.callCost?.toString() ?? null,
    recording: call.recording ? {
      ...call.recording,
      uploadedAt: call.recording.uploadedAt.toISOString(),
      expiresAt: call.recording.expiresAt?.toISOString() ?? null,
    } : null,
    callNotes: call.callNotes.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
  };

  return (
    <CallDetailView
      call={serializedCall}
      canViewFullNumber={canViewFullNumber}
      canEdit={canEdit}
      canListenRecording={canListenRecording}
      canDelete={canDelete}
      canManage={canManage}
    />
  );
}
