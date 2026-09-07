import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileTelephonyView } from "./MobileTelephonyView";

export const metadata = { title: "Telephony · Nirman" };

export default function MobileTelephonyPage() {
  return (
    <MobileListPage perm={PERM.TELEPHONY_VIEW} what="telephony settings" permission="telephony.view" managePerm={PERM.TELEPHONY_MANAGE}>
      {async ({ company, canManage }) => {
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
            where: { companyId: company.id, user: { isHidden: { not: true } } },
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
      }}
    </MobileListPage>
  );
}
