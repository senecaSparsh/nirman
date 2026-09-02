import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, requireUser } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileCallsView } from "./MobileCallsView";

export const metadata = { title: "Call Log · Nirman" };

export default function MobileCallsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <div className="size-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-ink-300)", borderTopColor: "transparent" }} />
        </div>
      }
    >
      <CallsContent />
    </Suspense>
  );
}

async function CallsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const user = await requireUser();

  if (!hasPermission(role, PERM.CALL_VIEW)) {
    return (
      <div className="py-12 text-center">
        <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
          You don&rsquo;t have access to the call log.
        </p>
      </div>
    );
  }

  const canViewAll = hasPermission(role, PERM.CALL_VIEW_ALL);
  const canViewFullNumber = hasPermission(role, PERM.CALL_VIEW_FULL_NUMBER);
  const canListenRecording = hasPermission(role, PERM.CALL_RECORDING_LISTEN);

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
      source: true,
      legalHold: true,
      recording: { select: { id: true, durationSec: true } },
      voicemail: { select: { id: true } },
      companyPhone: { select: { id: true, phoneNumber: true, label: true } },
      caller: { select: { id: true, name: true } },
      callee: { select: { id: true, name: true } },
      tags: { include: { callTag: { select: { id: true, name: true, color: true } } } },
    },
  });

  const phoneNumbers = await prisma.companyPhone.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, phoneNumber: true, label: true },
    orderBy: { phoneNumber: "asc" },
  });

  const serializedCalls = calls.map((c) => ({
    ...c,
    direction: c.direction as "INBOUND" | "OUTBOUND" | "INTERNAL",
    status: c.status as "RINGING" | "ANSWERED" | "MISSED" | "BUSY" | "REJECTED" | "FAILED" | "VOICEMAIL",
    startedAt: c.startedAt.toISOString(),
  }));

  return (
    <MobileCallsView
      calls={serializedCalls}
      phoneNumbers={phoneNumbers}
      canViewAll={canViewAll}
      canViewFullNumber={canViewFullNumber}
      canListenRecording={canListenRecording}
    />
  );
}
