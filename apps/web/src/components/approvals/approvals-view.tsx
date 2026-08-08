"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Inbox, ArrowRight, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Page, Section, StatusPill, MetricGrid, Metric } from "@/components/page";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ApprovalPORow, ApprovalReqRow } from "@/lib/types";

/**
 * Approvals queue — lists POs (DRAFT) and requisitions (SUBMITTED)
 * awaiting approval. Approve/reject actions hit the existing
 * /api/purchase-orders/[id] and /api/requisitions/[id] PATCH endpoints
 * (which are permission-gated with po.approve / requisition.approve).
 *
 * After approving, the row collapses into a "done" state with a link
 * to view the approved item on its home page — so the user always
 * knows where to go next instead of hitting a dead end.
 */
export function ApprovalsView({
  purchaseOrders,
  requisitions,
}: {
  purchaseOrders: ApprovalPORow[];
  requisitions: ApprovalReqRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filteredPOs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return purchaseOrders;
    return purchaseOrders.filter((po) =>
      po.poNumber.toLowerCase().includes(q) ||
      (po.supplierName ?? "").toLowerCase().includes(q) ||
      (po.projectName ?? "").toLowerCase().includes(q) ||
      (po.createdByName ?? "").toLowerCase().includes(q),
    );
  }, [purchaseOrders, query]);

  const filteredReqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requisitions;
    return requisitions.filter((r) =>
      r.reqNumber.toLowerCase().includes(q) ||
      (r.projectName ?? "").toLowerCase().includes(q) ||
      (r.requestedByName ?? "").toLowerCase().includes(q),
    );
  }, [requisitions, query]);

  const empty = filteredPOs.length === 0 && filteredReqs.length === 0;
  const totalCount = purchaseOrders.length + requisitions.length;

  if (totalCount === 0) {
    return (
      <Page>
        <div className="flex items-center justify-end">
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Nothing to approve"
          description="Items awaiting your sign-off will appear here."
        />
      </Page>
    );
  }

  return (
    <Page>
      <MetricGrid cols={3}>
        <Metric label="Total Pending" value={totalCount} icon={<Inbox />} tone="warning" />
        <Metric label="Purchase Orders" value={purchaseOrders.length} sub="awaiting approval" />
        <Metric label="Material Indents" value={requisitions.length} sub="awaiting approval" />
      </MetricGrid>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by no, supplier, project…" className="pl-8" />
        </div>
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {empty ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="No items match the search"
          description="Try a different search term."
        />
      ) : (
        <>
          {filteredPOs.length > 0 && (
            <Section
              title="Purchase Orders"
              action={<Badge variant="muted">{filteredPOs.length}</Badge>}
            >
              <div className="divide-y divide-border">
                {filteredPOs.map((po) => (
                  <POApprovalRow key={po.id} po={po} />
                ))}
              </div>
            </Section>
          )}

          {filteredReqs.length > 0 && (
            <Section
              title="Material Indents"
              action={<Badge variant="muted">{filteredReqs.length}</Badge>}
            >
              <div className="divide-y divide-border">
                {filteredReqs.map((r) => (
                  <ReqApprovalRow key={r.id} req={r} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}

function POApprovalRow({ po }: { po: ApprovalPORow }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState(false);

  async function act(action: "approve") {
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
      toast.success(`PO ${po.poNumber} approved`, {
        description: "It's ready to be ordered from the supplier.",
        action: {
          label: "Order from Supplier",
          onClick: () => router.push(`/procurement?po=${po.id}`),
        },
      });
      setDone(true);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center justify-between gap-4 p-4 bg-subtle/50">
        <div className="flex items-center gap-2 text-body text-muted-foreground">
          <Check className="h-4 w-4 text-success" />
          <span className="font-medium text-foreground">{po.poNumber}</span>
          approved
        </div>
        <Link href={`/procurement?po=${po.id}`} className="text-caption text-brand hover:underline inline-flex items-center gap-1">
          Order from Supplier <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-body font-semibold text-foreground">{po.poNumber}</span>
          <StatusPill status={po.status} />
        </div>
        <div className="text-caption text-muted-foreground">
          {po.supplierName}
          {po.projectName ? ` · ${po.projectName}` : ""}
          {po.createdByName ? ` · raised by ${po.createdByName}` : ""}
        </div>
        <div className="text-caption text-muted-foreground">
          Created {formatDate(po.createdAt)}
          {po.expectedDate ? ` · expected ${formatDate(po.expectedDate)}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="text-right">
          <div className="text-body font-semibold tnum text-foreground">
            {formatCurrency(po.total)}
          </div>
          <div className="text-caption text-muted-foreground">
            {po.lineCount} line{po.lineCount === 1 ? "" : "s"}
          </div>
        </div>
        {po.canApprove && (
          <div className="flex gap-2">
            <Button size="sm" disabled={acting} onClick={() => act("approve")}>
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReqApprovalRow({ req }: { req: ApprovalReqRow }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState(false);
  const [rejected, setRejected] = useState(false);

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
        throw new Error(d.error ?? `Failed to ${action} indent`);
      }
      if (action === "approve") {
        toast.success(`Indent ${req.reqNumber} approved`, {
          description: "It can now be converted to a purchase order.",
          action: {
            label: "Convert to PO",
            onClick: () => router.push(`/requisitions?req=${req.id}`),
          },
        });
        setDone(true);
      } else {
        toast.success(`Indent ${req.reqNumber} rejected`);
        setRejected(true);
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  if (done || rejected) {
    return (
      <div className="flex items-center justify-between gap-4 p-4 bg-subtle/50">
        <div className="flex items-center gap-2 text-body text-muted-foreground">
          {done ? (
            <>
              <Check className="h-4 w-4 text-success" />
              <span className="font-medium text-foreground">{req.reqNumber}</span>
              approved
            </>
          ) : (
            <>
              <X className="h-4 w-4 text-danger" />
              <span className="font-medium text-foreground">{req.reqNumber}</span>
              rejected
            </>
          )}
        </div>
        {done && (
          <Link href={`/requisitions?req=${req.id}`} className="text-caption text-brand hover:underline inline-flex items-center gap-1">
            Convert to PO <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-body font-semibold text-foreground">{req.reqNumber}</span>
          <StatusPill status={req.status} />
        </div>
        <div className="text-caption text-muted-foreground">
          {req.projectName}
          {req.phaseName ? ` · ${req.phaseName}` : ""}
          {req.requestedByName ? ` · raised by ${req.requestedByName}` : ""}
        </div>
        <div className="text-caption text-muted-foreground">
          Created {formatDate(req.createdAt)}
          {req.neededByDate ? ` · needed by ${formatDate(req.neededByDate)}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="text-right">
          <div className="text-body font-semibold tnum text-foreground">
            {req.totalQty.toLocaleString()} units
          </div>
          <div className="text-caption text-muted-foreground">
            {req.lineCount} line{req.lineCount === 1 ? "" : "s"}
          </div>
        </div>
        {req.canApprove && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={acting} onClick={() => act("reject")}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button size="sm" disabled={acting} onClick={() => act("approve")}>
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
