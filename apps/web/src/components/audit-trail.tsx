"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Plus, Truck, IndianRupee, FileText, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  PURCHASE_ORDER_CREATE: "PO Created",
  PURCHASE_ORDER_APPROVE: "PO Approved",
  PURCHASE_ORDER_ORDER: "Marked as Ordered",
  PURCHASE_ORDER_CANCEL: "PO Cancelled",
  PURCHASE_ORDER_RECEIVE: "Goods Received",
  REQUISITION_CREATE: "Requisition Created",
  REQUISITION_SUBMIT: "Requisition Submitted",
  REQUISITION_APPROVE: "Requisition Approved",
  REQUISITION_REJECT: "Requisition Rejected",
  REQUISITION_CONVERT: "Converted to PO",
  EQUIPMENT_CREATE: "Equipment Added",
  EQUIPMENT_ASSIGN: "Equipment Assigned",
  EQUIPMENT_RETURN: "Equipment Returned",
  EQUIPMENT_MAINTENANCE: "Maintenance Scheduled",
  EQUIPMENT_RETIRE: "Equipment Retired",
  SUPPLIER_PAYMENT_CREATE: "Payment Recorded",
  TRANSFER_CREATE: "Transfer Created",
  TRANSFER_COMPLETE: "Transfer Completed",
  TRANSFER_CANCEL: "Transfer Cancelled",
};

function getActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}

function getActionIcon(action: string) {
  if (action.includes("APPROVE") || action.includes("COMPLETE")) return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (action.includes("CANCEL") || action.includes("REJECT") || action.includes("RETIRE")) return <XCircle className="h-3.5 w-3.5 text-danger" />;
  if (action.includes("CREATE") || action.includes("CONVERT")) return <Plus className="h-3.5 w-3.5 text-brand" />;
  if (action.includes("RECEIVE") || action.includes("ASSIGN") || action.includes("TRANSFER")) return <Truck className="h-3.5 w-3.5 text-warning" />;
  if (action.includes("PAYMENT")) return <IndianRupee className="h-3.5 w-3.5 text-success" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function AuditTrail({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [entries, setEntries] = useState<{ id: string; action: string; userName: string | null; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityId) return;
    setLoading(true);
    fetch(`/api/audit?entityType=${entityType}&entityId=${entityId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setEntries(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-body font-medium">Activity</p>
        {[1, 2, 3].map(i => (
          <div key={i} className="h-4 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div>
        <p className="text-body font-medium">Activity</p>
        <p className="mt-1 text-caption text-muted-foreground">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-body font-medium">Activity</p>
      <div className="relative space-y-3 pl-5">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        {entries.map((e) => (
          <div key={e.id} className="relative">
            {/* Dot on the line */}
            <div className="absolute -left-5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background">
              {getActionIcon(e.action)}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-caption font-medium text-foreground">{getActionLabel(e.action)}</span>
              <span className="flex items-center gap-1 text-micro text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDate(e.createdAt)}
              </span>
            </div>
            {e.userName && (
              <p className="text-micro text-muted-foreground">by {e.userName}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
