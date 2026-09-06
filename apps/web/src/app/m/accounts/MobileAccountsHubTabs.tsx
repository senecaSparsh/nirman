"use client";

import { useTabParam } from "@/lib/use-tab-param";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";

const TABS = ["overview", "expenses", "claims", "petty-cash", "payments", "receipts", "gl"] as const;
type TabValue = (typeof TABS)[number];

const TAB_META: { value: TabValue; label: string; count?: number }[] = [
  { value: "overview", label: "Overview" },
  { value: "expenses", label: "Expenses" },
  { value: "claims", label: "Claims" },
  { value: "petty-cash", label: "Petty Cash" },
  { value: "payments", label: "Payments" },
  { value: "receipts", label: "Receipts" },
  { value: "gl", label: "GL" },
];

/**
 * MobileAccountsHubTabs — the tab bar wrapper for the Accounts/Finance hub.
 *
 * Groups Overview (dashboard), Expenses, Expense Claims, Petty Cash,
 * Supplier Payments, Receipts, and GL into one tabbed page at /m/accounts
 * — same pattern as /m/stock.
 */
export function MobileAccountsHubTabs({
  counts = {},
  children,
}: {
  activeTab?: string;
  counts?: Partial<Record<TabValue, number>>;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useTabParam(TABS, "overview");

  const tabsWithCounts = TAB_META.map((t) => ({
    ...t,
    count: counts[t.value as TabValue],
  }));

  return (
    <div>
      <RegisterTabs tabs={tabsWithCounts} value={tab} onChange={setTab} />
      {children}
    </div>
  );
}
