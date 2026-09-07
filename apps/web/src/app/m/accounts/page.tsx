import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  Wallet,
  RefreshCw,
  BookOpen,
  ArrowRight,
  Circle,
  ArrowDownLeft,
  Users,
} from "lucide-react";
import { prisma } from "@nirman/db";
import { getTallySyncStats, getSupplierOutstanding } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { loadQuickActionContext } from "@/lib/quick-action-server";
import { formatCurrency, formatCurrencyCompact, formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  SectionHead,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileHubPage } from "@/components/mobile/v2/hub-page";
import { TallySyncButton } from "@/components/mobile/tally-sync-button";
import { AttentionBannerCarousel, type AttentionBanner } from "@/components/mobile/v2/attention-banner-carousel";
import { AccountsInteractive } from "./accounts-interactive";
import { MobileAccountsHubTabs } from "./MobileAccountsHubTabs";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

// ── List components (reused from their existing pages, unchanged) ──
import { MobileExpensesList, type ExpenseListItem } from "../expenses/MobileExpensesList";
import { MobileExpenseClaimsList, type ExpenseClaimListItem } from "../expense-claims/MobileExpenseClaimsList";
import { MobilePettyCashList, type PettyCashFloatListItem } from "../petty-cash/MobilePettyCashList";
import { MobileSupplierPaymentsList, type SupplierPaymentListItem } from "../supplier-payments/MobileSupplierPaymentsList";
import { MobileReceiptsList, type ReceiptListItem } from "../books/receipts/MobileReceiptsList";
import { MobileGlList, type GlListItem } from "../books/gl/MobileGlList";
import { MobileReseedAccountsButton } from "../books/gl/MobileReseedAccountsButton";

/**
 * /m/accounts — Accounts/Finance hub. Groups the dashboard, expenses,
 * expense claims, petty cash, supplier payments, receipts, and GL into
 * one tabbed page — same pattern as /m/stock.
 */
export default function AccountsHomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <MobileHubPage>
      {async ({ company }) => {
        const { tab } = await searchParams;

        // ── Fetch badge counts for the tab bar ──
        const [pendingClaimsCount] = await Promise.all([
          prisma.expenseClaim.count({
            where: { companyId: company.id, status: "SUBMITTED" },
          }).catch(() => 0),
        ]);

        const counts = {
          claims: pendingClaimsCount,
        };

        // ── Render the active tab's content ──
        const validTabs = ["overview", "expenses", "claims", "petty-cash", "payments", "receipts", "gl"];
        const activeTab = validTabs.includes(tab ?? "") ? tab! : "overview";

        let content: React.ReactNode;
        if (activeTab === "expenses") {
          content = <AccountsExpensesTab />;
        } else if (activeTab === "claims") {
          content = <AccountsClaimsTab />;
        } else if (activeTab === "petty-cash") {
          content = <AccountsPettyCashTab />;
        } else if (activeTab === "payments") {
          content = <AccountsPaymentsTab />;
        } else if (activeTab === "receipts") {
          content = <AccountsReceiptsTab />;
        } else if (activeTab === "gl") {
          content = <AccountsGlTab />;
        } else {
          content = <AccountsOverviewContent />;
        }

        return (
          <MobileAccountsHubTabs activeTab={activeTab} counts={counts}>
            {content}
          </MobileAccountsHubTabs>
        );
      }}
    </MobileHubPage>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * OVERVIEW TAB — the existing Accounts dashboard (unchanged content)
 * ═══════════════════════════════════════════════════════════════════════════ */
async function AccountsOverviewContent() {
  await connection();
  const company = await getCompany();

  const [
    tallyStats,
    recentReceipts,
    allSupplierOutstanding,
    draftPayroll,
    recentExpenses,
    recentProjectCosts,
    qaCtx,
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
    loadQuickActionContext("accounts"),
  ]);

  // Only suppliers with outstanding balance > 0 are "payable"
  const payableSuppliers = allSupplierOutstanding
    .filter((s) => toNum(s.balanceOwed) > 0)
    .sort((a, b) => toNum(b.balanceOwed) - toNum(a.balanceOwed));
  const totalPayables = payableSuppliers.reduce(
    (s, x) => s + toNum(x.balanceOwed),
    0,
  );
  const topPayable = payableSuppliers[0];
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
  const netFlow = totalReceipts - totalOutflow;

  // ── Build attention banners ──
  const attentionBanners: AttentionBanner[] = [];

  // Tally sync failures (highest severity)
  if (tallyStats.failed > 0) {
    attentionBanners.push({
      id: "tally-failed",
      title: `${tallyStats.failed} Tally sync failure${tallyStats.failed !== 1 ? "s" : ""}`,
      subtitle: `Journal entries failed to sync — review and retry`,
      href: "/m/accounts?tab=gl",
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
      href: "/m/accounts?tab=gl",
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
      href: "/m/accounts?tab=gl",
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
      <AccountsInteractive persona={qaCtx.persona} savedLayouts={qaCtx.savedLayouts} extraActions={qaCtx.extraActions} />

      {/* ── 3. Today — compact 3-line summary with status flags ──
          Replaces the old CashFlowSnapshot bars, pending queue, and
          recent receipts list. One scannable block with colored dot
          flags: green=healthy, amber=attention, red=urgent, grey=no data. */}
      <SectionHead title="Today" />
      <div
        className="rounded-[0.625rem] border overflow-hidden mb-4"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        {/* Cash position line — flag: green if net positive, red if negative */}
        <Link
          href="/m/reports/cash-flow"
          className="flex items-center gap-2.5 px-3 py-3 text-m-body press"
          style={{ borderBottom: "1px solid var(--color-line)" }}
        >
          <Circle
            className="size-2 shrink-0 fill-current"
            style={{
              color: netFlow >= 0 ? "var(--color-go)" : "var(--color-stop)",
            }}
          />
          <ArrowDownLeft className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
          <span className="flex-1 text-m-body" style={{ color: "var(--color-ink-950)" }}>
            <span className="font-bold tabular-nums">{formatCurrencyCompact(totalReceipts)}</span> in
            <span style={{ color: "var(--color-ink-500)" }}> · </span>
            <span className="font-bold tabular-nums">{formatCurrencyCompact(totalOutflow)}</span> out
            <span style={{ color: "var(--color-ink-500)" }}> · </span>
            <span className="font-bold tabular-nums" style={{ color: netFlow >= 0 ? "var(--color-go)" : "var(--color-stop)" }}>
              {netFlow >= 0 ? "+" : ""}{formatCurrencyCompact(netFlow)}
            </span>
            <span style={{ color: "var(--color-ink-500)" }}> net</span>
          </span>
          <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
        </Link>

        {/* Top payable line — flag: amber if outstanding, green if none */}
        <Link
          href={topPayable ? "/m/suppliers" : "/m/accounts?tab=payments"}
          className="flex items-center gap-2.5 px-3 py-3 text-m-body press"
          style={{ borderBottom: "1px solid var(--color-line)" }}
        >
          <Circle
            className="size-2 shrink-0 fill-current"
            style={{
              color: topPayable ? "var(--color-signal)" : "var(--color-go)",
            }}
          />
          <Users className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          <span className="flex-1 text-m-body truncate" style={{ color: "var(--color-ink-950)" }}>
            {topPayable ? (
              <>
                <span className="font-bold">{topPayable.name}</span>
                <span style={{ color: "var(--color-ink-500)" }}> owes </span>
                <span className="font-bold tabular-nums">{formatCurrency(toNum(topPayable.balanceOwed))}</span>
                {payableSuppliers.length > 1 && (
                  <span style={{ color: "var(--color-ink-500)" }}> · {payableSuppliers.length - 1} more · {formatCurrencyCompact(totalPayables)} total</span>
                )}
              </>
            ) : (
              <span style={{ color: "var(--color-go)" }}>No outstanding payables</span>
            )}
          </span>
          <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
        </Link>

        {/* Pending line — flag: red if failures, amber if pending, green if clear */}
        <Link
          href={tallyStats.failed > 0 ? "/m/accounts?tab=gl" : tallyStats.pending > 0 ? "/m/accounts?tab=gl" : draftPayroll ? "/m/accounts?tab=gl" : "/m/accounts"}
          className="flex items-center gap-2.5 px-3 py-3 text-m-body press"
        >
          <Circle
            className="size-2 shrink-0 fill-current"
            style={{
              color: tallyStats.failed > 0 ? "var(--color-stop)"
                : totalPending > 0 ? "var(--color-signal)"
                : "var(--color-go)",
            }}
          />
          <RefreshCw className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          <span className="flex-1 text-m-body" style={{ color: "var(--color-ink-950)" }}>
            {totalPending > 0 ? (
              <>
                {tallyStats.failed > 0 && (
                  <><span className="font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>{tallyStats.failed}</span> sync failure{tallyStats.failed !== 1 ? "s" : ""} </>
                )}
                {tallyStats.pending > 0 && (
                  <>{tallyStats.failed > 0 && " · "}<span className="font-bold tabular-nums">{tallyStats.pending}</span> pending sync </>
                )}
                {draftPayroll && (
                  <>{(tallyStats.failed > 0 || tallyStats.pending > 0) && " · "}Payroll draft</>
                )}
                <span style={{ color: "var(--color-ink-500)" }}> needs action</span>
              </>
            ) : (
              <span style={{ color: "var(--color-go)" }}>All caught up — books in sync</span>
            )}
          </span>
          {/* Tally sync button — inline when there's something to sync */}
          {(tallyStats.pending > 0 || tallyStats.failed > 0) && (
            <TallySyncButton pendingCount={tallyStats.pending} />
          )}
          {totalPending === 0 && (
            <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          )}
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB CONTENT COMPONENTS — each fetches its own data and renders the
   existing list component. Server-rendered per tab switch.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Expenses tab — mirrors /m/expenses */
async function AccountsExpensesTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canView = hasPermission(role, PERM.FINANCE_VIEW);
  const canCreate = hasPermission(role, PERM.EXPENSE_CREATE);

  const expenses = await prisma.expense.findMany({
    where: { companyId: company.id },
    orderBy: { date: "desc" },
    take: 80,
    include: {
      project: { select: { id: true, name: true } },
      categoryMaster: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
  });

  const rows: ExpenseListItem[] = expenses.map((e) => ({
    id: e.id,
    category: e.category,
    amount: toNum(e.amount),
    date: e.date.toISOString(),
    projectName: e.project?.name ?? null,
    notes: e.notes ?? null,
    status: e.status,
    paymentMode: e.paymentMode,
    payeeName: e.payeeName,
    supplierName: e.supplier?.name ?? null,
    receiptUrl: e.receiptUrl,
  }));

  const totalAmount = rows.reduce((s, e) => s + e.amount, 0);
  const categories = new Set(rows.map((e) => e.category));

  return (
    <MobileExpensesList
      items={rows}
      totalAmount={totalAmount}
      categoryCount={categories.size}
      canView={canView}
      canCreate={canCreate}
      exportTitle="Expenses"
      exportRows={rows as unknown as Record<string, unknown>[]}
      exportColumns={[
        { key: "category", label: "Category" },
        { key: "amount", label: "Amount", format: "currency" },
        { key: "date", label: "Date", format: "date" },
        { key: "status", label: "Status" },
        { key: "paymentMode", label: "Payment Mode" },
        { key: "projectName", label: "Project" },
        { key: "supplierName", label: "Vendor" },
        { key: "payeeName", label: "Payee" },
        { key: "notes", label: "Notes" },
      ] as MobileColumnSpec[]}
      exportSummary={`${rows.length} expenses · ${categories.size} categories`}
    />
  );
}

/** Claims tab — mirrors /m/expense-claims */
async function AccountsClaimsTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canApprove = hasPermission(role, PERM.EXPENSE_APPROVE);
  const canCreate = hasPermission(role, PERM.EXPENSE_CREATE);

  const claims = await prisma.expenseClaim.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      claimant: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });

  const rows: ExpenseClaimListItem[] = claims.map((c) => ({
    id: c.id,
    claimantName: c.claimant?.name ?? "—",
    projectName: c.project?.name ?? null,
    status: c.status,
    totalAmount: toNum(c.totalAmount),
    submittedAt: c.submittedAt?.toISOString() ?? c.createdAt.toISOString(),
    description: c.description ?? null,
  }));

  const totalAmount = rows.reduce((s, c) => s + c.totalAmount, 0);
  const pendingCount = rows.filter((c) => c.status === "SUBMITTED").length;

  return (
    <MobileExpenseClaimsList
      items={rows}
      totalAmount={totalAmount}
      pendingCount={pendingCount}
      canApprove={canApprove}
      canCreate={canCreate}
    />
  );
}

/** Petty Cash tab — mirrors /m/petty-cash */
async function AccountsPettyCashTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.FINANCE_MANAGE);

  const floats = await prisma.pettyCashFloat.findMany({
    where: { companyId: company.id },
    orderBy: { name: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      custodian: { select: { id: true, name: true } },
      topUps: { orderBy: { date: "desc" }, take: 5 },
    },
  });

  const rows: PettyCashFloatListItem[] = floats.map((f) => ({
    id: f.id,
    name: f.name,
    projectName: f.project?.name ?? null,
    custodianName: f.custodian?.name ?? null,
    floatAmount: toNum(f.floatAmount),
    topUpTotal: toNum(f.topUpTotal),
    spentTotal: toNum(f.spentTotal),
    topUpCount: f.topUps.length,
    lastTopUpDate: f.topUps[0]?.date.toISOString() ?? null,
  }));

  const totalBalance = rows.reduce((s, f) => s + f.floatAmount, 0);
  const totalTopUps = rows.reduce((s, f) => s + f.topUpTotal, 0);

  return (
    <MobilePettyCashList
      items={rows}
      totalBalance={totalBalance}
      totalTopUps={totalTopUps}
      canManage={canManage}
    />
  );
}

/** Supplier Payments tab — mirrors /m/supplier-payments */
async function AccountsPaymentsTab() {
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.FINANCE_MANAGE);

  const payments = await prisma.supplierPayment.findMany({
    where: { companyId: company.id },
    orderBy: { paymentDate: "desc" },
    take: 80,
    include: {
      supplier: { select: { id: true, name: true } },
      purchaseOrder: { select: { poNumber: true } },
      invoice: { select: { invoiceNumber: true } },
    },
  });

  const rows: SupplierPaymentListItem[] = payments.map((p) => ({
    id: p.id,
    paymentNumber: p.paymentNumber,
    supplierName: p.supplier.name,
    poNumber: p.purchaseOrder?.poNumber ?? null,
    invoiceNumber: p.invoice?.invoiceNumber ?? null,
    amount: toNum(p.amount),
    paymentDate: p.paymentDate.toISOString(),
    paymentMode: p.paymentMode,
  }));

  const totalAmount = rows.reduce((s, p) => s + p.amount, 0);

  return (
    <MobileSupplierPaymentsList
      items={rows}
      totalAmount={totalAmount}
      canManage={canManage}
    />
  );
}

/** Receipts tab — mirrors /m/books/receipts */
async function AccountsReceiptsTab() {
  const company = await getCompany();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();

  const [assetPayments, materialPayments] = await Promise.all([
    prisma.assetSalePayment.findMany({
      where: { assetSale: { companyId: company.id }, status: "RECEIVED" },
      orderBy: { paymentDate: "desc" },
      take: 50,
      include: { assetSale: { select: { customer: { select: { name: true } }, saleNumber: true } } },
    }).catch(() => []),
    prisma.materialSalePayment.findMany({
      where: { sale: { companyId: company.id } },
      orderBy: { paymentDate: "desc" },
      take: 50,
      include: { sale: { select: { customer: { select: { name: true } }, saleNumber: true, partyName: true } } },
    }).catch(() => []),
  ]);

  const items: ReceiptListItem[] = [
    ...assetPayments.map((r) => ({
      id: r.id, kind: "ASSET" as const, customerName: r.assetSale.customer.name,
      saleNumber: r.assetSale.saleNumber, mode: r.mode, amount: toNum(r.amount),
      paymentDate: r.paymentDate.toISOString(),
    })),
    ...materialPayments.map((r) => ({
      id: r.id, kind: "MATERIAL" as const, customerName: r.sale.partyName ?? r.sale.customer.name,
      saleNumber: r.sale.saleNumber, mode: r.paymentMode, amount: toNum(r.amount),
      paymentDate: r.paymentDate.toISOString(),
    })),
  ].sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate));

  const total = items.reduce((s, r) => s + r.amount, 0);
  const avg = items.length > 0 ? total / items.length : 0;

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        <MobileStatCard label="Total Received" value={formatCurrencyCompact(total)} icon={Wallet} tone="go" />
        <MobileStatCard label="Count" value={formatNumber(items.length, 0)} icon={Wallet} />
        <MobileStatCard label="Average" value={formatCurrencyCompact(avg)} icon={Wallet} />
      </div>
      {items.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No payments received" hint="Record payments from the Sales section" />
      ) : (
        <MobileReceiptsList
          items={items}
          exportTitle="Receipts"
          exportRows={items as unknown as Record<string, unknown>[]}
          exportColumns={[
            { key: "saleNumber", label: "Receipt Number" },
            { key: "customerName", label: "Customer" },
            { key: "kind", label: "Type" },
            { key: "amount", label: "Amount", format: "currency" },
            { key: "paymentDate", label: "Date" },
            { key: "mode", label: "Mode" },
          ] as MobileColumnSpec[]}
          exportSummary={`${items.length} receipts · ${formatCurrencyCompact(total)} total`}
        />
      )}
    </div>
  );
}

/** GL tab — mirrors /m/books/gl */
async function AccountsGlTab() {
  const company = await getCompany();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();

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

  const serialized: GlListItem[] = rows.map((r) => ({
    code: r.code, name: r.name, type: r.type,
    debit: r.debit, credit: r.credit, balance: r.balance,
  }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        <MobileStatCard label="Total Debit" value={formatCurrencyCompact(totalDebit)} icon={BookOpen} />
        <MobileStatCard label="Total Credit" value={formatCurrencyCompact(totalCredit)} icon={BookOpen} tone="go" />
      </div>
      <div className="mb-4 flex justify-end">
        <MobileReseedAccountsButton />
      </div>
      {totalDebit !== totalCredit && (
        <div
          className="mb-4 rounded-[0.5rem] border-2 px-3 py-2 text-m-caption font-semibold"
          style={{
            borderColor: "color-mix(in srgb, var(--color-stop) 30%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)",
            color: "var(--color-stop)",
          }}
        >
          Out of balance by {formatCurrencyCompact(Math.abs(totalDebit - totalCredit))}
        </div>
      )}
      {rows.length === 0 ? (
        <MobileEmptyState icon={BookOpen} title="No journal entries" hint="Post transactions to see balances" />
      ) : (
        <MobileGlList
          items={serialized}
          exportTitle="Trial Balance"
          exportRows={serialized as unknown as Record<string, unknown>[]}
          exportColumns={[
            { key: "code", label: "Code" },
            { key: "name", label: "Account" },
            { key: "type", label: "Type" },
            { key: "debit", label: "Debit", format: "currency" },
            { key: "credit", label: "Credit", format: "currency" },
            { key: "balance", label: "Balance", format: "currency" },
          ] as MobileColumnSpec[]}
          exportSummary={`${serialized.length} accounts`}
        />
      )}
    </div>
  );
}
