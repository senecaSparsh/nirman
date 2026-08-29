import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileSmsIngest } from "./MobileSmsIngest";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MessageSquare, Plus, Link2, Check, AlertCircle } from "lucide-react";

export const metadata = { title: "Bank SMS · Nirman" };

/**
 * /m/sms — mobile Bank SMS auto-payment parsing.
 * Shows ingested SMS with match status; allows pasting new SMS.
 */
export default function MobileSmsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSmsContent />
    </Suspense>
  );
}

async function MobileSmsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.SALES_VIEW)) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">You don&apos;t have access to the SMS log.</p>
      </div>
    );
  }

  const canCreate = hasPermission(role, PERM.SALE_CREATE);

  const [smsRecords, stats] = await Promise.all([
    prisma.bankSms.findMany({
      where: { companyId: company.id },
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
    prisma.bankSms.groupBy({
      by: ["status"],
      where: { companyId: company.id },
      _count: true,
      _sum: { amount: true },
    }),
  ]);

  const matchedCount = stats.find((s) => s.status === "MATCHED")?._count ?? 0;
  const unmatchedCount = stats.find((s) => s.status === "UNMATCHED")?._count ?? 0;
  const totalMatched = stats.find((s) => s.status === "MATCHED")?._sum.amount ?? null;

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="size-4" style={{ color: "var(--color-ink-600)" }} />
        <h1 className="text-base font-bold" style={{ color: "var(--color-ink-950)" }}>
          Bank SMS
        </h1>
        {canCreate && <MobileSmsIngest />}
      </div>

      {/* Stats */}
      <div
        className="grid grid-cols-3 gap-2 rounded-[0.75rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.5rem] uppercase font-semibold" style={{ color: "var(--color-ink-500)" }}>
            Matched
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--color-go)" }}>
            {matchedCount}
          </p>
        </div>
        <div>
          <p className="text-[0.5rem] uppercase font-semibold" style={{ color: "var(--color-ink-500)" }}>
            Unmatched
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--color-signal)" }}>
            {unmatchedCount}
          </p>
        </div>
        <div>
          <p className="text-[0.5rem] uppercase font-semibold" style={{ color: "var(--color-ink-500)" }}>
            Collected
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--color-ink-950)" }}>
            {totalMatched ? formatCurrency(toNum(totalMatched)) : "₹0"}
          </p>
        </div>
      </div>

      {/* SMS list */}
      {smsRecords.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-[0.75rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <MessageSquare className="size-6" style={{ color: "var(--color-ink-400)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            No SMS yet
          </p>
          <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
            Forward bank payment SMS to auto-create entries.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {smsRecords.map((sms) => {
            const isMatched = sms.status === "MATCHED";
            const isUnmatched = sms.status === "UNMATCHED";
            return (
              <div
                key={sms.id}
                className="rounded-[0.75rem] border p-3"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                }}
              >
                <div className="flex items-start gap-2">
                  {/* Status icon */}
                  <div className="mt-0.5 shrink-0">
                    {isMatched ? (
                      <Check className="size-3.5" style={{ color: "var(--color-go)" }} />
                    ) : isUnmatched ? (
                      <AlertCircle className="size-3.5" style={{ color: "var(--color-signal)" }} />
                    ) : (
                      <MessageSquare className="size-3.5" style={{ color: "var(--color-ink-400)" }} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Amount + bank */}
                    <div className="flex items-center gap-2">
                      {sms.amount && (
                        <span className="text-[0.75rem] font-bold tnum" style={{ color: "var(--color-ink-950)" }}>
                          {formatCurrency(toNum(sms.amount))}
                        </span>
                      )}
                      {sms.bankName && (
                        <span
                          className="rounded px-1 py-0.5 text-[0.5rem] font-medium"
                          style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-600)" }}
                        >
                          {sms.bankName}
                        </span>
                      )}
                    </div>
                    {/* Message */}
                    <p
                      className="mt-1 text-[0.5625rem] line-clamp-2"
                      style={{ color: "var(--color-ink-500)" }}
                    >
                      {sms.message}
                    </p>
                    {/* Meta */}
                    <div
                      className="mt-1 flex items-center gap-2 text-[0.5rem]"
                      style={{ color: "var(--color-ink-400)" }}
                    >
                      <span>{sms.sender}</span>
                      <span>{formatDate(sms.receivedAt)}</span>
                      {sms.upiRef && <span>UPI: {sms.upiRef}</span>}
                    </div>
                    {/* Match reason */}
                    {sms.matchReason && (
                      <p
                        className="mt-1 text-[0.5rem] italic"
                        style={{ color: "var(--color-ink-400)" }}
                      >
                        {sms.matchReason}
                      </p>
                    )}
                    {/* Manual match link */}
                    {isUnmatched && sms.amount && canCreate && (
                      <Link
                        href={`/m/sms?match=${sms.id}`}
                        className="mt-1.5 inline-flex items-center gap-1 text-[0.5625rem] font-semibold"
                        style={{ color: "var(--color-brand)" }}
                      >
                        <Link2 className="size-3" /> Match to sale
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
