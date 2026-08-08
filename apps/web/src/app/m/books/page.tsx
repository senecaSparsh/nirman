import { Suspense } from "react";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Receipt, Wallet, CalendarCheck, BookOpen, TrendingUp, AlertTriangle, Building2, IndianRupee } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileStatCard,
  MobileInfoRow,
  MobileEmptyState,
  MobileCta,
  MobileRefreshButton,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";

/**
 * Finance persona home — "Books".
 * ACCOUNTANT. Record money movement fast: payables, receipts, payroll, ledger.
 */
export default function BooksPage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <BooksContent />
    </Suspense>
  );
}

async function BooksContent() {
  await connection();
  const company = await getCompany();

  const [payableSuppliers, recentReceipts, payrollPeriods, recentExpenses, draftPayroll] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null, balanceOwed: { gt: 0 }, purchaseOrders: { some: { companyId: company.id } } },
      orderBy: { balanceOwed: "desc" },
      take: 8,
      select: { id: true, name: true, phone: true, balanceOwed: true },
    }),
    prisma.assetSalePayment.findMany({
      where: { assetSale: { companyId: company.id }, status: "RECEIVED" },
      orderBy: { paymentDate: "desc" },
      take: 6,
      include: { assetSale: { select: { customer: { select: { name: true } } } } },
    }),
    prisma.payrollPeriod.findMany({
      where: { companyId: company.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 5,
      select: { id: true, month: true, year: true, status: true, totalNet: true, totalGross: true },
    }),
    prisma.expense.findMany({
      where: { companyId: company.id },
      orderBy: { date: "desc" },
      take: 6,
      include: { project: { select: { name: true } } },
    }),
    prisma.payrollPeriod.findFirst({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { id: true, month: true, year: true },
    }),
  ]);

  const totalPayables = payableSuppliers.reduce((s, x) => s + toNum(x.balanceOwed), 0);
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "short" });

  return (
    <div>
      <MobilePageHeader title="Books" subtitle={formatCurrency(totalPayables) + " payables"} right={<MobileRefreshButton />} />

      {/* ── Quick stats ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Total Payables" value={formatCurrency(totalPayables)} hint={`${payableSuppliers.length} vendors`} icon={Receipt} tone={totalPayables > 0 ? "warning" : "default"} />
        <MobileStatCard label="Recent Receipts" value={formatNumber(recentReceipts.length, 0)} hint="payments in" icon={Wallet} />
        <MobileStatCard label="Payroll Periods" value={formatNumber(payrollPeriods.length, 0)} hint="on file" icon={CalendarCheck} />
        <MobileStatCard label="Draft Payroll" value={draftPayroll ? `${monthName(draftPayroll.month)} ${draftPayroll.year}` : "None"} icon={CalendarCheck} tone={draftPayroll ? "warning" : "default"} />
      </div>

      {/* ── Payables ──────────────────────────────────────── */}
      <MobileSectionTitle>Payables (Vendors Owed)</MobileSectionTitle>
      {payableSuppliers.length === 0 ? (
        <MobileEmptyState icon={Receipt} title="No outstanding payables" />
      ) : (
        <div>
          {payableSuppliers.map((s) => (
            <MobileInfoRow key={s.id} icon={Receipt} title={s.name} subtitle={s.phone ?? "no phone"} value={formatCurrency(toNum(s.balanceOwed))} tone="warning" />
          ))}
        </div>
      )}

      {/* ── Recent receipts ───────────────────────────────── */}
      <MobileSectionTitle>Recent Receipts</MobileSectionTitle>
      {recentReceipts.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No recent payments received" />
      ) : (
        <div>
          {recentReceipts.map((p) => (
            <MobileInfoRow key={p.id} icon={Wallet} title={p.assetSale.customer.name} subtitle={`${formatDate(p.paymentDate)} · ${p.mode}`} value={formatCurrency(toNum(p.amount))} tone="success" />
          ))}
        </div>
      )}

      {/* ── Payroll ───────────────────────────────────────── */}
      <MobileSectionTitle>Payroll</MobileSectionTitle>
      {payrollPeriods.length === 0 ? (
        <MobileEmptyState icon={CalendarCheck} title="No payroll periods" />
      ) : (
        <div>
          {payrollPeriods.map((p) => (
            <MobileInfoRow key={p.id} icon={CalendarCheck} title={`${monthName(p.month)} ${p.year}`} subtitle={`gross ${formatCurrency(toNum(p.totalGross))}`} value={formatCurrency(toNum(p.totalNet))} badge={<MobileStatusBadge status={p.status} />} tone={p.status === "PAID" ? "success" : p.status === "DRAFT" ? "warning" : "default"} />
          ))}
        </div>
      )}

      {/* ── Recent expenses ───────────────────────────────── */}
      <MobileSectionTitle>Recent Expenses</MobileSectionTitle>
      {recentExpenses.length === 0 ? (
        <MobileEmptyState icon={AlertTriangle} title="No recent expenses" />
      ) : (
        <div>
          {recentExpenses.map((e) => (
            <MobileInfoRow key={e.id} icon={Building2} title={e.category} subtitle={e.project?.name ?? "Company"} value={formatCurrency(toNum(e.amount))} />
          ))}
        </div>
      )}

      <div className="space-y-2 px-4 pb-4 pt-2">
        {payableSuppliers.length > 0 && (
          <MobileCta href="/procurement" icon={IndianRupee} variant="primary">
            Record Supplier Payment ({formatCurrency(totalPayables)} owed)
          </MobileCta>
        )}
        <MobileCta href="/m/books/finance" icon={Wallet} variant="outline">
          Expenses & Project Costs
        </MobileCta>
        <MobileCta href="/m/books/gl" icon={BookOpen} variant="outline">
          General Ledger
        </MobileCta>
        <MobileCta href="/m/books/reports" icon={TrendingUp} variant="outline">
          Analytics
        </MobileCta>
      </div>
    </div>
  );
}
