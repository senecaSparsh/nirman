import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, requireUser } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { CallsView } from "@/components/calls/calls-view";

export const metadata = { title: "Call Log · Nirman" };

export default function CallsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading calls…" variant="list" />}>
      <CallsContent />
    </Suspense>
  );
}

export async function CallsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const user = await requireUser();

  if (!hasPermission(role, PERM.CALL_VIEW)) {
    return <NoAccess what="call log" />;
  }

  const canViewAll = hasPermission(role, PERM.CALL_VIEW_ALL);
  const canViewFullNumber = hasPermission(role, PERM.CALL_VIEW_FULL_NUMBER);
  const canCreate = hasPermission(role, PERM.CALL_CREATE);
  const canListenRecording = hasPermission(role, PERM.CALL_RECORDING_LISTEN);

  // Load initial calls (first page)
  // Without CALL_VIEW_ALL, users only see calls where they are the caller or callee
  const calls = await prisma.callLog.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(canViewAll ? {} : { OR: [{ callerUserId: user.id }, { calleeUserId: user.id }] }),
    },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      direction: true,
      fromNumber: true,
      toNumber: true,
      status: true,
      startedAt: true,
      durationSec: true,
      disposition: true,
      notes: true,
      source: true,
      legalHold: true,
      companyPhoneId: true,
      callerUserId: true,
      calleeUserId: true,
      relatedProjectId: true,
      recording: { select: { id: true, durationSec: true, transcriptStatus: true } },
      voicemail: { select: { id: true } },
      companyPhone: { select: { id: true, phoneNumber: true, label: true } },
      caller: { select: { id: true, name: true } },
      callee: { select: { id: true, name: true } },
      tags: { include: { callTag: { select: { id: true, name: true, color: true } } } },
    },
  });

  // Load company phone numbers for the filter
  const phoneNumbers = await prisma.companyPhone.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, phoneNumber: true, label: true, department: true },
    orderBy: { phoneNumber: "asc" },
  });

  // Load call tags
  const tags = await prisma.callTag.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });

  const serializedCalls = calls.map((c) => ({
    ...c,
    direction: c.direction as "INBOUND" | "OUTBOUND" | "INTERNAL",
    status: c.status as "RINGING" | "ANSWERED" | "MISSED" | "BUSY" | "REJECTED" | "FAILED" | "VOICEMAIL",
    startedAt: c.startedAt.toISOString(),
  }));

  return (
    <CallsView
      calls={serializedCalls}
      phoneNumbers={phoneNumbers}
      tags={tags}
      canViewAll={canViewAll}
      canViewFullNumber={canViewFullNumber}
      canCreate={canCreate}
      canListenRecording={canListenRecording}
    />
  );
}
