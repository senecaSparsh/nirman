import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { trialBalance, getTallySyncStats } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { GeneralLedgerView } from "@/components/finance/general-ledger-view";
import { TallySyncPanel } from "@/components/finance/tally-sync-panel";

import { NoAccess } from "@/components/no-access";
export const metadata = { title: "General Ledger · Nirman" };

export default function GeneralLedgerPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="General Ledger"
        description="Double-entry bookkeeping and GST posting. Every transaction posts a balanced journal entry automatically."
      />
      <Suspense fallback={<PageLoading label="Loading trial balance…" />}>
        <GeneralLedgerContent />
      </Suspense>
    </div>
  );
}

async function GeneralLedgerContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="the general ledger" />
    );
  }

  const [tb, accounts, tallyStats] = await Promise.all([
    trialBalance(company.id),
    prisma.glAccount.findMany({ orderBy: { code: "asc" } }),
    getTallySyncStats(company.id),
  ]);

  const accountRows = accounts.map((a) => ({
    code: a.code,
    name: a.name,
    type: a.type,
    isSystem: a.isSystem,
  }));

  const tbRows = tb.accounts.map((a) => ({
    code: a.code,
    name: a.name,
    type: a.type,
    debit: toNum(a.debit),
    credit: toNum(a.credit),
    balance: toNum(a.balance),
  }));

  return (
    <>
      <GeneralLedgerView
        accounts={accountRows}
        trialBalance={tbRows}
        totalDebit={toNum(tb.totalDebit)}
        totalCredit={toNum(tb.totalCredit)}
        isBalanced={tb.isBalanced}
      />
      {hasPermission(role, PERM.FINANCE_MANAGE) && (
        <TallySyncPanel stats={tallyStats} />
      )}
    </>
  );
}
