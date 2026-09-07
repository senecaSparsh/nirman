"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ScanLine,
  CheckCircle2, AlertTriangle, Clock, Scale, Loader2, Trash2,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { toast } from "sonner";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { DetailStatGrid, DetailKeyValueCard, DetailAlertBanner } from "@/components/mobile/v2/detail-primitives";

type CountStatus = "DRAFT" | "COUNTED" | "RECONCILED";

interface CountLine {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  materialUnit: string;
  systemQty: number;
  countedQty: number;
  variance: number;
}

interface CountData {
  id: string;
  status: CountStatus;
  countDate: string;
  createdAt: string;
  notes: string | null;
  location: { id: string; name: string; type: string };
  totalVariance: number;
  itemsWithVariance: number;
  itemsMatched: number;
  lineCount: number;
  lines: CountLine[];
}

/**
 * Stock count detail — shows count header, variance summary,
 * line items with system vs counted vs variance, and action buttons.
 */
export function MobileStockCountDetailClient({
  count,
  canManage,
  notFound,
}: {
  count?: CountData;
  canManage: boolean;
  notFound?: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<"confirm" | "reconcile" | "delete" | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  /* ── Not found ── */
  if (notFound || !count) {
    return (
      <MobileEmptyState
        icon={ScanLine}
        title="Count not found"
      />
    );
  }

  const isDraft = count.status === "DRAFT";
  const isCounted = count.status === "COUNTED";
  const isReconciled = count.status === "RECONCILED";

  const StatusIcon = isDraft ? Clock : isCounted ? AlertTriangle : CheckCircle2;
  const accentColor = isDraft ? "var(--color-signal)" : isCounted ? "var(--color-steel)" : "var(--color-go)";
  const statusLabel = isDraft ? "Draft" : isCounted ? "Counted" : "Reconciled";

  const handleAction = async (action: "confirm" | "reconcile") => {
    setActing(action);
    try {
      const res = await fetch(`/api/stock-counts/${count.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed to ${action}`);
      }
      toast.success(action === "confirm" ? "Count confirmed" : "Count reconciled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActing(null);
    }
  };

  const handleDelete = async () => {
    setActing("delete");
    try {
      const res = await fetch(`/api/stock-counts/${count.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete");
      }
      toast.success("Draft count deleted");
      router.push("/m/stock?tab=counts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setActing(null);
      setShowDelete(false);
    }
  };

  return (
    <div className="pb-20">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            Stock Inventory
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)` }}
        >
          <StatusIcon className="size-2.5" />
          {statusLabel}
        </span>
      </div>

      {/* ── Variance summary ── */}
      <DetailStatGrid
        cols={4}
        stats={[
          { label: "Counted", value: String(count.lineCount) },
          { label: "Matched", value: String(count.itemsMatched), tone: "go" },
          { label: "Mismatch", value: String(count.itemsWithVariance), tone: count.itemsWithVariance > 0 ? "signal" : "go" },
          {
            label: "Net Δ",
            value: `${count.totalVariance > 0 ? "+" : ""}${formatNumber(count.totalVariance, 0)}`,
            tone: count.totalVariance < 0 ? "stop" : count.totalVariance > 0 ? "signal" : "go",
          },
        ]}
      />

      {/* ── Details ── */}
      <DetailKeyValueCard
        entries={[
          { label: "Location", value: <Link href={`/m/stock?locationId=${count.location.id}`} className="underline underline-offset-2">{count.location.name}</Link> },
          { label: "Date", value: formatDate(count.countDate) },
          ...(count.notes ? [{ label: "Notes", value: count.notes }] : []),
        ]}
      />

      <AttachmentList entityType="StockCount" entityId={count.id} />

      {/* ── Line items ── */}
      <div className="flex items-center gap-1.5 mb-2">
        <ScanLine className="size-3" style={{ color: "var(--color-steel)" }} />
        <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
          Counted Items
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
      </div>

      {count.lines.length === 0 ? (
        <MobileEmptyState
          icon={ScanLine}
          title="No items counted"
          size="compact"
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {count.lines.map((l) => {
            const variance = l.variance;
            const hasVariance = variance > 0.001 || variance < -0.001;
            const VarianceIcon = variance > 0 ? TrendingUp : variance < 0 ? TrendingDown : Minus;
            const varianceColor = variance < 0 ? "var(--color-stop)" : variance > 0 ? "var(--color-signal)" : "var(--color-go)";
            const varianceStr = variance > 0 ? `+${formatNumber(variance, 0)}` : formatNumber(variance, 0);

            return (
              <Link
                key={l.id}
                href={`/m/materials/${l.materialId}`}
                className="flex items-center gap-2 rounded-[0.5rem] border p-2 active:opacity-80 transition-opacity"
                style={{
                  borderColor: hasVariance ? `color-mix(in srgb, ${varianceColor} 25%, var(--color-line))` : "var(--color-line)",
                  backgroundColor: hasVariance ? `color-mix(in srgb, ${varianceColor} 4%, var(--color-paper))` : "var(--color-paper)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {l.materialName}
                  </p>
                  <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                    {l.materialCode}
                  </p>
                  {/* System vs Counted */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      sys: {formatNumber(l.systemQty, 0)} {l.materialUnit}
                    </span>
                    <span style={{ color: "var(--color-line)" }}>→</span>
                    <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      {formatNumber(l.countedQty, 0)} {l.materialUnit}
                    </span>
                  </div>
                </div>

                {/* Variance badge */}
                <div
                  className="shrink-0 flex items-center gap-0.5 rounded-[0.375rem] px-1.5 py-1"
                  style={{ backgroundColor: hasVariance ? `color-mix(in srgb, ${varianceColor} 12%, transparent)` : "transparent" }}
                >
                  <VarianceIcon className="size-2.5" style={{ color: varianceColor }} />
                  <span
                    className="text-m-caption font-bold tabular-nums"
                    style={{ color: varianceColor }}
                  >
                    {hasVariance ? varianceStr : "✓"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Action buttons ── */}
      {canManage && (isDraft || isCounted) ? (
        <div className="flex flex-col gap-2 mt-4">
          {isDraft ? (
            <button
              onClick={() => handleAction("confirm")}
              disabled={acting !== null}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {acting === "confirm" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>Confirm Count</span>
                </>
              )}
            </button>
          ) : null}

          {isCounted ? (
            <button
              onClick={() => handleAction("reconcile")}
              disabled={acting !== null}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {acting === "reconcile" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Scale className="size-4" />
                  <span>Reconcile Stock</span>
                </>
              )}
            </button>
          ) : null}

          {/* Delete draft */}
          {isDraft ? (
            <button
              onClick={() => setShowDelete(true)}
              disabled={acting !== null}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-body font-bold border text-m-body press disabled:opacity-50"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-stop)" }}
            >
              <Trash2 className="size-3.5" />
              <span>Delete Draft</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Reconciled info ── */}
      {isReconciled ? (
        <div className="mt-4">
          <DetailAlertBanner
            tone="success"
            title="Reconciled"
            description="Stock levels have been adjusted to match counted quantities. GL entries posted for variances."
          />
        </div>
      ) : null}

      {/* ── Delete confirmation modal ── */}
      {showDelete ? (
        <MobileDialog open={true} onClose={() => setShowDelete(false)} title="Delete draft count?">
            <div>
              <p className="text-m-body mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will permanently delete the draft stock inventory for {count.location.name}. This action cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowDelete(false)}
                  className="flex-1 rounded-[0.5rem] py-2 text-m-body font-bold border text-m-body press"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={acting === "delete"}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-body font-bold text-m-body press disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
                >
                  {acting === "delete" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="size-3.5" />
                      <span>Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
        </MobileDialog>
      ) : null}
    </div>
  );
}
