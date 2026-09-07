"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTabParam } from "@/lib/use-tab-param";

/**
 * Client-side tab switcher for the Finance page.
 * Wraps the server-rendered views. Tab is URL-driven so deep links work.
 */
export function FinanceTabs({
  overview,
  invoices,
  expenses,
  claims,
  pettyCash,
  recurring,
  budgets,
  supplierPayments,
}: {
  overview: React.ReactNode;
  invoices: React.ReactNode;
  expenses?: React.ReactNode;
  claims?: React.ReactNode;
  pettyCash?: React.ReactNode;
  recurring?: React.ReactNode;
  budgets?: React.ReactNode;
  supplierPayments?: React.ReactNode;
}) {
  const [tab, setTab] = useTabParam(
    ["overview", "invoices", "expenses", "claims", "petty-cash", "recurring", "budgets", "supplier-payments"] as const,
    "overview",
  );
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="invoices">Supplier Invoices</TabsTrigger>
        {expenses ? <TabsTrigger value="expenses">Expenses</TabsTrigger> : null}
        {claims ? <TabsTrigger value="claims">Claims</TabsTrigger> : null}
        {pettyCash ? <TabsTrigger value="petty-cash">Petty Cash</TabsTrigger> : null}
        {recurring ? <TabsTrigger value="recurring">Recurring</TabsTrigger> : null}
        {budgets ? <TabsTrigger value="budgets">Budgets</TabsTrigger> : null}
        {supplierPayments ? <TabsTrigger value="supplier-payments">Supplier Payments</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="invoices">{invoices}</TabsContent>
      {expenses ? <TabsContent value="expenses">{expenses}</TabsContent> : null}
      {claims ? <TabsContent value="claims">{claims}</TabsContent> : null}
      {pettyCash ? <TabsContent value="petty-cash">{pettyCash}</TabsContent> : null}
      {recurring ? <TabsContent value="recurring">{recurring}</TabsContent> : null}
      {budgets ? <TabsContent value="budgets">{budgets}</TabsContent> : null}
      {supplierPayments ? <TabsContent value="supplier-payments">{supplierPayments}</TabsContent> : null}
    </Tabs>
  );
}
