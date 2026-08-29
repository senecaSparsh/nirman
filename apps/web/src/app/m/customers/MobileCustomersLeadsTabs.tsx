"use client";

import { useState } from "react";
import { Users, Flame } from "lucide-react";
import { MobileCustomersList, type CustomerListItem } from "./MobileCustomersList";
import { MobileLeadsList, type LeadListItem } from "../leads/MobileLeadsList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * MobileCustomersLeadsTabs — tab toggle between Customers and Leads,
 * shown on the /m/customers page. The client asked for leads to appear
 * inside the customers section rather than as a separate top-level page.
 */
export function MobileCustomersLeadsTabs({
  customers,
  leads,
  canCreate,
  customerStats,
  leadCount,
}: {
  customers: CustomerListItem[];
  leads: LeadListItem[];
  canCreate: boolean;
  customerStats: {
    customerCount: number;
    withDues: number;
    totalOutstanding: number;
    pipelineValue: number;
  };
  leadCount: number;
}) {
  const [tab, setTab] = useState<"customers" | "leads">("customers");

  return (
    <div>
      {/* Tab toggle */}
      <div
        className="sticky top-0 z-20 grid grid-cols-2 gap-1 p-1"
        style={{
          backgroundColor: "var(--color-paper)",
          borderBottom: "1px solid var(--color-line)",
        }}
      >
        <button
          onClick={() => setTab("customers")}
          className="flex items-center justify-center gap-1.5 h-9 rounded-[0.375rem] text-[0.6875rem] font-bold transition-colors"
          style={{
            backgroundColor: tab === "customers" ? "var(--color-ink-950)" : "transparent",
            color: tab === "customers" ? "var(--color-paper)" : "var(--color-ink-500)",
          }}
        >
          <Users className="size-3.5" />
          Customers
          <span
            className="ml-0.5 px-1.5 rounded-full text-[0.5rem]"
            style={{
              backgroundColor: tab === "customers" ? "rgba(255,255,255,0.2)" : "var(--color-concrete)",
            }}
          >
            {customers.length}
          </span>
        </button>
        <button
          onClick={() => setTab("leads")}
          className="flex items-center justify-center gap-1.5 h-9 rounded-[0.375rem] text-[0.6875rem] font-bold transition-colors"
          style={{
            backgroundColor: tab === "leads" ? "var(--color-ink-950)" : "transparent",
            color: tab === "leads" ? "var(--color-paper)" : "var(--color-ink-500)",
          }}
        >
          <Flame className="size-3.5" />
          Leads
          <span
            className="ml-0.5 px-1.5 rounded-full text-[0.5rem]"
            style={{
              backgroundColor: tab === "leads" ? "rgba(255,255,255,0.2)" : "var(--color-concrete)",
            }}
          >
            {leadCount}
          </span>
        </button>
      </div>

      {/* Tab content */}
      {tab === "customers" ? (
        <MobileCustomersList
          items={customers}
          canCreate={canCreate}
          stats={customerStats}
          exportTitle="Customers"
          exportRows={customers as unknown as Record<string, unknown>[]}
          exportColumns={[
            { key: "name", label: "Name" },
            { key: "phone", label: "Phone" },
            { key: "email", label: "Email" },
            { key: "totalValue", label: "Total Purchased", format: "currency" },
            { key: "totalPaid", label: "Total Paid", format: "currency" },
            { key: "outstanding", label: "Outstanding", format: "currency" },
          ] as MobileColumnSpec[]}
          exportSummary={`${customers.length} customers · ${customerStats.withDues} with dues`}
        />
      ) : (
        <MobileLeadsList
          items={leads}
          hotCount={leads.filter((l) => l.priority === "HIGH").length}
          bookedCount={leads.filter((l) => l.stage === "BOOKED").length}
          followUpsDue={leads.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt) <= new Date()).length}
          canCreate={canCreate}
          exportTitle="Leads"
          exportRows={leads as unknown as Record<string, unknown>[]}
          exportColumns={[
            { key: "name", label: "Name" },
            { key: "phone", label: "Phone" },
            { key: "stage", label: "Stage" },
            { key: "priority", label: "Priority" },
            { key: "source", label: "Source" },
          ] as MobileColumnSpec[]}
          exportSummary={`${leads.length} active leads`}
        />
      )}
    </div>
  );
}
