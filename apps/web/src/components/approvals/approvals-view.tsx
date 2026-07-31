"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, ClipboardCheck, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ApprovalPORow, ApprovalReqRow } from "@/lib/types";

/**
 * Approvals queue — lists POs (DRAFT) and requisitions (SUBMITTED)
 * awaiting approval. Approve/reject actions hit the existing
 * /api/purchase-orders/[id] and /api/requisitions/[id] PATCH endpoints
 * (which are permission-gated with po.approve / requisition.approve).
 */
export function ApprovalsView({
  purchaseOrders,
  requisitions,
}: {
  purchaseOrders: ApprovalPORow[];
  requisitions: ApprovalReqRow[];
}) {
  const empty = purchaseOrders.length === 0 && requisitions.length === 0;

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Nothing to approve</p>
        <p className="mt-1 text-meta text-muted-foreground">
          Purchase orders and requisitions awaiting your approval will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {purchaseOrders.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Purchase Orders</h2>
            <Badge variant="muted">{purchaseOrders.length}</Badge>
          </div>
          <div className="space-y-3">
            {purchaseOrders.map((po) => (
              <POApprovalCard key={po.id} po={po} />
            ))}
          </div>
        </section>
      )}

      {requisitions.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Material Requisitions</h2>
            <Badge variant="muted">{requisitions.length}</Badge>
          </div>
          <div className="space-y-3">
            {requisitions.map((r) => (
              <ReqApprovalCard key={r.id} req={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function POApprovalCard({ po }: { po: ApprovalPORow }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);

  async function act(action: "approve" | "reject") {
    setActing(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed to ${action} PO`);
      }
      toast.success(`PO ${action === "approve" ? "approved" : "rejected"}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <span>{po.poNumber}</span>
            <Badge variant="warning">{po.status}</Badge>
          </CardTitle>
          <div className="text-caption text-muted-foreground">
            {po.supplierName}
            {po.projectName ? ` · ${po.projectName}` : ""}
            {po.createdByName ? ` · raised by ${po.createdByName}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-foreground">
            {formatCurrency(po.total)}
          </div>
          <div className="text-caption text-muted-foreground">
            {po.lineCount} line{po.lineCount === 1 ? "" : "s"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="text-caption text-muted-foreground">
          Created {formatDate(po.createdAt)}
          {po.expectedDate ? ` · expected ${formatDate(po.expectedDate)}` : ""}
        </div>
        {po.canApprove && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={acting} onClick={() => act("reject")}>
              <X className="mr-1 h-3.5 w-3.5" />
              Reject
            </Button>
            <Button size="sm" disabled={acting} onClick={() => act("approve")}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Approve
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReqApprovalCard({ req }: { req: ApprovalReqRow }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);

  async function act(action: "approve" | "reject") {
    setActing(true);
    try {
      const res = await fetch(`/api/requisitions/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed to ${action} requisition`);
      }
      toast.success(`Requisition ${action === "approve" ? "approved" : "rejected"}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <span>{req.reqNumber}</span>
            <Badge variant="warning">{req.status}</Badge>
          </CardTitle>
          <div className="text-caption text-muted-foreground">
            {req.projectName}
            {req.phaseName ? ` · ${req.phaseName}` : ""}
            {req.requestedByName ? ` · raised by ${req.requestedByName}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-foreground">
            {req.totalQty.toLocaleString()} units
          </div>
          <div className="text-caption text-muted-foreground">
            {req.lineCount} line{req.lineCount === 1 ? "" : "s"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="text-caption text-muted-foreground">
          Created {formatDate(req.createdAt)}
          {req.neededByDate ? ` · needed by ${formatDate(req.neededByDate)}` : ""}
        </div>
        {req.canApprove && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={acting} onClick={() => act("reject")}>
              <X className="mr-1 h-3.5 w-3.5" />
              Reject
            </Button>
            <Button size="sm" disabled={acting} onClick={() => act("approve")}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Approve
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
