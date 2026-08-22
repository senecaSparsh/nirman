"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileEmptyState, MobileStatusBadge } from "@/components/mobile/v2/primitives";
import type { IncidentListItem } from "./MobileSafetyContent";

type Filter = "ALL" | "REPORTED" | "UNDER_INVESTIGATION" | "INVESTIGATED" | "CLOSED";

const FILTER_CHIPS: { label: string; value: Filter }[] = [
  { label: "All", value: "ALL" },
  { label: "Reported", value: "REPORTED" },
  { label: "Investigating", value: "UNDER_INVESTIGATION" },
  { label: "Investigated", value: "INVESTIGATED" },
  { label: "Closed", value: "CLOSED" },
];

const TYPE_LABELS: Record<string, string> = {
  ACCIDENT: "Accident", NEAR_MISS: "Near Miss", INJURY: "Injury", FATALITY: "Fatality",
  PROPERTY_DAMAGE: "Property Damage", ENVIRONMENTAL: "Environmental", FIRE: "Fire",
  STRUCTURAL: "Structural", OTHER: "Other",
};

const SEVERITY_COLORS: Record<string, string> = {
  FIRST_AID: "var(--color-ink-500)", LOST_TIME: "var(--color-signal)",
  SERIOUS: "var(--color-stop)", FATAL: "var(--color-stop)", PROPERTY_ONLY: "var(--color-ink-500)",
};

export function MobileIncidentList({ items }: { items: IncidentListItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "ALL") r = r.filter((i) => i.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((i) => i.title.toLowerCase().includes(q) || i.incidentNumber.toLowerCase().includes(q) || i.projectName.toLowerCase().includes(q));
    }
    return r;
  }, [items, query, filter]);

  if (items.length === 0) {
    return <MobileEmptyState icon={AlertTriangle} title="No incidents reported" hint="Report accidents, near-misses, and injuries here" />;
  }

  return (
    <div>
      <div className="mb-3 relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--color-ink-500)" }} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search incidents…" className="w-full h-9 rounded-[0.5rem] border pl-8 pr-8 text-[0.75rem] outline-none" style={{ borderColor: query ? "var(--color-ink-950)" : "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
        {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 press"><X className="size-3.5" style={{ color: "var(--color-ink-500)" }} /></button>}
      </div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {FILTER_CHIPS.map((c) => (
          <button key={c.value} onClick={() => setFilter(c.value)} className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold whitespace-nowrap" style={{ backgroundColor: filter === c.value ? "var(--color-ink-950)" : "var(--color-concrete)", color: filter === c.value ? "#fff" : "var(--color-ink-500)" }}>{c.label}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <MobileEmptyState icon={AlertTriangle} title="No matching incidents" hint="Try a different filter" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((i) => (
            <Link key={i.id} href={`/m/safety/incidents/${i.id}`} className="rounded-[0.5rem] border p-2.5 block press" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{i.incidentNumber}</p>
                <MobileStatusBadge status={i.status} />
              </div>
              <p className="text-[0.75rem] font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>{i.title}</p>
              <p className="text-[0.5rem] truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>{TYPE_LABELS[i.type] ?? i.type} · {i.projectName}{i.location ? ` · ${i.location}` : ""}</p>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Severity</p>
                  <p className="text-[0.625rem] font-bold" style={{ color: SEVERITY_COLORS[i.severity] ?? "var(--color-ink-500)" }}>{i.severity.replace("_", " ")}</p>
                </div>
                {(i.injuredCount > 0 || i.fatalities > 0) && (
                  <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                )}
                {i.injuredCount > 0 && (
                  <div>
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Injured</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>{i.injuredCount}</p>
                  </div>
                )}
                {i.fatalities > 0 && (
                  <div>
                    <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Fatal</p>
                    <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>{i.fatalities}</p>
                  </div>
                )}
                <div className="ml-auto text-right">
                  <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Date</p>
                  <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatDate(i.incidentDate)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
