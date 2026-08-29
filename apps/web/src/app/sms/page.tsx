import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { NoAccess } from "@/components/no-access";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SmsView } from "@/components/sms/sms-view";

export const metadata = { title: "Bank SMS · Nirman" };

/**
 * /sms — Bank SMS auto-payment parsing.
 *
 * The client's request: "जो मुझे मैसेज आते हैं टेक्स्ट पे पेमेंट रिसीव्ड
 * वो ये पढ़ लो और क्रिएट कर दे" — read payment received SMS and auto-create
 * payment entries. This page shows all ingested SMS, their match status,
 * and lets the user manually match unmatched ones.
 */
export default function SmsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading SMS log…" variant="list" />}>
      <SmsContent />
    </Suspense>
  );
}

async function SmsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.SALES_VIEW)) {
    return <NoAccess what="the SMS log" />;
  }

  const canCreate = hasPermission(role, PERM.SALE_CREATE);

  const [smsRecords, stats] = await Promise.all([
    prisma.bankSms.findMany({
      where: { companyId: company.id },
      orderBy: { receivedAt: "desc" },
      take: 200,
    }),
    prisma.bankSms.groupBy({
      by: ["status"],
      where: { companyId: company.id },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const totalMatched = stats.find((s) => s.status === "MATCHED")?._sum.amount ?? null;
  const matchedCount = stats.find((s) => s.status === "MATCHED")?._count ?? 0;
  const unmatchedCount = stats.find((s) => s.status === "UNMATCHED")?._count ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bank SMS"
        description="Auto-parse bank SMS notifications and match them to outstanding payments. Forward your payment received SMS here."
        stats={[
          { label: "Total SMS", value: smsRecords.length },
          { label: "Matched", value: matchedCount },
          { label: "Unmatched", value: unmatchedCount },
          { label: "Auto-collected", value: totalMatched ? formatCurrency(toNum(totalMatched)) : "₹0" },
        ]}
      />
      <div className="flex justify-end">
        <RefreshButton />
      </div>

      <SmsView
        items={smsRecords.map((s) => ({
          id: s.id,
          sender: s.sender,
          message: s.message,
          receivedAt: s.receivedAt.toISOString(),
          amount: s.amount ? toNum(s.amount) : null,
          upiRef: s.upiRef,
          bankName: s.bankName,
          txnType: s.txnType,
          counterparty: s.counterparty,
          status: s.status,
          matchedEntityType: s.matchedEntityType,
          matchedEntityId: s.matchedEntityId,
          paymentRecordId: s.paymentRecordId,
          matchConfidence: s.matchConfidence ? toNum(s.matchConfidence) : null,
          matchReason: s.matchReason,
        }))}
        canCreate={canCreate}
      />
    </div>
  );
}
