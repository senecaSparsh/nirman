"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

/**
 * Shared chart primitives for the Analytics/Reports module.
 *
 * All charts are client-only ("use client") and receive already-serialized
 * numbers (Decimals converted via `toNum()` in the server component). This
 * keeps recharts out of the PPR static shell.
 *
 * Colors map to the theme stage tokens so charts feel native to the app.
 */

const STAGE_COLORS = [
  "var(--color-stage-procure)",
  "var(--color-stage-build)",
  "var(--color-stage-workforce)",
  "var(--color-stage-sell)",
  "var(--color-stage-account)",
  "var(--color-stage-manage)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
];

const AXIS_STYLE = {
  fontSize: 11,
  fill: "var(--color-muted-foreground)",
};

const GRID_STYLE = {
  stroke: "var(--color-border)",
  strokeDasharray: "3 3",
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--color-foreground)",
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
};

export type BarDatum = { label: string; value?: number; [k: string]: unknown };

export function BarSeries({
  data,
  dataKey = "value",
  name,
  color = "var(--color-stage-account)",
  height = 280,
  currency = true,
  horizontal = false,
}: {
  data: BarDatum[];
  dataKey?: string;
  name?: string;
  color?: string;
  height?: number;
  currency?: boolean;
  horizontal?: boolean;
}) {
  const fmt = currency ? (v: number) => formatCurrency(v) : (v: number) => formatNumber(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray={GRID_STYLE.strokeDasharray} stroke={GRID_STYLE.stroke} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS_STYLE} tickFormatter={fmt} />
            <YAxis type="category" dataKey="label" tick={AXIS_STYLE} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={AXIS_STYLE} />
            <YAxis tick={AXIS_STYLE} tickFormatter={fmt} width={currency ? 80 : 50} />
          </>
        )}
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmt(v), name ?? ""]} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export type LineDatum = { label: string; value?: number; [k: string]: unknown };

export function LineSeries({
  data,
  dataKey = "value",
  name,
  color = "var(--color-stage-account)",
  height = 280,
  currency = true,
}: {
  data: LineDatum[];
  dataKey?: string;
  name?: string;
  color?: string;
  height?: number;
  currency?: boolean;
}) {
  const fmt = currency ? (v: number) => formatCurrency(v) : (v: number) => formatNumber(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray={GRID_STYLE.strokeDasharray} stroke={GRID_STYLE.stroke} />
        <XAxis dataKey="label" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={fmt} width={currency ? 80 : 50} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmt(v), name ?? ""]} />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export type AreaDatum = { label: string; value?: number; [k: string]: unknown };

export function AreaSeries({
  data,
  dataKey = "value",
  name,
  color = "var(--color-stage-account)",
  height = 280,
  currency = true,
}: {
  data: AreaDatum[];
  dataKey?: string;
  name?: string;
  color?: string;
  height?: number;
  currency?: boolean;
}) {
  const fmt = currency ? (v: number) => formatCurrency(v) : (v: number) => formatNumber(v);
  const gid = `area-grad-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray={GRID_STYLE.strokeDasharray} stroke={GRID_STYLE.stroke} />
        <XAxis dataKey="label" tick={AXIS_STYLE} />
        <YAxis tick={AXIS_STYLE} tickFormatter={fmt} width={currency ? 80 : 50} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmt(v), name ?? ""]} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#${gid})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type PieDatum = { label: string; value: number };

export function PieSeries({
  data,
  height = 280,
  currency = true,
  showLegend = true,
}: {
  data: PieDatum[];
  height?: number;
  currency?: boolean;
  showLegend?: boolean;
}) {
  const fmt = currency ? (v: number) => formatCurrency(v) : (v: number) => formatNumber(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={showLegend ? 80 : 100}
          innerRadius={showLegend ? 40 : 50}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [fmt(v), ""]} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
      </PieChart>
    </ResponsiveContainer>
  );
}

export { STAGE_COLORS };
