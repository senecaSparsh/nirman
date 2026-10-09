"use client";

import { useState, useEffect } from "react";
import { useFetch } from "@/lib/use-fetch";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Preference = {
  id: string;
  eventType: string;
  channel: string;
  enabled: boolean;
};

const EVENT_TYPES = [
  // Procurement (9)
  { value: "REQUISITION_SUBMITTED", label: "Indent Submitted", group: "Procurement" },
  { value: "REQUISITION_APPROVED", label: "Indent Approved", group: "Procurement" },
  { value: "REQUISITION_REJECTED", label: "Indent Rejected", group: "Procurement" },
  { value: "REQUISITION_CONVERTED_TO_PO", label: "Indent → PO Converted", group: "Procurement" },
  { value: "PO_APPROVED", label: "PO Approved", group: "Procurement" },
  { value: "PO_ORDERED", label: "PO Ordered", group: "Procurement" },
  { value: "GOODS_RECEIVED", label: "Goods Received", group: "Procurement" },
  { value: "SUPPLIER_PAYMENT_DUE", label: "Supplier Payment Due", group: "Procurement" },
  { value: "LOW_STOCK_ALERT", label: "Low Stock Alert", group: "Procurement" },
  // Sales (5)
  { value: "SALE_CREATED", label: "Sale Created", group: "Sales" },
  { value: "SALE_PAYMENT_RECEIVED", label: "Sale Payment Received", group: "Sales" },
  { value: "SALE_CANCELLED", label: "Sale Cancelled", group: "Sales" },
  { value: "CUSTOMER_DEPOSIT_RECEIVED", label: "Customer Deposit Received", group: "Sales" },
  { value: "UNIT_LISTING_SYNCED", label: "Unit Listing Synced", group: "Sales" },
  // Inventory (5)
  { value: "STOCK_TRANSFER_CREATED", label: "Stock Transfer Created", group: "Inventory" },
  { value: "STOCK_ISSUE_CREATED", label: "Stock Issue Created", group: "Inventory" },
  { value: "STOCK_COUNT_DUE", label: "Stock Inventory Due", group: "Inventory" },
  { value: "SCRAP_GENERATED", label: "Scrap Generated", group: "Inventory" },
  { value: "MATERIAL_PRICE_CHANGE", label: "Material Price Change", group: "Inventory" },
  // HR/DPR (5)
  { value: "DPR_SUBMITTED", label: "DPR Submitted", group: "HR/DPR" },
  { value: "DPR_SUB_ADMIN_APPROVED", label: "DPR Sub-Admin Approved", group: "HR/DPR" },
  { value: "DPR_APPROVED", label: "DPR Approved", group: "HR/DPR" },
  { value: "DPR_REJECTED", label: "DPR Rejected", group: "HR/DPR" },
  { value: "PAYROLL_PROCESSED", label: "Payroll Processed", group: "HR/DPR" },
  // Finance (3)
  { value: "EXPENSE_CREATED", label: "Expense Created", group: "Finance" },
  { value: "PROJECT_COST_ADDED", label: "Project Cost Added", group: "Finance" },
  { value: "SUPPLIER_INVOICE_SUBMITTED", label: "Supplier Invoice Submitted", group: "Finance" },
  { value: "GL_ENTRY_POSTED", label: "GL Entry Posted", group: "Finance" },

  { value: "TASK_ASSIGNED", label: "Task Assigned", group: "Tasks" },
  { value: "TASK_COMPLETED", label: "Task Completed", group: "Tasks" },
  { value: "TASK_BLOCKED", label: "Task Blocked", group: "Tasks" },

  // Approvals & gate passes
  { value: "GATE_PASS_SUBMITTED", label: "Gate Pass Submitted", group: "Gate Pass" },
  { value: "GATE_PASS_APPROVED", label: "Gate Pass Approved", group: "Gate Pass" },
  { value: "GATE_PASS_REJECTED", label: "Gate Pass Rejected", group: "Gate Pass" },
  { value: "GATE_PASS_EXITED", label: "Gate Pass Exited", group: "Gate Pass" },
  { value: "CO_SUBMITTED", label: "Change Order Submitted", group: "Change Orders" },
  { value: "CO_APPROVED", label: "Change Order Approved", group: "Change Orders" },
  { value: "CO_REJECTED", label: "Change Order Rejected", group: "Change Orders" },
  { value: "PO_CREATED", label: "PO Created", group: "Procurement" },
  { value: "PO_REJECTED", label: "PO Rejected", group: "Procurement" },
  { value: "SALE_PAYMENT_DUE", label: "Sale Payment Due", group: "Sales" },
  { value: "LAND_PURCHASE_CREATED", label: "Land Purchase Created", group: "Land" },
  { value: "LAND_PARTITIONED", label: "Land Partitioned", group: "Land" },
  { value: "LAND_PAYMENT_DUE", label: "Land Payment Due", group: "Land" },
  { value: "TENANCY_CREATED", label: "Tenancy Created", group: "Rentals" },
  { value: "TENANCY_TERMINATED", label: "Tenancy Terminated", group: "Rentals" },
  { value: "RENOVATION_COMPLETED", label: "Renovation Completed", group: "Rentals" },
  { value: "LEASE_EXPIRY_WARNING", label: "Lease Expiry Warning", group: "Rentals" },
  { value: "RENT_DUE_REMINDER", label: "Rent Due Reminder", group: "Rentals" },
  { value: "RENT_ESCALATION_APPLIED", label: "Rent Escalation Applied", group: "Rentals" },

  // People & payroll
  { value: "LEAVE_SUBMITTED", label: "Leave Submitted", group: "HR/DPR" },
  { value: "LEAVE_APPROVED", label: "Leave Approved", group: "HR/DPR" },
  { value: "LEAVE_REJECTED", label: "Leave Rejected", group: "HR/DPR" },
  { value: "CLAIM_SUBMITTED", label: "Expense Claim Submitted", group: "HR/DPR" },
  { value: "CLAIM_APPROVED", label: "Expense Claim Approved", group: "HR/DPR" },
  { value: "CLAIM_REJECTED", label: "Expense Claim Rejected", group: "HR/DPR" },
  { value: "CLAIM_PAID", label: "Expense Claim Paid", group: "HR/DPR" },
  { value: "CONTRACT_EXPIRING", label: "Contract Expiring", group: "HR/DPR" },
  { value: "PROBATION_ENDING", label: "Probation Ending", group: "HR/DPR" },
  { value: "EMPLOYEE_DOC_EXPIRING", label: "Employee Doc Expiring", group: "HR/DPR" },
  { value: "PAYROLL_ZERO_GROSS", label: "Payroll Zero-Gross Alert", group: "HR/DPR" },

  // Quality, petty cash, equipment, compliance
  { value: "NCR_RAISED", label: "NCR Raised", group: "Quality" },
  { value: "CAPA_DUE", label: "CAPA Due", group: "Quality" },
  { value: "CAPA_OVERDUE", label: "CAPA Overdue", group: "Quality" },
  { value: "PETTY_CASH_LOW_BALANCE", label: "Petty Cash Low Balance", group: "Finance" },
  { value: "PETTY_CASH_TOPUP", label: "Petty Cash Top-Up", group: "Finance" },
  { value: "EXPENSE_APPROVED", label: "Expense Approved", group: "Finance" },
  { value: "EXPENSE_REJECTED", label: "Expense Rejected", group: "Finance" },
  { value: "EQUIPMENT_ASSIGNED", label: "Equipment Assigned", group: "Inventory" },
  { value: "EQUIPMENT_SOLD", label: "Equipment Sold", group: "Inventory" },
  { value: "EQUIPMENT_RETIRED", label: "Equipment Retired", group: "Inventory" },
  { value: "EQUIPMENT_MAINTENANCE_DUE", label: "Equipment Maintenance Due", group: "Inventory" },
  { value: "LEGAL_DOC_EXPIRING", label: "Legal Doc Expiring", group: "Compliance" },
  { value: "QUOTE_APPROVED", label: "Quote Approved", group: "Procurement" },
];

const CHANNELS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "IN_APP", label: "In-App" },
] as const;

/**
 * NotificationPreferences — per-user toggle grid for notification event types × channels.
 * Users can opt in/out of specific notification types per channel.
 */
export function NotificationPreferences() {
  const { data, loading, error, retry: fetchPrefs } = useFetch<Preference[] | { preferences: Preference[] }>("/api/notifications/preferences");
  const prefs = Array.isArray(data) ? data : data?.preferences ?? [];
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  function isEnabled(eventType: string, channel: string): boolean {
    const pref = prefs.find((p) => p.eventType === eventType && p.channel === channel);
    // Default: enabled if no preference is set
    return pref?.enabled ?? true;
  }

  async function toggle(eventType: string, channel: string, enabled: boolean) {
    const key = `${eventType}:${channel}`;
    setUpdating(key);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, channel, enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update preference");
      // Refetch — the PUT already persisted server-side.
      fetchPrefs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update preference");
    } finally {
      setUpdating(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-body font-semibold">My Notification Preferences</h3>
      </div>
      <p className="text-caption text-muted-foreground">
        Choose which events you want to be notified about, and via which channel.
        Unchecked items will not send you a notification.
      </p>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-subtle">
              <th className="px-3 py-2 text-left text-caption font-medium text-muted-foreground">Event</th>
              {CHANNELS.map((ch) => (
                <th key={ch.value} className="px-3 py-2 text-center text-caption font-medium text-muted-foreground">
                  {ch.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const groups = [...new Set(EVENT_TYPES.map((e) => e.group))];
              let i = 0;
              return groups.flatMap((group) => [
                <tr key={`header-${group}`} className="border-b border-border bg-subtle/50">
                  <td colSpan={CHANNELS.length + 1} className="px-3 py-1.5 text-caption font-semibold text-muted-foreground uppercase tracking-wide">
                    {group}
                  </td>
                </tr>,
                ...EVENT_TYPES.filter((e) => e.group === group).map((evt) => {
                  const rowIdx = i++;
                  return (
                    <tr key={evt.value} className={cn(rowIdx % 2 === 1 && "bg-subtle/30")}>
                      <td className="px-3 py-2.5 text-body text-foreground">{evt.label}</td>
                      {CHANNELS.map((ch) => {
                        const key = `${evt.value}:${ch.value}`;
                        const enabled = isEnabled(evt.value, ch.value);
                        const isUpdating = updating === key;
                        return (
                          <td key={ch.value} className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => toggle(evt.value, ch.value, !enabled)}
                              disabled={isUpdating}
                              className={cn(
                                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                enabled ? "bg-success" : "bg-muted",
                                isUpdating && "opacity-50",
                              )}
                              aria-label={`${enabled ? "Disable" : "Enable"} ${evt.label} via ${ch.label}`}
                            >
                              <span
                                className={cn(
                                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                                  enabled ? "translate-x-[1.125rem]" : "translate-x-1",
                                )}
                              />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }),
              ]);
            })()}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
