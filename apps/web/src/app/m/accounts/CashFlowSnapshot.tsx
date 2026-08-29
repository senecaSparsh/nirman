"use client";

import Link from "next/link";
import { ChevronRight, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   CASH FLOW SNAPSHOT — the Accounts module's analogue to the inventory
   hierarchy tree and the HR workforce breakdown.

   Two panels stacked:
   1. Inflow vs Outflow — a side-by-side bar comparison of money in
      (receipts) vs money out (payments + expenses + project costs),
      with the net position highlighted.
   2. Top Payables — horizontal bars showing the biggest outstanding
      vendor balances, tappable into the suppliers page.

   Both are read-only visualisations using the warm mobile-v2 palette.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PayableNode {
  supplierId: string;
  name: string;
  balanceOwed: number;
}

export function CashFlowSnapshot({
  inflow,
  outflow,
  payables,
}: {
  inflow: number;
  outflow: number;
  payables: PayableNode[];
}) {
  const net = inflow - outflow;
  const maxFlow = Math.max(inflow, outflow, 1);
  const inflowPct = (inflow / maxFlow) * 100;
  const outflowPct = (outflow / maxFlow) * 100;
  const maxPayable = Math.max(...payables.map((p) => p.balanceOwed), 1);
  const sortedPayables = [...payables].sort(
    (a, b) => b.balanceOwed - a.balanceOwed,
  );

  return (
    <section className="mb-4">
      {/* ── Inflow vs Outflow ── */}
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
            Cash Flow
          </h3>
          <Link
            href="/m/reports/cash-flow"
            className="text-m-label font-semibold text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
          >
            Forecast →
          </Link>
        </div>

        {/* Inflow row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="grid place-items-center w-5 h-5 rounded-[0.25rem] shrink-0"
            style={{ backgroundColor: "var(--color-go-wash)" }}
          >
            <ArrowDownLeft
              className="size-3"
              style={{ color: "var(--color-go)" }}
            />
          </span>
          <span
            className="w-12 shrink-0 text-m-label font-medium"
            style={{ color: "var(--color-ink-700)" }}
          >
            Inflow
          </span>
          <div
            className="h-3.5 flex-1 overflow-hidden rounded-[0.25rem]"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <div
              className="h-full rounded-[0.25rem] transition-all duration-500"
              style={{
                width: `${inflowPct}%`,
                backgroundColor: "var(--color-go)",
                opacity: 0.7,
              }}
            />
          </div>
          <span
            className="tabular-nums text-m-label font-bold shrink-0"
            style={{ color: "var(--color-ink-950)" }}
          >
            {formatCurrency(inflow)}
          </span>
        </div>

        {/* Outflow row */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="grid place-items-center w-5 h-5 rounded-[0.25rem] shrink-0"
            style={{ backgroundColor: "var(--color-stop-wash)" }}
          >
            <ArrowUpRight
              className="size-3"
              style={{ color: "var(--color-stop)" }}
            />
          </span>
          <span
            className="w-12 shrink-0 text-m-label font-medium"
            style={{ color: "var(--color-ink-700)" }}
          >
            Outflow
          </span>
          <div
            className="h-3.5 flex-1 overflow-hidden rounded-[0.25rem]"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <div
              className="h-full rounded-[0.25rem] transition-all duration-500"
              style={{
                width: `${outflowPct}%`,
                backgroundColor: "var(--color-stop)",
                opacity: 0.7,
              }}
            />
          </div>
          <span
            className="tabular-nums text-m-label font-bold shrink-0"
            style={{ color: "var(--color-ink-950)" }}
          >
            {formatCurrency(outflow)}
          </span>
        </div>

        {/* Net position */}
        <div
          className="flex items-center justify-between rounded-[0.375rem] px-2 py-1.5"
          style={{
            backgroundColor: net >= 0 ? "var(--color-go-wash)" : "var(--color-stop-wash)",
          }}
        >
          <span
            className="text-m-label font-semibold uppercase tracking-wide"
            style={{
              color: net >= 0 ? "var(--color-go)" : "var(--color-stop)",
            }}
          >
            Net Position
          </span>
          <span
            className="tabular-nums text-m-section font-bold"
            style={{
              color: net >= 0 ? "var(--color-go)" : "var(--color-stop)",
            }}
          >
            {net >= 0 ? "+" : ""}
            {formatCurrency(net)}
          </span>
        </div>
      </div>

      {/* ── Top Payables ── */}
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
            Top Payables
          </h3>
          <Link
            href="/m/suppliers"
            className="text-m-label font-semibold text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
          >
            All →
          </Link>
        </div>

        {sortedPayables.length === 0 ? (
          <p
            className="py-3 text-center text-m-body"
            style={{ color: "var(--color-ink-300)" }}
          >
            No outstanding payables
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedPayables.slice(0, 6).map((p) => {
              const barPct = (p.balanceOwed / maxPayable) * 100;
              return (
                <Link
                  key={p.supplierId}
                  href="/m/suppliers"
                  className="flex items-center gap-2 text-m-body press text-m-body rounded-[0.25rem] py-0.5"
                >
                  <span
                    className="flex-1 truncate text-m-label font-medium"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    {p.name}
                  </span>
                  <div
                    className="h-3.5 w-16 overflow-hidden rounded-[0.25rem]"
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
                    className="tabular-nums text-m-label font-bold shrink-0"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {formatCurrency(p.balanceOwed)}
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
