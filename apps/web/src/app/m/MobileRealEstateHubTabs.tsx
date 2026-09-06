"use client";

import { useTabParam } from "@/lib/use-tab-param";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";

const TABS = ["projects", "units", "land", "customers", "brokers", "rentals"] as const;
type TabValue = (typeof TABS)[number];

const TAB_META: { value: TabValue; label: string; count?: number }[] = [
  { value: "projects", label: "Projects" },
  { value: "units", label: "Units" },
  { value: "land", label: "Land" },
  { value: "customers", label: "Customers" },
  { value: "brokers", label: "Brokers" },
  { value: "rentals", label: "Rentals" },
];

/**
 * MobileRealEstateHubTabs — tab bar wrapper for the Real Estate hub.
 *
 * Groups Projects, Built Units, Land, Customers, Brokers, and Rentals
 * into one tabbed page — same pattern as /m/stock.
 *
 * This hub lives at /m/real-estate (a new route) so it doesn't conflict
 * with the existing /m/projects, /m/land, etc. pages which remain
 * accessible for deep links.
 */
export function MobileRealEstateHubTabs({
  counts = {},
  children,
}: {
  activeTab?: string;
  counts?: Partial<Record<TabValue, number>>;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useTabParam(TABS, "projects");

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
