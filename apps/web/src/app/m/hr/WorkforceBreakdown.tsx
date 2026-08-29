"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   WORKFORCE BREAKDOWN — the HR module's analogue to the inventory tree.

   Two panels stacked:
   1. Headcount by Trade — horizontal bars (warm palette, tabular nums)
   2. Site Presence Today — where workers are, with attendance-rate bars

   Both are read-only visualisations; tapping a trade or project row
   navigates to the employees list or the attendance page respectively.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TradeNode {
  trade: string;
  count: number;
}

export interface SitePresenceNode {
  projectName: string;
  present: number;
  total: number;
}

export function WorkforceBreakdown({
  trades,
  sitePresence,
  totalHeadcount,
}: {
  trades: TradeNode[];
  sitePresence: SitePresenceNode[];
  totalHeadcount: number;
}) {
  const sortedTrades = [...trades].sort((a, b) => b.count - a.count).slice(0, 8);
  const maxTradeCount = Math.max(...sortedTrades.map((t) => t.count), 1);

  return (
    <section className="mb-4">
      {/* ── Headcount by Trade ── */}
      <div
        className="rounded-[0.625rem] border px-3 py-2.5 mb-2"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-baseline justify-between mb-2">
          <h3
            className="text-m-body font-bold uppercase tracking-wide"
            style={{ color: "var(--color-ink-500)" }}
          >
            Headcount by Trade
          </h3>
          <Link
            href="/m/hr/employees"
            className="text-m-label font-semibold text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
          >
            All →
          </Link>
        </div>

        {sortedTrades.length === 0 ? (
          <p
            className="py-3 text-center text-m-body"
            style={{ color: "var(--color-ink-300)" }}
          >
            No trade data yet
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedTrades.map((t) => {
              const barPct = (t.count / maxTradeCount) * 100;
              const sharePct =
                totalHeadcount > 0 ? (t.count / totalHeadcount) * 100 : 0;
              return (
                <Link
                  key={t.trade}
                  href="/m/hr/employees"
                  className="flex items-center gap-2 text-m-body press text-m-body rounded-[0.25rem] py-0.5"
                >
                  <span
                    className="w-20 shrink-0 truncate text-m-label font-medium"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    {t.trade}
                  </span>
                  <div
                    className="h-3.5 flex-1 overflow-hidden rounded-[0.25rem]"
                    style={{ backgroundColor: "var(--color-concrete)" }}
                  >
                    <div
                      className="h-full rounded-[0.25rem] transition-all duration-500"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: "var(--color-signal)",
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span
                    className="tabular-nums w-6 text-right text-m-label font-bold"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {t.count}
                  </span>
                  <span
                    className="tabular-nums w-9 text-right text-m-caption"
                    style={{ color: "var(--color-ink-300)" }}
                  >
                    {sharePct.toFixed(0)}%
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Site Presence Today ── */}
      <div
        className="rounded-[0.625rem] border px-3 py-2.5"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-baseline justify-between mb-2">
          <h3
            className="text-m-body font-bold uppercase tracking-wide"
            style={{ color: "var(--color-ink-500)" }}
          >
            Site Presence Today
          </h3>
          <Link
            href="/m/attendance"
            className="text-m-label font-semibold text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
          >
            Log →
          </Link>
        </div>

        {sitePresence.length === 0 ? (
          <p
            className="py-3 text-center text-m-body"
            style={{ color: "var(--color-ink-300)" }}
          >
            No site attendance logged today
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sitePresence.map((s) => {
              const rate = s.total > 0 ? (s.present / s.total) * 100 : 0;
              const barColor =
                rate >= 75
                  ? "var(--color-go)"
                  : rate >= 50
                    ? "var(--color-signal)"
                    : "var(--color-stop)";
              return (
                <Link
                  key={s.projectName}
                  href="/m/attendance"
                  className="flex items-center gap-2 text-m-body press text-m-body rounded-[0.25rem] py-0.5"
                >
                  <span
                    className="flex-1 truncate text-m-label font-medium"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    {s.projectName}
                  </span>
                  <div
                    className="h-1.5 w-16 overflow-hidden rounded-full"
                    style={{ backgroundColor: "var(--color-concrete)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${rate}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span
                    className="tabular-nums text-m-label font-bold"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {s.present}
                  </span>
                  <span
                    className="tabular-nums text-m-caption"
                    style={{ color: "var(--color-ink-300)" }}
                  >
                    /{s.total}
                  </span>
                  <ChevronRight
                    className="size-3 shrink-0"
                    style={{ color: "var(--color-ink-300)" }}
                  />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
