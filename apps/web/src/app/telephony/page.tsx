import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { TelephonyView } from "@/components/calls/telephony-view";

export const metadata = { title: "Telephony · Nirman" };

export default function TelephonyPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading telephony…" variant="list" />}>
      <TelephonyContent />
    </Suspense>
  );
}

async function TelephonyContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.TELEPHONY_VIEW)) {
    return <NoAccess what="telephony settings" />;
  }

  const canManage = hasPermission(role, PERM.TELEPHONY_MANAGE);

  const phoneNumbers = await prisma.companyPhone.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true,
      phoneNumber: true,
      phoneNormalized: true,
      numberType: true,
      provider: true,
      department: true,
      label: true,
      status: true,
      monthlyCost: true,
      acquiredAt: true,
      consentBeep: true,
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { calls: true } },
    },
    orderBy: { phoneNumber: "asc" },
  });

  const providers = await prisma.telephonyProviderConfig.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true,
      provider: true,
      webhookUrl: true,
      active: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const consentPolicy = await prisma.consentPolicy.findFirst({
    where: { companyId: company.id, retiredAt: null },
    orderBy: { effectiveAt: "desc" },
    select: {
      id: true,
      version: true,
      policyText: true,
      effectiveAt: true,
      _count: { select: { acceptances: true } },
    },
  });

  // Get all company members for the assign dropdown + recording selection
  const memberships = await prisma.userCompany.findMany({
    where: { companyId: company.id },
    select: {
      id: true,
      recordCalls: true,
      user: { select: { id: true, name: true, role: true, active: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const members = memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    role: m.user.role,
  }));

  const recordingMembers = memberships.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    role: m.user.role,
    active: m.user.active,
    recordCalls: m.recordCalls,
  }));

  return (
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
      phoneNumbers={phoneNumbers.map((p) => ({
        ...p,
        monthlyCost: p.monthlyCost?.toString() ?? null,
        acquiredAt: p.acquiredAt.toISOString(),
      }))}
      providers={providers.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
      consentPolicy={consentPolicy ? {
        ...consentPolicy,
        effectiveAt: consentPolicy.effectiveAt.toISOString(),
      } : null}
      members={members}
      recordingMembers={recordingMembers}
      canManage={canManage}
    />
  );
}
