"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Client-side tab switcher for the Finance page.
 * Wraps the server-rendered Overview and Supplier Invoices views.
 */
export function FinanceTabs({
  overview,
  invoices,
}: {
  overview: React.ReactNode;
  invoices: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="invoices">Supplier Invoices</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="invoices">{invoices}</TabsContent>
    </Tabs>
  );
}
