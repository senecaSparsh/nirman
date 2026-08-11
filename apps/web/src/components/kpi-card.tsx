import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const accentMap = {
  primary: "text-foreground",
  brand: "text-brand-strong",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
} as const;

/**
 * KPI card — a standalone metric tile.
 *
 * Prefer `<MetricGrid>` + `<Metric>` from `@/components/page` for a row
 * of related numbers: a divided band reads as one instrument panel,
 * where separate cards read as six things shouting at once. This
 * component exists for the cases where a metric genuinely stands alone.
 *
 * The number is the loudest thing in the tile. The icon is a quiet tint
 * in the corner, not a coloured chip competing for attention.
 *
 * `delta` is the important addition: a number with no baseline is
 * trivia. "₹47.2 Cr" tells an owner nothing; "₹47.2 Cr, +8.4% vs last
 * month" is a decision. Direction is carried by an arrow as well as by
 * colour, and "up" is not assumed to be good — pass `goodDirection` for
 * metrics where a rise is bad (overdue payments, scrap rate).
 */
export function KpiCard({
  label,
  value,
  icon,
  accent = "primary",
  href,
  sub,
  provenance,
  delta,
  deltaLabel,
  goodDirection = "up",
  className,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: keyof typeof accentMap;
  href?: string;
  sub?: string;
  /** One line on how this number was derived. Shown as a quiet tooltip. */
  provenance?: string;
  /** Signed percentage change, e.g. 8.4 or -3.1. Omit when there's no baseline. */
  delta?: number;
  /** What the delta is measured against. "vs last month". */
  deltaLabel?: string;
  /** Which direction is good. Overdue payments rising is not good news. */
  goodDirection?: "up" | "down";
  className?: string;
}) {
  const rising = (delta ?? 0) > 0;
  const flat = delta === 0;
  const good = flat ? null : rising === (goodDirection === "up");

  const inner = (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-raised",
        href && "card-interactive",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {icon && <span className="shrink-0 text-faint [&_svg]:size-3.5">{icon}</span>}
        <span className="min-w-0 truncate text-label text-muted-foreground">{label}</span>
        {provenance && (
          <span title={provenance} className="shrink-0 text-faint">
            <Info className="size-3" />
          </span>
        )}
        {href && (
          <ArrowRight className="ml-auto size-3.5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        )}
      </div>

      <p className={cn("text-figure", accentMap[accent])}>{value}</p>

      {(delta !== undefined || sub) && (
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-caption font-semibold tabular-nums",
                good === null && "text-muted-foreground",
                good === true && "text-success",
                good === false && "text-danger",
              )}
            >
              {!flat &&
                (rising ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                ))}
              {flat ? "No change" : `${Math.abs(delta).toFixed(1)}%`}
            </span>
          )}
          {deltaLabel && <span className="text-caption text-faint">{deltaLabel}</span>}
          {sub && <span className="text-caption text-muted-foreground">{sub}</span>}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group block">
        {inner}
      </Link>
    );
  }
  return inner;
}
