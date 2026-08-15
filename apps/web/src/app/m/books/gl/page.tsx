import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { BookOpen } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { MobileEmptyState, MobileStatCard } from "@/components/mobile/v2/primitives";
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
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
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
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Total Debit" value={formatCurrency(totalDebit)} icon={BookOpen} />
        <MobileStatCard label="Total Credit" value={formatCurrency(totalCredit)} icon={BookOpen} tone="go" />
      </div>

      {totalDebit !== totalCredit && (
        <div
          className="mb-4 rounded-[0.5rem] border-2 px-3 py-2 text-[0.5625rem] font-semibold"
          style={{
            borderColor: "color-mix(in srgb, var(--color-stop) 30%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)",
            color: "var(--color-stop)",
          }}
        >
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
