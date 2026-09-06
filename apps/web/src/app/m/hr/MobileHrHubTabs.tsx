"use client";

import { useTabParam } from "@/lib/use-tab-param";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";

const TABS = ["overview", "attendance", "dprs", "employees", "leaves", "payroll"] as const;
type TabValue = (typeof TABS)[number];

const TAB_META: { value: TabValue; label: string; count?: number }[] = [
  { value: "overview", label: "Overview" },
  { value: "attendance", label: "Attendance" },
  { value: "dprs", label: "DPRs" },
  { value: "employees", label: "Employees" },
  { value: "leaves", label: "Leaves" },
  { value: "payroll", label: "Payroll" },
];

/**
 * MobileHrHubTabs — the tab bar wrapper for the HR hub.
 *
 * Groups Overview (dashboard), Attendance, DPRs, Employees, Leaves, and
 * Payroll into one tabbed page at /m/hr — same pattern as /m/stock.
 *
 * The tab lives in `?tab=` so it's shareable and back-button friendly.
 * The content below the tab bar is server-rendered children — the page.tsx
 * conditionally fetches data and renders the appropriate component based
 * on the active tab. This keeps the dashboard's complex server-side queries
 * without pre-fetching everything for every tab.
 */
export function MobileHrHubTabs({
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
