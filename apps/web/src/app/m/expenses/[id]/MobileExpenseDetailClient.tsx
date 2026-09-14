"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Receipt,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  Trash2,
  FileText,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MobileEmptyState, ActionBar } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import {
  DetailHeroCard,
  DetailStatGrid,
  DetailKeyValueCard,
  DetailTimeline,
  type TimelineStepData,
} from "@/components/mobile/v2/detail-primitives";
import { AttachmentList } from "@/components/attachments/attachment-list";

const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CHEQUE: "Cheque",
  NEFT: "NEFT",
  BANK: "Bank Transfer",
};

type Props = {
  notFound?: boolean;
  id: string;
  category: string;
  amount: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  tdsAmount: number;
  status: string;
  date: string;
  projectName: string | null;
  projectId: string | null;
  supplierName: string | null;
  payeeName: string | null;
  paymentMode: string | null;
  referenceNo: string | null;
  receiptUrl: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  submittedByName: string | null;
  submittedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  canApprove: boolean;
  canManage: boolean;
  canCreate: boolean;
};

export function MobileExpenseDetailClient(props: Props) {
  const router = useRouter();
  const [acting, setActing] = useState<"submit" | "approve" | "reject" | "delete" | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (props.notFound) {
    return <MobileEmptyState icon={Receipt} title="Expense not found" />;
  }

  const isDraft = props.status === "DRAFT";
  const isPending = props.status === "PENDING";
  const isApproved = props.status === "APPROVED";
  const isRejected = props.status === "REJECTED";

  const hasGst = props.cgst > 0 || props.sgst > 0 || props.igst > 0;
  const payee = props.supplierName ?? props.payeeName ?? null;

  async function handleAction(action: "submit" | "approve" | "reject" | "delete") {
    setActing(action);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "reject") body.rejectionReason = rejectReason.trim();

      const res = await fetch(`/api/expenses/${props.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);

      const msgs: Record<string, string> = {
        submit: "Expense submitted for approval",
        approve: "Expense approved",
        reject: "Expense rejected",
        delete: "Expense deleted",
      };
      toast.success(msgs[action]);
      if (action === "delete") {
        router.push("/m/expenses");
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActing(null);
      if (action === "reject") { setShowReject(false); setRejectReason(""); }
      if (action === "delete") setShowDelete(false);
    }
  }

  // Timeline steps
  const timeline: TimelineStepData[] = [
    {
      label: "Created",
      state: "done",
      date: formatDate(props.createdAt),
      detail: props.createdByName ?? undefined,
    },
    {
      label: "Submitted",
      state: isPending || isApproved || isRejected ? "done" : "pending",
      date: props.submittedAt ? formatDate(props.submittedAt) : undefined,
      detail: props.submittedByName ?? undefined,
    },
    {
      label: isApproved ? "Approved" : isRejected ? "Rejected" : "Review",
      state: isApproved ? "done" : isRejected ? "cancelled" : "pending",
      date: props.approvedAt ? formatDate(props.approvedAt) : undefined,
      detail: props.approvedByName ?? undefined,
    },
  ];

  return (
    <div className="pb-20">
      {/* ── Hero ── */}
      <DetailHeroCard
        icon={Receipt}
        title={props.category}
        status={props.status}
      />

      {/* ── Amount stats ── */}
      <DetailStatGrid
        cols={hasGst ? 3 : 2}
        stats={[
          { label: "Total", value: formatCurrency(props.amount), tone: "stop" as const },
          ...(hasGst ? [{ label: "Subtotal", value: formatCurrency(props.subtotal) }] : []),
          ...(props.tdsAmount > 0 ? [{ label: "TDS", value: formatCurrency(props.tdsAmount), tone: "signal" as const }] : []),
        ].slice(0, hasGst ? 3 : 2)}
      />

      {/* ── Details ── */}
      <DetailKeyValueCard
        entries={[
          { label: "Date", value: formatDate(props.date), mono: true },
          ...(props.projectName ? [{ label: "Project", value: <Link href={`/m/projects/${props.projectId}`} className="underline underline-offset-2 press">{props.projectName}</Link> as React.ReactNode }] : []),
          ...(payee ? [{ label: "Payee", value: payee as React.ReactNode }] : []),
          ...(props.paymentMode ? [{ label: "Payment Mode", value: PAYMENT_MODE_LABELS[props.paymentMode] ?? props.paymentMode as React.ReactNode }] : []),
          ...(props.referenceNo ? [{ label: "Reference", value: props.referenceNo as React.ReactNode }] : []),
          ...(props.notes ? [{ label: "Notes", value: props.notes as React.ReactNode }] : []),
        ]}
      />

      {/* ── Audit trail ── */}
      <DetailKeyValueCard
        entries={[
          ...(props.createdByName ? [{ label: "Created By", value: props.createdByName as React.ReactNode }] : []),
          ...(props.submittedByName ? [{ label: "Submitted By", value: props.submittedByName as React.ReactNode }] : []),
          ...(props.approvedByName ? [{ label: "Approved By", value: props.approvedByName as React.ReactNode }] : []),
        ]}
      />

      {/* ── Rejection reason ── */}
      {isRejected && props.rejectedReason ? (
        <div
          className="rounded-[0.5rem] border p-3 mb-3"
          style={{ borderColor: "var(--color-stop)", backgroundColor: "color-mix(in srgb, var(--color-stop) 5%, transparent)" }}
        >
          <p className="text-m-caption font-bold mb-1" style={{ color: "var(--color-stop)" }}>Rejection Reason</p>
          <p className="text-m-body" style={{ color: "var(--color-ink-950)" }}>{props.rejectedReason}</p>
        </div>
      ) : null}

      {/* ── Receipt link ── */}
      {props.receiptUrl ? (
        <a
          href={`/api/uploads/${props.receiptUrl.replace(/^.*\//, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-[0.5rem] border p-3 mb-3 press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <FileText className="size-4" style={{ color: "var(--color-steel)" }} />
          <span className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>View Receipt</span>
        </a>
      ) : null}

      {/* ── Timeline ── */}
      <DetailTimeline steps={timeline} />

      {/* ── Attachments ── */}
      <AttachmentList entityType="Expense" entityId={props.id} />

      {/* ── Actions ── */}
      <ActionBar>
        <div className="flex flex-col gap-2 mt-3">
          {/* Submit: DRAFT → PENDING, or REJECTED → PENDING (resubmit after fixing) */}
          {(isDraft || isRejected) && props.canCreate && (
            <button
              disabled={acting !== null}
              onClick={() => handleAction("submit")}
              className="flex items-center justify-center gap-1.5 h-11 rounded-[0.5rem] text-m-section font-bold press"
              style={{ backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)" }}
            >
              {acting === "submit" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {isRejected ? "Fix & Resubmit" : "Submit for Approval"}
            </button>
          )}

          {/* Approve + Reject: PENDING */}
          {isPending && props.canApprove && (
            <div className="flex gap-2">
              <button
                disabled={acting !== null}
                onClick={() => { setShowReject(true); setRejectReason(""); }}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-[0.5rem] border text-m-section font-bold press"
                style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)" }}
              >
                <XCircle className="size-4" />
                Reject
              </button>
              <button
                disabled={acting !== null}
                onClick={() => handleAction("approve")}
                className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-[0.5rem] text-m-section font-bold press"
                style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
              >
                {acting === "approve" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Approve
              </button>
            </div>
          )}

          {/* Delete: DRAFT or REJECTED, FINANCE_MANAGE only */}
          {(isDraft || isRejected) && props.canManage && (
            <button
              disabled={acting !== null}
              onClick={() => setShowDelete(true)}
              className="flex items-center justify-center gap-1.5 h-11 rounded-[0.5rem] border text-m-section font-bold press"
              style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)" }}
            >
              <Trash2 className="size-4" />
              Delete Expense
            </button>
          )}
        </div>
      </ActionBar>

      {/* ── Reject dialog ── */}
      {showReject && (
        <MobileDialog open={true} onClose={() => setShowReject(false)} title="Reject Expense">
          <p className="text-m-caption mb-2" style={{ color: "var(--color-ink-500)" }}>
            Provide a reason for rejecting this expense.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Why is this expense being rejected?"
            className="w-full px-2 py-1.5 text-m-body outline-none border rounded-[0.375rem] resize-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={() => setShowReject(false)}
              className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
            >
              Cancel
            </button>
            <button
              disabled={!rejectReason.trim() || acting !== null}
              onClick={() => handleAction("reject")}
              className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
            >
              {acting === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : "Reject Expense"}
            </button>
          </div>
        </MobileDialog>
      )}

      {/* ── Delete confirmation ── */}
      {showDelete && (
        <MobileDialog open={true} onClose={() => setShowDelete(false)} title="Delete Expense">
          <p className="text-m-body mb-3" style={{ color: "var(--color-ink-700)" }}>
            This will permanently delete the expense &ldquo;{props.category}&rdquo; ({formatCurrency(props.amount)}).
            This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowDelete(false)}
              className="rounded-[0.375rem] border px-3 py-1.5 text-m-caption press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
            >
              Cancel
            </button>
            <button
              disabled={acting !== null}
              onClick={() => handleAction("delete")}
              className="rounded-[0.375rem] px-3 py-1.5 text-m-caption font-semibold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
            >
              {acting === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : "Delete"}
            </button>
          </div>
        </MobileDialog>
      )}
    </div>
  );
}
