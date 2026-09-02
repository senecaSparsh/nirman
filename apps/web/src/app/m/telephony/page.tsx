import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileTelephonyView } from "./MobileTelephonyView";

export const metadata = { title: "Telephony · Nirman" };

export default function MobileTelephonyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <div className="size-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-ink-300)", borderTopColor: "transparent" }} />
        </div>
      }
    >
      <TelephonyContent />
    </Suspense>
  );
}

async function TelephonyContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.TELEPHONY_VIEW)) {
    return (
      <div className="py-12 text-center">
        <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
          You don&rsquo;t have access to telephony settings.
        </p>
      </div>
    );
  }

  const canManage = hasPermission(role, PERM.TELEPHONY_MANAGE);

  const [phoneNumbers, providers, consentPolicy, memberships] = await Promise.all([
    prisma.companyPhone.findMany({
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
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { calls: true } },
      },
      orderBy: { phoneNumber: "asc" },
    }),
    prisma.telephonyProviderConfig.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, provider: true, webhookUrl: true, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.consentPolicy.findFirst({
      where: { companyId: company.id, retiredAt: null },
      orderBy: { effectiveAt: "desc" },
      select: { id: true, version: true, policyText: true, effectiveAt: true, _count: { select: { acceptances: true } } },
    }),
    prisma.userCompany.findMany({
      where: { companyId: company.id },
      select: {
        id: true,
        recordCalls: true,
        user: { select: { id: true, name: true, role: true, active: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const members = memberships.map((m) => ({ id: m.user.id, name: m.user.name, role: m.user.role }));
  const recordingMembers = memberships.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    role: m.user.role,
    active: m.user.active,
    recordCalls: m.recordCalls,
  }));

  return (
    <MobileTelephonyView
      company={{
        recordingConsentBeep: company.recordingConsentBeep,
        recordingRetentionDays: company.recordingRetentionDays,
        recordingAutoDelete: company.recordingAutoDelete,
        recordingStorageProvider: company.recordingStorageProvider,
        recordingMode: company.recordingMode,
      }}
      phoneNumbers={phoneNumbers.map((p) => ({ ...p }))}
      providers={providers.map((p) => ({ ...p }))}
      consentPolicy={consentPolicy ? { ...consentPolicy, effectiveAt: consentPolicy.effectiveAt.toISOString() } : null}
      members={members}
      recordingMembers={recordingMembers}
      canManage={canManage}
    />
  );
}
