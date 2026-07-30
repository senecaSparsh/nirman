import Link from "next/link";
import {
  Building2,
  Package,
  LandPlot,
  Home,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Construction & real estate inventory at a glance.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Material Inventory Value"
          value={formatCurrency(0)}
          icon={<Package className="h-5 w-5" />}
          accent="primary"
          href="/materials"
        />
        <KpiCard
          label="Unsold Asset Value"
          value={formatCurrency(0)}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="success"
          href="/units"
        />
        <KpiCard
          label="Active Projects"
          value="0"
          icon={<Building2 className="h-5 w-5" />}
          accent="warning"
          href="/projects"
        />
        <KpiCard
          label="Open Purchase Orders"
          value="0"
          icon={<Wallet className="h-5 w-5" />}
          accent="danger"
          href="/procurement"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction href="/procurement" label="Create Purchase Order" icon={<Wallet className="h-4 w-4" />} />
            <QuickAction href="/stock-movements" label="Issue Materials to Project" icon={<Package className="h-4 w-4" />} />
            <QuickAction href="/land" label="Record Land Purchase" icon={<LandPlot className="h-4 w-4" />} />
            <QuickAction href="/land" label="Partition a Land Parcel" icon={<LandPlot className="h-4 w-4" />} />
            <QuickAction href="/units" label="Add Built Units" icon={<Home className="h-4 w-4" />} />
            <QuickAction href="/sales" label="Record a Sale" icon={<TrendingUp className="h-4 w-4" />} />
          </CardContent>
        </Card>

        {/* Low stock alerts */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Low Stock Alerts</CardTitle>
            <Badge variant="muted">0 items</Badge>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<AlertTriangle className="h-8 w-8" />}
              title="No low-stock alerts"
              description="Materials dropping below minimum stock will appear here."
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent activity placeholder */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent Sales</CardTitle>
            <Link href="/sales" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<TrendingUp className="h-8 w-8" />}
              title="No sales yet"
              description="Asset sales (land or built units) will show up here."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent Stock Movements</CardTitle>
            <Link href="/stock-movements" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No movements yet"
              description="Receipts, transfers and issues will be logged here."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "primary" | "success" | "warning" | "danger";
  href: string;
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
  };
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center justify-between p-5">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${accentMap[accent]}`}>
            {icon}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-accent"
    >
      <span className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="text-muted-foreground/40">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
