"use client";

import { useState, useMemo } from "react";
import { Wallet, Building2, Search, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MobileSectionTitle, MobileRow, MobileEmptyState } from "@/components/mobile/v2/primitives";

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
      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-[0.625rem] border px-3 h-10"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
          <Search className="size-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-[var(--color-ink-300)]"
            style={{ color: "var(--color-ink-900)" }} />
          {query && <button onClick={() => setQuery("")} className="press"><X className="size-4" style={{ color: "var(--color-ink-300)" }} /></button>}
        </div>
      </div>

      <MobileSectionTitle>Recent Expenses ({filteredExpenses.length})</MobileSectionTitle>
      {filteredExpenses.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No matching expenses" hint="Try a different search" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredExpenses.slice(0, 15).map((e) => (
            <MobileRow
              key={e.id}
              icon={Wallet}
              title={e.category}
              subtitle={`${e.projectName ?? "Company"} · ${formatDate(e.date)}`}
              meta={formatCurrency(e.amount)}
            />
          ))}
        </div>
      )}

      <MobileSectionTitle>Recent Project Costs ({filteredProjectCosts.length})</MobileSectionTitle>
      {filteredProjectCosts.length === 0 ? (
        <MobileEmptyState icon={Building2} title="No matching project costs" hint="Try a different search" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredProjectCosts.slice(0, 15).map((c) => (
            <MobileRow
              key={c.id}
              icon={Building2}
              title={`${c.costType} · ${c.projectName}`}
              subtitle={`${c.vendor ?? "—"} · ${formatDate(c.date)}`}
              meta={formatCurrency(c.amount)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
