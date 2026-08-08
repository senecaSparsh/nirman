"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ClipboardList, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatNumber, formatDate } from "@/lib/utils";

type HrDprItem = {
  id: string;
  workSummary: string;
  progressPct: number;
  date: string;
  project: { name: string };
  submittedBy: { name: string } | null;
};

/**
 * Client component for the HR dashboard's recent DPR list.
 * Handles client-side search by project name or work summary.
 */
export function HrDprList({ dprs }: { dprs: HrDprItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dprs;
    return dprs.filter((d) =>
      d.project.name.toLowerCase().includes(q) ||
      d.workSummary.toLowerCase().includes(q) ||
      (d.submittedBy?.name ?? "").toLowerCase().includes(q),
    );
  }, [dprs, query]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-label text-muted-foreground">Recent DPRs</h2>
        <div className="relative ml-auto sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search DPRs…" className="h-8 pl-8 text-caption" />
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-body text-muted-foreground">
          {dprs.length === 0 ? (
            <>No DPRs submitted this week. <Link href="/hr/dprs" className="text-primary hover:underline">Create one →</Link></>
          ) : (
            "No DPRs match the search."
          )}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((dpr) => (
            <Link
              key={dpr.id}
              href={`/hr/dprs?id=${dpr.id}`}
              className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-md"
            >
              <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-medium">{dpr.project.name}</div>
                <div className="truncate text-caption text-muted-foreground">
                  {dpr.workSummary.slice(0, 80)}{dpr.workSummary.length > 80 ? "…" : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tnum text-caption font-medium text-foreground">{formatNumber(dpr.progressPct, 1)}%</div>
                <div className="text-micro text-muted-foreground">{formatDate(dpr.date)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
