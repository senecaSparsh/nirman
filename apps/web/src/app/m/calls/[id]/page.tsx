import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, requireUser } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { RecordRecentItem } from "@/components/mobile/v2/record-recent-item";
import { MobileCallDetailClient } from "./MobileCallDetailClient";

export const metadata = { title: "Call Detail · Nirman" };

export default function MobileCallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={5} />}>
      <MobileCallDetailContent params={params} />
    </Suspense>
  );
}

async function MobileCallDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await getUserRole();
  const company = await getCompany();
  const user = await requireUser();

  if (!hasPermission(role, PERM.CALL_VIEW)) {
    return <MobileNoAccess what="call details" />;
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
    direction: call.direction as "INBOUND" | "OUTBOUND" | "INTERNAL",
    status: call.status as "RINGING" | "ANSWERED" | "MISSED" | "BUSY" | "REJECTED" | "FAILED" | "VOICEMAIL",
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
    <>
      <RecordRecentItem
        type="call"
        id={call.id}
        label={`${call.direction === "INBOUND" ? "Incoming" : call.direction === "OUTBOUND" ? "Outgoing" : "Internal"} Call`}
        sublabel={call.caller?.name ?? call.callee?.name ?? undefined}
        href={`/m/calls/${call.id}`}
      />
      <MobileCallDetailClient
        call={serializedCall}
        canViewFullNumber={canViewFullNumber}
        canEdit={canEdit}
        canListenRecording={canListenRecording}
        canDelete={canDelete}
        canManage={canManage}
      />
    </>
  );
}
