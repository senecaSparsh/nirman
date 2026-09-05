"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  X,
  Loader2,
  Receipt,
  Clock,
  CheckCircle2,
  XCircle,
  IndianRupee,
  FileText,
  ArrowLeft,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileStatusBadge,
  MobileEmptyState,
  ActionBar,
} from "@/components/mobile/v2/primitives";

export type ClaimLine = {
  id: string;
  categoryName: string | null;
  amount: number;
  gstRate: number | null;
  gstAmount: number | null;
  date: string;
  receiptUrl: string | null;
  notes: string | null;
};

type Props = {
  notFound?: boolean;
  id: string;
  claimantName: string;
  projectName: string | null;
  status: string;
  totalAmount: number;
  description: string | null;
  submittedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  paidAt: string | null;
  paymentMode: string | null;
  referenceNo: string | null;
  lines: ClaimLine[];
  canApprove: boolean;
  canManage: boolean;
  canCreate: boolean;
  createdAt: string;
};

const STATUS_META: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  DRAFT: { label: "Draft", icon: Receipt, color: "text-muted-foreground" },
  SUBMITTED: { label: "Pending", icon: Clock, color: "text-warning" },
  APPROVED: { label: "Approved", icon: CheckCircle2, color: "text-success" },
  PAID: { label: "Paid", icon: CheckCircle2, color: "text-success" },
  REJECTED: { label: "Rejected", icon: XCircle, color: "text-danger" },
};

export function MobileExpenseClaimDetailClient({
  notFound,
  id,
  claimantName,
  projectName,
  status,
  totalAmount,
  description,
  submittedAt,
  approvedByName,
  approvedAt,
  rejectedReason,
  paidAt,
  paymentMode,
  referenceNo,
  lines,
  canApprove,
  canManage,
  canCreate,
  createdAt,
}: Props) {
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [payMode, setPayMode] = useState("BANK_TRANSFER");
  const [payRef, setPayRef] = useState("");

  if (notFound) {
    return (
      <MobileEmptyState
        icon={Receipt}
        title="Claim not found"
        description="This expense claim may have been deleted or does not exist."
        action={
          <Link
            href="/m/expense-claims"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-body font-medium text-brand-foreground"
          >
            <ArrowLeft className="size-4" /> Back to claims
          </Link>
        }
      />
    );
  }

  const meta = STATUS_META[status] ?? { label: status, icon: Receipt, color: "text-muted-foreground" };
  const StatusIcon = meta.icon;

  async function doAction(
    action: "submit" | "approve" | "reject" | "pay",
    extra?: Record<string, unknown>,
  ) {
    setActionLoading(`${action}`);
    try {
      const res = await fetch(`/api/expense-claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);
      toast.success(
        action === "submit"
          ? "Claim submitted"
          : action === "approve"
            ? "Claim approved"
            : action === "reject"
              ? "Claim rejected"
              : "Claim paid",
      );
      if (action === "reject") setShowReject(false);
      if (action === "pay") setShowPay(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  const canSubmit = status === "DRAFT" && canCreate;
  const canApproveAction = status === "SUBMITTED" && canApprove;
  const canRejectAction = status === "SUBMITTED" && canApprove;
  const canPayAction = status === "APPROVED" && canManage;
  const hasAction = canSubmit || canApproveAction || canRejectAction || canPayAction;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            {claimantName}
          </h1>
          <MobileStatusBadge status={status} />
        </div>
        {projectName && (
          <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
            {projectName}
          </p>
        )}
        <p className="mt-1 text-m-caption tnum" style={{ color: "var(--color-ink-500)" }}>
          Created {formatDate(createdAt)}
        </p>
      </div>

      {/* Amount card */}
      <div
        className="mb-4 rounded-[0.625rem] border p-4"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-m-caption font-bold uppercase tracking-wider" style={{ color: "var(--color-steel)" }}>
              Total Amount
            </p>
            <p className="mt-1 text-m-h2 font-bold tnum" style={{ color: "var(--color-ink-950)" }}>
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 text-m-body font-semibold ${meta.color}`}>
            <StatusIcon className="size-4" />
            {meta.label}
          </div>
        </div>
        {lines.length > 0 && (
          <p className="mt-2 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            {lines.length} line {lines.length === 1 ? "item" : "items"}
          </p>
        )}
      </div>

      {/* Description */}
      {description && (
        <div className="mb-4">
          <p className="text-m-caption font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-steel)" }}>
            Description
          </p>
          <div
            className="rounded-[0.625rem] border-l-2 p-3 text-m-section italic"
            style={{
              borderColor: "var(--color-steel)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-700)",
            }}
          >
            {description}
          </div>
        </div>
      )}

      {/* Workflow timeline */}
      <div className="mb-5">
        <p className="text-m-caption font-bold uppercase tracking-wider mb-3" style={{ color: "var(--color-steel)" }}>
          Workflow
        </p>
        <div className="relative pl-6">
          <div
            className="absolute left-[7px] top-1 bottom-1 w-px"
            style={{ backgroundColor: "var(--color-line)" }}
          />
          <TimelineStep
            done
            color="var(--color-go)"
            label="Created"
            date={formatDate(createdAt)}
          />
          {submittedAt ? (
            <TimelineStep
              done
              color="var(--color-go)"
              label="Submitted"
              date={formatDate(submittedAt)}
            />
          ) : (
            <TimelineStep
              color="var(--color-signal)"
              label="Draft — not submitted"
              detail={canSubmit ? "Your action needed" : "Awaiting submission"}
            />
          )}
          {status === "SUBMITTED" ? (
            <TimelineStep
              color="var(--color-signal)"
              label="Awaiting approval"
              detail={canApprove ? "Your action needed" : "Pending approver review"}
            />
          ) : status === "APPROVED" || status === "PAID" ? (
            <TimelineStep
              done
              color="var(--color-go)"
              label="Approved"
              date={approvedAt ? formatDate(approvedAt) : "—"}
              detail={approvedByName ?? "—"}
            />
          ) : status === "REJECTED" ? (
            <TimelineStep
              done
              color="var(--color-stop)"
              label="Rejected"
              detail={rejectedReason ?? "—"}
            />
          ) : null}
          {status === "PAID" ? (
            <TimelineStep
              done
              color="var(--color-go)"
              label="Paid"
              date={paidAt ? formatDate(paidAt) : "—"}
              detail={`${paymentMode ?? "—"}${referenceNo ? ` · ${referenceNo}` : ""}`}
            />
          ) : status === "APPROVED" ? (
            <TimelineStep
              color="var(--color-signal)"
              label="Awaiting payment"
              detail={canManage ? "Your action needed" : "Pending finance payout"}
            />
          ) : null}
        </div>
      </div>

      {/* Line items */}
      {lines.length > 0 && (
        <div className="mb-5">
          <p className="text-m-caption font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-steel)" }}>
            Line Items
          </p>
          <div
            className="rounded-[0.625rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {lines.map((l, i) => (
              <div
                key={l.id}
                className="px-3 py-2.5"
                style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                      {l.categoryName ?? "Uncategorized"}
                    </p>
                    <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                      {formatDate(l.date)}
                      {l.notes ? ` · ${l.notes}` : ""}
                    </p>
                    {l.receiptUrl && (
                      <a
                        href={l.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-m-caption font-semibold"
                        style={{ color: "var(--color-signal)" }}
                      >
                        <FileText className="size-3" /> Receipt
                      </a>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-m-body font-bold tnum" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(l.amount)}
                    </p>
                    {l.gstAmount ? (
                      <p className="text-m-caption tnum" style={{ color: "var(--color-ink-500)" }}>
                        +{formatCurrency(l.gstAmount)} GST
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {showReject && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-xl">
            <h3 className="text-m-section font-bold mb-2">Reject claim</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)…"
              rows={3}
              className="w-full rounded-lg border border-border bg-background p-2 text-m-body"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-lg px-3 py-2 text-m-body font-medium border border-border"
                onClick={() => setShowReject(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-destructive px-3 py-2 text-m-body font-medium text-destructive-foreground"
                disabled={actionLoading === "reject" || !rejectReason.trim()}
                onClick={() => doAction("reject", { rejectionReason: rejectReason })}
              >
                {actionLoading === "reject" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay dialog */}
      {showPay && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-xl">
            <h3 className="text-m-section font-bold mb-2">Mark as paid</h3>
            <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-steel)" }}>
              Payment mode
            </label>
            <select
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
              className="w-full rounded-lg border border-border bg-background p-2 text-m-body mb-3"
            >
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="UPI">UPI</option>
              <option value="OTHER">Other</option>
            </select>
            <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-steel)" }}>
              Reference no. (optional)
            </label>
            <input
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="UTR / cheque no."
              className="w-full rounded-lg border border-border bg-background p-2 text-m-body"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-lg px-3 py-2 text-m-body font-medium border border-border"
                onClick={() => setShowPay(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-brand px-3 py-2 text-m-body font-medium text-brand-foreground"
                disabled={actionLoading === "pay"}
                onClick={() => doAction("pay", { paymentMode: payMode, referenceNo: payRef || null })}
              >
                {actionLoading === "pay" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Mark as Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      {hasAction && (
        <ActionBar>
          <div className="flex w-full gap-2">
            {canSubmit && (
              <button
                className="flex-1 rounded-lg bg-brand px-3 py-2.5 text-m-body font-semibold text-brand-foreground press"
                disabled={actionLoading === "submit"}
                onClick={() => doAction("submit")}
              >
                {actionLoading === "submit" ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
                Submit
              </button>
            )}
            {canApproveAction && (
              <button
                className="flex-1 rounded-lg bg-success px-3 py-2.5 text-m-body font-semibold text-success-foreground press"
                disabled={actionLoading === "approve"}
                onClick={() => doAction("approve")}
              >
                {actionLoading === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Approve
              </button>
            )}
            {canRejectAction && (
              <button
                className="flex-1 rounded-lg border border-destructive px-3 py-2.5 text-m-body font-semibold text-destructive press"
                disabled={actionLoading === "reject"}
                onClick={() => setShowReject(true)}
              >
                <X className="size-4" />
                Reject
              </button>
            )}
            {canPayAction && (
              <button
                className="flex-1 rounded-lg bg-brand px-3 py-2.5 text-m-body font-semibold text-brand-foreground press"
                disabled={actionLoading === "pay"}
                onClick={() => setShowPay(true)}
              >
                {actionLoading === "pay" ? <Loader2 className="size-4 animate-spin" /> : <IndianRupee className="size-4" />}
                Pay
              </button>
            )}
          </div>
        </ActionBar>
      )}
    </div>
  );
}

function TimelineStep({
  done,
  color,
  label,
  date,
  detail,
}: {
  done?: boolean;
  color: string;
  label: string;
  date?: string;
  detail?: React.ReactNode;
}) {
  return (
    <div className="relative pb-4 last:pb-0">
      <div
        className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full border-2"
        style={{
          backgroundColor: done ? color : "var(--color-paper)",
          borderColor: color,
        }}
      >
        {done ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--color-paper)" }} />
          </div>
        ) : null}
      </div>
      <div>
        <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
          {label}
        </p>
        {date ? (
          <p className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {date}
          </p>
        ) : null}
        {detail ? (
          <p className="text-m-label mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}
