"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileSectionTitle, MobileRow, MobileStatusBadge } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileFilterIcon, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

export type PayrollListItem = {
  id: string;
  month: number;
  year: number;
  monthLabel: string;
  status: string;
  totalNet: number;
  totalGross: number;
};

type PayrollFilter = "ALL" | "DRAFT" | "PAID" | "PROCESSED";

const FILTER_CHIPS: { label: string; value: PayrollFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Paid", value: "PAID" },
  { label: "Processed", value: "PROCESSED" },
];

/**
 * Client component for the mobile payroll list. Handles client-side
 * search by month/year (e.g. "Jan 2024", "2024") and status filter
 * chips (All / Draft / Paid / Processed). Each row shows a coloured
 * MobileStatusBadge instead of plain text.
 */
export function MobilePayrollList({
  items,
  canManage = false,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: PayrollListItem[];
  canManage?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PayrollFilter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  async function periodAction(id: string, action: "process" | "pay") {
    setActing(true);
    try {
      const res = await fetch(`/api/payroll/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(action === "process" ? "Payroll processed" : "Payroll paid");
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
    if (statusFilter !== "ALL") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.monthLabel.toLowerCase().includes(q) ||
          String(p.year).includes(q) ||
          String(p.month).includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search..."
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={statusFilter}
              defaultValue="ALL"
              onChange={(v) => setStatusFilter(v as PayrollFilter)}
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
        showClear={!!query || statusFilter !== "ALL"}
        onClear={() => { setQuery(""); setStatusFilter("ALL"); }}
      />

      <MobileSectionTitle>Periods ({filtered.length})</MobileSectionTitle>
      {filtered.length === 0 ? (
        <MobileNoResults title="No matching payroll periods" hint="Try a different search or filter" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((p) => {
            const expanded = expandedId === p.id;
            return (
              <div key={p.id} className="rounded-[0.625rem] border" style={{ borderColor: "var(--color-line)" }}>
                <div
                  className="press cursor-pointer"
                  onClick={() => { haptic(5); setExpandedId(expanded ? null : p.id); }}
                >
                  <MobileRow
                    icon={CalendarCheck}
                    title={p.monthLabel}
                    subtitle={`gross ${formatCurrency(p.totalGross)}`}
                    meta={formatCurrency(p.totalNet)}
                    badge={<MobileStatusBadge status={p.status} />}
                    tone={p.status === "PAID" ? "success" : p.status === "DRAFT" ? "warning" : "default"}
                  />
                </div>
                {expanded ? (
                  <div className="px-3 pb-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                      <span>Net payable</span>
                      <span className="font-bold" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(p.totalNet)}</span>
                    </div>
                    <div className="flex gap-2">
                      {canManage && p.status === "DRAFT" ? (
                        <button
                          disabled={acting}
                          onClick={() => periodAction(p.id, "process")}
                          className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
                        >
                          {acting ? <Loader2 className="size-3.5 animate-spin" /> : "Process payroll"}
                        </button>
                      ) : null}
                      {canManage && p.status === "PROCESSED" ? (
                        <button
                          disabled={acting}
                          onClick={() => periodAction(p.id, "pay")}
                          className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1"
                          style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
                        >
                          {acting ? <Loader2 className="size-3.5 animate-spin" /> : `Pay ${formatCurrency(p.totalNet)}`}
                        </button>
                      ) : null}
                      {p.status === "PAID" ? (
                        <p className="flex-1 text-m-caption" style={{ color: "var(--color-go)" }}>Settled — salaries paid out.</p>
                      ) : null}
                      {!canManage && p.status !== "PAID" ? (
                        <p className="flex-1 text-m-caption" style={{ color: "var(--color-ink-400)" }}>Awaiting finance action.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
