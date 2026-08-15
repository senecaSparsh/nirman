"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, ArrowLeftRight, MapPin, Calendar, FileText,
  CheckCircle2, AlertTriangle, Clock, Package, Loader2, XCircle,
  Building2,
} from "lucide-react";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";
import { MobileStatusBadge } from "@/components/mobile/v2/primitives";
import { formatDate, formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type TransferStatus = "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";

interface TransferLine {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUnit: string;
  qty: number;
  unitCostAtSource: number | null;
  unitTransferPrice: number | null;
  lineTransferTotal: number | null;
}

interface TransferData {
  id: string;
  status: TransferStatus;
  transferDate: string;
  createdAt: string;
  notes: string | null;
  isInterCompany: boolean;
  freight: number;
  handlingFee: number;
  markupPct: number;
  transferPriceTotal: number | null;
  fromLocation: { id: string; name: string; type: string; companyName: string | null };
  toLocation: { id: string; name: string; type: string; companyName: string | null };
  totalQty: number;
  lineCount: number;
  lines: TransferLine[];
}

/**
 * Stock transfer detail — shows from → to header, status, line items,
 * and action buttons (complete / cancel) for DRAFT transfers.
 */
export function MobileTransferDetailClient({
  transfer,
  canManage,
}: {
  transfer: TransferData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<"complete" | "cancel" | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  const isDraft = transfer.status === "DRAFT";
  const isCompleted = transfer.status === "COMPLETED";
  const isCancelled = transfer.status === "CANCELLED";

  const StatusIcon = isDraft ? Clock : isCompleted ? CheckCircle2 : AlertTriangle;
  const accentColor = isDraft
    ? "var(--color-signal)"
    : isCompleted
      ? "var(--color-go)"
      : "var(--color-stop)";
  const statusLabel = isDraft
    ? "Draft"
    : transfer.status === "IN_TRANSIT"
      ? "In Transit"
      : isCompleted
        ? "Completed"
        : "Cancelled";

  const handleAction = async (action: "complete" | "cancel") => {
    haptic(10);
    setActing(action);
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed to ${action}`);
      }
      toast.success(action === "complete" ? "Transfer completed" : "Transfer cancelled");
      router.refresh();
    } catch (err) {
      haptic([10, 30, 10]);
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActing(null);
      setShowCancel(false);
    }
  };

  return (
    <div className="pb-20">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <MobileBackButton fallback="/m/transfers" className="shrink-0" style={{ color: "var(--color-ink-700)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Stock Transfer
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}
        >
          <StatusIcon className="size-2.5" />
          {statusLabel}
        </span>
      </div>

      {/* ── From → To banner ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center gap-2">
          {/* From */}
          <div className="min-w-0 flex-1">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              From
            </p>
            <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {transfer.fromLocation.name}
            </p>
            {transfer.isInterCompany && transfer.fromLocation.companyName ? (
              <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-steel)" }}>
                {transfer.fromLocation.companyName}
              </p>
            ) : null}
          </div>

          <div
            className="grid place-items-center size-7 rounded-full shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <ArrowRight className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
          </div>

          {/* To */}
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              To
            </p>
            <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {transfer.toLocation.name}
            </p>
            {transfer.isInterCompany && transfer.toLocation.companyName ? (
              <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-steel)" }}>
                {transfer.toLocation.companyName}
              </p>
            ) : null}
          </div>
        </div>

        {/* Inter-company badge */}
        {transfer.isInterCompany ? (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t" style={{ borderColor: "var(--color-line)" }}>
            <Building2 className="size-3" style={{ color: "var(--color-signal-dark)" }} />
            <span className="text-[0.5rem] font-semibold" style={{ color: "var(--color-signal-dark)" }}>
              Inter-company STO
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Summary row ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3 flex items-center justify-between"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div>
          <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Items
          </p>
          <p className="text-[1.125rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {transfer.lineCount}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Total Qty
          </p>
          <p className="text-[1.125rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(transfer.totalQty, 2)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
            Status
          </p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <MobileStatusBadge status={transfer.status} label={statusLabel} />
          </div>
        </div>
      </div>

      {/* ── Info row ── */}
      <div className="flex flex-col gap-1.5 mb-3">
        <InfoRow icon={Calendar} label="Date" value={formatDate(transfer.transferDate)} />
        {transfer.notes ? (
          <InfoRow icon={FileText} label="Notes" value={transfer.notes} />
        ) : null}
      </div>

      {/* ── Line items ── */}
      <div className="flex items-center gap-1.5 mb-2">
        <ArrowLeftRight className="size-3" style={{ color: "var(--color-steel)" }} />
        <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
          Transfer Items
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
      </div>

      {transfer.lines.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Package className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>No items in this transfer</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {transfer.lines.map((l) => (
            <Link
              key={l.id}
              href={`/m/materials/${l.materialId}`}
              className="flex items-center gap-2 rounded-[0.5rem] border p-2 active:opacity-80 transition-opacity"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {l.materialName}
                </p>
                <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                  {l.materialCode}
                </p>
              </div>

              {/* Qty */}
              <div className="shrink-0 text-right">
                <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatNumber(l.qty, 2)}
                </p>
                <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
                  {l.materialUnit}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Completed info ── */}
      {isCompleted ? (
        <div
          className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 mt-4"
          style={{
            borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))",
            backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
          <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>
            Stock has been moved from source to destination location. Stock ledger and MAC updated.
          </span>
        </div>
      ) : null}

      {/* ── Cancelled info ── */}
      {isCancelled ? (
        <div
          className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 mt-4"
          style={{
            borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))",
            backgroundColor: "color-mix(in srgb, var(--color-stop) 6%, var(--color-paper))",
          }}
        >
          <XCircle className="size-4 shrink-0" style={{ color: "var(--color-stop)" }} />
          <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>
            This transfer was cancelled. No stock was moved.
          </span>
        </div>
      ) : null}

      {/* ── Sticky action bar (DRAFT + canManage) ── */}
      {canManage && isDraft ? (
        <div
          className="sticky bottom-0 z-20 border-t mt-4"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
            borderColor: "var(--color-line)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="mx-auto w-full max-w-[34rem] px-3.5 py-2.5 pb-safe flex items-center gap-2">
            <button
              onClick={() => setShowCancel(true)}
              disabled={acting !== null}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
              style={{
                borderColor: "var(--color-stop)",
                color: "var(--color-stop)",
                backgroundColor: "transparent",
              }}
            >
              {acting === "cancel" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              Cancel
            </button>
            <button
              onClick={() => void handleAction("complete")}
              disabled={acting !== null}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-[0.8125rem] press active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-go)",
                color: "#fff",
              }}
            >
              {acting === "complete" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Complete
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Cancel confirmation modal ── */}
      {showCancel ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
          onClick={() => setShowCancel(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Cancel this transfer?</p>
            </div>
            <div className="p-3">
              <p className="text-[0.6875rem] mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will cancel the stock transfer from {transfer.fromLocation.name} to {transfer.toLocation.name}. No stock will be moved. This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCancel(false)}
                  disabled={acting !== null}
                  className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border press disabled:opacity-50"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                >
                  Keep
                </button>
                <button
                  onClick={() => void handleAction("cancel")}
                  disabled={acting !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
                >
                  {acting === "cancel" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="size-3.5" />
                      <span>Cancel Transfer</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Info row ─── */
function InfoRow({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-[0.5rem] border px-2.5 py-1.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <Icon className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
      <div className="min-w-0 flex-1">
        <span className="text-[0.4375rem] font-semibold uppercase block" style={{ color: "var(--color-ink-500)" }}>
          {label}
        </span>
        <span className="text-[0.6875rem] font-bold block" style={{ color: "var(--color-ink-950)" }}>
          {value}
        </span>
      </div>
    </div>
  );
}
