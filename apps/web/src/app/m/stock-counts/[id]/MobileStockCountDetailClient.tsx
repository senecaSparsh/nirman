"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ScanLine, MapPin, Calendar, FileText,
  CheckCircle2, AlertTriangle, Clock, Scale, Loader2, Trash2,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import { toast } from "sonner";

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
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Stock count not found
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-8 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <ScanLine className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            Count not found
          </p>
        </div>
      </div>
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
      router.push("/m/stock-counts");
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
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Stock Count
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

      {/* ── Variance banner ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{
          borderColor: count.itemsWithVariance > 0
            ? `color-mix(in srgb, ${count.totalVariance < 0 ? "var(--color-stop)" : "var(--color-signal)"} 30%, var(--color-line))`
            : "color-mix(in srgb, var(--color-go) 30%, var(--color-line))",
          backgroundColor: count.itemsWithVariance > 0
            ? `color-mix(in srgb, ${count.totalVariance < 0 ? "var(--color-stop)" : "var(--color-signal)"} 6%, var(--color-paper))`
            : "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))",
        }}
      >
        <div className="flex items-center justify-between">
          {/* Items counted */}
          <div>
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Items Counted
            </p>
            <p className="text-[1.125rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {count.lineCount}
            </p>
          </div>

          {/* Matched */}
          <div className="text-center">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Matched
            </p>
            <p className="text-[1.125rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {count.itemsMatched}
            </p>
          </div>

          {/* Mismatches */}
          <div className="text-center">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Mismatch
            </p>
            <p
              className="text-[1.125rem] font-bold tabular-nums"
              style={{ color: count.itemsWithVariance > 0 ? "var(--color-signal)" : "var(--color-go)" }}
            >
              {count.itemsWithVariance}
            </p>
          </div>

          {/* Net variance */}
          <div className="text-right">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Net Δ
            </p>
            <p
              className="text-[1.125rem] font-bold tabular-nums"
              style={{
                color: count.totalVariance < 0 ? "var(--color-stop)" : count.totalVariance > 0 ? "var(--color-signal)" : "var(--color-go)",
              }}
            >
              {count.totalVariance > 0 ? "+" : ""}{formatNumber(count.totalVariance, 0)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Info row ── */}
      <div className="flex flex-col gap-1.5 mb-3">
        <InfoRow icon={MapPin} label="Location" value={count.location.name} href={`/m/stock?locationId=${count.location.id}`} />
        <InfoRow icon={Calendar} label="Date" value={formatDate(count.countDate)} />
        {count.notes ? (
          <InfoRow icon={FileText} label="Notes" value={count.notes} />
        ) : null}
      </div>

      {/* ── Line items ── */}
      <div className="flex items-center gap-1.5 mb-2">
        <ScanLine className="size-3" style={{ color: "var(--color-steel)" }} />
        <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
          Counted Items
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
      </div>

      {count.lines.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-6 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <ScanLine className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>No items counted</p>
        </div>
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
                  <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {l.materialName}
                  </p>
                  <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                    {l.materialCode}
                  </p>
                  {/* System vs Counted */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[0.5rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      sys: {formatNumber(l.systemQty, 0)} {l.materialUnit}
                    </span>
                    <span style={{ color: "var(--color-line)" }}>→</span>
                    <span className="text-[0.5rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
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
                    className="text-[0.5625rem] font-bold tabular-nums"
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
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
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
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
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
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border press disabled:opacity-50"
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
        <div
          className="flex items-center gap-2 rounded-[0.5rem] border px-3 py-2 mt-4"
          style={{
            borderColor: "color-mix(in srgb, var(--color-go) 30%, var(--color-line))",
            backgroundColor: "color-mix(in srgb, var(--color-go) 6%, var(--color-paper))",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
          <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-700)" }}>
            Stock levels have been adjusted to match counted quantities. GL entries posted for variances.
          </span>
        </div>
      ) : null}

      {/* ── Delete confirmation modal ── */}
      {showDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
          onClick={() => setShowDelete(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
              <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Delete draft count?</p>
            </div>
            <div className="p-3">
              <p className="text-[0.6875rem] mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will permanently delete the draft stock count for {count.location.name}. This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDelete(false)}
                  className="flex-1 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold border press"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={acting === "delete"}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-[0.6875rem] font-bold press disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Info row ─── */
function InfoRow({
  icon: Icon, label, value, href,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div
      className="flex items-center gap-2 rounded-[0.5rem] border px-2.5 py-1.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <Icon className="size-3 shrink-0" style={{ color: "var(--color-steel)" }} />
      <div className="min-w-0 flex-1">
        <span className="text-[0.4375rem] font-semibold uppercase block" style={{ color: "var(--color-ink-500)" }}>
          {label}
        </span>
        <span className="text-[0.6875rem] font-bold truncate block" style={{ color: "var(--color-ink-950)" }}>
          {value}
        </span>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
