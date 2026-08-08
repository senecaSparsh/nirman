import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { BookOpen } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileGlList } from "./MobileGlList";

/**
 * /m/books/gl — mobile trial balance. Replaces desktop `/gl` leaks.
 * GlAccount is a global chart of accounts (no companyId). To get
 * company-scoped balances, we query JournalLine through JournalEntry
 * which has the companyId filter.
 */
export default function MobileGlPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileGlContent />
    </Suspense>
  );
}

async function MobileGlContent() {
  await connection();
  const company = await getCompany();

  const accounts = await prisma.glAccount.findMany({
    orderBy: { code: "asc" },
    include: {
      journalLines: {
        where: { journalEntry: { companyId: company.id } },
        select: { debit: true, credit: true },
      },
    },
  });

  const rows = accounts
    .map((a) => {
      const debit = a.journalLines.reduce((s, l) => s + toNum(l.debit), 0);
      const credit = a.journalLines.reduce((s, l) => s + toNum(l.credit), 0);
      const balance = debit - credit;
      return { code: a.code, name: a.name, type: a.type, debit, credit, balance };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  // Serialize for the client component (search by account code or name)
  const serialized = rows.map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type,
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Trial Balance"
        subtitle={`${rows.length} accounts`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Total Debit" value={formatCurrency(totalDebit)} icon={BookOpen} />
        <MobileStatCard label="Total Credit" value={formatCurrency(totalCredit)} icon={BookOpen} tone="success" />
      </div>

      {totalDebit !== totalCredit && (
        <div className="mx-3 mb-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-meta text-danger">
          Out of balance by {formatCurrency(Math.abs(totalDebit - totalCredit))}
        </div>
      )}

      {rows.length === 0 ? (
        <MobileEmptyState icon={BookOpen} title="No journal entries" hint="Post transactions to see balances" />
      ) : (
        <MobileGlList items={serialized} />
      )}
    </div>
  );
}
