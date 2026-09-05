"use client";

import * as React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardToolbar } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Books Health View — the "trust surface".
 *
 * Renders the five reconciliation checks as a vertical stack of cards.
 * Each card shows the check name, status badge, expected vs actual, and
 * an expandable details section for per-entity breakdowns when the check
 * has divergences.
 *
 * The whole report can be re-fetched client-side via the "Re-run checks"
 * button (hits /api/health/books).
 */

type CheckStatus = "PASS" | "FAIL" | "WARN";

interface DetailRow {
  id: string;
  label: string;
  expected: number;
  actual: number;
  delta: number;
}

interface CheckRow {
  id: string;
  name: string;
  description: string;
  status: CheckStatus;
  expected: number;
  actual: number;
  delta: number;
  tolerance: number;
  message?: string;
  details: DetailRow[];
}

interface BooksHealthViewProps {
  timestamp: string;
  allPass: boolean;
  summary: { total: number; passed: number; failed: number; warned: number };
  checks: CheckRow[];
}

const STATUS_META: Record<
  CheckStatus,
  { label: string; variant: "success" | "danger" | "warning"; icon: React.ElementType }
> = {
  PASS: { label: "Pass", variant: "success", icon: CheckCircle2 },
  FAIL: { label: "Fail", variant: "danger", icon: XCircle },
  WARN: { label: "Drift", variant: "warning", icon: AlertTriangle },
};

function fmt(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

export function BooksHealthView({
  timestamp,
  allPass,
  summary,
  checks,
}: BooksHealthViewProps) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [liveChecks, setLiveChecks] = React.useState(checks);
  const [liveSummary, setLiveSummary] = React.useState(summary);
  const [liveAllPass, setLiveAllPass] = React.useState(allPass);
  const [liveTimestamp, setLiveTimestamp] = React.useState(timestamp);

  const rerun = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/health/books", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLiveChecks(data.checks);
        setLiveSummary(data.summary);
        setLiveAllPass(data.allPass);
        setLiveTimestamp(data.timestamp);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const overallTone = liveAllPass
    ? "success"
    : liveSummary.failed > 0
      ? "danger"
      : "warning";

  return (
    <div className="space-y-4">
      {/* ── Overall status banner ── */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-full",
                overallTone === "success" && "bg-success-soft text-success",
                overallTone === "danger" && "bg-danger-soft text-danger",
                overallTone === "warning" && "bg-warning-soft text-warning",
              )}
            >
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="text-section font-semibold text-foreground">
                {liveAllPass
                  ? "All books tie out"
                  : liveSummary.failed > 0
                    ? `${liveSummary.failed} check${liveSummary.failed > 1 ? "s" : ""} failing`
                    : `${liveSummary.warned} check${liveSummary.warned > 1 ? "s" : ""} drifting`}
              </div>
              <div className="text-meta text-muted-foreground">
                {liveSummary.passed} passed · {liveSummary.warned} drifting · {liveSummary.failed} failing
                {" · "}
                {new Date(liveTimestamp).toLocaleString("en-IN")}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={rerun} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Re-run checks
          </Button>
        </CardContent>
      </Card>

      {/* ── Check cards ── */}
      {liveChecks.map((check) => (
        <CheckCard key={check.id} check={check} />
      ))}

      {/* ── Footnote ── */}
      <p className="px-1 text-caption leading-relaxed text-muted-foreground">
        All checks are read-only — running them never mutates data. They compare
        the immutable operational ledgers (StockMovement, LandCostComponent,
        MaterialIssue) against the cached derived values (StockLocationItem,
        LandPurchase.totalCost, Project.totalProjectCost) and the GL. Divergence
        means a cache is stale or a posting was missed — not that data is lost.
      </p>
    </div>
  );
}

function CheckCard({ check }: { check: CheckRow }) {
  const [expanded, setExpanded] = React.useState(false);
  const meta = STATUS_META[check.status];
  const Icon = meta.icon;
  const hasDetails = check.details.length > 0;

  return (
    <Card>
      <CardHeader divided>
        <CardToolbar>
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon
              className={cn(
                "size-5 shrink-0",
                check.status === "PASS" && "text-success",
                check.status === "FAIL" && "text-danger",
                check.status === "WARN" && "text-warning",
              )}
            />
            <div className="min-w-0">
              <CardTitle className="truncate">{check.name}</CardTitle>
            </div>
          </div>
          <Badge variant={meta.variant} dot>
            {meta.label}
          </Badge>
        </CardToolbar>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-meta leading-relaxed text-muted-foreground">
          {check.description}
        </p>

        {/* Expected vs Actual vs Delta */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Expected" value={fmt(check.expected)} />
          <Stat label="Actual" value={fmt(check.actual)} />
          <Stat
            label="Delta"
            value={fmt(check.delta)}
            tone={
              check.status === "PASS"
                ? "default"
                : check.status === "FAIL"
                  ? "danger"
                  : "warning"
            }
          />
        </div>

        {/* Message when not PASS */}
        {check.message && check.status !== "PASS" && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-caption leading-relaxed",
              check.status === "FAIL"
                ? "border-danger-border bg-danger-soft/50 text-danger"
                : "border-warning-border bg-warning-soft/50 text-warning",
            )}
          >
            {check.message}
          </div>
        )}

        {/* Expandable details */}
        {hasDetails && (
          <div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              />
              {check.details.length} divergent item{check.details.length > 1 ? "s" : ""}
            </button>
            {expanded && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="border-b border-border text-left text-label text-muted-foreground">
                      <th className="pb-1.5 pr-3 font-medium">Item</th>
                      <th className="pb-1.5 pr-3 text-right font-medium">Expected</th>
                      <th className="pb-1.5 pr-3 text-right font-medium">Actual</th>
                      <th className="pb-1.5 text-right font-medium">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {check.details.map((d) => (
                      <tr key={d.id} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-3 text-foreground">{d.label}</td>
                        <td className="py-1.5 pr-3 text-right tnum text-muted-foreground">
                          {fmt(d.expected)}
                        </td>
                        <td className="py-1.5 pr-3 text-right tnum text-foreground">
                          {fmt(d.actual)}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 text-right tnum font-medium",
                            d.delta < 0 ? "text-danger" : "text-warning",
                          )}
                        >
                          {d.delta > 0 ? "+" : ""}
                          {fmt(d.delta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  return (
    <div className="rounded-md border border-border bg-subtle/50 px-3 py-2">
      <div className="text-label text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[13px] font-semibold tnum",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
