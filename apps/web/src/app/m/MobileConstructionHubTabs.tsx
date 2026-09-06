"use client";

import { useTabParam } from "@/lib/use-tab-param";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";

const TABS = ["work-orders", "change-orders", "quality", "safety", "boq", "wbs", "mb"] as const;
type TabValue = (typeof TABS)[number];

const TAB_META: { value: TabValue; label: string; count?: number }[] = [
  { value: "work-orders", label: "Work Orders" },
  { value: "change-orders", label: "Changes" },
  { value: "quality", label: "Quality" },
  { value: "safety", label: "Safety" },
  { value: "boq", label: "BOQ" },
  { value: "wbs", label: "WBS" },
  { value: "mb", label: "MB" },
];

/**
 * MobileConstructionHubTabs — tab bar wrapper for the Construction hub.
 *
 * Groups Work Orders, Change Orders, Quality Control, Safety, BOQ, WBS,
 * and Measurement Book into one tabbed page — same pattern as /m/stock.
 */
export function MobileConstructionHubTabs({
  counts = {},
  children,
}: {
  activeTab?: string;
  counts?: Partial<Record<TabValue, number>>;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useTabParam(TABS, "work-orders");

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
