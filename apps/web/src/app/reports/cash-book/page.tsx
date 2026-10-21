import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserPermissions, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { Page } from "@/components/page";
import { CashBookView, type CashBookLine } from "@/components/reports/cash-book-report";

const CASH_CODES = ["1000", "1050", "1060"]; // Cash, Petty Cash, RERA Escrow
const ACCOUNT_NAMES: Record<string, string> = {
  "1000": "Cash in Hand",
  "1050": "Petty Cash",
  "1060": "RERA Escrow Account",
};

/**
 * Cash Book — every debit/credit touching the cash accounts (cash in hand,
 * petty cash, the RERA escrow account), running balance, daily totals. The
 * report the cashier and the CA open every morning.
 */
export default function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <Page>
      <Suspense fallback={<PageLoading label="Loading cash book…" variant="cards" />}>
        <CashBookContent searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function CashBookContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.FINANCE_VIEW)) {
    return <NoAccess what="the cash book" permission={PERM.FINANCE_VIEW} />;
  }
  const company = await getCompany();
  const { from, to } = await searchParams;

  const today = new Date();
  const fromDate = from ? new Date(from) : new Date(today.getFullYear(), today.getMonth(), 1);
  const toDate = to ? new Date(to) : today;
  toDate.setHours(23, 59, 59, 999);

  const accounts = await prisma.glAccount.findMany({
    where: { companyId: company.id, code: { in: CASH_CODES } },
    select: { id: true, code: true, name: true },
  });
  const accountIds = accounts.map((a) => a.id);
  const nameById = new Map(accounts.map((a) => [a.id, `${a.code} — ${ACCOUNT_NAMES[a.code] ?? a.name}`]));

  // Opening balance — everything posted before `from`.
  const opening = await prisma.journalLine.aggregate({
    where: {
      accountId: { in: accountIds },
      journalEntry: { companyId: company.id, status: "POSTED", entryDate: { lt: fromDate } },
    },
    _sum: { debit: true, credit: true },
  });
  const openingBalance = toNum(opening._sum.debit) - toNum(opening._sum.credit);

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        companyId: company.id,
        status: "POSTED",
        entryDate: { gte: fromDate, lte: toDate },
      },
    },
    select: {
      id: true,
      accountId: true,
      debit: true,
      credit: true,
      memo: true,
      entityType: true,
      entityId: true,
      journalEntry: {
        select: { entryNumber: true, entryDate: true, sourceType: true, memo: true, sourceId: true },
      },
    },
    orderBy: { journalEntry: { entryDate: "asc" } },
    take: 500,
  });

  // Running balance walk (plain loop — map-with-accumulator trips the
  // immutability lint)
  let running = openingBalance;
  const mapped: CashBookLine[] = [];
  for (const l of lines) {
    const dr = toNum(l.debit);
    const cr = toNum(l.credit);
    running += dr - cr;
    mapped.push({
      id: l.id,
      date: l.journalEntry.entryDate.toISOString(),
      entryNumber: l.journalEntry.entryNumber,
      accountName: nameById.get(l.accountId) ?? l.accountId,
      narration: l.memo ?? l.journalEntry.memo ?? l.journalEntry.sourceType ?? "—",
      debit: dr,
      credit: cr,
      balance: running,
    });
  }

  const totalDebit = mapped.reduce((s, l) => s + l.debit, 0);
  const totalCredit = mapped.reduce((s, l) => s + l.credit, 0);

  return (
    <>
      <PageHeader
        title="Cash Book"
        description="Every cash/petty-cash/escrow movement with running balance — the cashier's daily book."
        stats={[
          { label: "Opening", value: formatInr(openingBalance), hint: `Balance on ${fromDate.toLocaleDateString("en-IN")}` },
          { label: "In", value: formatInr(totalDebit), hint: "Total cash debits in the period." },
          { label: "Out", value: formatInr(totalCredit), hint: "Total cash credits in the period." },
          { label: "Closing", value: formatInr(running), hint: `Balance at ${toDate.toLocaleDateString("en-IN")} — should match physical cash + bank.` },
        ]}
      />
      <CashBookView
        lines={mapped}
        openingBalance={openingBalance}
        closingBalance={running}
        defaultFrom={fromDate.toISOString().slice(0, 10)}
        defaultTo={toDate.toISOString().slice(0, 10)}
      />
    </>
  );
}

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
