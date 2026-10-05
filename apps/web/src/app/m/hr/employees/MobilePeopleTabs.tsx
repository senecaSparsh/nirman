"use client";

import type { ReactNode } from "react";
import { useTabParam } from "@/lib/use-tab-param";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";

const TABS = ["employees", "crews"] as const;
type TabValue = (typeof TABS)[number];

/**
 * MobilePeopleTabs — Staff | Crews switcher for /m/hr/employees.
 * Mirrors the desktop EmployeesView tabs (same useTabParam convention):
 * ?tab=crews is deep-linkable, survives refresh, and browser-back walks
 * the tab history.
 */
export function MobilePeopleTabs({
  employeeCount,
  crewCount,
  employees,
  crews,
}: {
  employeeCount: number;
  crewCount: number;
  employees: ReactNode;
  crews: ReactNode;
}) {
  const [tab, setTab] = useTabParam(TABS, "employees");

  return (
    <div>
      <RegisterTabs
        tabs={[
          { value: "employees" as TabValue, label: "Staff", count: employeeCount },
          { value: "crews" as TabValue, label: "Crews", count: crewCount },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "employees" ? employees : crews}
    </div>
  );
}
