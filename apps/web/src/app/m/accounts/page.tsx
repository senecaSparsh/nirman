import { Suspense } from "react";
import { connection } from "next/server";
import {
  Receipt,
  Wallet,
  IndianRupee,
  TrendingUp,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { prisma } from "@nirman/db";
import { getTallySyncStats } from "@nirman/services";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  SectionHead,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { TallySyncButton } from "@/components/mobile/tally-sync-button";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";

/**
 * Accounts / Tally module home — the third tab.
 *
 * Covers: payables, receipts, ledger, Tally sync, reports.
 * The Tally integration is the defining feature of this module.
 */
export default function AccountsHomePage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <AccountsContent />
    </Suspense>
  );
}

async function AccountsContent() {
  await connection();
  const company = await getCompany();

  const [tallyStats, recentReceipts, payableSuppliers, draftPayroll, ,] =
    await Promise.all([
      getTallySyncStats(company.id).catch(() => ({
        total: 0, synced: 0, failed: 0, pending: 0, imported: 0, variance: 0,
      })),
      prisma.assetSalePayment.findMany({
        where: { assetSale: { companyId: company.id } },
        orderBy: { paymentDate: "desc" },
        take: 5,
        include: { assetSale: { select: { customer: { select: { name: true } } } } },
      }).catch(() => []),
      prisma.supplier.findMany({
        where: { deletedAt: null, balanceOwed: { gt: 0 }, purchaseOrders: { some: { companyId: company.id } } },
        orderBy: { balanceOwed: "desc" },
        take: 5,
        select: { id: true, name: true, balanceOwed: true },
      }).catch(() => []),
      prisma.payrollPeriod.findFirst({
        where: { companyId: company.id, status: "DRAFT" },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { id: true, month: true, year: true, totalNet: true },
      }).catch(() => null),
      prisma.expense.findMany({
        where: { companyId: company.id },
        orderBy: { date: "desc" },
        take: 3,
        select: { id: true, category: true, amount: true, project: { select: { name: true } } },
      }).catch(() => []),
    ]);

  const totalPayables = payableSuppliers.reduce((s, x) => s + toNum(x.balanceOwed), 0);
  const totalReceipts = recentReceipts.reduce((s, r) => s + toNum(r.amount), 0);

  // ── Build attention banners ──
  const attentionBanners: AttentionBanner[] = [];

  // Tally sync failures
  if (tallyStats.failed > 0) {
    attentionBanners.push({
      id: "tally-failed",
      title: `${tallyStats.failed} Tally sync failure${tallyStats.failed !== 1 ? "s" : ""}`,
      subtitle: `Journal entries failed to sync — review and retry`,
      href: "/m/books/gl",
      severity: "out",
      qtyText: String(tallyStats.failed),
      category: "Tally Sync",
    });
  }

  // Tally pending
  if (tallyStats.pending > 0) {
    attentionBanners.push({
      id: "tally-pending",
      title: `${tallyStats.pending} entr${tallyStats.pending !== 1 ? "ies" : "y"} pending Tally sync`,
      subtitle: `Sync now to push to Tally ERP`,
      href: "/m/books/gl",
      severity: "low",
      qtyText: String(tallyStats.pending),
      category: "Tally Sync",
    });
  }

  // Outstanding payables — one per top vendor
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

  // Draft payroll
  if (draftPayroll) {
    const monthName = new Date(2000, draftPayroll.month - 1, 1).toLocaleString("en-IN", { month: "short" });
    attentionBanners.push({
      id: "draft-payroll",
      title: `Payroll draft — ${monthName} ${draftPayroll.year}`,
      subtitle: draftPayroll.totalNet
        ? `Net payable: ${formatCurrency(toNum(draftPayroll.totalNet))}`
        : `Awaiting approval to process`,
      href: "/m/books/payroll",
      severity: "low",
      qtyText: "Draft",
      category: "Payroll",
    });
  }

  // If no alerts, show green "all caught up"
  if (attentionBanners.length === 0) {
    attentionBanners.push({
      id: "clear",
      title: "All caught up!",
      subtitle: `${formatCurrency(totalReceipts)} received recently · no pending syncs · no outstanding payables`,
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

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MobileStatCard label="Payables" value={formatCurrency(totalPayables)} hint={`${payableSuppliers.length} vendors`} icon={Receipt} tone={totalPayables > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Receipts" value={formatCurrency(totalReceipts)} hint={`${recentReceipts.length} recent`} icon={Wallet} tone="go" />
        <MobileStatCard label="Tally Pending" value={formatNumber(tallyStats.pending, 0)} icon={AlertCircle} tone={tallyStats.pending > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Tally Failed" value={formatNumber(tallyStats.failed, 0)} icon={AlertCircle} tone={tallyStats.failed > 0 ? "stop" : "neutral"} />
      </div>

      {/* ── Tally sync action ── */}
      <div className="mb-3">
        <TallySyncButton pendingCount={tallyStats.pending} />
      </div>

      {/* ── Quick actions ── */}
      <SectionHead title="Quick actions" />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MobileCta href="/m/books/receipts" icon={Wallet} variant="secondary">
          Record Receipt
        </MobileCta>
        <MobileCta href="/m/books/finance" icon={IndianRupee} variant="secondary">
          Record Payment
        </MobileCta>
        <MobileCta href="/m/books/gl" icon={BookOpen} variant="secondary">
          General Ledger
        </MobileCta>
        <MobileCta href="/m/books/reports" icon={TrendingUp} variant="secondary">
          Reports
        </MobileCta>
      </div>

      {/* ── Recent receipts ── */}
      {recentReceipts.length > 0 ? (
        <>
          <MobileSectionTitle>Recent receipts</MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {recentReceipts.map((r) => (
              <MobileRow
                key={r.id}
                href={`/m/books/receipts/${r.id}?kind=ASSET`}
                title={r.assetSale?.customer?.name ?? "—"}
                subtitle={`${formatDate(r.paymentDate)} · ${r.mode}`}
                meta={formatCurrency(toNum(r.amount))}
                metaSub="Property Sale"
                tone="success"
              />
            ))}
          </div>
        </>
      ) : (
        <MobileEmptyState
          icon={Wallet}
          title="No receipts yet"
          hint="Payments received will appear here"
        />
      )}
    </div>
  );
}
