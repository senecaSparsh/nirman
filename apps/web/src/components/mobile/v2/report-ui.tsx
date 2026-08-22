import type { LucideIcon } from "lucide-react";

/**
 * MobileReportHeader — consistent header for mobile report pages.
 * Shows the report title, an optional subtitle/period, and optional
 * summary stats inline. Designed to be compact and scannable.
 */
export function MobileReportHeader({
  title,
  subtitle,
  icon: Icon,
  period,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  period?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span
            className="grid place-items-center size-9 rounded-[0.625rem] shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Icon className="size-4" style={{ color: "var(--color-ink-600)" }} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h1
            className="text-[1rem] font-bold leading-tight"
            style={{ color: "var(--color-ink-950)" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="text-[0.625rem] mt-0.5 leading-snug"
              style={{ color: "var(--color-ink-500)" }}
            >
              {subtitle}
            </p>
          )}
          {period && (
            <span
              className="inline-block mt-1.5 rounded-[0.375rem] px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: "var(--color-signal-wash)",
                color: "var(--color-signal-dark)",
              }}
            >
              {period}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * MobileReportSummary — a compact summary line shown below the header.
 * Displays key-value pairs in a single row, wrapping as needed.
 */
export function MobileReportSummary({
  items,
}: {
  items: { label: string; value: string; tone?: "default" | "go" | "stop" | "signal" }[];
}) {
  const toneColor = {
    default: "var(--color-ink-950)",
    go: "var(--color-go)",
    stop: "var(--color-stop)",
    signal: "var(--color-signal-dark)",
  };

  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-[0.625rem] border p-3 mb-4"
      style={{
        backgroundColor: "var(--color-paper-2)",
        borderColor: "var(--color-line)",
      }}
    >
      {items.map((item, i) => (
        <div key={i} className="flex flex-col">
          <span
            className="text-[0.5rem] uppercase tracking-wide font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            {item.label}
          </span>
          <span
            className="text-[0.875rem] font-bold tabular-nums leading-tight"
            style={{ color: toneColor[item.tone ?? "default"] }}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * MobileBarChart — a simple horizontal bar chart for mobile.
 * Each bar shows a label, value, and a proportional bar.
 * No external dependencies — pure CSS bars.
 */
export function MobileBarChart({
  data,
  formatValue,
  maxItems = 12,
}: {
  data: { label: string; value: number; tone?: "default" | "go" | "stop" | "signal" }[];
  formatValue?: (v: number) => string;
  maxItems?: number;
}) {
  const sorted = [...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, maxItems);
  const maxAbs = Math.max(...sorted.map((d) => Math.abs(d.value)), 1);

  const toneColor = {
    default: "var(--color-ink-600)",
    go: "var(--color-go)",
    stop: "var(--color-stop)",
    signal: "var(--color-signal)",
  };
  const toneBg = {
    default: "var(--color-concrete)",
    go: "var(--color-go-wash)",
    stop: "var(--color-stop-wash)",
    signal: "var(--color-signal-wash)",
  };

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((d, i) => {
        const pct = (Math.abs(d.value) / maxAbs) * 100;
        const fmt = formatValue ?? ((v: number) => String(v));
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-[0.6875rem] font-medium truncate"
                style={{ color: "var(--color-ink-900)" }}
              >
                {d.label}
              </span>
              <span
                className="text-[0.6875rem] font-bold tabular-nums shrink-0"
                style={{ color: toneColor[d.tone ?? "default"] }}
              >
                {fmt(d.value)}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: toneColor[d.tone ?? "default"],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
