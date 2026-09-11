import * as React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * STAT CARD — a labelled metric with optional trend indicator.
 *
 * Replaces the ~15 inline "Card with label + big number + trend"
 * patterns in dashboards, reports, and profile pages. The label sits
 * above the figure (one eye movement instead of two), and the trend
 * arrow is a second channel beyond colour (accessibility).
 *
 * Usage:
 *   <StatCard label="Total Inventory" value="₹12.5L" />
 *   <StatCard label="Revenue" value="₹45.2L" trend={{ value: 12.5, direction: "up" }} />
 *   <StatCard label="Pending POs" value="8" icon={<Package />} />
 */
export function StatCard({
  label,
  value,
  hint,
  trend,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Secondary line below the value — a subtitle or comparison. */
  hint?: React.ReactNode;
  /** Optional trend indicator with percentage and direction. */
  trend?: { value: number; direction: "up" | "down" };
  /** Optional leading icon. */
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-caption font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-figure text-foreground tnum">{value}</p>
          {hint && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
          {trend && (
            <div className="mt-1.5 flex items-center gap-1">
              {trend.direction === "up" ? (
                <TrendingUp className="size-3 text-success" />
              ) : (
                <TrendingDown className="size-3 text-danger" />
              )}
              <span
                className={cn(
                  "text-caption font-medium tabular-nums",
                  trend.direction === "up" ? "text-success" : "text-danger",
                )}
              >
                {trend.value}%
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
