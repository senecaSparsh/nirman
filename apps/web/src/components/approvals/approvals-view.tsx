"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check, X, Inbox, ArrowRight, Search, RefreshCw, Loader2,
  AlertTriangle, Clock, CalendarClock, ChevronDown, ChevronRight,
  TrendingDown, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Page, Section, StatusPill, Toolbar, ToolbarCount } from "@/components/page";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { ApprovalPORow, ApprovalReqRow } from "@/lib/types";

// ── Urgency badge ──────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === "overdue") {
    return (
      <Badge variant="danger" className="gap-1">
        <AlertTriangle className="h-3 w-3" /> Overdue
      </Badge>
    );
  }
  if (urgency === "due_today") {
    return (
      <Badge variant="warning" className="gap-1">
        <Clock className="h-3 w-3" /> Due today
      </Badge>
    );
  }
  if (urgency === "due_this_week") {
    return (
      <Badge variant="muted" className="gap-1">
        <CalendarClock className="h-3 w-3" /> This week
      </Badge>
    );
  }
  return null;
}

// ── Budget context badge ───────────────────────────────────────

function BudgetBadge({
  budgetRemaining,
  utilizationPct,
  wouldExceedBudget,
}: {
  budgetRemaining: number | null;
  utilizationPct: number | null;
  wouldExceedBudget: boolean;
}) {
  if (budgetRemaining === null || utilizationPct === null) return null;

  const tone = wouldExceedBudget
    ? "danger"
    : utilizationPct >= 95
      ? "danger"
      : utilizationPct >= 80
        ? "warning"
        : "success";

  return (
    <div className="flex items-center gap-1.5">
      {wouldExceedBudget && (
        <Badge variant="danger" className="gap-1">
          <AlertTriangle className="h-3 w-3" /> Exceeds budget
        </Badge>
      )}
      <Badge variant={tone} className="tnum">
        {utilizationPct.toFixed(0)}% used · {formatCurrency(budgetRemaining)} left
      </Badge>
    </div>
  );
}

// ── Budget context detail line ─────────────────────────────────

function BudgetDetail({
  projectBudget,
  projectSpent,
  budgetRemaining,
  budgetUtilizationPct,
}: {
  projectBudget: number | null;
  projectSpent: number | null;
  budgetRemaining: number | null;
  budgetUtilizationPct: number | null;
}) {
  if (projectBudget === null) return null;
  return (
    <div className="flex items-center gap-3 text-caption text-muted-foreground">
      <span>
        Budget: <span className="tnum text-foreground font-medium">{formatCurrency(projectBudget)}</span>
      </span>
      <span>
        Spent: <span className="tnum text-foreground font-medium">{formatCurrency(projectSpent ?? 0)}</span>
      </span>
      <span>
        Remaining: <span className="tnum text-foreground font-medium">{formatCurrency(budgetRemaining ?? 0)}</span>
      </span>
      {budgetUtilizationPct !== null && (
        <span>
          Utilization: <span className="tnum text-foreground font-medium">{budgetUtilizationPct.toFixed(1)}%</span>
        </span>
      )}
    </div>
  );
}

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
  const [bulkApproving, setBulkApproving] = useState(false);

  async function bulkApprovePOs(pos: ApprovalPORow[]) {
    setBulkApproving(true);
    let ok = 0;
    let fail = 0;
    await Promise.all(pos.map(async (po) => {
      try {
        const res = await fetch(`/api/purchase-orders/${po.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }));
    setBulkApproving(false);
    if (ok > 0) toast.success(`Approved ${ok} PO${ok === 1 ? "" : "s"}`);
    if (fail > 0) toast.error(`${fail} PO${fail === 1 ? "" : "s"} failed to approve`);
    router.refresh();
  }

  async function bulkApproveReqs(reqs: ApprovalReqRow[]) {
    setBulkApproving(true);
    let ok = 0;
    let fail = 0;
    await Promise.all(reqs.map(async (r) => {
      try {
        const res = await fetch(`/api/requisitions/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }));
    setBulkApproving(false);
    if (ok > 0) toast.success(`Approved ${ok} indent${ok === 1 ? "" : "s"}`);
    if (fail > 0) toast.error(`${fail} indent${fail === 1 ? "" : "s"} failed to approve`);
    router.refresh();
  }

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
      <Toolbar attached={false}>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by no, supplier, project…" className="pl-8" />
        </div>
        <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <ToolbarCount>{totalCount} items</ToolbarCount>
      </Toolbar>

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
              action={
                <div className="flex items-center gap-2">
                  <Badge variant="muted">{filteredPOs.length}</Badge>
                  {filteredPOs.some((po) => po.canApprove) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkApproving}
                      onClick={() => bulkApprovePOs(filteredPOs.filter((po) => po.canApprove))}
                    >
                      {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve All
                    </Button>
                  )}
                </div>
              }
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
              action={
                <div className="flex items-center gap-2">
                  <Badge variant="muted">{filteredReqs.length}</Badge>
                  {filteredReqs.some((r) => r.canApprove) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkApproving}
                      onClick={() => bulkApproveReqs(filteredReqs.filter((r) => r.canApprove))}
                    >
                      {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve All
                    </Button>
                  )}
                </div>
              }
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
    <div className={`flex items-start justify-between gap-4 p-4 ${po.wouldExceedBudget ? "bg-danger/5" : ""}`}>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-body font-semibold text-foreground">{po.poNumber}</span>
          <StatusPill status={po.status} />
          <UrgencyBadge urgency={po.urgency} />
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
        {po.projectBudget !== null && (
          <BudgetDetail
            projectBudget={po.projectBudget}
            projectSpent={po.projectSpent}
            budgetRemaining={po.budgetRemaining}
            budgetUtilizationPct={po.budgetUtilizationPct}
          />
        )}
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
        {po.projectBudget !== null && (
          <BudgetBadge
            budgetRemaining={po.budgetRemaining}
            utilizationPct={po.budgetUtilizationPct}
            wouldExceedBudget={po.wouldExceedBudget}
          />
        )}
        {po.canApprove && (
          <div className="flex gap-2">
            <Button size="sm" disabled={acting} onClick={() => act("approve")}>
              {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
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
  const [showDetails, setShowDetails] = useState(false);

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

  // Check if any line has low stock (currentStock < qtyRequested)
  const hasLowStock = req.lineDetails.some(
    (l) => l.currentStock !== null && l.currentStock < l.qtyRequested,
  );

  return (
    <div className={`p-4 ${req.wouldExceedBudget ? "bg-danger/5" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-body font-semibold text-foreground">{req.reqNumber}</span>
            <StatusPill status={req.status} />
            <UrgencyBadge urgency={req.urgency} />
            {hasLowStock && (
              <Badge variant="warning" className="gap-1">
                <Package className="h-3 w-3" /> Low stock
              </Badge>
            )}
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
          {req.projectBudget !== null && (
            <BudgetDetail
              projectBudget={req.projectBudget}
              projectSpent={req.projectSpent}
              budgetRemaining={req.budgetRemaining}
              budgetUtilizationPct={req.budgetUtilizationPct}
            />
          )}
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
          {req.projectBudget !== null && (
            <BudgetBadge
              budgetRemaining={req.budgetRemaining}
              utilizationPct={req.budgetUtilizationPct}
              wouldExceedBudget={req.wouldExceedBudget}
            />
          )}
          {req.canApprove && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={acting} onClick={() => act("reject")}>
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Reject
              </Button>
              <Button size="sm" disabled={acting} onClick={() => act("approve")}>
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Expandable line details with stock/rate context */}
      {req.lineDetails.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-caption text-brand hover:underline"
          >
            {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {showDetails ? "Hide line details" : `Show ${req.lineDetails.length} line${req.lineDetails.length === 1 ? "" : "s"} (stock & rates)`}
          </button>
          {showDetails && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-caption">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-4 font-medium">Material</th>
                    <th className="py-1.5 pr-4 font-medium text-right">Qty Requested</th>
                    <th className="py-1.5 pr-4 font-medium text-right">Current Stock</th>
                    <th className="py-1.5 pr-4 font-medium text-right">Last Rate</th>
                    <th className="py-1.5 pr-4 font-medium">Last Rate Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {req.lineDetails.map((line) => {
                    const lowStock = line.currentStock !== null && line.currentStock < line.qtyRequested;
                    return (
                      <tr key={line.materialId}>
                        <td className="py-1.5 pr-4">
                          <div className="font-medium text-foreground">{line.materialName}</div>
                          <div className="text-muted-foreground">{line.materialCode} · {line.unit}</div>
                        </td>
                        <td className="py-1.5 pr-4 text-right tnum text-foreground">
                          {formatNumber(line.qtyRequested)} {line.unit}
                        </td>
                        <td className={`py-1.5 pr-4 text-right tnum ${lowStock ? "text-danger font-medium" : "text-foreground"}`}>
                          {line.currentStock !== null ? `${formatNumber(line.currentStock)} ${line.unit}` : "—"}
                          {lowStock && <TrendingDown className="inline h-3 w-3 ml-1" />}
                        </td>
                        <td className="py-1.5 pr-4 text-right tnum text-foreground">
                          {line.lastRate !== null ? formatCurrency(line.lastRate) : "—"}
                        </td>
                        <td className="py-1.5 pr-4 text-muted-foreground">
                          {line.lastRateDate ? formatDate(line.lastRateDate) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
