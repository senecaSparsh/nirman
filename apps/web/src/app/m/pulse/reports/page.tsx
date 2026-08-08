import { connection } from "next/server";
import { BarChart3, Package, Truck, ShoppingCart, Building2, Wallet, ClipboardCheck } from "lucide-react";
import { MobilePageHeader, MobileSectionTitle, MobileRow, MobileRefreshButton } from "@/components/mobile/mobile-primitives";

const REPORTS = [
  { href: "/reports", label: "Analytics Overview", icon: BarChart3 },
  { href: "/reports/inventory-value", label: "Inventory Value", icon: Package },
  { href: "/reports/purchase-trends", label: "Purchase Trends", icon: Truck },
  { href: "/reports/sales-revenue", label: "Sales & Revenue", icon: ShoppingCart },
  { href: "/reports/project-progress", label: "Project Progress", icon: Building2 },
  { href: "/reports/payroll-expense", label: "Payroll Expense", icon: Wallet },
  { href: "/reports/pending-payments", label: "Pending Payments", icon: ClipboardCheck },
];

export default async function PulseReportsPage() {
  await connection();
  return (
    <div>
      <MobilePageHeader title="Reports" subtitle="Analytics & financial reports" right={<MobileRefreshButton />} />
      <MobileSectionTitle>All reports</MobileSectionTitle>
      <div>
        {REPORTS.map((r) => (
          <MobileRow key={r.href} href={r.href} icon={r.icon} title={r.label} />
        ))}
      </div>
    </div>
  );
}
