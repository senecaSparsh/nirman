"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTabParam } from "@/lib/use-tab-param";

/**
 * URL TABS — Tabs that sync the active tab to a URL query param.
 *
 * Combines the existing `Tabs` component with `useTabParam` so the
 * active tab is shareable, bookmarkable, and survives a page refresh.
 * Replaces the 17 manual `useTabParam` + `Tabs` wirings.
 *
 * Usage:
 *   <UrlTabs
 *     param="tab"
 *     tabs={[
 *       { value: "overview", label: "Overview", content: <OverviewTab /> },
 *       { value: "members", label: "Members", content: <MembersTab />, count: 5 },
 *     ]}
 *   />
 */
export function UrlTabs<T extends string = string>({
  param = "tab",
  tabs,
  defaultValue,
  className,
  listClassName,
}: {
  /** URL query param name for the active tab. */
  param?: string;
  tabs: {
    value: T;
    label: React.ReactNode;
    content: React.ReactNode;
    count?: number;
  }[];
  /** Fallback tab if no param in URL. Defaults to first tab. */
  defaultValue?: T;
  className?: string;
  listClassName?: string;
}) {
  const fallback = defaultValue ?? tabs[0]?.value ?? ("" as T);
  const allowedValues = tabs.map((t) => t.value) as unknown as T[];
  const [active, setActive] = useTabParam<T>(allowedValues, fallback, { param });

  return (
    <Tabs<T>
      value={active as T}
      onValueChange={(v) => setActive(v as T)}
      className={className}
    >
      <TabsList className={listClassName}>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} count={t.count}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
