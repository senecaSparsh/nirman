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
  HardHat,
  Sun,
  MapPin,
  Search,
  Briefcase,
  Workflow,
  Building2 as BuildingIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * MOBILE PERSONA-BASED NAVIGATION
 *
 * The tab bar is curated by persona — each role sees the 4-5 tabs that
 * match what they do on a phone. Executive and Sales personas use 4 tabs
 * + a "More" link; Ops, Field, and Finance use 5 tabs.
 *
 * A tab may promote one deep action (a supervisor's commonest act is
 * "Receive", not "browse Materials"). It keeps its world's colour so it
 * reads as a shortcut, not a new place.
 */

export interface ModuleTab {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional endpoint that returns a count badge. */
  badge?: { endpoint: string };
}

// ── All available tabs ──────────────────────────────────────────────

const HOME_TAB: ModuleTab = { id: "home", label: "Home", href: "/m/home", icon: Home };
const INVENTORY_TAB: ModuleTab = {
  id: "inventory",
  label: "Inventory",
  href: "/m/inventory",
  icon: Boxes,
  badge: { endpoint: "/api/purchase-orders?status=DRAFT,APPROVED,ORDERED,PARTIAL" },
};
const HR_TAB: ModuleTab = { id: "hr", label: "HR", href: "/m/hr", icon: Users };
const ACCOUNTS_TAB: ModuleTab = { id: "accounts", label: "Accounts", href: "/m/accounts", icon: BookOpen };
const SETTINGS_TAB: ModuleTab = { id: "settings", label: "More", href: "/m/settings", icon: Settings };
const SITE_TAB: ModuleTab = { id: "site", label: "Site", href: "/m/site", icon: MapPin };
const DPR_TAB: ModuleTab = {
  id: "dpr",
  label: "DPR",
  href: "/m/dprs",
  icon: ClipboardList,
  badge: { endpoint: "/api/dprs?approvalStatus=SUBMITTED" },
};
const TASKS_TAB: ModuleTab = {
  id: "tasks",
  label: "Tasks",
  href: "/m/site/tasks",
  icon: ClipboardCheck,
  badge: { endpoint: "/api/my-tasks" },
};
const STOCK_TAB: ModuleTab = { id: "stock", label: "Stock", href: "/m/stock", icon: Package };
const PROCUREMENT_TAB: ModuleTab = {
  id: "procurement",
  label: "POs",
  href: "/m/procurement",
  icon: FileText,
  badge: { endpoint: "/api/purchase-orders?status=DRAFT" },
};
const TRANSFERS_TAB: ModuleTab = { id: "transfers", label: "Transfers", href: "/m/transfers", icon: ArrowLeftRight };
const SALES_TAB: ModuleTab = { id: "sales", label: "Sales", href: "/m/sales", icon: ShoppingCart };
const CUSTOMERS_TAB: ModuleTab = { id: "customers", label: "Customers", href: "/m/customers", icon: Users };
const REPORTS_TAB: ModuleTab = { id: "reports", label: "Reports", href: "/m/reports", icon: BarChart3 };
const ATTENDANCE_TAB: ModuleTab = { id: "attendance", label: "Attendance", href: "/m/attendance", icon: Calendar };

// Search tab — opens the global search overlay (special: doesn't navigate, opens overlay)
const SEARCH_TAB: ModuleTab = { id: "search", label: "Search", href: "#search", icon: Search };

// ── Persona → tab mapping ───────────────────────────────────────────

/**
 * Maps a role to a persona. Personas group roles that share the same
 * mobile tab bar. The mapping follows the 5-tier delegation hierarchy:
 *
 *   Executive  — OWNER, ADMIN, PROJECT_DIRECTOR, FINANCE_HEAD
 *   Ops        — PROJECT_MANAGER
 *   Procurement— PROCUREMENT_MANAGER, STORE_KEEPER
 *   Field      — SITE_ENGINEER, SUPERVISOR, QAQC_ENGINEER
 *   Sales      — SALES_MANAGER
 *   Finance    — ACCOUNTANT
 *   HR         — HR_MANAGER
 */
export type Persona =
  | "executive"
  | "ops"
  | "procurement"
  | "field"
  | "sales"
  | "finance"
  | "hr";

export function roleToPersona(role: string): Persona {
  switch (role) {
    case "OWNER":
    case "ADMIN":
    case "PROJECT_DIRECTOR":
    case "FINANCE_HEAD":
      return "executive";
    case "PROJECT_MANAGER":
      return "ops";
    case "PROCUREMENT_MANAGER":
    case "STORE_KEEPER":
      return "procurement";
    case "SITE_ENGINEER":
    case "SUPERVISOR":
    case "QAQC_ENGINEER":
      return "field";
    case "SALES_MANAGER":
      return "sales";
    case "ACCOUNTANT":
      return "finance";
    case "HR_MANAGER":
      return "hr";
    default:
      return "executive";
  }
}

/**
 * The tab bar for a given persona. 4-5 tabs + "More" link.
 * Executive and Sales use 4 tabs + More; the rest use 5 tabs.
 */
const PERSONA_TABS: Record<Persona, ModuleTab[]> = {
  // Executive — dashboards, inventory, search, HR, More (5 tabs)
  executive: [HOME_TAB, INVENTORY_TAB, SEARCH_TAB, HR_TAB, SETTINGS_TAB],
  // Ops — project management overview (5 tabs + search = 6, but we keep 5 by replacing)
  ops: [HOME_TAB, INVENTORY_TAB, SEARCH_TAB, SITE_TAB, SETTINGS_TAB],
  // Procurement — POs, search, stock, transfers, More (5 tabs)
  procurement: [INVENTORY_TAB, PROCUREMENT_TAB, SEARCH_TAB, STOCK_TAB, SETTINGS_TAB],
  // Field — site, DPR, search, tasks, More (5 tabs)
  field: [SITE_TAB, DPR_TAB, SEARCH_TAB, TASKS_TAB, SETTINGS_TAB],
  // Sales — home, sales, search, customers, More (5 tabs)
  sales: [HOME_TAB, SALES_TAB, SEARCH_TAB, CUSTOMERS_TAB, SETTINGS_TAB],
  // Finance — home, accounts, search, reports, More (5 tabs)
  finance: [HOME_TAB, ACCOUNTS_TAB, SEARCH_TAB, REPORTS_TAB, SETTINGS_TAB],
  // HR — HR, attendance, search, DPR, More (5 tabs)
  hr: [HR_TAB, ATTENDANCE_TAB, SEARCH_TAB, DPR_TAB, SETTINGS_TAB],
};

/**
 * Returns the tabs for the given role. Falls back to executive if the
 * role is unknown.
 */
export function tabsForRole(role: string): ModuleTab[] {
  return PERSONA_TABS[roleToPersona(role)] ?? PERSONA_TABS.executive;
}

/**
 * Union of ALL tabs that carry a badge, across every persona.
 * Used by MobileShellV2 to fetch badge counts in parallel —
 * regardless of which persona is active. (The old code only
 * fetched badges from MOBILE_TABS, which missed tabs like POs,
 * DPR, Tasks that aren't in the legacy 5-tab array.)
 */
export const ALL_BADGE_TABS: ModuleTab[] = [
  HOME_TAB,
  INVENTORY_TAB,
  HR_TAB,
  ACCOUNTS_TAB,
  SETTINGS_TAB,
  SITE_TAB,
  DPR_TAB,
  TASKS_TAB,
  STOCK_TAB,
  PROCUREMENT_TAB,
  TRANSFERS_TAB,
  SALES_TAB,
  CUSTOMERS_TAB,
  REPORTS_TAB,
  ATTENDANCE_TAB,
].filter((t) => t.badge);

/**
 * Maps any /m/* pathname to its parent module ID — the module
 * whose NavSheet group best represents the page the user is on.
 * Used for:
 *   1. NavSheet moduleId (so the sitemap opens to the right section)
 *   2. goBack() fallback (so back from /m/projects goes to the
 *      persona's relevant tab, not always /m/home)
 *
 * The mapping is based on the first path segment under /m/ and
 * which module owns that entity family.
 */
const PATH_TO_MODULE: Record<string, string> = {
  // Home module
  home: "home",
  pulse: "home",
  alerts: "home",
  queue: "home",
  me: "settings",
  // Inventory module (procurement + stock + real estate + construction)
  inventory: "inventory",
  procurement: "inventory",
  requisitions: "inventory",
  quotations: "inventory",
  suppliers: "inventory",
  "rate-contracts": "inventory",
  "supplier-returns": "inventory",
  materials: "inventory",
  stock: "inventory",
  "stock-locations": "inventory",
  "stock-counts": "inventory",
  transfers: "inventory",
  vehicles: "inventory",
  "scrap-generations": "inventory",
  "material-sales": "inventory",
  "gate-pass": "inventory",
  equipment: "inventory",
  "stock-out": "inventory",
  boq: "inventory",
  wbs: "inventory",
  "measurement-book": "inventory",
  "budget-variance": "inventory",
  "project-control": "inventory",
  "standard-consumptions": "inventory",
  "material-reconciliation": "inventory",
  "direct-purchases": "inventory",
  "goods-receipts": "inventory",
  departments: "inventory",
  "profit-center": "accounts",
  workflows: "home",
  // Real estate (lives under inventory module in NavSheet)
  projects: "inventory",
  units: "inventory",
  land: "inventory",
  permissions: "inventory",
  "portal-listings": "inventory",
  "work-orders": "inventory",
  "change-orders": "inventory",
  subcontractors: "inventory",
  "quality-control": "inventory",
  safety: "inventory",
  // HR module
  hr: "hr",
  attendance: "hr",
  dprs: "hr",
  employees: "hr",
  leaves: "hr",
  // Site (field) — maps to home for NavSheet (dashboards live there)
  site: "home",
  // Accounts module
  accounts: "accounts",
  books: "accounts",
  expenses: "accounts",
  // Sales/CRM — maps to home (sales links live in home NavSheet)
  sales: "home",
  customers: "home",
  leads: "home",
  rentals: "home",
  rent: "home",
  brokers: "home",
  // Reports — maps to home
  reports: "home",
  // Settings module
  settings: "settings",
};

export function moduleFromPath(pathname: string): string {
  // Strip /m/ prefix, take the first segment
  const seg = pathname.replace(/^\/m\//, "").split("/")[0] ?? "";
  return PATH_TO_MODULE[seg] ?? "home";
}

/**
 * Derive the best goBack fallback href for a given pathname + persona.
 * If the page belongs to one of the persona's tabs, go to that tab.
 * Otherwise, go to the persona's first tab (usually Home).
 */
export function goBackFallback(pathname: string, personaTabs: ModuleTab[]): string {
  const moduleId = moduleFromPath(pathname);
  // Try to find a persona tab whose ID matches the module
  const match = personaTabs.find((t) => t.id === moduleId);
  if (match) return match.href;
  // Try to find a persona tab whose href is a prefix of the pathname
  const prefixMatch = personaTabs.find((t) => isModuleActive(pathname, t.href));
  if (prefixMatch) return prefixMatch.href;
  // Fall back to the first tab (usually Home)
  return personaTabs[0]?.href ?? "/m/home";
}

// ── Legacy: all tabs (for backward compatibility) ───────────────────

export const MOBILE_TABS: ModuleTab[] = [
  HOME_TAB,
  INVENTORY_TAB,
  HR_TAB,
  ACCOUNTS_TAB,
  SETTINGS_TAB,
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
  /**
   * If set, this group is only shown to these personas.
   * If omitted, the group is shown to all personas.
   * This prevents the Procore anti-pattern where a store keeper
   * sees 20 tools they'll never use (Real Estate, BOQ, Safety, etc.).
   */
  personas?: Persona[];
}

export const NAV_GROUPS: Record<string, NavGroup[]> = {
  home: [
    {
      title: "Dashboards",
      links: [
        { href: "/m/pulse", icon: Sun, label: "Executive Dashboard", subtitle: "Portfolio KPIs, project health, approvals" },
        { href: "/m/site", icon: MapPin, label: "Field Dashboard", subtitle: "Tasks, DPR, in-transit, attendance" },
      ],
    },
    {
      title: "Attention",
      links: [
        { href: "/m/pulse/attention", icon: AlertTriangle, label: "Attention Queue", subtitle: "All alerts in one place" },
        { href: "/m/pulse/approvals", icon: ClipboardCheck, label: "Approvals", subtitle: "POs, requisitions awaiting sign-off" },
      ],
    },
    {
      title: "Quick Access",
      links: [
        { href: "/m/inventory", icon: Boxes, label: "Inventory", subtitle: "Raw material + real estate" },
        { href: "/m/hr", icon: Users, label: "People", subtitle: "Attendance, DPR, employees" },
        { href: "/m/accounts", icon: BookOpen, label: "Accounts", subtitle: "Finance, GL, receipts" },
        { href: "/m/settings", icon: Settings, label: "Settings", subtitle: "Profile, team, company" },
        { href: "/m/workflows", icon: Workflow, label: "Workflows", subtitle: "Automate repetitive tasks — schedule and run" },
      ],
    },
    {
      title: "Projects & Real Estate",
      personas: ["executive", "ops", "sales"],
      links: [
        { href: "/m/projects", icon: Building2, label: "Projects", subtitle: "Active developments" },
        { href: "/m/land", icon: LandPlot, label: "Land & Parcels", subtitle: "Plots, partitions, valuation" },
        { href: "/m/sales", icon: ShoppingCart, label: "Sales & CRM", subtitle: "Leads, bookings, collections" },
        { href: "/m/rentals", icon: Building2, label: "Rentals", subtitle: "Rented units, agreements" },
        { href: "/m/customers", icon: Users, label: "Customers", subtitle: "Buyers, contacts" },
      ],
    },
    {
      title: "Inventory & Procurement",
      personas: ["executive", "ops", "procurement", "field"],
      links: [
        { href: "/m/requisitions", icon: ShoppingCart, label: "Material Indents", subtitle: "Site needs → approve → convert to PO" },
        { href: "/m/quotations", icon: FileText, label: "Quotation Requests", subtitle: "Compare vendor prices" },
        { href: "/m/procurement", icon: FileText, label: "Purchase Orders", subtitle: "Draft, ordered, receive goods" },
        { href: "/m/materials", icon: Boxes, label: "Materials & Stock", subtitle: "Catalogue, current stock by location" },
        { href: "/m/stock-out", icon: ArrowLeftRight, label: "Move Stock", subtitle: "Transfer or issue stock" },
        { href: "/m/suppliers", icon: Truck, label: "Suppliers", subtitle: "Vendors, balances" },
        { href: "/m/equipment", icon: Wrench, label: "Equipment", subtitle: "Tools, assignments" },
      ],
    },
    {
      title: "Reports",
      links: [
        { href: "/m/reports", icon: FileSpreadsheet, label: "All Reports", subtitle: "Complete report hub" },
      ],
    },
  ],
  inventory: [
    {
      // Procurement flow follows the business muscle-memory:
      // Indent → Quotation → PO → (Receive is inside PO detail)
      title: "Procurement Flow",
      personas: ["executive", "ops", "procurement", "field"],
      links: [
        { href: "/m/requisitions", icon: ShoppingCart, label: "Material Indents", subtitle: "Site needs → approve → convert to PO" },
        { href: "/m/quotations", icon: FileText, label: "Quotation Requests", subtitle: "Compare vendor prices, auto-create PO" },
        { href: "/m/procurement", icon: FileText, label: "Purchase Orders", subtitle: "Draft, ordered, received — receive goods here" },
        { href: "/m/suppliers", icon: Truck, label: "Suppliers", subtitle: "Vendors, ratings, balances" },
        { href: "/m/rate-contracts", icon: FileText, label: "Rate Contracts", subtitle: "Fixed-rate supplier agreements" },
        { href: "/m/supplier-returns", icon: AlertTriangle, label: "Supplier Returns", subtitle: "Return to vendor" },
      ],
    },
    {
      // Materials + Stock merged into one group (owner: "ये एक ही तो बात है")
      // Issue + Transfer merged into one "Move Stock" link → /m/stock-out
      title: "Materials & Stock",
      personas: ["executive", "ops", "procurement", "field"],
      links: [
        { href: "/m/materials", icon: Boxes, label: "Materials & Stock", subtitle: "Catalogue, current stock by location" },
        { href: "/m/stock-out", icon: ArrowLeftRight, label: "Move Stock", subtitle: "Transfer to location or issue to project" },
        { href: "/m/stock-locations/new", icon: Warehouse, label: "Add Stock Location", subtitle: "New warehouse or project site" },
        { href: "/m/site/stock", icon: Package, label: "Site Stock", subtitle: "Stock by site + movements" },
        { href: "/m/stock-counts", icon: ClipboardCheck, label: "Stock Counts", subtitle: "Cycle counts, reconciliation" },
        { href: "/m/scrap-generations", icon: Wrench, label: "Scrap / Create", subtitle: "Internally generated material" },
        { href: "/m/material-sales", icon: TrendingUp, label: "Material Sales", subtitle: "Sell raw material directly" },
        { href: "/m/gate-pass", icon: ShieldCheck, label: "Gate Pass", subtitle: "Approve items leaving the gate" },
        { href: "/m/equipment", icon: Wrench, label: "Equipment", subtitle: "Tools, assignments, maintenance" },
        { href: "/m/vehicles", icon: Truck, label: "Vehicles", subtitle: "Auto-built vehicle master + trip log" },
        { href: "/m/departments", icon: BuildingIcon, label: "Departments", subtitle: "Operational cost centers — workshop, lab, manufacturing" },
      ],
    },
    {
      title: "Real Estate",
      personas: ["executive", "ops", "sales"],
      links: [
        { href: "/m/projects", icon: Building2, label: "Projects", subtitle: "Active developments" },
        { href: "/m/units", icon: Package, label: "Built Units", subtitle: "Available, sold, rented" },
        { href: "/m/land", icon: LandPlot, label: "Land & Parcels", subtitle: "Plots, partitions, valuation" },
        { href: "/m/permissions", icon: Scale, label: "Permissions & Legal", subtitle: "NOCs, licenses, certificates, expiry alerts" },
        { href: "/m/customers", icon: Users, label: "Customers", subtitle: "Buyers, contacts, payments" },
        { href: "/m/sales", icon: ShoppingCart, label: "Sales & CRM", subtitle: "Leads, bookings, follow-ups, collections" },
        { href: "/m/brokers", icon: Briefcase, label: "Brokers", subtitle: "Agents, commission %, deals" },
        { href: "/m/rentals", icon: Building2, label: "Rentals", subtitle: "Rented units, agreements" },
        { href: "/m/work-orders", icon: Wrench, label: "Work Orders", subtitle: "Subcontractor scope & RA bills" },
        { href: "/m/change-orders", icon: GitBranch, label: "Change Orders", subtitle: "Scope & budget modifications" },
        { href: "/m/quality-control", icon: ClipboardCheck, label: "Quality Control", subtitle: "NCRs & CAPA" },
        { href: "/m/portal-listings", icon: TrendingUp, label: "Portal Listings", subtitle: "99acres, MagicBricks sync" },
      ],
    },
    {
      title: "Construction",
      personas: ["executive", "ops", "field"],
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
      title: "Safety",
      personas: ["executive", "ops", "field"],
      links: [
        { href: "/m/safety", icon: HardHat, label: "Safety Management", subtitle: "Hazards, incidents, inspections" },
      ],
    },
    {
      title: "Dashboards",
      links: [
        { href: "/m/pulse", icon: Sun, label: "Executive Dashboard", subtitle: "Portfolio KPIs, project health, approvals" },
        { href: "/m/site", icon: MapPin, label: "Field Dashboard", subtitle: "Tasks, DPR, in-transit, attendance" },
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
      personas: ["executive", "ops", "procurement", "finance"],
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
      personas: ["executive", "ops", "hr", "field"],
      links: [
        { href: "/m/attendance", icon: Calendar, label: "Attendance", subtitle: "Today's headcount, GPS-tagged" },
        { href: "/m/site/attendance", icon: Calendar, label: "Mark Attendance", subtitle: "Bulk check-in with GPS" },
      ],
    },
    {
      title: "Daily Progress Report",
      personas: ["executive", "ops", "hr", "field"],
      links: [
        { href: "/m/dprs", icon: ClipboardList, label: "Daily Progress Reports", subtitle: "All reports, approval status" },
        { href: "/m/site/dpr", icon: ClipboardList, label: "New Daily Progress Report", subtitle: "Submit a new report" },
      ],
    },
    {
      title: "People",
      personas: ["executive", "ops", "hr"],
      links: [
        { href: "/m/hr/employees", icon: User, label: "Employees", subtitle: "All workers, trades, wages" },
        { href: "/m/hr/leaves", icon: CalendarDays, label: "Leaves", subtitle: "Leave records & approvals" },
        { href: "/m/site/me", icon: User, label: "My Profile", subtitle: "Supervisor profile" },
        { href: "/m/site/tasks", icon: ClipboardCheck, label: "My Tasks", subtitle: "Assigned tasks" },
      ],
    },
    {
      title: "Reports & Analysis",
      personas: ["executive", "ops", "hr", "finance"],
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
      personas: ["executive", "ops", "finance"],
      links: [
        { href: "/m/accounts", icon: Receipt, label: "Finance Home", subtitle: "GL, receipts, payroll overview" },
        { href: "/m/books/finance", icon: Wallet, label: "Finance", subtitle: "Expenses & project costs" },
        { href: "/m/books/receipts", icon: Receipt, label: "Receipts", subtitle: "Payment receipts" },
        { href: "/m/books/payroll", icon: Wallet, label: "Payroll", subtitle: "Salary processing" },
        { href: "/m/profit-center", icon: TrendingUp, label: "Profit Center", subtitle: "Per-project revenue, cost, and margin analysis" },
      ],
    },
    {
      title: "Ledger & Reports",
      personas: ["executive", "ops", "finance"],
      links: [
        { href: "/m/books/gl", icon: BookIcon, label: "Trial Balance", subtitle: "All accounts" },
        { href: "/m/books/reports", icon: TrendingUp, label: "Analytics", subtitle: "Key metrics at a glance" },
        { href: "/m/reports", icon: BarChart3, label: "Reports Hub", subtitle: "All report links in one place" },
      ],
    },
    {
      title: "Reports & Analysis",
      personas: ["executive", "ops", "finance"],
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
        { href: "/m/queue", icon: ClipboardList, label: "Offline Queue", subtitle: "Pending sync items & recent actions" },
      ],
    },
    {
      title: "Administration",
      personas: ["executive"],
      links: [
        { href: "/m/settings/company", icon: Building2, label: "Company Details", subtitle: "Name, GSTIN, PAN, address, phone" },
        { href: "/m/settings/team", icon: Users, label: "Team & Permissions", subtitle: "Users, roles, access control" },
        { href: "/m/settings/export", icon: FileText, label: "Bulk Export", subtitle: "CSV/PDF data export" },
        { href: "/m/settings/notifications", icon: AlertTriangle, label: "Notifications", subtitle: "Alerts, templates, delivery" },
        { href: "/m/settings/project-assignments", icon: ShieldCheck, label: "Project Assignments", subtitle: "Scope user access to specific projects" },
      ],
    },
  ],
};

/**
 * Returns the NavGroups for a given module, filtered by persona.
 * Groups without a `personas` field are shown to everyone. Groups
 * with a `personas` field are only shown if the current persona is
 * in the list. This prevents the Procore anti-pattern where a store
 * keeper sees 20 tools they'll never use.
 */
export function navGroupsForPersona(moduleId: string, persona: Persona): NavGroup[] {
  const groups = NAV_GROUPS[moduleId] ?? NAV_GROUPS.home ?? [];
  return groups.filter((g) => !g.personas || g.personas.includes(persona));
}
