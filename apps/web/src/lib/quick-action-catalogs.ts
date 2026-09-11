import {
  Truck,
  ScanLine,
  Send,
  PackagePlus,
  TrendingUp,
  FileText,
  ShoppingCart,
  Building2,
  Package,
  LandPlot,
  Users,
  Home,
  Wrench,
  ClipboardList,
  CalendarCheck,
  ListChecks,
  ShieldAlert,
  MapPin,
  CalendarDays,
  Wallet,
  HardHat,
  IndianRupee,
  Receipt,
  BookOpen,
  RefreshCw,
  Scale,
  ClipboardCheck,
  Calculator,
  Layers,
  Recycle,
  Target,
  Globe,
  KeyRound,
} from "lucide-react";
import type { Persona } from "@/lib/mobile-nav-v2";
import type { QuickActionTab } from "@/components/mobile/v2/quick-actions-bar";

/* ═══════════════════════════════════════════════════════════════════════════
   QUICK ACTION CATALOGS — one per module (inventory / hr / accounts).

   Each action declares a stable `key` (used for persistence + dnd), an
   href, icon, label, and the personas it is relevant to. Persona
   filtering is a ranking hint, not an access gate — the route manifest's
   `perm` field is the hard gate. Omitting `personas` means "relevant to
   everyone with access to this module".

   These catalogs are imported by the server pages (so they can pass
   them to the client component without a second source of truth) and by
   the client `QuickActionsBar` (via props).
   ═══════════════════════════════════════════════════════════════════════════ */

export const INVENTORY_QUICK_ACTIONS: QuickActionTab[] = [
  {
    id: "raw-material",
    label: "Raw Material",
    icon: "📦",
    actions: [
      { key: "indents", href: "/m/procurement?tab=indents", icon: ShoppingCart, label: "Indents", personas: ["procurement", "ops", "field", "executive"] },
      { key: "quotations", href: "/m/procurement?tab=quotations", icon: FileText, label: "Quotations", personas: ["procurement", "ops", "executive"] },
      { key: "purchase-orders", href: "/m/procurement", icon: Truck, label: "Procurement", personas: ["procurement", "ops", "executive"] },
      { key: "receive", href: "/m/site/receive", icon: ScanLine, label: "Receive", personas: ["procurement", "field", "ops"] },
      { key: "stock-out", href: "/m/stock-out", icon: Send, label: "Stock Out", personas: ["procurement", "field", "ops"] },
      { key: "materials", href: "/m/materials", icon: PackagePlus, label: "Materials", personas: ["procurement", "ops", "executive"] },
      { key: "stock", href: "/m/stock", icon: Package, label: "Stock", personas: ["procurement", "ops", "field", "executive"] },
      { key: "material-sales", href: "/m/material-sales", icon: TrendingUp, label: "Material Sales", personas: ["sales", "executive", "finance"] },
    ],
  },
  {
    id: "real-estate",
    label: "Real Estate",
    icon: "🏗️",
    actions: [
      { key: "sales", href: "/m/sales?tab=collections", icon: ShoppingCart, label: "Sales", personas: ["sales", "executive", "finance"] },
      { key: "projects", href: "/m/projects", icon: Building2, label: "Projects", personas: ["ops", "executive", "field", "sales"] },
      { key: "units", href: "/m/units", icon: Package, label: "Units", personas: ["sales", "executive", "ops"] },
      { key: "land", href: "/m/land", icon: LandPlot, label: "Land", personas: ["executive", "ops"] },
      { key: "customers", href: "/m/customers", icon: Users, label: "Customers", personas: ["sales", "executive"] },
      { key: "rentals", href: "/m/rentals", icon: Home, label: "Rentals", personas: ["sales", "executive"] },
      { key: "work-orders", href: "/m/work-orders", icon: Wrench, label: "Work Orders", personas: ["ops", "field", "executive"] },
      { key: "portal-listings", href: "/m/portal-listings", icon: TrendingUp, label: "Portal Listings", personas: ["sales", "executive"] },
    ],
  },
];

export const HR_QUICK_ACTIONS: QuickActionTab[] = [
  {
    id: "field",
    label: "Field",
    icon: "👷",
    actions: [
      { key: "dprs", href: "/m/dprs", icon: ClipboardList, label: "DPRs", personas: ["field", "ops", "hr", "executive"] },
      { key: "attendance", href: "/m/attendance", icon: CalendarCheck, label: "Attendance", personas: ["field", "hr", "ops", "executive"] },
      { key: "add-dpr", href: "/m/site/dpr", icon: FileText, label: "Add DPR", personas: ["field", "ops"] },
      { key: "tasks", href: "/m/site/tasks", icon: ListChecks, label: "Tasks", personas: ["field", "ops"] },
      { key: "safety", href: "/m/safety", icon: ShieldAlert, label: "Safety", personas: ["field", "ops", "executive"] },
      { key: "field-report", href: "/m/site/field", icon: MapPin, label: "Field", personas: ["field", "ops"] },
      { key: "site", href: "/m/site", icon: HardHat, label: "Site", personas: ["field", "ops", "executive"] },
      { key: "progress", href: "/m/dprs", icon: TrendingUp, label: "Progress", personas: ["ops", "executive", "field"] },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: "🧑",
    columns: 3,
    actions: [
      { key: "employees", href: "/m/hr/employees", icon: Users, label: "Employees", personas: ["hr", "executive", "ops"] },
      { key: "leaves", href: "/m/hr/leaves", icon: CalendarDays, label: "Leaves", personas: ["hr", "executive", "field", "ops"] },
      { key: "payroll", href: "/m/books/payroll", icon: Wallet, label: "Payroll", personas: ["hr", "finance", "executive"] },
      { key: "labour-cost", href: "/m/reports/payroll-expense", icon: TrendingUp, label: "Labour Cost", personas: ["hr", "finance", "executive"] },
      { key: "crews", href: "/m/hr/employees", icon: HardHat, label: "Crews", personas: ["field", "ops", "hr"] },
      { key: "approvals", href: "/m/hr/leaves", icon: CalendarDays, label: "Approvals", personas: ["hr", "ops", "executive"] },
    ],
  },
];

export const ACCOUNTS_QUICK_ACTIONS: QuickActionTab[] = [
  {
    id: "cash",
    label: "Cash",
    icon: "💵",
    actions: [
      { key: "receipts", href: "/m/accounts?tab=receipts", icon: Wallet, label: "Receipts", personas: ["finance", "executive"] },
      { key: "payments", href: "/m/accounts?tab=payments", icon: IndianRupee, label: "Payments", personas: ["finance", "executive"] },
      { key: "expenses", href: "/m/accounts?tab=expenses", icon: Receipt, label: "Expenses", personas: ["finance", "executive", "ops", "field"] },
      { key: "payroll", href: "/m/accounts?tab=gl", icon: Wallet, label: "Payroll", personas: ["finance", "hr", "executive"] },
      { key: "dues", href: "/m/reports/pending-payments", icon: ClipboardCheck, label: "Dues", personas: ["finance", "executive"] },
      { key: "cash-flow", href: "/m/reports/cash-flow", icon: TrendingUp, label: "Cash Flow", personas: ["finance", "executive"] },
      { key: "spend", href: "/m/reports/expenses", icon: Receipt, label: "Spend", personas: ["finance", "executive", "ops"] },
      { key: "project-cost", href: "/m/accounts?tab=expenses", icon: Building2, label: "Project Cost", personas: ["finance", "ops", "executive"] },
    ],
  },
  {
    id: "books",
    label: "Books",
    icon: "📒",
    actions: [
      { key: "ledger", href: "/m/accounts?tab=gl", icon: BookOpen, label: "Ledger", personas: ["finance", "executive"] },
      { key: "tally-sync", href: "/m/accounts?tab=gl", icon: RefreshCw, label: "Tally Sync", personas: ["finance", "executive"] },
      { key: "gst", href: "/m/reports/gst", icon: FileText, label: "GST", personas: ["finance", "executive"] },
      { key: "tds", href: "/m/reports/tds-certificates", icon: Receipt, label: "TDS", personas: ["finance", "executive"] },
      { key: "pnl", href: "/m/reports/profit", icon: TrendingUp, label: "P&L", personas: ["finance", "executive"] },
      { key: "job-cost", href: "/m/reports/job-costing", icon: Calculator, label: "Job Cost", personas: ["finance", "executive", "ops"] },
      { key: "compare", href: "/m/reports/comparative", icon: Layers, label: "Compare", personas: ["finance", "executive"] },
      { key: "reports", href: "/m/books/reports", icon: Scale, label: "Reports", personas: ["finance", "executive"] },
    ],
  },
];

export const SITE_QUICK_ACTIONS: QuickActionTab[] = [
  {
    id: "daily",
    label: "Daily",
    icon: "📋",
    actions: [
      { key: "quick-issue", href: "/m/stock-out?mode=issue", icon: Send, label: "Quick Issue", personas: ["field", "ops", "procurement"] },
      { key: "receive", href: "/m/site/receive", icon: Truck, label: "Receive Stock", personas: ["field", "procurement", "ops"] },
      { key: "dpr", href: "/m/site/dpr", icon: ClipboardList, label: "Submit DPR", personas: ["field", "ops", "hr", "executive"] },
      { key: "attendance", href: "/m/site/attendance", icon: CalendarCheck, label: "Attendance", personas: ["field", "hr", "ops", "executive"] },
      { key: "tasks", href: "/m/site/tasks", icon: ListChecks, label: "Tasks", personas: ["field", "ops", "hr", "executive"] },
      { key: "scrap", href: "/m/stock?tab=scrap", icon: Recycle, label: "Scrap Log", personas: ["field", "ops", "procurement"] },
      { key: "site-stock", href: "/m/site/stock", icon: Package, label: "Site Stock", personas: ["field", "ops", "procurement", "executive"] },
      { key: "field", href: "/m/site/field", icon: MapPin, label: "Field", personas: ["field", "ops", "procurement"] },
    ],
  },
  {
    id: "site-ops",
    label: "Site Ops",
    icon: "🏗️",
    actions: [
      { key: "projects", href: "/m/projects", icon: Building2, label: "Projects", personas: ["ops", "executive", "field", "sales"] },
      { key: "work-orders", href: "/m/work-orders", icon: Wrench, label: "Work Orders", personas: ["ops", "field", "executive"] },
      { key: "safety", href: "/m/safety", icon: ShieldAlert, label: "Safety", personas: ["field", "ops", "executive"] },
      { key: "measurement-book", href: "/m/measurement-book", icon: ClipboardCheck, label: "MB", personas: ["field", "ops", "executive"] },
      { key: "stock-out", href: "/m/stock-out", icon: Send, label: "Stock Out", personas: ["field", "procurement", "ops"] },
      { key: "dprs", href: "/m/dprs", icon: TrendingUp, label: "All DPRs", personas: ["ops", "hr", "executive", "field"] },
    ],
  },
];

export const SALES_QUICK_ACTIONS: QuickActionTab[] = [
  {
    id: "pipeline",
    label: "Pipeline",
    icon: "🎯",
    actions: [
      { key: "leads", href: "/m/leads", icon: Target, label: "Leads", personas: ["sales", "executive"] },
      { key: "customers", href: "/m/customers", icon: Users, label: "Customers", personas: ["sales", "executive"] },
      { key: "sales", href: "/m/sales?tab=collections", icon: ShoppingCart, label: "Sales", personas: ["sales", "executive", "finance"] },
      { key: "material-sales", href: "/m/material-sales", icon: TrendingUp, label: "Material Sales", personas: ["sales", "executive", "finance"] },
      { key: "portal-listings", href: "/m/portal-listings", icon: Globe, label: "Portal Listings", personas: ["sales", "executive"] },
      { key: "rentals", href: "/m/rentals", icon: Home, label: "Rentals", personas: ["sales", "executive"] },
      { key: "units", href: "/m/units", icon: Package, label: "Units", personas: ["sales", "executive", "ops"] },
      { key: "brokers", href: "/m/brokers", icon: Users, label: "Brokers", personas: ["sales", "executive"] },
    ],
  },
  {
    id: "deals",
    label: "Deals",
    icon: "🤝",
    actions: [
      { key: "projects", href: "/m/projects", icon: Building2, label: "Projects", personas: ["sales", "executive", "ops", "field"] },
      { key: "land", href: "/m/land", icon: LandPlot, label: "Land", personas: ["executive", "sales", "ops"] },
      { key: "tasks", href: "/m/site/tasks", icon: ListChecks, label: "Tasks", personas: ["sales", "ops", "field", "hr", "executive"] },
      { key: "bookings", href: "/m/sales?tab=bookings", icon: KeyRound, label: "Bookings", personas: ["sales", "executive"] },
      { key: "payments", href: "/m/sales?tab=collections", icon: Wallet, label: "Collections", personas: ["sales", "finance", "executive"] },
      { key: "reports", href: "/m/reports/sales-revenue", icon: TrendingUp, label: "Sales Reports", personas: ["sales", "executive", "finance"] },
    ],
  },
];

/** All catalogs keyed by module id — used by the server pages. */
export const QUICK_ACTION_CATALOGS: Record<"inventory" | "hr" | "accounts" | "site" | "sales", QuickActionTab[]> = {
  inventory: INVENTORY_QUICK_ACTIONS,
  hr: HR_QUICK_ACTIONS,
  accounts: ACCOUNTS_QUICK_ACTIONS,
  site: SITE_QUICK_ACTIONS,
  sales: SALES_QUICK_ACTIONS,
};

/** Helper for server pages: load saved layouts for all tabs of a module. */
export function quickActionKeysFor(module: "inventory" | "hr" | "accounts" | "site" | "sales"): string[] {
  return QUICK_ACTION_CATALOGS[module].map((t) => `quick-actions:${module}:${t.id}`);
}

/** Re-export the Persona type for convenience in server pages. */
export type { Persona };
