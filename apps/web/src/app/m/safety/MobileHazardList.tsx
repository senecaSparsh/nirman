"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { MobileEmptyState, MobileStatusBadge } from "@/components/mobile/v2/primitives";
import { MobileSearchHeader, MobileFilterIcon, MobileNoResults } from "@/components/mobile/v2/scaffold";
import type { HazardListItem } from "./MobileSafetyContent";

type Filter = "ALL" | "IDENTIFIED" | "MITIGATING" | "RESOLVED";

const FILTER_CHIPS: { label: string; value: Filter }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "IDENTIFIED" },
  { label: "Mitigating", value: "MITIGATING" },
  { label: "Resolved", value: "RESOLVED" },
];

const RISK_COLORS: Record<string, string> = {
  LOW: "var(--color-go)", MEDIUM: "var(--color-signal)",
  HIGH: "var(--color-stop)", CRITICAL: "var(--color-stop)",
};

const RISK_BG: Record<string, string> = {
  LOW: "rgba(22,163,74,0.1)", MEDIUM: "rgba(224,154,16,0.1)",
  HIGH: "rgba(220,38,38,0.1)", CRITICAL: "rgba(220,38,38,0.15)",
};

export function MobileHazardList({ items }: { items: HazardListItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered = useMemo(() => {
    let r = items;
    if (filter !== "ALL") r = r.filter((h) => h.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((h) => h.title.toLowerCase().includes(q) || h.hazardNumber.toLowerCase().includes(q) || h.projectName.toLowerCase().includes(q));
    }
    return r;
  }, [items, query, filter]);

  if (items.length === 0) {
    return <MobileEmptyState icon={ShieldAlert} title="No hazards identified" hint="Report site hazards with risk assessment here" />;
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search hazards…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_CHIPS}
              active={filter}
              defaultValue="ALL"
              onChange={setFilter}
            />
          </div>
        }
        showClear={!!query || filter !== "ALL"}
        onClear={() => { setQuery(""); setFilter("ALL"); }}
      />
      {filtered.length === 0 ? (
        <MobileNoResults title="No matching hazards" hint="Try a different filter" />
      ) : (
        <div>
          {(query || filter !== "ALL") && (
            <div className="flex items-center justify-end mb-1.5">
              <span
                className="text-m-label font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {filtered.length} hazard{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        <div className="flex flex-col gap-2">
          {filtered.map((h) => (
            <Link key={h.id} href={`/m/safety/hazards/${h.id}`} className="rounded-[0.5rem] border p-2.5 block text-m-body press" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{h.hazardNumber}</p>
                <MobileStatusBadge status={h.status} />
              </div>
              <p className="text-m-section font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>{h.title}</p>
              <p className="text-m-caption truncate mb-1.5" style={{ color: "var(--color-ink-500)" }}>{h.projectName}{h.location ? ` · ${h.location}` : ""}</p>
              <div className="flex items-center gap-2">
                <div className="rounded-[0.25rem] px-2 py-0.5" style={{ backgroundColor: RISK_BG[h.riskLevel] ?? "var(--color-concrete)" }}>
                  <span className="text-m-caption font-bold uppercase" style={{ color: RISK_COLORS[h.riskLevel] ?? "var(--color-ink-500)" }}>{h.riskLevel}</span>
                </div>
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>L:{h.likelihood}×S:{h.severity}={h.likelihood * h.severity}</span>
                {h.targetResolutionDate && (
                  <div className="ml-auto text-right">
                    <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Target</p>
                    <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatDate(h.targetResolutionDate)}</p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
        </div>
      )}
    </div>
  );
}
