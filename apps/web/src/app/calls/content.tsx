import { connection } from "next/server";
import { prisma, type Prisma } from "@nirman/db";
import { getCompany, requireUser, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { CallsView } from "@/components/calls/calls-view";
import { TelephonyView } from "@/components/calls/telephony-view";
import { CallsTabs } from "@/components/calls/calls-tabs";

const CALLS_PAGE_SIZE = 50;
const VALID_DIRECTIONS = ["INBOUND", "OUTBOUND", "INTERNAL"];
const VALID_STATUSES = ["RINGING", "ANSWERED", "MISSED", "BUSY", "REJECTED", "FAILED", "VOICEMAIL"];

function formatDuration(sec: number): string {
  if (sec === 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function CallsContent({
  searchParams = Promise.resolve({})}: {
  searchParams?: Promise<{ tab?: string; q?: string; dir?: string; st?: string; phone?: string; tag?: string; page?: string }>;
} = {}) {
  await connection();
  const { tab, q = "", dir = "", st = "", phone = "", tag = "", page: rawPage = "1" } = await searchParams;
  const __effPerms = await getUserPermissions();
  const company = await getCompany();
  const user = await requireUser();

  if (!__effPerms.includes(PERM.CALL_VIEW)) {
    return <NoAccess what="call log" permission={PERM.CALL_VIEW} />;
  }

  const canViewAll = __effPerms.includes(PERM.CALL_VIEW_ALL);
  const canViewFullNumber = __effPerms.includes(PERM.CALL_VIEW_FULL_NUMBER);
  const canCreate = __effPerms.includes(PERM.CALL_CREATE);
  const canListenRecording = __effPerms.includes(PERM.CALL_RECORDING_LISTEN);
  const canManageTelephony = __effPerms.includes(PERM.TELEPHONY_MANAGE);
  const canViewTelephony = __effPerms.includes(PERM.TELEPHONY_VIEW);

  // Load one page of calls, filtered server-side — the URL params
  // (q / dir / st / phone / page) are the filters' source of truth, so a
  // shared link or a refresh reproduces the exact same list.
  // Without CALL_VIEW_ALL, users only see calls where they are the caller or callee
  const qTrim = q.trim();
  const qDigits = normalizePhone(qTrim);
  const callsWhere: Prisma.CallLogWhereInput = {
    companyId: company.id,
    deletedAt: null,
    ...(canViewAll ? {} : { OR: [{ callerUserId: user.id }, { calleeUserId: user.id }] }),
    ...(VALID_DIRECTIONS.includes(dir) ? { direction: dir } : {}),
    ...(VALID_STATUSES.includes(st) ? { status: st } : {}),
    ...(phone ? { companyPhoneId: phone } : {}),
    ...(tag ? { tags: { some: { callTagId: tag } } } : {}),
    ...(qTrim
      ? {
          AND: [
            {
              OR: [
                ...(qDigits
                  ? [{ fromNumber: { contains: qDigits } }, { toNumber: { contains: qDigits } }]
                  : []),
                { caller: { name: { contains: qTrim, mode: "insensitive" as const } } },
                { callee: { name: { contains: qTrim, mode: "insensitive" as const } } },
                { notes: { contains: qTrim, mode: "insensitive" as const } },
              ],
            },
          ],
        }
      : {}),
  };

  const [totalCalls, missedCount, durationAgg] = await Promise.all([
    prisma.callLog.count({ where: callsWhere }),
    prisma.callLog.count({ where: { ...callsWhere, status: "MISSED" } }),
    prisma.callLog.aggregate({ _sum: { durationSec: true }, where: callsWhere }),
  ]);

  // Clamp out-of-range pages (a stale ?page=5 after filters shrink the
  // result set) instead of rendering an empty list.
  const pageCount = Math.max(1, Math.ceil(totalCalls / CALLS_PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(rawPage, 10) || 1), pageCount);

  const calls = await prisma.callLog.findMany({
    where: callsWhere,
    orderBy: { startedAt: "desc" },
    skip: (page - 1) * CALLS_PAGE_SIZE,
    take: CALLS_PAGE_SIZE,
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
      tags: { include: { callTag: { select: { id: true, name: true, color: true } } } }}});

  // Load company phone numbers for the filter
  const phoneNumbers = await prisma.companyPhone.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, phoneNumber: true, label: true, department: true },
    orderBy: { phoneNumber: "asc" }});

  // Load call tags
  const tags = await prisma.callTag.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" }});

  const serializedCalls = calls.map((c) => ({
    ...c,
    direction: c.direction as "INBOUND" | "OUTBOUND" | "INTERNAL",
    status: c.status as "RINGING" | "ANSWERED" | "MISSED" | "BUSY" | "REJECTED" | "FAILED" | "VOICEMAIL",
    startedAt: c.startedAt.toISOString()}));

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
          _count: { select: { calls: true } }},
        orderBy: { phoneNumber: "asc" }}),
      prisma.telephonyProviderConfig.findMany({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true, provider: true, webhookUrl: true, active: true, createdAt: true },
        orderBy: { createdAt: "desc" }}),
      prisma.consentPolicy.findFirst({
        where: { companyId: company.id, retiredAt: null },
        orderBy: { effectiveAt: "desc" },
        select: { id: true, version: true, policyText: true, effectiveAt: true, _count: { select: { acceptances: true } } }}),
      prisma.userCompany.findMany({
        where: { companyId: company.id, user: { isHidden: { not: true } } },
        select: { id: true, recordCalls: true, user: { select: { id: true, name: true, role: true, active: true } } },
        orderBy: { user: { name: "asc" } }}),
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
          accountLockoutDurationMin: company.accountLockoutDurationMin}}
        phoneNumbers={telephonyNumbers.map((p) => ({
          ...p,
          monthlyCost: p.monthlyCost?.toString() ?? null,
          acquiredAt: p.acquiredAt.toISOString()}))}
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
        stats={[
          { label: "Total", value: totalCalls },
          { label: "Missed", value: missedCount, tone: missedCount > 0 ? "danger" : "muted" },
          { label: "Talk time", value: formatDuration(durationAgg._sum?.durationSec ?? 0), tone: "muted" },
        ]}
      />
      <CallsTabs
        callLog={
          <CallsView
            calls={serializedCalls}
            phoneNumbers={phoneNumbers}
            tags={tags}
            total={totalCalls}
            missedCount={missedCount}
            totalDurationSec={durationAgg._sum?.durationSec ?? 0}
            page={page}
            pageCount={pageCount}
            canViewAll={canViewAll}
            canViewFullNumber={canViewFullNumber}
            canCreate={canCreate}
            canListenRecording={canListenRecording}
          />
        }
        telephony={telephonyView ?? (canViewTelephony ? <PageLoading label="Loading telephony…" variant="list" /> : <NoAccess what="telephony settings" permission={PERM.TELEPHONY_VIEW} />)}
        canViewTelephony={canViewTelephony}
      />
    </>
  );
}
