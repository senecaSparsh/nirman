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
        { href: "/m/requisitions", icon: ShoppingCart, label: "Material Indents", subtitle: "Site requests → PO" },
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
        { href: "/m/stock-counts", icon: ClipboardCheck, label: "Stock Counts", subtitle: "Cycle counts, reconciliation" },
        { href: "/m/scrap-generations", icon: Wrench, label: "Scrap / Create", subtitle: "Internally generated material" },
        { href: "/m/material-sales", icon: TrendingUp, label: "Material Sales", subtitle: "Sell raw material directly" },
        { href: "/m/equipment", icon: Wrench, label: "Equipment", subtitle: "Tools, assignments, maintenance" },
      ],
    },
    {
      title: "Real Estate",
      links: [
        { href: "/m/projects", icon: Building2, label: "Projects", subtitle: "Active developments" },
        { href: "/m/units", icon: Package, label: "Built Units", subtitle: "Available, sold, rented" },
        { href: "/m/land", icon: LandPlot, label: "Land & Parcels", subtitle: "Plots, partitions, valuation" },
        { href: "/m/customers", icon: Users, label: "Customers", subtitle: "Buyers, contacts, payments" },
        { href: "/m/sales", icon: ShoppingCart, label: "Sales", subtitle: "Active sales, payments" },
        { href: "/m/rentals", icon: Building2, label: "Rentals", subtitle: "Rented units, agreements" },
        { href: "/m/work-orders", icon: Wrench, label: "Work Orders", subtitle: "Subcontractor scope & RA bills" },
        { href: "/m/portal-listings", icon: TrendingUp, label: "Portal Listings", subtitle: "99acres, MagicBricks sync" },
      ],
    },
    {
      title: "Construction",
      links: [
        { href: "/m/boq", icon: FileText, label: "Bill of Quantities", subtitle: "BOQ items, rates, amounts" },
        { href: "/m/wbs", icon: ListTree, label: "WBS", subtitle: "Work breakdown structure" },
        { href: "/m/measurement-book", icon: BookOpen, label: "Measurement Book", subtitle: "Measured work entries" },
        { href: "/m/budget-variance", icon: TrendingUp, label: "Budget Variance", subtitle: "Budget vs actual analysis" },
        { href: "/m/project-control", icon: Gauge, label: "Project Control", subtitle: "EVM: CPI, SPI, EAC" },
        { href: "/m/standard-consumptions", icon: Beaker, label: "Std Consumptions", subtitle: "Material consumption benchmarks" },
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
      title: "DPR",
      links: [
        { href: "/m/dprs", icon: ClipboardList, label: "Daily Progress Reports", subtitle: "All DPRs, approval status" },
        { href: "/m/site/dpr", icon: ClipboardList, label: "New DPR", subtitle: "Submit a new report" },
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
