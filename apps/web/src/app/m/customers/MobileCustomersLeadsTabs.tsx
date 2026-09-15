"use client";

import { useState } from "react";
import { MobileCustomersList, type CustomerListItem } from "./MobileCustomersList";
import { MobileLeadsList, type LeadListItem } from "../leads/MobileLeadsList";
import { useHydratedDate } from "@/lib/use-hydrated-date";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";
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
  canEdit = false,
  canDelete = false,
  customerStats,
  leadCount,
  existingPhones = [],
  customerLoadMoreUrl,
  customerInitialCursor,
}: {
  customers: CustomerListItem[];
  leads: LeadListItem[];
  canCreate: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  customerStats: {
    customerCount: number;
    withDues: number;
    totalOutstanding: number;
    pipelineValue: number;
  };
  leadCount: number;
  /** Existing phone numbers for duplicate-check in the new-customer FAB modal. */
  existingPhones?: string[];
  customerLoadMoreUrl?: string;
  customerInitialCursor?: string | null;
}) {
  const [tab, setTab] = useState<"customers" | "leads">("customers");
  const now = useHydratedDate();

  return (
    <div>
      {/* Tab toggle — transparent text tabs with sliding underline */}
      <RegisterTabs
        tabs={[
          { value: "customers" as const, label: "Customers", count: customers.length },
          { value: "leads" as const, label: "Leads", count: leadCount },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* Tab content */}
      {tab === "customers" ? (
        <MobileCustomersList
          items={customers}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          stats={customerStats}
          existingPhones={existingPhones}
          loadMoreUrl={customerLoadMoreUrl}
          initialCursor={customerInitialCursor}
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
          followUpsDue={leads.filter((l) => l.nextFollowUpAt && now !== null && new Date(l.nextFollowUpAt) <= now).length}
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
