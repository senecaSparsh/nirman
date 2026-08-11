"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Building2,
  Home,
  LandPlot,
  TrendingUp,
  TrendingDown,
  Hammer,
  CheckCircle2,
  CircleDollarSign,
  ShoppingCart,
  CalendarPlus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";

type MonthlyAddition = {
  month: string;
  created: number;
  purchased: number;
  total: number;
};

type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  totalUnits: number;
  availableUnits: number;
  soldUnits: number;
  underConstructionUnits: number;
  reservedUnits: number;
  rentedUnits: number;
  createdUnits: number;
  purchasedUnits: number;
  landCost: number;
  constructionCost: number;
  totalAssetValue: number;
  revenue: number;
  availableParcels: number;
  parcelArea: number;
};

type RealEstateInventoryData = {
  totalUnits: number;
  availableUnits: number;
  soldUnits: number;
  underConstructionUnits: number;
  reservedUnits: number;
  rentedUnits: number;
  createdUnits: number;
  purchasedUnits: number;
  totalParcels: number;
  availableParcels: number;
  soldParcels: number;
  partitionedParcels: number;
  totalAssetValue: number;
  totalRevenue: number;
  projects: ProjectSummary[];
  monthlyAdditions: MonthlyAddition[];
};

export function RealEstateInventoryView() {
  const [data, setData] = useState<RealEstateInventoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/real-estate-inventory")
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load real estate inventory"))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) {
    return <PageLoading label="Loading real estate inventory…" variant="default" />;
  }

  if (!data) {
    return (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title="No data available"
        description="No real estate inventory data could be loaded."
      />
    );
  }

  const maxMonthly = Math.max(...data.monthlyAdditions.map((m) => m.total), 1);

  return (
    <div className="space-y-4">
      {/* ── Summary KPI cards ── */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Home className="h-3.5 w-3.5" />}
          label="Total Units"
          value={formatNumber(data.totalUnits)}
          sublabel={`${data.createdUnits} created · ${data.purchasedUnits} purchased`}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />}
          label="Available"
          value={formatNumber(data.availableUnits)}
          sublabel={`${data.underConstructionUnits} under construction`}
        />
        <KpiCard
          icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}
          label="Sold"
          value={formatNumber(data.soldUnits)}
          sublabel={`${data.reservedUnits} reserved · ${data.rentedUnits} rented`}
        />
        <KpiCard
          icon={<CircleDollarSign className="h-3.5 w-3.5" />}
          label="Total Asset Value"
          value={formatCurrency(data.totalAssetValue)}
          sublabel={`Revenue: ${formatCurrency(data.totalRevenue)}`}
        />
      </div>

      {/* ── Whole plots (land parcels) summary ── */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <LandPlot className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-body font-semibold">Plots (Whole)</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <MiniStat label="Total Parcels" value={formatNumber(data.totalParcels)} />
          <MiniStat label="Available" value={formatNumber(data.availableParcels)} />
          <MiniStat label="Sold" value={formatNumber(data.soldParcels)} />
          <MiniStat label="Partitioned" value={formatNumber(data.partitionedParcels)} />
        </div>
      </Card>

      {/* ── Monthly additions chart ── */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-body font-semibold">Monthly New Additions</h3>
        </div>
        {data.monthlyAdditions.every((m) => m.total === 0) ? (
          <EmptyState
            icon={<CalendarPlus className="h-5 w-5" />}
            title="No additions yet"
            description="New units created or purchased will show here, grouped by month."
            size="compact"
          />
        ) : (
          <div className="flex items-end gap-1 h-32">
            {data.monthlyAdditions.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-caption text-muted-foreground tnum opacity-0 group-hover:opacity-100 transition-opacity">
                  {m.total}
                </div>
                <div className="w-full flex flex-col justify-end h-20 gap-px">
                  {m.created > 0 && (
                    <div
                      className="w-full bg-primary/70 rounded-t-sm group-hover:bg-primary transition-colors"
                      style={{ height: `${(m.created / maxMonthly) * 100}%` }}
                      title={`Created: ${m.created}`}
                    />
                  )}
                  {m.purchased > 0 && (
                    <div
                      className="w-full bg-primary/30 rounded-t-sm group-hover:bg-primary/50 transition-colors"
                      style={{ height: `${(m.purchased / maxMonthly) * 100}%` }}
                      title={`Purchased: ${m.purchased}`}
                    />
                  )}
                  {m.total === 0 && <div className="w-full h-px bg-border" />}
                </div>
                <div className="text-caption text-muted-foreground">
                  {m.month.slice(5)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 text-caption text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-primary/70 rounded-sm" />
            Created
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-primary/30 rounded-sm" />
            Purchased
          </div>
        </div>
      </Card>

      {/* ── Per-project breakdown ── */}
      <Card className="p-4 space-y-3">
        <h3 className="text-body font-semibold">Per-Project Breakdown</h3>
        {data.projects.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-5 w-5" />}
            title="No projects"
            description="Create a project to see its real estate inventory breakdown."
            size="compact"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-meta">
              <thead>
                <tr className="border-b border-border text-left text-caption text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Project</th>
                  <th className="py-2 pr-4 text-right font-medium">Units</th>
                  <th className="py-2 pr-4 text-right font-medium">Avail.</th>
                  <th className="py-2 pr-4 text-right font-medium">Sold</th>
                  <th className="py-2 pr-4 text-right font-medium">U.C.</th>
                  <th className="py-2 pr-4 text-right font-medium">Plots</th>
                  <th className="py-2 pr-4 text-right font-medium">Land Cost</th>
                  <th className="py-2 pr-4 text-right font-medium">Construction</th>
                  <th className="py-2 text-right font-medium">Asset Value</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {p.name}
                      <span className={cn("ml-2 text-caption", p.status === "ACTIVE" ? "text-success" : "text-muted-foreground")}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right tnum text-foreground">{p.totalUnits}</td>
                    <td className="py-2 pr-4 text-right tnum text-success">{p.availableUnits}</td>
                    <td className="py-2 pr-4 text-right tnum text-foreground">{p.soldUnits}</td>
                    <td className="py-2 pr-4 text-right tnum text-muted-foreground">{p.underConstructionUnits}</td>
                    <td className="py-2 pr-4 text-right tnum text-muted-foreground">{p.availableParcels}</td>
                    <td className="py-2 pr-4 text-right tnum text-foreground">{formatCurrency(p.landCost)}</td>
                    <td className="py-2 pr-4 text-right tnum text-foreground">{formatCurrency(p.constructionCost)}</td>
                    <td className="py-2 text-right tnum font-semibold text-foreground">{formatCurrency(p.totalAssetValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-2 pr-4 font-semibold text-foreground">Total</td>
                  <td className="py-2 pr-4 text-right font-semibold tnum text-foreground">{data.totalUnits}</td>
                  <td className="py-2 pr-4 text-right font-semibold tnum text-success">{data.availableUnits}</td>
                  <td className="py-2 pr-4 text-right font-semibold tnum text-foreground">{data.soldUnits}</td>
                  <td className="py-2 pr-4 text-right font-semibold tnum text-muted-foreground">{data.underConstructionUnits}</td>
                  <td className="py-2 pr-4 text-right font-semibold tnum text-muted-foreground">{data.availableParcels}</td>
                  <td className="py-2 pr-4 text-right font-semibold tnum text-foreground">
                    {formatCurrency(data.projects.reduce((s, p) => s + p.landCost, 0))}
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold tnum text-foreground">
                    {formatCurrency(data.projects.reduce((s, p) => s + p.constructionCost, 0))}
                  </td>
                  <td className="py-2 text-right font-semibold tnum text-foreground">{formatCurrency(data.totalAssetValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <Card className="p-3 space-y-0.5">
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-body font-semibold tnum text-foreground">{value}</div>
      {sublabel && <div className="text-caption text-muted-foreground">{sublabel}</div>}
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className="text-body font-semibold tnum text-foreground">{value}</div>
    </div>
  );
}
