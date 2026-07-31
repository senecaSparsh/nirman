import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const accentMap = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  muted: "bg-muted text-muted-foreground",
} as const;

/**
 * Reusable KPI card: compact label (11px caption) + bold value (20px, tabular)
 * + accent icon chip. Optional href makes it a navigable card with a hover lift.
 */
export function KpiCard({
  label,
  value,
  icon,
  accent = "primary",
  href,
  sub,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: keyof typeof accentMap;
  href?: string;
  sub?: string;
}) {
  const inner = (
    <Card className={cn(href && "card-interactive")}>
      <CardContent className="flex items-center justify-between p-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-caption font-medium text-muted-foreground">{label}</p>
          <p className="tnum text-xl font-bold tracking-tight">{value}</p>
          {sub && <p className="tnum text-caption text-muted-foreground">{sub}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              accentMap[accent],
            )}
          >
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <a href={href} className="group block">
        {inner}
      </a>
    );
  }
  return inner;
}
