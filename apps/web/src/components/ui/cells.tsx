import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════
 * TABLE CELLS — the shared vocabulary for what goes *inside* a row.
 *
 * Before this file, every list page invented its own way to show the
 * same four things: an identity, a money amount, a progress ratio and a
 * secondary detail line. Ten modules, ten treatments, and the app read
 * as ten apps. These are the canonical five.
 *
 * They exist mainly so we can delete cards. A card was often chosen not
 * because a card was right but because a card had room for a name, a
 * subtitle, a bar and a badge — and nobody had a cell that could hold
 * those. Now they do, so the same information fits in a row you can
 * sort, total and export.
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * IDENTITY — the cell you read to know which record this row is.
 *
 * Two lines: the name, and the one detail that disambiguates it (a code,
 * an address, a category). The second line is what stops a table of
 * "Cement OPC 53" × 6 locations from being unreadable.
 */
export function IdentityCell({
  name,
  sub,
  href,
  dot,
  icon,
  className,
}: {
  name: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  /** A status colour dot before the name. Pass a CSS colour. */
  dot?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      {dot && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {icon && <span className="shrink-0 text-faint [&_svg]:size-3.5">{icon}</span>}
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{name}</span>
        {sub && <span className="mt-0.5 block truncate text-caption font-normal text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block min-w-0 hover:underline hover:decoration-border-strong">
      {inner}
    </Link>
  );
}

/**
 * PROGRESS — a ratio, as a number *and* a bar.
 *
 * The bar is 4px and sits under the figures, not beside them, so a
 * column of them reads as a column. Tone is derived from the ratio
 * against `warnAt`/`dangerAt` rather than passed in, so "80% of budget
 * spent is amber" is stated once rather than at every call site.
 */
export function ProgressCell({
  value,
  total,
  label,
  warnAt = 80,
  dangerAt = 100,
  invert = false,
  className,
}: {
  value: number;
  total: number;
  /** Text under the bar — "₹4.2L / ₹6L", "12 of 20 sold". */
  label?: React.ReactNode;
  warnAt?: number;
  dangerAt?: number;
  /** For ratios where high is good (units sold) rather than bad (budget burn). */
  invert?: boolean;
  className?: string;
}) {
  if (!total) return <span className="text-faint">—</span>;
  const pct = (value / total) * 100;
  const over = pct >= dangerAt;
  const near = pct >= warnAt;
  const tone = invert
    ? over
      ? "bg-success"
      : near
        ? "bg-success/70"
        : "bg-foreground/70"
    : over
      ? "bg-danger"
      : near
        ? "bg-warning"
        : "bg-success";

  return (
    <div className={cn("min-w-24", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-body font-semibold tnum",
            !invert && over && "text-danger",
            !invert && near && !over && "text-warning",
          )}
        >
          {pct.toFixed(0)}%
        </span>
        {label && <span className="truncate text-caption tnum text-muted-foreground">{label}</span>}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

/**
 * MONEY — a signed amount. Positive is success, negative is danger, and
 * zero is neither. `sub` carries the margin or the baseline.
 *
 * `neutral` turns the colour off for amounts where sign carries no
 * judgement (a purchase value is not "bad" for being large).
 */
export function MoneyCell({
  value,
  formatted,
  sub,
  neutral = false,
  showSign = false,
  className,
}: {
  value: number;
  /** The pre-formatted string — pass `formatCurrency(value)`. */
  formatted: string;
  sub?: React.ReactNode;
  neutral?: boolean;
  showSign?: boolean;
  className?: string;
}) {
  const tone = neutral || value === 0 ? "text-foreground" : value > 0 ? "text-success" : "text-danger";
  return (
    <span className={cn("block", className)}>
      <span className={cn("block font-semibold tnum", tone)}>
        {showSign && value > 0 ? "+" : ""}
        {formatted}
      </span>
      {sub && <span className="mt-0.5 block text-caption tnum text-muted-foreground">{sub}</span>}
    </span>
  );
}

/**
 * QUANTITY — a number with its unit of measure. The unit is set smaller
 * and quieter so a column of quantities aligns on the digits rather than
 * being ragged wherever "bag" is longer than "kg".
 */
export function QtyCell({
  value,
  unit,
  sub,
  tone,
  className,
}: {
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
  className?: string;
}) {
  return (
    <span className={cn("block", className)}>
      <span className="whitespace-nowrap">
        <span
          className={cn(
            "font-semibold tnum",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-warning",
            tone === "success" && "text-success",
          )}
        >
          {value}
        </span>
        {unit && <span className="ml-1 text-caption font-normal text-muted-foreground">{unit}</span>}
      </span>
      {sub && <span className="mt-0.5 block text-caption text-muted-foreground">{sub}</span>}
    </span>
  );
}

/**
 * DATE — a date with the human-relative distance under it, because
 * "25 Mar" alone does not tell an approver that a delivery is 6 days
 * late. Overdue dates go red.
 */
export function DateCell({
  date,
  formatted,
  className,
}: {
  date: string | Date | null | undefined;
  formatted: string;
  className?: string;
}) {
  if (!date) return <span className="text-faint">—</span>;
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  const relative =
    days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : days === -1
          ? "yesterday"
          : days > 0
            ? `in ${days}d`
            : `${Math.abs(days)}d ago`;
  return (
    <span className={cn("block whitespace-nowrap", className)}>
      <span className="block tnum">{formatted}</span>
      <span className={cn("mt-0.5 block text-caption", days < 0 ? "text-danger" : "text-muted-foreground")}>
        {relative}
      </span>
    </span>
  );
}
