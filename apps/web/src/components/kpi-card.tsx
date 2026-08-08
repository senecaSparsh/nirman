import Link from "next/link";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

const accentMap = {
  primary: "text-foreground",
  brand: "text-brand",
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
 */
export function KpiCard({
  label,
  value,
  icon,
  accent = "primary",
  href,
  sub,
  provenance,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: keyof typeof accentMap;
  href?: string;
  sub?: string;
  /** One line on how this number was derived. Shown as a quiet tooltip. */
  provenance?: string;
}) {
  const inner = (
    <div
      className={cn(
        "flex h-full flex-col gap-1.5 rounded-lg border border-border bg-card p-4",
        href && "card-interactive",
      )}
    >
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground/45 [&_svg]:size-3.5">{icon}</span>}
        <span className="min-w-0 truncate text-label text-muted-foreground/75">{label}</span>
        {provenance && (
          <span title={provenance} className="shrink-0 text-muted-foreground/35">
            <Info className="h-3 w-3" />
          </span>
        )}
      </div>
      <p className={cn("text-figure", accentMap[accent])}>{value}</p>
      {sub && <p className="text-caption text-muted-foreground">{sub}</p>}
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
