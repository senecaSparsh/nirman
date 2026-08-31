import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import {
  Wallet,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { prisma } from "@nirman/db";
import { getTallySyncStats, getSupplierOutstanding } from "@nirman/services";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  SectionHead,
  Badge,
} from "@/components/mobile/v2/primitives";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { TallySyncButton } from "@/components/mobile/tally-sync-button";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";
import { AccountsInteractive } from "./accounts-interactive";
import { CashFlowSnapshot, type PayableNode } from "./CashFlowSnapshot";

/**
 * Accounts / Tally module home — the third tab.
 *
 * Visual architecture (mirrors the inventory and HR homes):
 *   1. Attention banner carousel — Tally failures, pending syncs, overdue payables, draft payroll
 *   2. KPI strip (4-col) — payables / receipts / tally pending / tally failed
 *   3. Cash / Books toggle + quick actions grid
 *   4. Cash flow snapshot — inflow vs outflow bars + top payables
 *   5. Pending queue — Tally failures, overdue payables, draft payroll (sync action inline)
 *   6. Recent receipts — latest payments received
 *
 * Covers: payables, receipts, ledger, Tally sync, GST, TDS, expenses, reports.
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

  const [
    tallyStats,
    recentReceipts,
    allSupplierOutstanding,
    draftPayroll,
    recentExpenses,
    recentProjectCosts,
  ] = await Promise.all([
    getTallySyncStats(company.id).catch(() => ({
      total: 0, synced: 0, failed: 0, pending: 0, imported: 0, variance: 0,
    })),
    prisma.assetSalePayment
      .findMany({
        where: { assetSale: { companyId: company.id } },
        orderBy: { paymentDate: "desc" },
        take: 5,
        include: {
          assetSale: { select: { customer: { select: { name: true } } } },
        },
      })
      .catch(() => []),
    // Use the same service function as Settings page for consistency
    getSupplierOutstanding(company.id).catch(() => []),
    prisma.payrollPeriod
      .findFirst({
        where: { companyId: company.id, status: "DRAFT" },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { id: true, month: true, year: true, totalNet: true },
      })
      .catch(() => null),
    prisma.expense
      .findMany({
        where: { companyId: company.id },
        orderBy: { date: "desc" },
        take: 5,
        select: {
          id: true,
          category: true,
          amount: true,
          date: true,
          project: { select: { name: true } },
        },
      })
      .catch(() => []),
    prisma.projectCost
      .findMany({
        where: { project: { companyId: company.id } },
        orderBy: { date: "desc" },
        take: 5,
        select: {
          id: true,
          costType: true,
          amount: true,
          date: true,
          project: { select: { name: true } },
        },
      })
      .catch(() => []),
  ]);

  // Only suppliers with outstanding balance > 0 are "payable"
  const payableSuppliers = allSupplierOutstanding
    .filter((s) => toNum(s.balanceOwed) > 0)
    .sort((a, b) => toNum(b.balanceOwed) - toNum(a.balanceOwed));
  const _totalPayables = payableSuppliers.reduce(
    (s, x) => s + toNum(x.balanceOwed),
    0,
  );
  const _payableVendorCount = payableSuppliers.length;
  const totalReceipts = recentReceipts.reduce(
    (s, r) => s + toNum(r.amount),
    0,
  );

  // ── Compute outflow (expenses + project costs) ──
  const totalExpenses = recentExpenses.reduce((s, e) => s + toNum(e.amount), 0);
  const totalProjectCosts = recentProjectCosts.reduce(
    (s, c) => s + toNum(c.amount),
    0,
  );
  const totalOutflow = totalExpenses + totalProjectCosts;

  // Serialize payables for the snapshot component
  const payableNodes: PayableNode[] = payableSuppliers
    .slice(0, 6)
    .map((s) => ({
      supplierId: s.supplierId,
      name: s.name,
      balanceOwed: toNum(s.balanceOwed),
    }));

  // ── Build attention banners ──
  const attentionBanners: AttentionBanner[] = [];

  // Tally sync failures (highest severity)
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
      id: s.supplierId,
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
    const monthName = new Date(
      2000,
      draftPayroll.month - 1,
      1,
    ).toLocaleString("en-IN", { month: "short" });
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
      href: "/m/accounts",
      severity: "clear",
      qtyText: "✓",
      category: "Everything looks good",
    });
  }

  const totalPending =
    tallyStats.failed + tallyStats.pending + (draftPayroll ? 1 : 0);

  return (
    <div>
      {/* ── 1. Attention banner carousel ── */}
      <AttentionBannerCarousel
        banners={attentionBanners}
        approvalsCount={totalPending}
      />

      {/* ── 2. Cash / Books toggle + quick actions ── */}
      <AccountsInteractive />

      {/* ── 4. Cash flow snapshot ── */}
      <SectionHead title="Cash Flow" />
      <CashFlowSnapshot
        inflow={totalReceipts}
        outflow={totalOutflow}
        payables={payableNodes}
      />

      {/* ── 5. Pending queue ── */}
      {totalPending > 0 ? (
        <>
          <MobileSectionTitle>Pending actions</MobileSectionTitle>
          <div className="flex flex-col gap-2 mb-3">
            {tallyStats.failed > 0 && (
              <MobileRow
                href="/m/books/gl"
                icon={AlertCircle}
                title="Tally sync failures"
                subtitle={`${tallyStats.failed} journal entries failed to sync — review and retry`}
                meta={String(tallyStats.failed)}
                metaSub="failed"
                tone="danger"
                badge={<Badge tone="stop">failed</Badge>}
              />
            )}
            {tallyStats.pending > 0 && (
              <MobileRow
                href="/m/books/gl"
                icon={RefreshCw}
                title="Entries pending Tally sync"
                subtitle={`${tallyStats.pending} posted entries not yet pushed to Tally ERP`}
                meta={String(tallyStats.pending)}
                metaSub="pending"
                tone="warning"
                badge={<Badge tone="signal">pending</Badge>}
              />
            )}
            {/* Tally sync action — lives here next to the rows it resolves */}
            {(tallyStats.pending > 0 || tallyStats.failed > 0) && (
              <TallySyncButton pendingCount={tallyStats.pending} />
            )}
            {draftPayroll && (
              <MobileRow
                href="/m/books/payroll"
                icon={Wallet}
                title={`Payroll draft — ${new Date(2000, draftPayroll.month - 1, 1).toLocaleString("en-IN", { month: "short" })} ${draftPayroll.year}`}
                subtitle={
                  draftPayroll.totalNet
                    ? `Net: ${formatCurrency(toNum(draftPayroll.totalNet))}`
                    : "Awaiting processing"
                }
                meta="Draft"
                metaSub="payroll"
                tone="warning"
                badge={<Badge tone="signal">draft</Badge>}
              />
            )}
          </div>
        </>
      ) : null}

      {/* ── 7. Recent receipts ── */}
      {recentReceipts.length > 0 ? (
        <>
          <MobileSectionTitle
            right={
              <Link
                href="/m/books/receipts"
                className="text-m-label font-semibold text-m-body press"
                style={{ color: "var(--color-ink-500)" }}
              >
                View all
              </Link>
            }
          >
            Recent receipts
          </MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {recentReceipts.map((r) => (
              <MobileRow
                key={r.id}
                href={`/m/books/receipts/${r.id}?kind=ASSET`}
                icon={Wallet}
                title={r.assetSale?.customer?.name ?? "—"}
                subtitle={`${formatDate(r.paymentDate)} · ${r.mode}`}
                meta={formatCurrency(toNum(r.amount))}
                metaSub="Property Sale"
                tone="success"
                badge={<Badge tone="go">received</Badge>}
              />
            ))}
          </div>
        </>
      ) : (
        <MobileEmptyState
          icon={Wallet}
          title="No receipts yet"
          hint="Payments received from sales will appear here"
          action={
            <Link
              href="/m/books/receipts"
              className="text-m-label font-semibold text-m-body press"
              style={{ color: "var(--color-ink-500)" }}
            >
              Go to receipts →
            </Link>
          }
        />
      )}
    </div>
  );
}
