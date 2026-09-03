"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Coins, Plus, Wallet } from "lucide-react";
import { formatCurrencyCompact, formatDate } from "@/lib/utils";
import {
  MobileSearchHeader,
  MobileCardGrid,
  MobileNoResults,
  MobileSummaryStrip,
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

export type PettyCashFloatListItem = {
  id: string;
  name: string;
  projectName: string | null;
  custodianName: string | null;
  floatAmount: number;
  topUpTotal: number;
  spentTotal: number;
  topUpCount: number;
  lastTopUpDate: string | null;
};

export function MobilePettyCashList({
  items,
  totalBalance,
  totalTopUps,
  canManage,
}: {
  items: PettyCashFloatListItem[];
  totalBalance: number;
  totalTopUps: number;
  canManage?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.projectName?.toLowerCase().includes(q) ?? false) ||
        (f.custodianName?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const stats: SummaryStat[] = [
    { label: "Balance", value: formatCurrencyCompact(totalBalance) },
    { label: "Top-ups", value: formatCurrencyCompact(totalTopUps) },
    { label: "Floats", value: String(items.length) },
  ];

  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Coins}
        title="No petty cash floats"
        description="Site cash floats will appear here once created."
        action={
          canManage ? (
            <Link href="/petty-cash" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-body font-medium text-brand-foreground">
              <Plus className="size-4" /> Create Float
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div>
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search floats…"
      />
      <MobileSummaryStrip stats={stats} />
      <MobileCardGrid>
        {filtered.map((f) => {
          const totalIn = f.floatAmount + f.topUpTotal;
          const utilization = totalIn > 0 ? (f.spentTotal / totalIn) * 100 : 0;
          return (
            <Link
              key={f.id}
              href={`/petty-cash?open=${f.id}`}
              className="block rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors active:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-foreground">{f.name}</p>
                  {f.projectName && (
                    <p className="mt-0.5 truncate text-caption text-muted-foreground">{f.projectName}</p>
                  )}
                  {f.custodianName && (
                    <p className="mt-0.5 truncate text-caption text-muted-foreground">
                      <Wallet className="mr-1 inline size-3" />
                      {f.custodianName}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="tnum text-body font-semibold text-foreground">{formatCurrencyCompact(f.floatAmount)}</p>
                  <p className="tnum text-caption text-muted-foreground">balance</p>
                </div>
              </div>
              {/* Utilization bar */}
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${utilization > 80 ? "bg-danger" : utilization > 50 ? "bg-warning" : "bg-brand"}`}
                  style={{ width: `${Math.min(utilization, 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-caption text-muted-foreground">
                  {utilization.toFixed(0)}% utilized
                </span>
                {f.lastTopUpDate && (
                  <span className="text-caption text-muted-foreground">
                    Last top-up: {formatDate(f.lastTopUpDate)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </MobileCardGrid>
      {filtered.length === 0 && <MobileNoResults query={query} />}
    </div>
  );
}
