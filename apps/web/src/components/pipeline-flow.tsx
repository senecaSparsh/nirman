import Link from "next/link";
import { Truck, Building2, ShoppingCart, ArrowRight } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

/**
 * Pipeline Flow — the procure→build→sell value chain as a horizontal flow.
 * Clean, minimal cards connected by animated dashed lines. No colored
 * borders or fills — just the data and the flow.
 */

interface StageData {
  label: string;
  icon: typeof Truck;
  color: string;
  metric: string;
  metricLabel: string;
  count: number;
  countLabel: string;
  href: string;
}

export function PipelineFlow({
  procure,
  build,
  sell,
}: {
  procure: { poCount: number; inventoryValue: number };
  build: { projectCount: number; equipmentCount: number };
  sell: { unsoldValue: number; unitCount: number };
}) {
  const stages: StageData[] = [
    {
      label: "Procure",
      icon: Truck,
      color: "var(--color-stage-procure)",
      metric: formatCurrency(procure.inventoryValue),
      metricLabel: "in inventory",
      count: procure.poCount,
      countLabel: "POs open",
      href: "/procurement",
    },
    {
      label: "Build",
      icon: Building2,
      color: "var(--color-stage-build)",
      metric: String(build.projectCount),
      metricLabel: "active projects",
      count: build.equipmentCount,
      countLabel: "equipment",
      href: "/projects",
    },
    {
      label: "Sell",
      icon: ShoppingCart,
      color: "var(--color-stage-sell)",
      metric: formatCurrency(sell.unsoldValue),
      metricLabel: "unsold assets",
      count: sell.unitCount,
      countLabel: "units",
      href: "/sales",
    },
  ];

  return (
    <div className="flex items-stretch gap-0">
      {stages.map((stage, idx) => {
        const Icon = stage.icon;
        return (
          <div key={stage.label} className="flex flex-1 items-stretch">
            <Link
              href={stage.href}
              className="group relative flex-1 rounded-lg border border-border bg-card p-4 transition-all hover:border-foreground/20"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-label text-muted-foreground">{stage.label}</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-opacity group-hover:opacity-100" />
              </div>

              <div className="mt-3">
                <div className="text-xl font-bold tnum text-foreground">{stage.metric}</div>
                <div className="text-caption text-muted-foreground">{stage.metricLabel}</div>
              </div>

              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-body font-semibold tnum text-foreground">{formatNumber(stage.count, 0)}</span>
                <span className="text-caption text-muted-foreground">{stage.countLabel}</span>
              </div>
            </Link>

            {idx < stages.length - 1 && (
              <div className="flex w-10 items-center justify-center sm:w-14">
                <svg width="100%" height="20" viewBox="0 0 56 20" className="overflow-visible">
                  <line
                    x1="0" y1="10" x2="56" y2="10"
                    stroke="var(--color-border)"
                    strokeWidth="1.5"
                    className="flow-line"
                  />
                  <polygon points="50,7 56,10 50,13" fill="var(--color-border)" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
