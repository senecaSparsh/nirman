"use client";

import { useState, useMemo } from "react";
import { Wallet, Building2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

export type ExpenseListItem = {
  id: string;
  category: string;
  projectName: string | null;
  amount: number;
  date: string;
};

export type ProjectCostListItem = {
  id: string;
  costType: string;
  projectName: string;
  vendor: string | null;
  amount: number;
  date: string;
};

/**
 * Client component for the mobile finance list. Handles client-side
 * search across expenses (by category, project name) and project costs
 * (by cost type, vendor, project name). When no search is active, both
 * lists are shown in their original sections.
 */
export function MobileFinanceList({
  expenses,
  projectCosts,
}: {
  expenses: ExpenseListItem[];
  projectCosts: ProjectCostListItem[];
}) {
  const [query, setQuery] = useState("");

  const filteredExpenses = useMemo(() => {
    if (!query.trim()) return expenses;
    const q = query.toLowerCase();
    return expenses.filter(
      (e) =>
        e.category.toLowerCase().includes(q) ||
        (e.projectName?.toLowerCase().includes(q) ?? false),
    );
  }, [expenses, query]);

  const filteredProjectCosts = useMemo(() => {
    if (!query.trim()) return projectCosts;
    const q = query.toLowerCase();
    return projectCosts.filter(
      (c) =>
        c.costType.toLowerCase().includes(q) ||
        c.projectName.toLowerCase().includes(q) ||
        (c.vendor?.toLowerCase().includes(q) ?? false),
    );
  }, [projectCosts, query]);

  return (
    <div>
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search category, vendor, project…"
      />

      <MobileSectionTitle>Recent Expenses ({filteredExpenses.length})</MobileSectionTitle>
      {filteredExpenses.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No matching expenses" hint="Try a different search" />
      ) : (
        <div>
          {filteredExpenses.slice(0, 15).map((e) => (
            <MobileInfoRow
              key={e.id}
              icon={Wallet}
              title={e.category}
              subtitle={`${e.projectName ?? "Company"} · ${formatDate(e.date)}`}
              value={formatCurrency(e.amount)}
            />
          ))}
        </div>
      )}

      <MobileSectionTitle>Recent Project Costs ({filteredProjectCosts.length})</MobileSectionTitle>
      {filteredProjectCosts.length === 0 ? (
        <MobileEmptyState icon={Building2} title="No matching project costs" hint="Try a different search" />
      ) : (
        <div>
          {filteredProjectCosts.slice(0, 15).map((c) => (
            <MobileInfoRow
              key={c.id}
              icon={Building2}
              title={`${c.costType} · ${c.projectName}`}
              subtitle={`${c.vendor ?? "—"} · ${formatDate(c.date)}`}
              value={formatCurrency(c.amount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
