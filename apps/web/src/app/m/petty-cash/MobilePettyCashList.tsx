"use client";

import { useState, useMemo } from "react";
import { Coins, Wallet, Share2, Tag, Building2, User, IndianRupee, Hash, Calendar } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
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
        hint={canManage ? "Tap + to create your first float" : "Site cash floats will appear here once created."}
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
        {filtered.map((f) => (
          <PettyCashCard key={f.id} f={f} />
        ))}
      </MobileCardGrid>
      {filtered.length === 0 && <MobileNoResults query={query} />}
    </div>
  );
}

/* ─── Petty cash card — long-press opens overview sheet ─── */
function PettyCashCard({ f }: { f: PettyCashFloatListItem }) {
  const totalIn = f.floatAmount + f.topUpTotal;
  const utilization = totalIn > 0 ? (f.spentTotal / totalIn) * 100 : 0;

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const balanceAfter = f.floatAmount + f.topUpTotal - f.spentTotal;

  const overviewRows: OverviewRow[] = [
    { icon: Tag, label: "Float Name", value: f.name },
    { icon: Calendar, label: "Last Top-up", value: f.lastTopUpDate ? formatDate(f.lastTopUpDate) : "—" },
    { icon: IndianRupee, label: "Float Amount", value: formatCurrency(f.floatAmount) },
    { icon: IndianRupee, label: "Top-ups Total", value: formatCurrency(f.topUpTotal) },
    { icon: IndianRupee, label: "Spent Total", value: formatCurrency(f.spentTotal), valueColor: "var(--color-stop)" },
    { icon: IndianRupee, label: "Balance After", value: formatCurrency(balanceAfter), valueColor: "var(--color-go)" },
    { icon: Hash, label: "Top-up Count", value: String(f.topUpCount) },
    { icon: Building2, label: "Project", value: f.projectName ?? "—" },
    { icon: User, label: "Custodian", value: f.custodianName ?? "—" },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/petty-cash`;
        if (navigator.share) {
          navigator.share({ title: f.name, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  return (
    <>
      <div {...longPressBind}>
        <button
          type="button"
          onClick={() => { setPressPoint(null); setOverviewOpen(true); }}
          className="block w-full text-left rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors active:bg-muted/40"
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
              <p className="tnum text-body font-semibold text-foreground">{formatCurrencyCompact(balanceAfter)}</p>
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
        </button>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={f.name}
        subtitle={formatCurrency(f.floatAmount)}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}
