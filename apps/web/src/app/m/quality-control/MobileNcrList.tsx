"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ShieldCheck, FileText, ShieldAlert } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileStatusBadge, MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileFilterIcon, MobileNoResults } from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

export type NcrListItem = {
  id: string;
  ncrNumber: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  projectName: string;
  subcontractorName: string | null;
  location: string | null;
  hasCapa: boolean;
  capaStatus: string | null;
  raisedAt: string;
};

type NcrFilter = "ALL" | "OPEN" | "UNDER_REVIEW" | "CAPA_REQUIRED" | "ACCEPTED" | "REJECTED" | "CLOSED";

const FILTER_CHIPS: { label: string; value: NcrFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "OPEN" },
  { label: "Review", value: "UNDER_REVIEW" },
  { label: "CAPA", value: "CAPA_REQUIRED" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Closed", value: "CLOSED" },
];

const SEVERITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CRITICAL: AlertTriangle,
  MAJOR: AlertTriangle,
  MINOR: FileText,
  OBSERVATION: FileText,
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "var(--color-stop)",
  MAJOR: "var(--color-signal)",
  MINOR: "var(--color-ink-500)",
  OBSERVATION: "var(--color-ink-500)",
};

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: "Material",
  WORKMANSHIP: "Workmanship",
  DESIGN: "Design",
  DOCUMENT: "Document",
  PROCESS: "Process",
  SAFETY: "Safety",
  OTHER: "Other",
};

export function MobileNcrList({
  items,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: NcrListItem[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NcrFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") result = result.filter((n) => n.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (n) => n.title.toLowerCase().includes(q) || n.ncrNumber.toLowerCase().includes(q) || n.projectName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, query, filter]);

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={ShieldAlert}
        title="No NCRs raised"
        hint="Non-conformance reports will appear here"
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search NCR…"
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

      {filtered.length === 0 ? (
        <MobileNoResults title="No matching NCRs" hint="Try a different search or filter" />
      ) : (
        <div>
          {(query || filter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} NCR{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        <div className="flex flex-col gap-2">
          {filtered.map((n) => (
            <NcrCard key={n.id} ncr={n} />
          ))}
        </div>
        </div>
      )}
    </div>
  );
}

function NcrCard({ ncr: n }: { ncr: NcrListItem }) {
  const SevIcon = SEVERITY_ICONS[n.severity] ?? FileText;
  const sevColor = SEVERITY_COLORS[n.severity] ?? "var(--color-ink-500)";
  return (
    <Link
      href={`/m/quality-control/ncr/${n.id}`}
      className="rounded-[0.5rem] border p-2.5 block text-m-body press"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {n.ncrNumber}
        </p>
        <MobileStatusBadge status={n.status} />
      </div>
      <div className="flex items-start gap-1.5 mb-1">
        <SevIcon className="size-3.5 shrink-0 mt-0.5" style={{ color: sevColor }} />
        <p className="text-m-section font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          {n.title}
        </p>
      </div>
      <p className="text-m-caption truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {CATEGORY_LABELS[n.category] ?? n.category} · {n.severity} · {n.projectName}
        {n.subcontractorName ? ` · ${n.subcontractorName}` : ""}
      </p>
      <div className="flex items-center gap-3">
        {n.location && (
          <div>
            <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Location</p>
            <p className="text-m-label font-bold truncate max-w-[120px]" style={{ color: "var(--color-ink-950)" }}>
              {n.location}
            </p>
          </div>
        )}
        {n.hasCapa && (
          <div className="flex items-center gap-0.5">
            <ShieldCheck className="size-3" style={{ color: "var(--color-go)" }} />
            <span className="text-m-caption font-bold" style={{ color: "var(--color-go)" }}>CAPA {n.capaStatus}</span>
          </div>
        )}
        <div className="ml-auto text-right">
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Raised</p>
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(n.raisedAt)}
          </p>
        </div>
      </div>
    </Link>
  );
}
