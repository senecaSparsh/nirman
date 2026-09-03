"use client";

import { useState, useMemo } from "react";
import { Undo2, PackageX } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

type ReturnStatus = "ALL" | "DRAFT" | "SUBMITTED" | "COMPLETED" | "CANCELLED";

export type SupplierReturnItem = {
  id: string;
  returnNumber: string;
  status: string;
  returnDate: string;
  creditNoteNo: string | null;
  supplierName: string;
  totalValue: number;
};

const FILTER_CHIPS: { label: string; value: ReturnStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
];

/**
 * Client component for the supplier returns list. Handles
 * client-side search + status filter chips.
 */
export function MobileSupplierReturnsList({
  items,
  totalValue = 0,
  pendingCount = 0,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: SupplierReturnItem[];
  totalValue?: number;
  pendingCount?: number;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReturnStatus>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (r) =>
          r.returnNumber.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          (r.creditNoteNo?.toLowerCase().includes(q) ?? false) ||
          r.status.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={PackageX}
        title="No supplier returns"
        hint="Supplier returns will appear here"
      />
    );
  }

  return (
    <div>
      {/* ── Summary strip (same position across all procurement tabs) ── */}
      <MobileSummaryStrip
        stats={[
          { label: "Return Value", value: formatCurrency(totalValue), tone: "signal" },
          { label: "Pending", value: String(pendingCount), tone: "signal" },
          { label: "Total", value: String(items.length) },
          { label: "Completed", value: String(items.filter((r) => r.status === "COMPLETED").length) },
        ]}
      />

      {/* ── Sticky search header (same position across all procurement tabs) ── */}
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
              onChange={setStatusFilter}
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
        showClear={query !== "" || statusFilter !== "ALL"}
        onClear={() => { setQuery(""); setStatusFilter("ALL"); }}
      />

      <MobileSectionTitle
        right={
          (query || statusFilter !== "ALL") ? (
            <span
              className="text-m-label font-semibold"
              style={{ color: "var(--color-ink-500)" }}
            >
              {filtered.length} return{filtered.length !== 1 ? "s" : ""}
            </span>
          ) : undefined
        }
      >
        {query || statusFilter !== "ALL" ? "Results" : "Recent"}
      </MobileSectionTitle>

      {filtered.length === 0 ? (
        <MobileNoResults title="No matching returns" hint="Try a different search or filter" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((r) => (
            <MobileRow
              key={r.id}
              href={`/m/supplier-returns/${r.id}`}
              icon={Undo2}
              title={r.returnNumber}
              subtitle={`${r.supplierName} · ${formatDate(new Date(r.returnDate))}${r.creditNoteNo ? ` · CN: ${r.creditNoteNo}` : ""}`}
              meta={formatCurrency(r.totalValue)}
              badge={<MobileStatusBadge status={r.status} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
