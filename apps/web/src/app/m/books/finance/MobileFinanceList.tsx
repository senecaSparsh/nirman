"use client";

import { useState, useMemo } from "react";
import { Wallet, Building2, FileText, Printer } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileSectionTitle, MobileRow, MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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

export type SupplierInvoiceListItem = {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  poNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: number;
  status: string;
  matchStatus: string | null;
};

type FinanceTab = "expenses" | "invoices";

const INVOICE_STATUS_STYLE: Record<string, { color: string; label: string }> = {
  PENDING: { color: "var(--color-signal)", label: "Pending" },
  APPROVED: { color: "var(--color-go)", label: "Approved" },
  DISPUTED: { color: "var(--color-stop)", label: "Disputed" },
  PAID: { color: "var(--color-go)", label: "Paid" },
};

/**
 * Client component for the mobile finance list. Handles client-side
 * search across expenses (by category, project name) and project costs
 * (by cost type, vendor, project name). When no search is active, both
 * lists are shown in their original sections.
 * Also includes a Supplier Invoices tab with print links.
 */
export function MobileFinanceList({
  expenses,
  projectCosts,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
  supplierInvoices = [],
  invoiceExportRows,
}: {
  expenses: ExpenseListItem[];
  projectCosts: ProjectCostListItem[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
  supplierInvoices?: SupplierInvoiceListItem[];
  invoiceExportRows?: Record<string, unknown>[];
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FinanceTab>("expenses");

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

  const filteredInvoices = useMemo(() => {
    if (!query.trim()) return supplierInvoices;
    const q = query.toLowerCase();
    return supplierInvoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.supplierName.toLowerCase().includes(q) ||
        (inv.poNumber?.toLowerCase().includes(q) ?? false),
    );
  }, [supplierInvoices, query]);

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder={tab === "invoices" ? "Search invoice no, supplier, PO…" : "Search…"}
        action={
          <div className="flex items-center gap-1 shrink-0">
            {tab === "expenses" && exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
            {tab === "invoices" && invoiceExportRows && invoiceExportRows.length > 0 ? (
              <MobileExportShareIcons
                title="Supplier Invoices"
                rows={invoiceExportRows}
                columns={[
                  { key: "invoiceNumber", label: "Invoice Number" },
                  { key: "supplierName", label: "Supplier" },
                  { key: "poNumber", label: "PO Number" },
                  { key: "totalAmount", label: "Amount", format: "currency" },
                  { key: "invoiceDate", label: "Date", format: "date" },
                  { key: "status", label: "Status" },
                ] as MobileColumnSpec[]}
                summary={`${supplierInvoices.length} supplier invoices`}
              />
            ) : null}
          </div>
        }
        showClear={!!query}
        onClear={() => setQuery("")}
      />

      {/* Tab switcher */}
      <div
        className="flex items-center gap-1 p-0.5 rounded-[0.5rem] mb-2"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <button
          onClick={() => { haptic(5); setTab("expenses"); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[0.375rem] text-m-label font-bold transition-colors text-m-body press"
          style={{
            backgroundColor: tab === "expenses" ? "var(--color-paper)" : "transparent",
            color: tab === "expenses" ? "var(--color-ink-950)" : "var(--color-ink-500)",
            boxShadow: tab === "expenses" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
          }}
        >
          <Wallet className="size-3" />
          Expenses
          <span className="text-m-caption tabular-nums opacity-70">{expenses.length + projectCosts.length}</span>
        </button>
        <button
          onClick={() => { haptic(5); setTab("invoices"); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[0.375rem] text-m-label font-bold transition-colors text-m-body press"
          style={{
            backgroundColor: tab === "invoices" ? "var(--color-paper)" : "transparent",
            color: tab === "invoices" ? "var(--color-ink-950)" : "var(--color-ink-500)",
            boxShadow: tab === "invoices" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
          }}
        >
          <FileText className="size-3" />
          Invoices
          <span className="text-m-caption tabular-nums opacity-70">{supplierInvoices.length}</span>
        </button>
      </div>

      {tab === "invoices" ? (
        <>
          {supplierInvoices.length === 0 ? (
            <MobileEmptyState
              icon={FileText}
              title="No supplier invoices"
              hint="Supplier invoices will appear here once recorded"
            />
          ) : filteredInvoices.length === 0 ? (
            <MobileNoResults title="No invoices found" hint="Try a different search" />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredInvoices.map((inv) => {
                const style = INVOICE_STATUS_STYLE[inv.status] ?? INVOICE_STATUS_STYLE.PENDING!;
                const isOverdue = inv.dueDate && inv.status === "PENDING" && new Date(inv.dueDate) < new Date();
                return (
                  <a
                    key={inv.id}
                    href={`/print/supplier-invoice/${inv.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-[0.5rem] border px-2.5 py-2 text-m-body press"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                  >
                    <span
                      className="grid place-items-center size-7 rounded-full shrink-0"
                      style={{ backgroundColor: `color-mix(in srgb, ${style.color} 12%, transparent)` }}
                    >
                      <FileText className="size-3.5" style={{ color: style.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {inv.invoiceNumber}
                      </p>
                      <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                        {inv.supplierName}
                        {inv.poNumber ? ` · ${inv.poNumber}` : ""}
                        {" · "}{formatDate(inv.invoiceDate)}
                      </p>
                      {isOverdue ? (
                        <p className="text-m-caption font-semibold" style={{ color: "var(--color-stop)" }}>
                          Overdue
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                        {formatCurrency(inv.totalAmount)}
                      </span>
                      <span className="text-m-caption font-bold uppercase" style={{ color: style.color }}>
                        {style.label}
                      </span>
                    </div>
                    <Printer className="size-3 shrink-0" style={{ color: "var(--color-brand)" }} />
                  </a>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <MobileSectionTitle>Recent Expenses ({filteredExpenses.length})</MobileSectionTitle>
          {filteredExpenses.length === 0 ? (
            <MobileNoResults title="No matching expenses" hint="Try a different search" />
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
            <MobileNoResults title="No matching project costs" hint="Try a different search" />
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
        </>
      )}
    </div>
  );
}
