"use client";

import { useState, useEffect } from "react";
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
  { value: "REQUISITION_SUBMITTED", label: "Requisition Submitted", group: "Procurement" },
  { value: "REQUISITION_APPROVED", label: "Requisition Approved", group: "Procurement" },
  { value: "REQUISITION_REJECTED", label: "Requisition Rejected", group: "Procurement" },
  { value: "REQUISITION_CONVERTED_TO_PO", label: "Requisition → PO Converted", group: "Procurement" },
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
  { value: "STOCK_COUNT_DUE", label: "Stock Count Due", group: "Inventory" },
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
  { value: "GL_ENTRY_POSTED", label: "GL Entry Posted", group: "Finance" },
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
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function fetchPrefs() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/preferences");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load preferences");
      setPrefs(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPrefs();
  }, []);

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
      // Update local state
      setPrefs((prev) => {
        const existing = prev.find((p) => p.eventType === eventType && p.channel === channel);
        if (existing) {
          return prev.map((p) =>
            p.eventType === eventType && p.channel === channel ? { ...p, enabled } : p,
          );
        }
        return [...prev, data];
      });
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
                                  enabled ? "translate-x-4.5" : "translate-x-1",
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
