"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Wallet,
  IndianRupee,
  Receipt,
  TrendingUp,
  BookOpen,
  RefreshCw,
  FileText,
  Scale,
  ClipboardCheck,
  Calculator,
  Layers,
  Building2,
  type LucideIcon,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   ACCOUNTS HOME — interactive client layer

   Two toggle tabs (Cash / Books) that switch the quick actions grid
   below. Mirrors the inventory home's Raw Material / Real Estate toggle
   and the HR home's Field / People toggle.

   • Cash  — money in, money out: receipts, payments, expenses, payroll,
             outstanding dues, cash-flow forecast.
   • Books — the ledger and compliance: GL/trial balance, Tally sync,
             GST, TDS, audit trail, P&L, job costing, comparative.
   ═══════════════════════════════════════════════════════════════════════════ */

interface QuickAction {
  href: string;
  icon: LucideIcon;
  label: string;
}

const CASH_ACTIONS: QuickAction[] = [
  { href: "/m/accounts?tab=receipts", icon: Wallet, label: "Receipts" },
  { href: "/m/accounts?tab=payments", icon: IndianRupee, label: "Payments" },
  { href: "/m/accounts?tab=expenses", icon: Receipt, label: "Expenses" },
  { href: "/m/accounts?tab=gl", icon: Wallet, label: "Payroll" },
  { href: "/m/reports/pending-payments", icon: ClipboardCheck, label: "Dues" },
  { href: "/m/reports/cash-flow", icon: TrendingUp, label: "Cash Flow" },
  { href: "/m/reports/expenses", icon: Receipt, label: "Spend" },
  { href: "/m/accounts?tab=expenses", icon: Building2, label: "Project Cost" },
];

const BOOKS_ACTIONS: QuickAction[] = [
  { href: "/m/accounts?tab=gl", icon: BookOpen, label: "Ledger" },
  { href: "/m/accounts?tab=gl", icon: RefreshCw, label: "Tally Sync" },
  { href: "/m/reports/gst", icon: FileText, label: "GST" },
  { href: "/m/reports/tds-certificates", icon: Receipt, label: "TDS" },
  { href: "/m/reports/profit", icon: TrendingUp, label: "P&L" },
  { href: "/m/reports/job-costing", icon: Calculator, label: "Job Cost" },
  { href: "/m/reports/comparative", icon: Layers, label: "Compare" },
  { href: "/m/books/reports", icon: Scale, label: "Reports" },
];

type CategoryId = "cash" | "books";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: string;
  actions: QuickAction[];
}[] = [
  {
    id: "cash",
    label: "Cash",
    icon: "💵",
    actions: CASH_ACTIONS,
  },
  {
    id: "books",
    label: "Books",
    icon: "📒",
    actions: BOOKS_ACTIONS,
  },
];

export function AccountsInteractive() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read the tab from the URL (?tab=books) so the selection survives
  // refresh and back/forward navigation. Falls back to "cash".
  const paramTab = searchParams.get("tab");
  const initialTab: CategoryId =
    paramTab === "cash" || paramTab === "books" ? paramTab : "cash";
  const [activeTab, setActiveTab] = React.useState<CategoryId>(initialTab);

  // Keep state in sync if the URL changes (e.g. browser back/forward).
  React.useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "cash" || t === "books") {
      setActiveTab(t);
    } else {
      setActiveTab("cash");
    }
  }, [searchParams]);

  const active = CATEGORIES.find((c) => c.id === activeTab)!;

  function selectTab(id: CategoryId) {
    setActiveTab(id);
    // Shallow-update the URL without scrolling so the choice is bookmarkable
    // and survives refresh / back navigation.
    const params = new URLSearchParams(searchParams.toString());
    if (id === "cash") {
      params.delete("tab"); // default — keep URL clean
    } else {
      params.set("tab", id);
    }
    const qs = params.toString();
    router.replace(qs ? `/m/accounts?${qs}` : "/m/accounts", {
      scroll: false,
    });
  }

  return (
    <>
      {/* ── Toggle tabs — Cash / Books ── */}
      <div
        className="grid grid-cols-2 gap-1 rounded-[0.625rem] border p-1 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = cat.id === activeTab;
          return (
            <button
              key={cat.id}
              onClick={() => selectTab(cat.id)}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-body press transition-colors"
              style={{
                backgroundColor: isActive
                  ? "var(--color-ink-950)"
                  : "transparent",
                color: isActive ? "var(--color-paper)" : "var(--color-ink-500)",
              }}
            >
              <span className="text-m-section">{cat.icon}</span>
              <span className="text-m-body font-bold">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Quick actions — 4-col grid, switches with tab ── */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {active.actions.map((action) => (
          <QuickActionTile
            key={action.label}
            href={action.href}
            icon={action.icon}
            label={action.label}
          />
        ))}
      </div>
    </>
  );
}

/* ── Quick action tile ── */
function QuickActionTile({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-[0.625rem] border p-2 text-m-body text-m-body press"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <span
        className="grid place-items-center w-7 h-7 rounded-[0.375rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Icon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
      </span>
      <span
        className="font-semibold text-m-caption text-center leading-tight"
        style={{ color: "var(--color-ink-950)" }}
      >
        {label}
      </span>
    </Link>
  );
}
