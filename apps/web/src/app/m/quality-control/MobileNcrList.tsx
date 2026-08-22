"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ClipboardCheck, Search, X, AlertTriangle, ShieldCheck, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileEmptyState, MobileStatusBadge } from "@/components/mobile/v2/primitives";

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

export function MobileNcrList({ items }: { items: NcrListItem[] }) {
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

  if (items.length === 0) return null;

  return (
    <div>
      {/* Search */}
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NCR…"
            className="w-full h-9 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] outline-none"
            style={{
              borderColor: query ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 press">
              <X className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {FILTER_CHIPS.map((chip) => {
          const active = filter === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => setFilter(chip.value)}
              className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold whitespace-nowrap transition-colors"
              style={{
                backgroundColor: active ? "var(--color-ink-950)" : "var(--color-concrete)",
                color: active ? "#fff" : "var(--color-ink-500)",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <MobileEmptyState icon={ClipboardCheck} title="No matching NCRs" hint="Try a different search or filter" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((n) => (
            <NcrCard key={n.id} ncr={n} />
          ))}
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
      className="rounded-[0.5rem] border p-2.5 block press"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {n.ncrNumber}
        </p>
        <MobileStatusBadge status={n.status} />
      </div>
      <div className="flex items-start gap-1.5 mb-1">
        <SevIcon className="size-3.5 shrink-0 mt-0.5" style={{ color: sevColor }} />
        <p className="text-[0.75rem] font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          {n.title}
        </p>
      </div>
      <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>
        {CATEGORY_LABELS[n.category] ?? n.category} · {n.severity} · {n.projectName}
        {n.subcontractorName ? ` · ${n.subcontractorName}` : ""}
      </p>
      <div className="flex items-center gap-3">
        {n.location && (
          <div>
            <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Location</p>
            <p className="text-[0.625rem] font-bold truncate max-w-[120px]" style={{ color: "var(--color-ink-950)" }}>
              {n.location}
            </p>
          </div>
        )}
        {n.hasCapa && (
          <div className="flex items-center gap-0.5">
            <ShieldCheck className="size-3" style={{ color: "var(--color-go)" }} />
            <span className="text-[0.5rem] font-bold" style={{ color: "var(--color-go)" }}>CAPA {n.capaStatus}</span>
          </div>
        )}
        <div className="ml-auto text-right">
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Raised</p>
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatDate(n.raisedAt)}
          </p>
        </div>
      </div>
    </Link>
  );
}
