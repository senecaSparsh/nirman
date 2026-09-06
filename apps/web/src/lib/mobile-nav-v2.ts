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
  Phone,
  PhoneIncoming,
  Banknote,
  Coins,
  MessageSquare,
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
  // Badge = draft POs awaiting approval (actionable count, not total POs)
  badge: { endpoint: "/api/purchase-orders?status=DRAFT" },
};
const HR_TAB: ModuleTab = { id: "hr", label: "HR", href: "/m/hr", icon: Users };
const ACCOUNTS_TAB: ModuleTab = { id: "accounts", label: "Accounts", href: "/m/accounts", icon: BookOpen };
const SETTINGS_TAB: ModuleTab = { id: "settings", label: "More", href: "/m/settings", icon: Settings };
const SITE_TAB: ModuleTab = { id: "site", label: "Site", href: "/m/site", icon: MapPin };
const DPR_TAB: ModuleTab = {
  id: "dpr",
  label: "DPR",
  href: "/m/hr?tab=dprs",
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
const TRANSFERS_TAB: ModuleTab = { id: "transfers", label: "Transfers", href: "/m/stock?tab=transfers", icon: ArrowLeftRight };
const SALES_TAB: ModuleTab = { id: "sales", label: "Sales", href: "/m/sales", icon: ShoppingCart };
const CUSTOMERS_TAB: ModuleTab = { id: "customers", label: "Customers", href: "/m/customers", icon: Users };
const REPORTS_TAB: ModuleTab = { id: "reports", label: "Reports", href: "/m/reports", icon: BarChart3 };
const ATTENDANCE_TAB: ModuleTab = { id: "attendance", label: "Attendance", href: "/m/hr?tab=attendance", icon: Calendar };

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
  // Ops — inventory, stock ledger, search, site dashboard, More (5 tabs)
  // PROJECT_MANAGER needs direct stock access at project sites.
  // Home (orbit) is accessible via NavSheet → Dashboards.
  ops: [INVENTORY_TAB, STOCK_TAB, SEARCH_TAB, SITE_TAB, SETTINGS_TAB],
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
  // Real estate hub (lives under inventory module in NavSheet)
  "real-estate": "inventory",
  projects: "inventory",
  units: "inventory",
  land: "inventory",
  permissions: "inventory",
  "portal-listings": "inventory",
  // Construction hub (lives under inventory module in NavSheet)
  construction: "inventory",
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
  // Calls — maps to home (call log link lives in home NavSheet)
  calls: "home",
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
  // Strip query string from href — tab hrefs like "/m/hr?tab=attendance"
  // should match pathname "/m/hr" (pathname never includes the query).
  const hrefPath = href.split("?")[0];
  if (pathname === hrefPath) return true;
  return pathname.startsWith(hrefPath + "/");
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
        { href: "/m/real-estate?tab=projects", icon: Building2, label: "Real Estate Hub", subtitle: "Projects, units, land, customers, rentals" },
        { href: "/m/sales", icon: ShoppingCart, label: "Sales & CRM", subtitle: "Leads, bookings, collections" },
        { href: "/m/leads", icon: TrendingUp, label: "Lead Pipeline", subtitle: "Stage, priority, follow-up triage" },
        { href: "/m/crm", icon: Users, label: "CRM Hub", subtitle: "Leads, calls, customers in one place" },
      ],
    },
    {
      title: "Inventory & Procurement",
      personas: ["executive", "ops", "procurement", "field"],
      links: [
        { href: "/m/procurement?tab=indents", icon: ShoppingCart, label: "Material Indents", subtitle: "Site needs → approve → convert to PO" },
        { href: "/m/procurement?tab=quotations", icon: FileText, label: "Quotation Requests", subtitle: "Compare vendor prices" },
        { href: "/m/procurement", icon: FileText, label: "Purchase Orders", subtitle: "Draft, ordered, receive goods" },
        { href: "/m/materials", icon: Boxes, label: "Materials & Stock", subtitle: "Catalogue, current stock by location" },
        { href: "/m/stock", icon: Package, label: "Stock", subtitle: "Ledger, transfers, counts, scrap" },
        { href: "/m/stock-out", icon: ArrowLeftRight, label: "Move Stock", subtitle: "Transfer or issue stock" },
        { href: "/m/suppliers", icon: Truck, label: "Suppliers", subtitle: "Vendors, balances" },
        { href: "/m/equipment", icon: Wrench, label: "Equipment", subtitle: "Tools, assignments" },
      ],
    },
    {
      title: "Finance & Books",
      personas: ["executive", "finance"],
      links: [
        { href: "/m/accounts", icon: BookOpen, label: "Accounts Hub", subtitle: "Expenses, claims, payments, receipts, GL" },
        { href: "/m/books/finance", icon: Wallet, label: "Supplier Invoices", subtitle: "Bills, GRN-based invoicing" },
        { href: "/m/books/gl", icon: BookIcon, label: "General Ledger", subtitle: "Chart of accounts, trial balance" },
        { href: "/m/books/receipts", icon: Receipt, label: "Receipts Ledger", subtitle: "Payment receipts — asset & material sales" },
        { href: "/m/sms", icon: MessageSquare, label: "Bank SMS", subtitle: "Auto-parse bank SMS into payments" },
        { href: "/m/profit-center", icon: TrendingUp, label: "Profit Center", subtitle: "Per-project revenue, cost, margin" },
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
      // Indent → Quotation → PO → Returns — all tabs within /m/procurement
      title: "Procurement Flow",
      personas: ["executive", "ops", "procurement", "field"],
      links: [
        { href: "/m/procurement?tab=indents", icon: ShoppingCart, label: "Material Indents", subtitle: "Site needs → approve → convert to PO" },
        { href: "/m/procurement?tab=quotations", icon: FileText, label: "Quotation Requests", subtitle: "Compare vendor prices, auto-create PO" },
        { href: "/m/procurement", icon: FileText, label: "Purchase Orders", subtitle: "Draft, ordered, received — receive goods here" },
        { href: "/m/suppliers", icon: Truck, label: "Suppliers", subtitle: "Vendors, ratings, balances" },
        { href: "/m/rate-contracts", icon: FileText, label: "Rate Contracts", subtitle: "Fixed-rate supplier agreements" },
        { href: "/m/procurement?tab=returns", icon: AlertTriangle, label: "Supplier Returns", subtitle: "Return to vendor" },
      ],
    },
    {
      // Materials + Stock merged into one group (owner: "ये एक ही तो बात है")
      // Issue + Transfer merged into one "Move Stock" link → /m/stock-out
      title: "Materials & Stock",
      personas: ["executive", "ops", "procurement", "field"],
      links: [
        { href: "/m/materials", icon: Boxes, label: "Materials & Stock", subtitle: "Catalogue, current stock by location" },
        { href: "/m/stock", icon: Package, label: "Stock", subtitle: "Ledger, transfers, counts, scrap — all in one" },
        { href: "/m/stock-out", icon: ArrowLeftRight, label: "Move Stock", subtitle: "Transfer to location or issue to project" },
        { href: "/m/stock-locations", icon: Warehouse, label: "Stock Locations", subtitle: "Warehouses, project sites, add new" },
        { href: "/m/site/stock", icon: Package, label: "Site Stock", subtitle: "Stock by site + movements" },
        { href: "/m/material-sales", icon: TrendingUp, label: "Material Sales", subtitle: "Sell raw material directly" },
        { href: "/m/gate-pass", icon: ShieldCheck, label: "Gate Pass", subtitle: "Approve items leaving the gate" },
        { href: "/m/equipment", icon: Wrench, label: "Equipment", subtitle: "Tools, assignments, maintenance" },
        { href: "/m/vehicles", icon: Truck, label: "Vehicles", subtitle: "Auto-built vehicle master + trip log" },
        { href: "/m/departments", icon: BuildingIcon, label: "Departments", subtitle: "Operational cost centers — workshop, lab, manufacturing" },
      ],
    },
    {
      title: "Real Estate Hub",
      personas: ["executive", "ops", "sales"],
      links: [
        { href: "/m/real-estate?tab=projects", icon: Building2, label: "Projects", subtitle: "Active developments" },
        { href: "/m/real-estate?tab=units", icon: Package, label: "Built Units", subtitle: "Available, sold, rented" },
        { href: "/m/real-estate?tab=land", icon: LandPlot, label: "Land & Parcels", subtitle: "Plots, partitions, valuation" },
        { href: "/m/real-estate?tab=customers", icon: Users, label: "Customers", subtitle: "Buyers, contacts, payments" },
        { href: "/m/real-estate?tab=brokers", icon: Briefcase, label: "Brokers", subtitle: "Agents, commission %, deals" },
        { href: "/m/real-estate?tab=rentals", icon: Building2, label: "Rentals", subtitle: "Rented units, agreements" },
        { href: "/m/permissions", icon: Scale, label: "Permissions & Legal", subtitle: "NOCs, licenses, certificates, expiry alerts" },
        { href: "/m/sales", icon: ShoppingCart, label: "Sales & CRM", subtitle: "Leads, bookings, follow-ups, collections" },
        { href: "/m/leads", icon: TrendingUp, label: "Lead Pipeline", subtitle: "Stage, priority, follow-up triage" },
        { href: "/m/crm", icon: Users, label: "CRM Hub", subtitle: "Leads, calls, customers in one place" },
        { href: "/m/portal-listings", icon: TrendingUp, label: "Portal Listings", subtitle: "99acres, MagicBricks sync" },
      ],
    },
    {
      title: "Construction Hub",
      personas: ["executive", "ops", "field"],
      links: [
        { href: "/m/construction?tab=work-orders", icon: Wrench, label: "Work Orders", subtitle: "Subcontractor scope & RA bills" },
        { href: "/m/subcontractors", icon: HardHat, label: "Subcontractors", subtitle: "Subcontractor master, scope, RA bills" },
        { href: "/m/construction?tab=change-orders", icon: GitBranch, label: "Change Orders", subtitle: "Scope & budget modifications" },
        { href: "/m/construction?tab=quality", icon: ClipboardCheck, label: "Quality Control", subtitle: "NCRs & CAPA" },
        { href: "/m/construction?tab=safety", icon: HardHat, label: "Safety", subtitle: "Hazards, incidents, inspections" },
        { href: "/m/construction?tab=boq", icon: FileText, label: "Bill of Quantities", subtitle: "BOQ items, rates, amounts" },
        { href: "/m/construction?tab=wbs", icon: ListTree, label: "WBS", subtitle: "Project task hierarchy" },
        { href: "/m/construction?tab=mb", icon: BookOpen, label: "Measurement Book", subtitle: "Measured work entries" },
      ],
    },
    {
      title: "Project Control",
      personas: ["executive", "ops", "field"],
      links: [
        { href: "/m/budget-variance", icon: TrendingUp, label: "Budget Variance", subtitle: "Budget vs actual analysis" },
        { href: "/m/project-control", icon: Gauge, label: "Project Control", subtitle: "Earned value: CPI, SPI, EAC" },
        { href: "/m/standard-consumptions", icon: Beaker, label: "Standard Consumptions", subtitle: "Material consumption benchmarks" },
        { href: "/m/material-reconciliation", icon: Package, label: "Material Reconciliation", subtitle: "Required vs issued vs consumed" },
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
      title: "HR Hub",
      personas: ["executive", "ops", "hr", "field"],
      links: [
        { href: "/m/hr", icon: Users, label: "HR Overview", subtitle: "Dashboard, attention, workforce" },
        { href: "/m/hr?tab=attendance", icon: Calendar, label: "Attendance", subtitle: "Today's headcount, GPS-tagged" },
        { href: "/m/hr?tab=dprs", icon: ClipboardList, label: "DPRs", subtitle: "Daily progress reports & approvals" },
        { href: "/m/hr?tab=employees", icon: User, label: "Employees", subtitle: "All workers, trades, wages" },
        { href: "/m/hr?tab=leaves", icon: CalendarDays, label: "Leaves", subtitle: "Leave records & approvals" },
        { href: "/m/hr?tab=payroll", icon: Wallet, label: "Payroll", subtitle: "Salary periods & processing" },
      ],
    },
    {
      title: "Field Actions",
      personas: ["executive", "ops", "hr", "field"],
      links: [
        { href: "/m/site/attendance", icon: Calendar, label: "Mark Attendance", subtitle: "Bulk check-in with GPS" },
        { href: "/m/site/dpr", icon: ClipboardList, label: "New DPR", subtitle: "Submit a new daily progress report" },
        { href: "/m/site/me", icon: User, label: "My Profile", subtitle: "Supervisor profile" },
        { href: "/m/site/tasks", icon: ClipboardCheck, label: "My Tasks", subtitle: "Assigned tasks" },
      ],
    },
    {
      title: "Reports & Analysis",
      personas: ["executive", "ops", "hr", "finance"],
      links: [
        { href: "/m/reports/payroll-expense", icon: Wallet, label: "Payroll Expense", subtitle: "Monthly payroll by trade/crew" },
        { href: "/m/hr?tab=attendance", icon: Calendar, label: "Attendance Summary", subtitle: "Headcount, present %, GPS audit" },
        { href: "/m/hr?tab=dprs", icon: ClipboardList, label: "DPR Analysis", subtitle: "All reports, approval status" },
        { href: "/m/standard-consumptions", icon: Beaker, label: "Standard vs Actual", subtitle: "Consumption benchmarks + variance" },
        { href: "/m/reports", icon: FileSpreadsheet, label: "All Reports", subtitle: "Complete report hub" },
      ],
    },
  ],
  accounts: [
    {
      title: "Finance Hub",
      personas: ["executive", "ops", "finance"],
      links: [
        { href: "/m/accounts", icon: Receipt, label: "Finance Overview", subtitle: "Cash flow, payables, Tally sync" },
        { href: "/m/accounts?tab=expenses", icon: Wallet, label: "Expenses", subtitle: "Company expense log" },
        { href: "/m/accounts?tab=claims", icon: Receipt, label: "Expense Claims", subtitle: "Employee reimbursement claims" },
        { href: "/m/accounts?tab=petty-cash", icon: Coins, label: "Petty Cash", subtitle: "Site cash floats & top-ups" },
        { href: "/m/accounts?tab=payments", icon: Banknote, label: "Supplier Payments", subtitle: "Payments made to vendors" },
        { href: "/m/accounts?tab=receipts", icon: Receipt, label: "Receipts", subtitle: "Payment receipts" },
        { href: "/m/accounts?tab=gl", icon: BookIcon, label: "Trial Balance", subtitle: "All accounts" },
      ],
    },
    {
      title: "Other Finance",
      personas: ["executive", "ops", "finance"],
      links: [
        { href: "/m/hr?tab=payroll", icon: Wallet, label: "Payroll", subtitle: "Salary processing" },
        { href: "/m/profit-center", icon: TrendingUp, label: "Profit Center", subtitle: "Per-project revenue, cost, and margin analysis" },
        { href: "/m/books/reports", icon: TrendingUp, label: "Analytics", subtitle: "Key metrics at a glance" },
        { href: "/m/reports", icon: BarChart3, label: "Reports Hub", subtitle: "All report links in one place" },
      ],
    },
    {
      title: "Books (Ledger)",
      personas: ["executive", "finance"],
      links: [
        { href: "/m/books/finance", icon: Wallet, label: "Supplier Invoices", subtitle: "Bills, GRN-based invoicing" },
        { href: "/m/books/gl", icon: BookIcon, label: "General Ledger", subtitle: "Chart of accounts, trial balance" },
        { href: "/m/books/payroll", icon: Wallet, label: "Payroll Ledger", subtitle: "Payroll periods, salary breakdown" },
        { href: "/m/books/receipts", icon: Receipt, label: "Receipts Ledger", subtitle: "Payment receipts — asset & material sales" },
        { href: "/m/sms", icon: MessageSquare, label: "Bank SMS", subtitle: "Auto-parse bank SMS into payments" },
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
        { href: "/m/telephony", icon: Phone, label: "Telephony", subtitle: "Phone numbers, providers, consent" },
        { href: "/m/calls", icon: PhoneIncoming, label: "Call Log", subtitle: "Call history, recordings, tags" },
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

/**
 * Metadata for all navigation modules — used by the NavSheet to render
 * the accordion section headers. Each module has an id (matching the
 * NAV_GROUPS key), a display label, and an icon.
 */
export interface NavModule {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const ALL_NAV_MODULES: NavModule[] = [
  { id: "home", label: "Home & Dashboards", icon: Home },
  { id: "inventory", label: "Inventory & Procurement", icon: Boxes },
  { id: "hr", label: "HR & Field", icon: Users },
  { id: "accounts", label: "Accounts & Finance", icon: BookOpen },
  { id: "settings", label: "Settings & Admin", icon: Settings },
];

/**
 * Returns ALL modules' NavGroups, each filtered by persona.
 * Used by the NavSheet's accordion view — shows all modules as
 * collapsible sections, so the user can browse any module's pages
 * without navigating away.
 */
export function allNavGroupsForPersona(persona: Persona): Record<string, NavGroup[]> {
  const result: Record<string, NavGroup[]> = {};
  for (const mod of ALL_NAV_MODULES) {
    const groups = navGroupsForPersona(mod.id, persona);
    // Skip modules that have zero visible groups for this persona
    if (groups.length > 0) {
      result[mod.id] = groups;
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════════════════════
   WORKFLOW LINKS — contextual cross-module navigation

   Maps a page (or page prefix) to its workflow neighbors. When the user
   is on a page, the NavSheet shows a "Related" section with these links,
   so they can jump to the next step in the workflow without scrolling
   through the accordion.

   This follows the IA research recommendation: "add contextual cross-links
   at the bottom of each hub page — not in the NavSheet, but inline where
   the workflow actually happens." We put them in the NavSheet's "Related"
   section instead (safer — no page modifications needed).

   Key workflows:
   - Procurement: Indent → Quotation → PO → Receive (GRN) → Issue
   - Construction: BOQ → Work Order → DPR → Measurement Book
   - Sales: Lead → Quotation → Sale → Receipt
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Maps a path prefix to related workflow pages.
 * Key = path prefix (matched against current pathname).
 * Value = list of hrefs that are the next/previous steps in the workflow.
 */
export const WORKFLOW_LINKS: Record<string, string[]> = {
  // ── Procurement flow ──
  "/m/requisitions": ["/m/procurement?tab=quotations", "/m/procurement", "/m/suppliers"],
  "/m/quotations": ["/m/procurement", "/m/suppliers", "/m/rate-contracts"],
  "/m/procurement": ["/m/requisitions", "/m/procurement?tab=quotations", "/m/suppliers", "/m/stock"],
  "/m/suppliers": ["/m/procurement", "/m/rate-contracts", "/m/supplier-returns"],

  // ── Stock flow (receive → issue → transfer) ──
  "/m/stock": ["/m/stock-out", "/m/transfers", "/m/stock-counts", "/m/materials"],
  "/m/materials": ["/m/stock", "/m/stock-out", "/m/procurement"],
  "/m/stock-out": ["/m/stock", "/m/material-issues", "/m/transfers"],

  // ── Construction flow ──
  "/m/boq": ["/m/wbs", "/m/measurement-book", "/m/construction?tab=work-orders"],
  "/m/wbs": ["/m/boq", "/m/measurement-book", "/m/construction?tab=work-orders"],
  "/m/measurement-book": ["/m/boq", "/m/wbs", "/m/dprs"],
  "/m/work-orders": ["/m/subcontractors", "/m/measurement-book", "/m/budget-variance"],
  "/m/subcontractors": ["/m/work-orders", "/m/construction?tab=change-orders"],

  // ── Sales flow ──
  "/m/leads": ["/m/quotations", "/m/sales", "/m/customers", "/m/crm"],
  "/m/sales": ["/m/leads", "/m/customers", "/m/portal-listings", "/m/crm"],
  "/m/customers": ["/m/sales", "/m/leads", "/m/rentals"],

  // ── HR flow ──
  "/m/dprs": ["/m/measurement-book", "/m/hr?tab=attendance", "/m/site/dpr"],
  "/m/hr": ["/m/site/attendance", "/m/site/dpr", "/m/site/tasks"],

  // ── Finance flow ──
  "/m/accounts": ["/m/books/finance", "/m/books/gl", "/m/sms", "/m/profit-center"],
  "/m/books/finance": ["/m/accounts?tab=payments", "/m/suppliers", "/m/books/gl"],
  "/m/books/gl": ["/m/accounts", "/m/books/finance", "/m/reports/profit"],

  // ── Project control ──
  "/m/budget-variance": ["/m/project-control", "/m/reports/job-costing", "/m/material-reconciliation"],
  "/m/project-control": ["/m/budget-variance", "/m/reports/project-progress", "/m/standard-consumptions"],
};

/**
 * Returns workflow-related links for a given pathname.
 * Matches the longest prefix in WORKFLOW_LINKS.
 */
export function workflowLinksForPath(pathname: string): string[] {
  // Try exact match first, then progressively shorter prefixes
  let bestMatch: string | null = null;
  for (const prefix of Object.keys(WORKFLOW_LINKS)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      // Pick the longest matching prefix
      if (!bestMatch || prefix.length > bestMatch.length) {
        bestMatch = prefix;
      }
    }
  }
  return bestMatch ? (WORKFLOW_LINKS[bestMatch] ?? []) : [];
}

/**
 * Flat list of ALL navigable links from all NAV_GROUPS.
 * Used by the global search to index page titles + subtitles so any
 * page is one search away (the universal reachability safety net).
 */
export const ALL_NAV_LINKS: NavLink[] = (() => {
  const seen = new Set<string>();
  const links: NavLink[] = [];
  for (const groups of Object.values(NAV_GROUPS)) {
    for (const group of groups) {
      for (const link of group.links) {
        if (!seen.has(link.href)) {
          seen.add(link.href);
          links.push(link);
        }
      }
    }
  }
  return links;
})();
