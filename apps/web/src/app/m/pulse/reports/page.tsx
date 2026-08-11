import { connection } from "next/server";
import {
  BarChart3,
  Package,
  Truck,
  ShoppingCart,
  Building2,
  Wallet,
  ClipboardCheck,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileRow,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

/**
 * Reports hub — links to mobile-friendly report destinations.
 *
 * The desktop /reports/* pages are data-dense and not suited for mobile.
 * Instead, we route the owner to the mobile pages that surface the same
 * information in a thumb-friendly format:
 *   - /m/books/reports  — financial analytics (stock value, sales, purchases)
 *   - /m/books/gl       — trial balance
 *   - /m/pulse/projects — project P&L + health
 *   - /m/pulse/inventory — inventory valuation
 *   - /m/pulse/attention — alerts (low stock, overruns, overdue)
 */
const MOBILE_REPORTS = [
  {
    href: "/m/books/reports",
    label: "Financial analytics",
    desc: "Stock value, sales, purchases, costs",
    icon: BarChart3,
  },
  {
    href: "/m/pulse/projects",
    label: "Project P&L",
    desc: "Per-project budget vs actual, margin",
    icon: Building2,
  },
  {
    href: "/m/pulse/inventory",
    label: "Inventory valuation",
    desc: "Stock value by location, low-stock",
    icon: Package,
  },
  {
    href: "/m/pulse/attention",
    label: "Alerts & overruns",
    desc: "Low stock, cost overruns, overdue POs",
    icon: TrendingUp,
  },
  {
    href: "/m/books/gl",
    label: "Trial balance",
    desc: "GL account balances",
    icon: BookOpen,
  },
  {
    href: "/m/books/finance",
    label: "Expenses & costs",
    desc: "Project costs, expense register",
    icon: Wallet,
  },
  {
    href: "/m/books/receipts",
    label: "Receipts",
    desc: "Sale payments received",
    icon: ClipboardCheck,
  },
  {
    href: "/m/procurement",
    label: "Purchase register",
    desc: "All POs by status",
    icon: Truck,
  },
  {
    href: "/m/material-sales",
    label: "Material sales",
    desc: "Scrap & material sale register",
    icon: ShoppingCart,
  },
];

export default async function PulseReportsPage() {
  await connection();
  return (
    <div>
      <MobilePageHeader
        title="Reports"
        subtitle="Analytics & financial reports"
        right={<MobileRefreshButton />}
      />
      <MobileSectionTitle>Mobile reports</MobileSectionTitle>
      <div>
        {MOBILE_REPORTS.map((r) => (
          <MobileRow
            key={r.href}
            href={r.href}
            icon={r.icon}
            title={r.label}
            subtitle={r.desc}
          />
        ))}
      </div>
      <div className="h-4" />
    </div>
  );
}
