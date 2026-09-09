"use client";

import { useState, useEffect, useRef } from "react";
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
  Plus,
  Trash2,
  Camera,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { MobileEmptyState, ActionBar } from "@/components/mobile/v2/primitives";
import { EnumSelect, SectionCard, SelectorModal } from "@/components/mobile/v2/form-primitives";
import {
  DetailHeroCard,
  DetailTimeline,
  type TimelineStepData,
} from "@/components/mobile/v2/detail-primitives";
import { useTodayDateState } from "@/lib/use-today-date";

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
  categories: { id: string; name: string; isActive: boolean }[];
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
  categories,
}: Props) {
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [payMode, setPayMode] = useState("BANK_TRANSFER");
  const [payRef, setPayRef] = useState("");

  // ── Inline line-item editing (DRAFT only) ──
  const [today] = useTodayDateState();
  const [showAddLine, setShowAddLine] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lineForm, setLineForm] = useState({
    categoryId: "",
    category: "",
    amount: "",
    gstRate: "",
    date: "",
    notes: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync line form date with today when it becomes available
  useEffect(() => {
    if (today && !lineForm.date) {
      setLineForm((f) => ({ ...f, date: today }));
    }
  }, [today, lineForm.date]);

  if (notFound) {
    return (
      <MobileEmptyState
        icon={Receipt}
        title="Claim not found"
        description="This expense claim may have been deleted or does not exist."
        action={
          <Link
            href="/m/accounts?tab=claims"
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

  async function uploadReceipt(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      return data.url ?? null;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function addLine() {
    if (!lineForm.category.trim() || !lineForm.amount) {
      toast.error("Category and amount are required");
      return;
    }
    setAddingLine(true);
    try {
      let receiptUrl: string | null = null;
      if (receiptFile) {
        const uploaded = await uploadReceipt(receiptFile);
        if (uploaded) receiptUrl = uploaded;
      }
      const res = await fetch(`/api/expense-claims/${id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: lineForm.categoryId || null,
          category: lineForm.category.trim(),
          amount: Number(lineForm.amount),
          gstRate: lineForm.gstRate ? Number(lineForm.gstRate) : null,
          date: lineForm.date || undefined,
          receiptUrl,
          notes: lineForm.notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add line");
      toast.success("Line added");
      setLineForm({ categoryId: "", category: "", amount: "", gstRate: "", date: today, notes: "" });
      setReceiptFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowAddLine(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAddingLine(false);
    }
  }

  async function removeLine(lineId: string) {
    setDeletingLineId(lineId);
    try {
      const res = await fetch(`/api/expense-claims/${id}/lines?lineId=${lineId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to remove line");
      toast.success("Line removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setDeletingLineId(null);
    }
  }

  const canSubmit = status === "DRAFT" && canCreate;
  const canApproveAction = status === "SUBMITTED" && canApprove;
  const canRejectAction = status === "SUBMITTED" && canApprove;
  const canPayAction = status === "APPROVED" && canManage;
  const hasAction = canSubmit || canApproveAction || canRejectAction || canPayAction;

  const timelineSteps: TimelineStepData[] = [
    { label: "Created", date: formatDate(createdAt), state: "done", color: "var(--color-go)" },
  ];
  if (submittedAt) {
    timelineSteps.push({ label: "Submitted", date: formatDate(submittedAt), state: "done", color: "var(--color-go)" });
  } else {
    timelineSteps.push({ label: "Draft — not submitted", detail: canSubmit ? "Your action needed" : "Awaiting submission", state: "current" });
  }
  if (status === "SUBMITTED") {
    timelineSteps.push({ label: "Awaiting approval", detail: canApprove ? "Your action needed" : "Pending approver review", state: "current" });
  } else if (status === "APPROVED" || status === "PAID") {
    timelineSteps.push({ label: "Approved", date: approvedAt ? formatDate(approvedAt) : "—", detail: approvedByName ?? "—", state: "done", color: "var(--color-go)" });
  } else if (status === "REJECTED") {
    timelineSteps.push({ label: "Rejected", detail: rejectedReason ?? "—", state: "done", color: "var(--color-stop)" });
  }
  if (status === "PAID") {
    timelineSteps.push({ label: "Paid", date: paidAt ? formatDate(paidAt) : "—", detail: `${paymentMode ?? "—"}${referenceNo ? ` · ${referenceNo}` : ""}`, state: "done", color: "var(--color-go)" });
  } else if (status === "APPROVED") {
    timelineSteps.push({ label: "Awaiting payment", detail: canManage ? "Your action needed" : "Pending finance payout", state: "current" });
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <DetailHeroCard
        icon={Receipt}
        title={claimantName}
        subtitle={projectName ?? undefined}
        status={status}
      >
        <p className="mt-2 text-m-caption tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          Created {formatDate(createdAt)}
        </p>
      </DetailHeroCard>

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
      <DetailTimeline steps={timelineSteps} title="Workflow" />

      {/* Line items */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-caption font-bold uppercase tracking-wider" style={{ color: "var(--color-steel)" }}>
            Line Items {lines.length > 0 && `(${lines.length})`}
          </p>
          {canSubmit && !showAddLine && (
            <button
              type="button"
              onClick={() => setShowAddLine(true)}
              className="flex items-center gap-1 text-m-caption font-bold press"
              style={{ color: "var(--color-signal)" }}
            >
              <Plus className="size-3.5" /> Add line
            </button>
          )}
        </div>

        {lines.length === 0 && !showAddLine && (
          <div
            className="rounded-[0.625rem] border p-4 text-center"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              {canSubmit ? "No expense lines yet — tap \"Add line\" to get started." : "No expense lines."}
            </p>
          </div>
        )}

        {lines.length > 0 && (
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
                  <div className="flex items-start gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-m-body font-bold tnum" style={{ color: "var(--color-ink-950)" }}>
                        {formatCurrency(l.amount)}
                      </p>
                      {l.gstAmount ? (
                        <p className="text-m-caption tnum" style={{ color: "var(--color-ink-500)" }}>
                          +{formatCurrency(l.gstAmount)} GST
                        </p>
                      ) : null}
                    </div>
                    {canSubmit && (
                      <button
                        type="button"
                        onClick={() => removeLine(l.id)}
                        disabled={deletingLineId === l.id}
                        className="rounded p-1 press"
                        style={{ color: "var(--color-stop)" }}
                        title="Remove line"
                      >
                        {deletingLineId === l.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add line form (DRAFT only) */}
        {canSubmit && showAddLine && (
          <SectionCard title="Add Expense Line">
            {/* Category */}
            <div className="mb-2">
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Category <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <button
                type="button"
                onClick={() => setCategoryModal(true)}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left press"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: lineForm.category ? "var(--color-ink-950)" : "var(--color-ink-500)",
                }}
              >
                <span className="truncate block">{lineForm.category || "— Select —"}</span>
              </button>
            </div>

            {/* Amount + Date */}
            <div className="flex gap-3 mb-2">
              <div className="flex-1">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Amount <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <div className="flex items-center border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)" }}>
                  <IndianRupee className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={lineForm.amount}
                    onChange={(e) => setLineForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full px-1 h-7 text-m-caption outline-none tabular-nums"
                    style={{ backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Date
                </label>
                <input
                  type="date"
                  value={lineForm.date}
                  onChange={(e) => setLineForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                />
              </div>
            </div>

            {/* GST + Notes */}
            <div className="flex gap-3 mb-2">
              <div className="w-20">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  GST %
                </label>
                <input
                  type="number"
                  min="0"
                  max="28"
                  step="0.01"
                  inputMode="decimal"
                  value={lineForm.gstRate}
                  onChange={(e) => setLineForm((f) => ({ ...f, gstRate: e.target.value }))}
                  placeholder="0"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors tabular-nums"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                  Notes
                </label>
                <input
                  type="text"
                  value={lineForm.notes}
                  onChange={(e) => setLineForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional"
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                />
              </div>
            </div>

            {/* Receipt photo */}
            <div className="flex items-center gap-2 mb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-m-caption font-semibold press"
                style={{ color: "var(--color-signal)" }}
              >
                <Camera className="size-3.5" />
                {receiptFile ? "Receipt selected" : "Add receipt"}
              </button>
              {uploading && <Loader2 className="size-3 animate-spin" />}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowAddLine(false); setLineForm({ categoryId: "", category: "", amount: "", gstRate: "", date: today, notes: "" }); setReceiptFile(null); }}
                className="flex-1 rounded-[0.5rem] py-2 text-m-caption font-bold border press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addLine}
                disabled={addingLine || uploading}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-caption font-bold press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                {addingLine ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Add Line
              </button>
            </div>
          </SectionCard>
        )}

        {/* Category selector modal */}
        {categoryModal && (
          <SelectorModal
            title="Select Category"
            items={categories.filter((c) => c.isActive).map((c) => ({ id: c.id, label: c.name }))}
            selectedId={lineForm.categoryId}
            onSelect={(catId) => {
              const cat = categories.find((c) => c.id === catId);
              setLineForm((f) => ({ ...f, categoryId: catId, category: cat?.name ?? f.category }));
              setCategoryModal(false);
            }}
            onClose={() => setCategoryModal(false)}
          />
        )}
      </div>

      {/* Reject dialog */}
      {showReject && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-4 shadow-xl">
            <h3 className="text-m-section font-extrabold tracking-tight mb-2">Reject claim</h3>
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
            <h3 className="text-m-section font-extrabold tracking-tight mb-2">Mark as paid</h3>
            <div className="mb-3">
            <EnumSelect
              label="Payment mode"
              value={payMode}
              onChange={setPayMode}
              options={[
                { value: "BANK_TRANSFER", label: "Bank Transfer" },
                { value: "CASH", label: "Cash" },
                { value: "CHEQUE", label: "Cheque" },
                { value: "UPI", label: "UPI" },
                { value: "OTHER", label: "Other" },
              ]}
            />
            </div>
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

      <AttachmentList entityType="ExpenseClaim" entityId={id} />

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
