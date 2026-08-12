import { Suspense } from "react";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Receipt, Wallet, CalendarCheck, BookOpen, TrendingUp, AlertTriangle, Building2, IndianRupee } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";

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
      select: { id: true, month: true, year: true, totalNet: true },
    }),
  ]);

  const totalPayables = payableSuppliers.reduce((s, x) => s + toNum(x.balanceOwed), 0);
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "short" });

  // ── Build attention banners ──
  const attentionBanners: AttentionBanner[] = [];

  for (const s of payableSuppliers.slice(0, 3)) {
    attentionBanners.push({
      id: s.id,
      title: s.name,
      subtitle: `Outstanding payable · ${formatCurrency(toNum(s.balanceOwed))}`,
      href: "/m/suppliers",
      severity: "low",
      qtyText: formatCurrency(toNum(s.balanceOwed)),
      category: "Payable",
    });
  }

  if (draftPayroll) {
    attentionBanners.push({
      id: "draft-payroll",
      title: `Payroll draft — ${monthName(draftPayroll.month)} ${draftPayroll.year}`,
      subtitle: draftPayroll.totalNet
        ? `Net payable: ${formatCurrency(toNum(draftPayroll.totalNet))}`
        : `Awaiting approval to process`,
      href: "/m/books/payroll",
      severity: "low",
      qtyText: "Draft",
      category: "Payroll",
    });
  }

  if (attentionBanners.length === 0) {
    attentionBanners.push({
      id: "clear",
      title: "All caught up!",
      subtitle: `No outstanding payables · no draft payroll · books are balanced`,
      href: "/m/books",
      severity: "clear",
      qtyText: "✓",
      category: "Everything looks good",
    });
  }

  return (
    <div>
      {/* ── Attention banner carousel ── */}
      <AttentionBannerCarousel banners={attentionBanners} />

      {/* ── Quick stats ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MobileStatCard label="Total Payables" value={formatCurrency(totalPayables)} hint={`${payableSuppliers.length} vendors`} icon={Receipt} tone={totalPayables > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Recent Receipts" value={formatNumber(recentReceipts.length, 0)} hint="payments in" icon={Wallet} />
        <MobileStatCard label="Draft Payroll" value={draftPayroll ? `${monthName(draftPayroll.month)} ${draftPayroll.year}` : "None"} icon={CalendarCheck} tone={draftPayroll ? "signal" : "neutral"} />
      </div>

      {/* ── Payables ──────────────────────────────────────── */}
      <MobileSectionTitle>Payables (Vendors Owed)</MobileSectionTitle>
      {payableSuppliers.length === 0 ? (
        <MobileEmptyState icon={Receipt} title="No outstanding payables" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {payableSuppliers.map((s) => (
            <MobileRow key={s.id} icon={Receipt} title={s.name} subtitle={s.phone ?? "no phone"} meta={formatCurrency(toNum(s.balanceOwed))} tone="warning" />
          ))}
        </div>
      )}

      {/* ── Recent receipts ───────────────────────────────── */}
      <MobileSectionTitle>Recent Receipts</MobileSectionTitle>
      {recentReceipts.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No recent payments received" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {recentReceipts.map((p) => (
            <MobileRow key={p.id} icon={Wallet} title={p.assetSale.customer?.name ?? "Unknown"} subtitle={`${formatDate(p.paymentDate)} · ${p.mode}`} meta={formatCurrency(toNum(p.amount))} tone="success" />
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
            <MobileRow key={p.id} icon={CalendarCheck} title={`${monthName(p.month)} ${p.year}`} subtitle={`gross ${formatCurrency(toNum(p.totalGross))}`} meta={formatCurrency(toNum(p.totalNet))} badge={<MobileStatusBadge status={p.status} />} tone={p.status === "PAID" ? "success" : p.status === "DRAFT" ? "warning" : "default"} />
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
            <MobileRow key={e.id} icon={Building2} title={e.category} subtitle={e.project?.name ?? "Company"} meta={formatCurrency(toNum(e.amount))} />
          ))}
        </div>
      )}

      <div className="space-y-2 px-4 pb-4 pt-2">
        {payableSuppliers.length > 0 && (
          <MobileCta href="/m/procurement" icon={IndianRupee} variant="primary">
            Record Supplier Payment ({formatCurrency(totalPayables)} owed)
          </MobileCta>
        )}
        <MobileCta href="/m/books/finance" icon={Wallet} variant="secondary">
          Expenses & Project Costs
        </MobileCta>
        <MobileCta href="/m/books/gl" icon={BookOpen} variant="secondary">
          General Ledger
        </MobileCta>
        <MobileCta href="/m/books/reports" icon={TrendingUp} variant="secondary">
          Analytics
        </MobileCta>
      </div>
    </div>
  );
}
