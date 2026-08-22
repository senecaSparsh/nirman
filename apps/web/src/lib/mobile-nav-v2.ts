import {
  Boxes,
  Users,
  BookOpen,
  Building2,
  Package,
  ShoppingCart,
  LandPlot,
  Truck,
  FileText,
  Wrench,
  TrendingUp,
  AlertTriangle,
  ClipboardCheck,
  ArrowLeftRight,
  Warehouse,
  Home,
  Calendar,
  ClipboardList,
  User,
  Receipt,
  Wallet,
  BookOpen as BookIcon,
  Settings,
  CalendarDays,
  ListTree,
  Gauge,
  Beaker,
  BarChart3,
  IndianRupee,
  ShieldCheck,
  Scale,
  PieChart,
  FileSpreadsheet,
  GitBranch,
  type LucideIcon,
} from "lucide-react";

/**
 * MOBILE 3-MODULE NAVIGATION
 *
 * Replaces the old 5-persona system with a fixed bottom tab bar of
 * three modules: Inventory, HR, Accounts. Every role sees the same
 * three tabs; content inside each module is gated by permissions.
 */

export interface ModuleTab {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional endpoint that returns a count badge. */
  badge?: { endpoint: string };
}

export const MOBILE_TABS: ModuleTab[] = [
  { id: "home", label: "Home", href: "/m/home", icon: Home },
  {
    id: "inventory",
    label: "Inventory",
    href: "/m/inventory",
    icon: Boxes,
    badge: { endpoint: "/api/purchase-orders?status=DRAFT,APPROVED,ORDERED,PARTIAL" },
  },
  { id: "hr", label: "HR", href: "/m/hr", icon: Users },
  { id: "accounts", label: "Accounts", href: "/m/accounts", icon: BookOpen },
  { id: "settings", label: "Settings", href: "/m/settings", icon: Settings },
];

export function isModuleActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export function activeModuleTab(pathname: string): ModuleTab | undefined {
  return MOBILE_TABS.find((t) => isModuleActive(pathname, t.href));
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAV SHEET LINKS — per-module grouped navigation
   Shown in the 3-dot overflow bottom sheet. Each module has grouped
   sections of links. Links are plain hrefs + icons + labels — no counts
   or live data (the sheet is a sitemap, not a dashboard).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface NavLink {
  href: string;
  icon: LucideIcon;
  label: string;
  subtitle?: string;
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

export const NAV_GROUPS: Record<string, NavGroup[]> = {
  inventory: [
    {
      title: "Procurement",
      links: [
        { href: "/m/procurement", icon: FileText, label: "Purchase Orders", subtitle: "Draft, ordered, received" },
        { href: "/m/requisitions", icon: ShoppingCart, label: "Material Indents", subtitle: "Site requests to purchase orders" },
        { href: "/m/suppliers", icon: Truck, label: "Suppliers", subtitle: "Vendors, ratings, balances" },
        { href: "/m/rate-contracts", icon: FileText, label: "Rate Contracts", subtitle: "Fixed-rate supplier agreements" },
        { href: "/m/supplier-returns", icon: AlertTriangle, label: "Supplier Returns", subtitle: "Return to vendor" },
      ],
    },
    {
      title: "Stock",
      links: [
        { href: "/m/materials", icon: Boxes, label: "Materials Catalogue", subtitle: "All materials, categories, units" },
        { href: "/m/stock", icon: Package, label: "Stock Ledger", subtitle: "Current stock by location" },
        { href: "/m/stock-locations/new", icon: Warehouse, label: "Add Stock Location", subtitle: "New warehouse or project site" },
        { href: "/m/site/stock", icon: Package, label: "Site Stock", subtitle: "Stock by site + movements" },
        { href: "/m/transfers", icon: ArrowLeftRight, label: "Stock Transfers", subtitle: "Move stock between locations" },
        { href: "/m/vehicles", icon: Truck, label: "Vehicles", subtitle: "Auto-built vehicle master + trip log" },
        { href: "/m/stock-counts", icon: ClipboardCheck, label: "Stock Counts", subtitle: "Cycle counts, reconciliation" },
        { href: "/m/scrap-generations", icon: Wrench, label: "Scrap / Create", subtitle: "Internally generated material" },
        { href: "/m/material-sales", icon: TrendingUp, label: "Material Sales", subtitle: "Sell raw material directly" },
        { href: "/m/gate-pass", icon: ShieldCheck, label: "Gate Pass", subtitle: "Approve items leaving the gate" },
        { href: "/m/equipment", icon: Wrench, label: "Equipment", subtitle: "Tools, assignments, maintenance" },
      ],
    },
    {
      title: "Real Estate",
      links: [
        { href: "/m/projects", icon: Building2, label: "Projects", subtitle: "Active developments" },
        { href: "/m/units", icon: Package, label: "Built Units", subtitle: "Available, sold, rented" },
        { href: "/m/land", icon: LandPlot, label: "Land & Parcels", subtitle: "Plots, partitions, valuation" },
        { href: "/m/permissions", icon: Scale, label: "Permissions & Legal", subtitle: "NOCs, licenses, certificates, expiry alerts" },
        { href: "/m/customers", icon: Users, label: "Customers", subtitle: "Buyers, contacts, payments" },
        { href: "/m/sales", icon: ShoppingCart, label: "Sales & CRM", subtitle: "Leads, bookings, follow-ups, collections" },
        { href: "/m/rentals", icon: Building2, label: "Rentals", subtitle: "Rented units, agreements" },
        { href: "/m/work-orders", icon: Wrench, label: "Work Orders", subtitle: "Subcontractor scope & RA bills" },
        { href: "/m/change-orders", icon: GitBranch, label: "Change Orders", subtitle: "Scope & budget modifications" },
        { href: "/m/quality-control", icon: ClipboardCheck, label: "Quality Control", subtitle: "NCRs & CAPA" },
        { href: "/m/portal-listings", icon: TrendingUp, label: "Portal Listings", subtitle: "99acres, MagicBricks sync" },
      ],
    },
    {
      title: "Construction",
      links: [
        { href: "/m/boq", icon: FileText, label: "Bill of Quantities", subtitle: "BOQ items, rates, amounts" },
        { href: "/m/wbs", icon: ListTree, label: "Work Breakdown Structure", subtitle: "Project task hierarchy" },
        { href: "/m/measurement-book", icon: BookOpen, label: "Measurement Book", subtitle: "Measured work entries" },
        { href: "/m/budget-variance", icon: TrendingUp, label: "Budget Variance", subtitle: "Budget vs actual analysis" },
        { href: "/m/project-control", icon: Gauge, label: "Project Control", subtitle: "Earned value: CPI, SPI, EAC" },
        { href: "/m/standard-consumptions", icon: Beaker, label: "Standard Consumptions", subtitle: "Material consumption benchmarks" },
        { href: "/m/material-reconciliation", icon: Package, label: "Material Reconciliation", subtitle: "Required vs issued vs consumed" },
      ],
    },
    {
      title: "Alerts",
      links: [
        { href: "/m/pulse/attention", icon: AlertTriangle, label: "Attention Queue", subtitle: "All alerts in one place" },
        { href: "/m/pulse/approvals", icon: ClipboardCheck, label: "Approvals", subtitle: "POs, requisitions awaiting sign-off" },
      ],
    },
    {
      title: "Reports & Analysis",
      links: [
        { href: "/m/reports/inventory-value", icon: Scale, label: "Inventory Valuation", subtitle: "Stock value by location" },
        { href: "/m/reports/stock-movement-summary", icon: Package, label: "Stock Movement Summary", subtitle: "Opening, received, issued, balance" },
        { href: "/m/reports/issue-register", icon: FileText, label: "Issue Register", subtitle: "All stock issue slips" },
        { href: "/m/reports/purchase-register", icon: FileText, label: "Purchase Register", subtitle: "Direct purchases + returns" },
        { href: "/m/reports/purchase-trends", icon: TrendingUp, label: "Purchase Trends", subtitle: "12-month spend, top suppliers" },
        { href: "/m/reports/purchaser-performance", icon: BarChart3, label: "Purchaser Performance", subtitle: "Quote metrics, savings" },
        { href: "/m/reports/department-consumption", icon: PieChart, label: "Dept Consumption", subtitle: "Material use by department" },
        { href: "/m/material-reconciliation", icon: Beaker, label: "Material Reconciliation", subtitle: "Required vs issued vs consumed" },
        { href: "/m/vehicles", icon: Truck, label: "Vehicle / Transporter Analysis", subtitle: "Trip log, frequency, routes" },
        { href: "/m/reports", icon: FileSpreadsheet, label: "All Reports", subtitle: "Complete report hub" },
      ],
    },
  ],
  hr: [
    {
      title: "Attendance",
      links: [
        { href: "/m/attendance", icon: Calendar, label: "Attendance", subtitle: "Today's headcount, GPS-tagged" },
        { href: "/m/site/attendance", icon: Calendar, label: "Mark Attendance", subtitle: "Bulk check-in with GPS" },
      ],
    },
    {
      title: "Daily Progress Report",
      links: [
        { href: "/m/dprs", icon: ClipboardList, label: "Daily Progress Reports", subtitle: "All reports, approval status" },
        { href: "/m/site/dpr", icon: ClipboardList, label: "New Daily Progress Report", subtitle: "Submit a new report" },
      ],
    },
    {
      title: "People",
      links: [
        { href: "/m/hr/employees", icon: User, label: "Employees", subtitle: "All workers, trades, wages" },
        { href: "/m/hr/leaves", icon: CalendarDays, label: "Leaves", subtitle: "Leave records & approvals" },
        { href: "/m/site/me", icon: User, label: "My Profile", subtitle: "Supervisor profile" },
        { href: "/m/site/tasks", icon: ClipboardCheck, label: "My Tasks", subtitle: "Assigned tasks" },
      ],
    },
    {
      title: "Reports & Analysis",
      links: [
        { href: "/m/reports/payroll-expense", icon: Wallet, label: "Payroll Expense", subtitle: "Monthly payroll by trade/crew" },
        { href: "/m/attendance", icon: Calendar, label: "Attendance Summary", subtitle: "Headcount, present %, GPS audit" },
        { href: "/m/dprs", icon: ClipboardList, label: "DPR Analysis", subtitle: "All reports, approval status" },
        { href: "/m/standard-consumptions", icon: Beaker, label: "Standard vs Actual", subtitle: "Consumption benchmarks + variance" },
        { href: "/m/reports", icon: FileSpreadsheet, label: "All Reports", subtitle: "Complete report hub" },
      ],
    },
  ],
  accounts: [
    {
      title: "Books",
      links: [
        { href: "/m/books", icon: Receipt, label: "Finance Home", subtitle: "GL, receipts, payroll overview" },
        { href: "/m/books/finance", icon: Wallet, label: "Finance", subtitle: "Expenses & project costs" },
        { href: "/m/books/receipts", icon: Receipt, label: "Receipts", subtitle: "Payment receipts" },
        { href: "/m/books/payroll", icon: Wallet, label: "Payroll", subtitle: "Salary processing" },
      ],
    },
    {
      title: "Ledger & Reports",
      links: [
        { href: "/m/books/gl", icon: BookIcon, label: "Trial Balance", subtitle: "All accounts" },
        { href: "/m/books/reports", icon: TrendingUp, label: "Analytics", subtitle: "Key metrics at a glance" },
        { href: "/m/reports", icon: BarChart3, label: "Reports Hub", subtitle: "All report links in one place" },
      ],
    },
    {
      title: "Reports & Analysis",
      links: [
        { href: "/m/reports/profit", icon: PieChart, label: "Profit & Loss", subtitle: "Income vs expense statement" },
        { href: "/m/reports/cash-flow", icon: IndianRupee, label: "Cash Flow Forecast", subtitle: "Projected inflows vs outflows" },
        { href: "/m/reports/pending-payments", icon: Wallet, label: "Pending Payments", subtitle: "Overdue POs + receivables" },
        { href: "/m/reports/sales-revenue", icon: TrendingUp, label: "Sales Revenue", subtitle: "12-month revenue, top customers" },
        { href: "/m/reports/project-progress", icon: BarChart3, label: "Project Progress", subtitle: "Budget vs actual, P&L per project" },
        { href: "/m/reports/job-costing", icon: FileText, label: "Job Costing", subtitle: "Per-project cost breakdown" },
        { href: "/m/reports/real-estate-inventory", icon: Building2, label: "Real Estate Inventory", subtitle: "Available units, valuation" },
        { href: "/m/reports/gst", icon: FileSpreadsheet, label: "GST Report", subtitle: "GSTR-1, GSTR-3B reconciliation" },
        { href: "/m/reports/tds-certificates", icon: FileText, label: "TDS Certificates", subtitle: "Subcontractor TDS tracking" },
        { href: "/m/reports/expenses", icon: Wallet, label: "Expenses", subtitle: "All expenses by category" },
      ],
    },
  ],
  settings: [
    {
      title: "Profile",
      links: [
        { href: "/m/me", icon: User, label: "My Profile", subtitle: "Account, role, preferences" },
        { href: "/m/settings", icon: Building2, label: "Company Portfolio", subtitle: "Company overview, activity, dues" },
      ],
    },
    {
      title: "Administration",
      links: [
        { href: "/m/settings/team", icon: Users, label: "Team & Permissions", subtitle: "Users, roles, access control" },
        { href: "/m/settings/export", icon: FileText, label: "Bulk Export", subtitle: "CSV/PDF data export" },
        { href: "/m/settings/notifications", icon: AlertTriangle, label: "Notifications", subtitle: "Alerts, templates, delivery" },
      ],
    },
  ],
};
