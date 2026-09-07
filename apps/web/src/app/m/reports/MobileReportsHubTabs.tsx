"use client";

import { useTabParam } from "@/lib/use-tab-param";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";

const TABS = ["overview", "financial", "purchasing", "inventory", "projects"] as const;
type TabValue = (typeof TABS)[number];

const TAB_META: { value: TabValue; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "financial", label: "Finance" },
  { value: "purchasing", label: "Purchasing" },
  { value: "inventory", label: "Inventory" },
  { value: "projects", label: "Projects" },
];

/**
 * MobileReportsHubTabs — tab bar wrapper for the Reports hub.
 *
 * Groups 20+ report pages into 5 category tabs so the user doesn't
 * have to scroll through a flat list of 20 items. The tab lives in
 * `?tab=` so it's shareable and back-button friendly.
 */
export function MobileReportsHubTabs({
  children,
}: {
  activeTab?: string;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useTabParam(TABS, "overview");

  return (
    <div>
      <RegisterTabs tabs={TAB_META} value={tab} onChange={setTab} />
      {children}
    </div>
  );
}
