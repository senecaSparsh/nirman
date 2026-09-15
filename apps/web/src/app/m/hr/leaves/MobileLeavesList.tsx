"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileStatusBadge } from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

export type LeaveListItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeTrade: string | null;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  days: number;
};

type LeaveFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

const FILTER_CHIPS: { label: string; value: LeaveFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const LEAVE_TYPE_LABELS: Record<string, string> = {
  CASUAL: "Casual",
  SICK: "Sick",
  EARNED: "Earned",
  UNPAID: "Unpaid",
  MATERNITY: "Maternity",
  PATERNITY: "Paternity",
};

export function MobileLeavesList({
  items,
  canManage = false,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: LeaveListItem[];
  canManage?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LeaveFilter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  async function leaveAction(id: string, approve: boolean) {
    setActing(true);
    try {
      const res = await fetch(`/api/leaves/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(approve ? "Leave approved" : "Leave rejected");
      setExpandedId(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") result = result.filter((l) => l.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (l) =>
          l.employeeName.toLowerCase().includes(q) ||
          (l.employeeTrade?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, filter]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search employee…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={filter}
              defaultValue="ALL"
              onChange={setFilter}
            />
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={!!query || filter !== "ALL"}
        onClear={() => { setQuery(""); setFilter("ALL"); }}
      />

      {/* List */}
      {filtered.length === 0 ? (
        <MobileNoResults title="No matching leave records" hint="Try a different search or filter" />
      ) : (
        <div>
          {(query || filter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} leave{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        <div className="flex flex-col gap-2">
          {filtered.map((l) => (
            <LeaveCard
              key={l.id}
              leave={l}
              canManage={canManage}
              expanded={expandedId === l.id}
              acting={acting}
              onToggle={() => { haptic(5); setExpandedId(expandedId === l.id ? null : l.id); }}
              onAction={(approve) => leaveAction(l.id, approve)}
            />
          ))}
        </div>
        </div>
      )}
    </div>
  );
}

function LeaveCard({
  leave: l,
  canManage,
  expanded,
  acting,
  onToggle,
  onAction,
}: {
  leave: LeaveListItem;
  canManage: boolean;
  expanded: boolean;
  acting: boolean;
  onToggle: () => void;
  onAction: (approve: boolean) => void;
}) {
  return (
    <div
      className="rounded-[0.5rem] border p-2.5 press cursor-pointer"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between mb-1">
        <Link
          href={`/m/hr/employees/${l.employeeId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-m-section font-bold leading-tight truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {l.employeeName}
        </Link>
        <MobileStatusBadge status={l.status} />
      </div>
      <p className="text-m-caption truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {l.employeeTrade ?? "—"} · {LEAVE_TYPE_LABELS[l.type] ?? l.type}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Dates</p>
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(l.startDate)} → {formatDate(l.endDate)}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Days</p>
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {l.days}
          </p>
        </div>
      </div>
      {l.reason && (
        <p className="text-m-caption mt-1.5" style={{ color: "var(--color-ink-500)" }}>
          {l.reason}
        </p>
      )}
      {expanded ? (
        <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {canManage && l.status === "PENDING" ? (
            <>
              <button
                disabled={acting}
                onClick={() => onAction(true)}
                className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
              >
                {acting ? <Loader2 className="size-3.5 animate-spin" /> : "Approve"}
              </button>
              <button
                disabled={acting}
                onClick={() => onAction(false)}
                className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1 border"
                style={{ borderColor: "var(--color-stop)", color: "var(--color-stop)" }}
              >
                Reject
              </button>
            </>
          ) : (
            <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              {l.status === "PENDING" ? "Awaiting HR approval." : `Leave ${l.status.toLowerCase()}.`}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
