"use client";

import { Button } from "@/components/ui/button";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Phone,
  Clock,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Download,
  BarChart3,
} from "lucide-react";

interface Summary {
  total: number;
  missed: number;
  answered: number;
  voicemail: number;
  totalDuration: number;
  avgDuration: number;
  missedRate: number;
  totalCost: number;
}

interface StaffStat {
  name: string;
  count: number;
  duration: number;
  missed: number;
}

interface CallAnalyticsViewProps {
  summary: Summary;
  staffStats: StaffStat[];
  dispositions: [string, number][];
  directions: [string, number][];
  dailyVolume: { date: string; total: number; missed: number; answered: number }[];
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function CallAnalyticsView({
  summary,
  staffStats,
  dispositions,
  directions,
  dailyVolume,
}: CallAnalyticsViewProps) {
  const maxDaily = Math.max(...dailyVolume.map((d) => d.total), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title text-foreground">Call Analytics</h1>
          <p className="mt-0.5 text-meta text-muted-foreground">Last 30 days</p>
        </div>
        <a href="/api/reports/calls/export" download>
          <Button size="sm" variant="outline">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total Calls"
          value={summary.total.toString()}
          icon={Phone}
          color="text-brand"
        />
        <StatCard
          label="Missed"
          value={`${summary.missed} (${summary.missedRate.toFixed(1)}%)`}
          icon={PhoneMissed}
          color="text-danger"
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(summary.avgDuration)}
          icon={Clock}
          color="text-foreground"
        />
        <StatCard
          label="Total Cost"
          value={`₹${summary.totalCost.toFixed(2)}`}
          icon={DollarSign}
          color="text-foreground"
        />
      </div>

      {/* Daily volume chart */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-body font-medium text-foreground">Daily Call Volume (30 days)</h3>
        <div className="flex items-end gap-1 h-32">
          {dailyVolume.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="w-full flex flex-col justify-end h-full gap-px">
                {d.answered > 0 && (
                  <div
                    className="w-full bg-success/60 rounded-t-sm group-hover:bg-success"
                    style={{ height: `${(d.answered / maxDaily) * 100}%` }}
                    title={`Answered: ${d.answered}`}
                  />
                )}
                {d.missed > 0 && (
                  <div
                    className="w-full bg-danger/60 rounded-t-sm group-hover:bg-danger"
                    style={{ height: `${(d.missed / maxDaily) * 100}%` }}
                    title={`Missed: ${d.missed}`}
                  />
                )}
              </div>
              {/* Tooltip on hover */}
              <div className="absolute -top-8 hidden group-hover:block rounded bg-foreground px-2 py-1 text-micro text-background whitespace-nowrap z-10">
                {formatDate(d.date)}: {d.total} calls
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 text-micro text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-success" /> Answered
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-danger" /> Missed
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Staff performance */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-body font-medium text-foreground">Calls per Staff Member</h3>
          {staffStats.length === 0 ? (
            <p className="text-caption text-muted-foreground">No staff calls in this period.</p>
          ) : (
            <div className="space-y-2">
              {staffStats.map((s) => {
                const missedRate = s.count > 0 ? (s.missed / s.count) * 100 : 0;
                return (
                  <div key={s.name} className="flex items-center justify-between text-caption">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{s.name}</p>
                      <p className="text-micro text-muted-foreground">
                        {s.count} calls · {formatDuration(s.duration)} talk time
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`font-medium ${missedRate > 30 ? "text-danger" : "text-muted-foreground"}`}>
                        {missedRate.toFixed(0)}% missed
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Direction distribution */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-body font-medium text-foreground">Direction Breakdown</h3>
          {directions.length === 0 ? (
            <p className="text-caption text-muted-foreground">No calls in this period.</p>
          ) : (
            <div className="space-y-2">
              {directions.map(([dir, count]) => {
                const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
                return (
                  <div key={dir} className="space-y-1">
                    <div className="flex items-center justify-between text-caption">
                      <span className="flex items-center gap-1.5 text-foreground">
                        {dir === "INBOUND" && <PhoneIncoming className="h-3 w-3 text-success" />}
                        {dir === "OUTBOUND" && <PhoneOutgoing className="h-3 w-3 text-brand" />}
                        {dir === "INTERNAL" && <Phone className="h-3 w-3 text-muted-foreground" />}
                        {dir}
                      </span>
                      <span className="text-muted-foreground">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-accent overflow-hidden">
                      <div
                        className={`h-full ${dir === "INBOUND" ? "bg-success" : dir === "OUTBOUND" ? "bg-brand" : "bg-muted-foreground"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Disposition distribution */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-body font-medium text-foreground">Call Dispositions</h3>
        {dispositions.length === 0 ? (
          <p className="text-caption text-muted-foreground">No dispositions set in this period.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dispositions.map(([disp, count]) => (
              <span
                key={disp}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-accent/30 px-2.5 py-1 text-caption"
              >
                <span className="font-medium text-foreground">{disp}</span>
                <span className="text-muted-foreground">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-micro text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        {label}
      </div>
      <p className="mt-1 text-body font-semibold text-foreground">{value}</p>
    </div>
  );
}
