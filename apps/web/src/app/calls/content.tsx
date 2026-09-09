import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, requireUser } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { CallsView } from "@/components/calls/calls-view";
import { TelephonyView } from "@/components/calls/telephony-view";
import { CallsTabs } from "@/components/calls/calls-tabs";

export async function CallsContent({
  searchParams = Promise.resolve({}),
}: { searchParams?: Promise<{ tab?: string }> } = {}) {
  await connection();
  const { tab } = await searchParams;
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
  const canManageTelephony = hasPermission(role, PERM.TELEPHONY_MANAGE);
  const canViewTelephony = hasPermission(role, PERM.TELEPHONY_VIEW);

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

  // ── Conditionally fetch telephony data when the telephony tab is active ──
  const activeTab = tab ?? "log";
  const needTelephony = activeTab === "telephony" && canViewTelephony;

  let telephonyView: React.ReactNode = null;
  if (needTelephony) {
    const [telephonyNumbers, providers, consentPolicy, memberships] = await Promise.all([
      prisma.companyPhone.findMany({
        where: { companyId: company.id, deletedAt: null },
        select: {
          id: true, phoneNumber: true, phoneNormalized: true, numberType: true,
          provider: true, department: true, label: true, status: true,
          monthlyCost: true, acquiredAt: true, consentBeep: true,
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { calls: true } },
        },
        orderBy: { phoneNumber: "asc" },
      }),
      prisma.telephonyProviderConfig.findMany({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true, provider: true, webhookUrl: true, active: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.consentPolicy.findFirst({
        where: { companyId: company.id, retiredAt: null },
        orderBy: { effectiveAt: "desc" },
        select: { id: true, version: true, policyText: true, effectiveAt: true, _count: { select: { acceptances: true } } },
      }),
      prisma.userCompany.findMany({
        where: { companyId: company.id, user: { isHidden: { not: true } } },
        select: { id: true, recordCalls: true, user: { select: { id: true, name: true, role: true, active: true } } },
        orderBy: { user: { name: "asc" } },
      }),
    ]);

    const members = memberships.map((m) => ({ id: m.user.id, name: m.user.name, role: m.user.role }));
    const recordingMembers = memberships.map((m) => ({ userId: m.user.id, name: m.user.name, role: m.user.role, active: m.user.active, recordCalls: m.recordCalls }));

    telephonyView = (
      <TelephonyView
        company={{
          recordingConsentBeep: company.recordingConsentBeep,
          recordingRetentionDays: company.recordingRetentionDays,
          recordingAutoDelete: company.recordingAutoDelete,
          recordingStorageProvider: company.recordingStorageProvider,
          recordingMode: company.recordingMode,
          passwordMinLength: company.passwordMinLength,
          accountLockoutThreshold: company.accountLockoutThreshold,
          accountLockoutDurationMin: company.accountLockoutDurationMin,
        }}
        phoneNumbers={telephonyNumbers.map((p) => ({
          ...p,
          monthlyCost: p.monthlyCost?.toString() ?? null,
          acquiredAt: p.acquiredAt.toISOString(),
        }))}
        providers={providers.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
        consentPolicy={consentPolicy ? { ...consentPolicy, effectiveAt: consentPolicy.effectiveAt.toISOString() } : null}
        members={members}
        recordingMembers={recordingMembers}
        canManage={canManageTelephony}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Calls"
        description="Call log, recordings, and telephony configuration — all in one place."
      />
      <CallsTabs
        callLog={
          <CallsView
            calls={serializedCalls}
            phoneNumbers={phoneNumbers}
            tags={tags}
            canViewAll={canViewAll}
            canViewFullNumber={canViewFullNumber}
            canCreate={canCreate}
            canListenRecording={canListenRecording}
          />
        }
        telephony={telephonyView ?? (canViewTelephony ? <PageLoading label="Loading telephony…" variant="list" /> : <NoAccess what="telephony settings" />)}
        canViewTelephony={canViewTelephony}
      />
    </>
  );
}
