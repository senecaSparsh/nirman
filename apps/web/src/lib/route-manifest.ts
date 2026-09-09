/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTE MANIFEST — the single source of truth for mobile navigation.
 *
 * One entry per route under `app/m`. Every navigation surface is a
 * *projection* of this list; nothing about navigation is maintained by hand
 * twice. See `docs/NAVIGATION.md` for the full rationale and migration plan.
 *
 * Derived from this file (Phase 2 onward):
 *   header title, Up target, breadcrumbs, menu tree, active tab,
 *   search page-index, command palette, badge endpoints, Related links.
 *
 * Replaces (Phase 2 deletes these):
 *   NAV_GROUPS, PATH_TO_MODULE, WORKFLOW_LINKS   — lib/mobile-nav-v2.ts
 *   TITLE_MAP                                    — mobile-shell.tsx
 *   MODULE_GROUP_MAP                             — nav-sheet.tsx
 *
 * ── ADDING A ROUTE ────────────────────────────────────────────────────────
 * Create `app/m/<path>/page.tsx` AND add an entry here. The guard tests in
 * `route-manifest.test.ts` fail the build if you do one without the other —
 * that is the whole point of this file. 43% of routes had drifted out of the
 * old hand-maintained maps before it existed.
 *
 * ── INVARIANTS (enforced by route-manifest.test.ts) ───────────────────────
 *   G1  every page.tsx has an entry, and every entry has a page.tsx
 *   G2  every route is ≤3 hops from a tab root for at least one persona
 *   G3  exactly one tab resolves active for every route × persona
 *   G4  `parent` is a strict path ancestor or a declared hub; no cycles;
 *       never points at a redirect stub
 *   G5  routes sharing a list component declare each other in
 *       `sharesListWith` (two URLs for one concept — Phase 3 resolves them)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { LucideIcon } from "lucide-react";
import type { FlowId } from "@/lib/flow-map";
import type { Persona } from "@/lib/mobile-nav-v2";

import {
  AlertTriangle,
  ArrowLeftRight,
  Award,
  Banknote,
  BarChart3,
  Beaker,
  BookOpen,
  Boxes,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarOff,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  Contact,
  DoorOpen,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  GitBranch,
  Globe,
  Hammer,
  Handshake,
  HardHat,
  Home,
  Inbox,
  IndianRupee,
  Key,
  Landmark,
  LifeBuoy,
  ListChecks,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Network,
  Package,
  Phone,
  PhoneIncoming,
  PieChart,
  Receipt,
  Ruler,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Tags,
  TrendingUp,
  Trash2,
  Truck,
  Undo2,
  User,
  UserPlus,
  Users,
  Wallet,
  Warehouse,
  Workflow,
  Wrench,
} from "lucide-react";

/** Wayfinding group. Drives menu section, colour, and module resolution. */
export type ModuleId = "home" | "inventory" | "hr" | "accounts" | "settings";

export type RouteKind =
  /** A landing page with sub-navigation of its own. */
  | "hub"
  /** A list/register of records. */
  | "list"
  /** A single record. Title is overridden at runtime by the entity label. */
  | "detail"
  | "create"
  | "edit"
  /** Lives under /m/reports — grouped separately in the menu. */
  | "report"
  /** A single-purpose utility screen (scanner, queue, profile). */
  | "tool"
  /** No UI — redirects elsewhere. Excluded from menus, search and Up targets. */
  | "redirect";

export interface RouteEntry {
  /** Path under app/m, exactly as on disk (may contain `[id]`). */
  path: string;
  /** Header title. For `detail` routes this is the fallback shown until the
   *  page announces a real entity label via the page-context store. */
  title: string;
  /** Shorter label for the bottom tab bar — e.g. "Field" for "Field Dashboard".
   *  Falls back to `title` when omitted. Only needed on tab-root routes whose
   *  `title` is too long for the 4-tab bar. */
  shortTitle?: string;
  /** The Up target — where the back chevron goes. `null` only for the
   *  module hubs, which are tab roots with nothing above them. */
  parent: string | null;
  kind: RouteKind;
  module: ModuleId;
  icon: LucideIcon;
  /**
   * The permission required to OPEN this route — the hard access gate, and the
   * same key the page/API already enforces server-side.
   *
   * Omitted = inherit from `parent` (see `permFor`). A route whose whole
   * ancestor chain omits it is universal (Home, My Profile, Settings, Queue).
   *
   * Seeded by extracting `PERM.*` references from each route's own files, with
   * a hand-reviewed override list for the cases where the cheapest referenced
   * permission was a write/approve key (which would have hidden the page from
   * legitimate read-only users).
   */
  perm?: string;
  /** One plain-language line. Powers menu subtitles, search and tooltips.
   *  Same contract as `hint` in lib/nav.ts — written once, reused everywhere. */
  hint?: string;
  /**
   * Personas for whom this route is PROMINENT. This is a ranking hint, never
   * an access gate — gating is `perm` alone. Omitting it means "not especially
   * prominent for anyone", not "hidden". See §3.8 of docs/NAVIGATION.md.
   */
  personas?: Persona[];
  /** Extra search terms. */
  keywords?: string[];
  /** Live count badge — endpoint returns an array; we show its length. */
  badge?: { endpoint: string };
  /** Flow this route participates in — enables Next Step + Related. */
  flowId?: FlowId;
  /** Equivalent desktop path, where one exists (Phase 5 convergence). */
  desktopPath?: string;
  /** For `kind: "redirect"` — the target. */
  redirectTo?: string;
  /** Reachable by deep link and search, but not listed in the menu tree. */
  hidden?: boolean;
  /** Other routes rendering the SAME list component — i.e. two URLs for one
   *  concept. Declared so guard G5 can fail on *new* duplicates while Phase 3
   *  works through the existing ones. */
  sharesListWith?: string[];
}

export const ROUTES: RouteEntry[] = [
  { path: "/m", title: "Home", parent: null, kind: "redirect", module: "home", icon: Home, redirectTo: "/m/home" },
  { path: "/m/accounts", title: "Accounts", parent: "/m/home", kind: "hub", module: "accounts", perm: "finance.view", icon: BookOpen, hint: "Expenses, claims, petty cash, supplier payments, receipts, GL", sharesListWith: ["/m/books/gl", "/m/books/receipts", "/m/expense-claims", "/m/expenses", "/m/petty-cash", "/m/supplier-payments"] },
  { path: "/m/alerts/lease-expiry", title: "Lease Expiry", parent: "/m/home", kind: "list", module: "home", perm: "assets.view", icon: CalendarOff, hint: "Leasehold land with a lease ending within 90 days, or already expired" },
  { path: "/m/attendance", title: "Attendance", parent: "/m/hr", kind: "list", module: "hr", perm: "hr.view", icon: CalendarCheck, hint: "Daily headcount — GPS-tagged check-ins by site", desktopPath: "/hr/attendance" },
  { path: "/m/books", title: "Books", parent: "/m/accounts", kind: "redirect", module: "accounts", icon: BookOpen, redirectTo: "/m/accounts" },
  { path: "/m/books/finance", title: "Supplier Invoices", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: Receipt, hint: "Bills, GRN-based invoicing", personas: ["executive", "finance"] },
  { path: "/m/books/gl", title: "General Ledger", shortTitle: "GL", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: BookOpen, hint: "Chart of accounts, trial balance", personas: ["executive", "finance"], sharesListWith: ["/m/accounts"] },
  { path: "/m/books/payroll", title: "Payroll Ledger", parent: "/m/accounts", kind: "list", module: "accounts", perm: "payroll.view", icon: Landmark, hint: "Payroll periods, salary breakdown", personas: ["executive", "finance"] },
  { path: "/m/books/receipts", title: "Receipts Ledger", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: Receipt, hint: "Payment receipts — asset & material sales", personas: ["executive", "finance"], sharesListWith: ["/m/accounts"] },
  { path: "/m/books/receipts/[id]", title: "Receipt", parent: "/m/books/receipts", kind: "detail", module: "accounts", perm: "finance.view", icon: Receipt },
  { path: "/m/books/reports", title: "Analytics", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: BarChart3, hint: "Key metrics at a glance", personas: ["executive", "ops", "finance"] },
  { path: "/m/boq", title: "Bill of Quantities", parent: "/m/inventory", kind: "list", module: "inventory", perm: "boq.view", icon: ClipboardList, hint: "Bill of Quantities — the project cost budget, item by item", desktopPath: "/boq", keywords: ["bill of quantities", "boq", "estimate", "budget", "rate analysis", "quantity survey"] },
  { path: "/m/boq/[id]", title: "BOQ Item", parent: "/m/boq", kind: "detail", module: "inventory", perm: "boq.view", icon: ClipboardList },
  { path: "/m/brokers", title: "Brokers", parent: "/m/home", kind: "list", module: "home", perm: "sales.view", icon: Handshake, hint: "Real estate brokers/agents — default commission %, contact info, deal history", desktopPath: "/brokers", keywords: ["broker", "agent", "commission", "deal source", "middleman", "referral"], sharesListWith: ["/m/real-estate"] },
  { path: "/m/brokers/new", title: "New Broker", parent: "/m/brokers", kind: "create", module: "home", perm: "sales.manage", icon: Handshake },
  { path: "/m/budget-variance", title: "Budget Variance", parent: "/m/inventory", kind: "list", module: "inventory", perm: "project_control.view", icon: Gauge, hint: "Budget vs actual analysis", desktopPath: "/cost-control?tab=budget-variance", personas: ["executive", "ops", "field"], keywords: ["budget", "variance", "boq vs actual", "overrun", "cost control"] },
  { path: "/m/budget-variance/[id]", title: "Budget Variance", parent: "/m/budget-variance", kind: "detail", module: "inventory", perm: "project_control.view", icon: Gauge },
  { path: "/m/calls", title: "Call Log", parent: "/m/home", kind: "list", module: "home", perm: "call.view", icon: PhoneIncoming, hint: "Call history, recordings, tags", desktopPath: "/calls", personas: ["executive"], keywords: ["call", "phone", "recording", "telephony", "voicemail", "missed call", "call log", "communication"] },
  { path: "/m/calls/[id]", title: "Call Log Detail", parent: "/m/calls", kind: "detail", module: "home", perm: "call.view", icon: PhoneIncoming },
  { path: "/m/change-orders", title: "Change Orders", parent: "/m/inventory", kind: "list", module: "inventory", perm: "projects.view", icon: GitBranch, hint: "Formal modifications to project scope, BOQ, budget, and schedule with approval workflow", desktopPath: "/change-orders", keywords: ["change order", "scope change", "variation", "modification", "addition", "deletion", "budget change", "schedule change"], sharesListWith: ["/m/construction"] },
  { path: "/m/change-orders/[id]", title: "Change Order", parent: "/m/change-orders", kind: "detail", module: "inventory", perm: "projects.view", icon: GitBranch },
  { path: "/m/construction", title: "Construction", parent: "/m/inventory", kind: "hub", module: "inventory", perm: "projects.view", icon: Hammer, hint: "Subcontractor scope & RA bills", personas: ["executive", "ops", "field"], sharesListWith: ["/m/change-orders", "/m/quality-control", "/m/work-orders"] },
  { path: "/m/crm", title: "CRM", parent: "/m/home", kind: "hub", module: "home", perm: "sales.view", icon: Contact, hint: "Leads, calls, customers in one place", personas: ["executive", "ops", "sales"] },
  { path: "/m/customers", title: "Customers", parent: "/m/home", kind: "list", module: "home", perm: "sales.view", icon: Contact, hint: "Buyers and tenants — contacts, bookings, and payments", desktopPath: "/customers", sharesListWith: ["/m/leads"] },
  { path: "/m/customers/[id]", title: "Customer Detail", parent: "/m/customers", kind: "detail", module: "home", perm: "sales.view", icon: Contact },
  { path: "/m/customers/new", title: "New Customer", parent: "/m/customers", kind: "create", module: "home", perm: "sales.manage", icon: Contact },
  { path: "/m/departments", title: "Departments", parent: "/m/inventory", kind: "list", module: "inventory", perm: "inventory.view", icon: Building2, hint: "Operational cost centers — workshop, lab, manufacturing", desktopPath: "/departments", personas: ["executive", "ops", "procurement", "field"], keywords: ["department", "cost center", "cost centre", "boiler", "workshop", "lab", "manufacturing", "processing"] },
  { path: "/m/dprs", title: "Daily Progress Reports", shortTitle: "DPRs", parent: "/m/hr", kind: "list", module: "hr", perm: "dpr.view", icon: ClipboardList, hint: "Daily progress reports — submit, review, and approve", desktopPath: "/hr/dprs" },
  { path: "/m/dprs/[id]", title: "Daily Progress Report Detail", parent: "/m/dprs", kind: "detail", module: "hr", perm: "dpr.view", icon: ClipboardList, flowId: "dpr" },
  { path: "/m/equipment", title: "Equipment", parent: "/m/inventory", kind: "list", module: "inventory", perm: "assets.view", icon: Wrench, hint: "Tools, assignments", desktopPath: "/equipment", personas: ["executive", "ops", "procurement", "field"], keywords: ["machine", "tool", "asset", "plant", "maintenance", "equipment"] },
  { path: "/m/equipment/[id]", title: "Equipment Detail", parent: "/m/equipment", kind: "detail", module: "inventory", perm: "assets.view", icon: Wrench },
  { path: "/m/equipment/new", title: "New Equipment", parent: "/m/equipment", kind: "create", module: "inventory", perm: "assets.manage", icon: Wrench },
  { path: "/m/expenses-hub", title: "Expenses", parent: "/m/home", kind: "hub", module: "home", perm: "finance.view", icon: Wallet, hint: "All expenses in one place — operating expenses, claims, petty cash, supplier payments, reports", keywords: ["expense", "spend", "claim", "reimbursement", "petty cash", "supplier payment", "bill", "voucher", "opex"], redirectTo: "/m/accounts?tab=expenses" },
  { path: "/m/expense-claims", title: "Expense Claims", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: FileText, hint: "Employee reimbursement claims — submit, approve, and pay out", desktopPath: "/finance?tab=claims", keywords: ["claim", "reimbursement", "employee expense", "travel", "site expense"], sharesListWith: ["/m/accounts"] },
  { path: "/m/expense-claims/new", title: "New Expense Claim", parent: "/m/expense-claims", kind: "create", module: "accounts", perm: "expense.create", icon: FileText },
  { path: "/m/expense-claims/[id]", title: "Expense Claim", parent: "/m/expense-claims", kind: "detail", module: "accounts", perm: "finance.view", icon: FileText },
  { path: "/m/expenses", title: "Operating Expenses", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: BookOpen, hint: "Book and approve operating expenses — categories, payment mode, GST, receipts, and approval workflow", desktopPath: "/finance?tab=expenses", keywords: ["expense", "spend", "opex", "voucher", "bill", "reimbursement", "petty cash", "approval"], sharesListWith: ["/m/accounts"] },
  { path: "/m/gate-pass", title: "Gate Pass", parent: "/m/inventory", kind: "list", module: "inventory", perm: "gate_pass.view", icon: ShieldCheck, hint: "Approve items leaving the gate", desktopPath: "/gate-passes", personas: ["executive", "ops", "procurement", "field"] },
  { path: "/m/home", title: "Home", parent: null, kind: "hub", module: "home", icon: Home, hint: "Your companies, dashboards, and everything waiting on you" },
  { path: "/m/hr", title: "HR", parent: "/m/home", kind: "hub", module: "hr", perm: "hr.view", icon: Users, hint: "Attendance, DPRs, employees, leaves, and payroll in one place", desktopPath: "/hr" },
  { path: "/m/hr/employees", title: "Employees", parent: "/m/hr", kind: "list", module: "hr", perm: "hr.view", icon: Users, hint: "Staff and labour — their wage rate and where they're posted (crews/gangs tab inside)", desktopPath: "/hr/employees", keywords: ["staff", "labour", "worker", "mazdoor", "roster", "employee", "gang", "crew", "team", "group", "contractor", "mazdor gang"] },
  { path: "/m/hr/employees/[id]", title: "Employee", parent: "/m/hr/employees", kind: "detail", module: "hr", perm: "hr.view", icon: Users },
  { path: "/m/hr/leaves", title: "Leaves", parent: "/m/hr", kind: "list", module: "hr", perm: "hr.view", icon: CalendarOff, hint: "Leave records and approvals" },
  { path: "/m/hr/onboarding", title: "Onboarding", parent: "/m/hr", kind: "list", module: "hr", perm: "hr.view", icon: UserPlus, hint: "Onboarding progress for every employee — done, in progress, not started" },
  { path: "/m/hr/onboarding/[id]", title: "Onboarding", parent: "/m/hr/onboarding", kind: "detail", module: "hr", perm: "hr.view", icon: UserPlus },
  { path: "/m/hr/pending", title: "Pending", parent: "/m/hr", kind: "list", module: "hr", perm: "hr.view", icon: ClipboardCheck, hint: "Everything that needs your attention — pending approvals, leaves, payrolls, POs, and overdue tasks in one place", desktopPath: "/hr/pending", keywords: ["pending", "approval", "overdue", "task", "leave", "payroll", "po", "requisition", "queue", "action"] },
  { path: "/m/inventory", title: "Inventory", parent: "/m/home", kind: "hub", module: "inventory", perm: "inventory.view", icon: Boxes, hint: "Raw material and real estate — stock, indents, projects, units", badge: { endpoint: "/api/purchase-orders?status=DRAFT" } },
  { path: "/m/land", title: "Land & Parcels", parent: "/m/inventory", kind: "list", module: "inventory", perm: "assets.view", icon: MapIcon, hint: "What land you own, what it cost, and how it's been subdivided", desktopPath: "/land", keywords: ["plot", "parcel", "partition", "subdivide", "khasra", "acquisition", "land bank"], sharesListWith: ["/m/real-estate"] },
  { path: "/m/land/[id]", title: "Land Parcel", parent: "/m/land", kind: "detail", module: "inventory", perm: "assets.view", icon: MapIcon },
  { path: "/m/leads", title: "Lead Pipeline", shortTitle: "Leads", parent: "/m/home", kind: "list", module: "home", perm: "sales.view", icon: Filter, hint: "Stage, priority, follow-up triage", personas: ["executive", "ops", "sales"], sharesListWith: ["/m/customers"] },
  { path: "/m/leads/[id]", title: "Lead Detail", parent: "/m/leads", kind: "detail", module: "home", perm: "sales.view", icon: Filter },
  { path: "/m/leads/new", title: "New Lead", parent: "/m/leads", kind: "create", module: "home", perm: "sales.manage", icon: Filter },
  { path: "/m/material-issues", title: "Material Issues", parent: "/m/stock", kind: "list", module: "inventory", perm: "inventory.view", icon: Package, hint: "Stock issued to projects and departments — the issue register", flowId: "materialIssue" },
  { path: "/m/material-issues/[id]", title: "Material Issue", parent: "/m/material-issues", kind: "detail", module: "inventory", perm: "inventory.view", icon: Package, flowId: "materialIssue" },
  { path: "/m/material-reconciliation", title: "Material Reconciliation", parent: "/m/inventory", kind: "list", module: "inventory", perm: "project_control.view", icon: Package, hint: "Required vs issued vs consumed", desktopPath: "/material-reconciliation", personas: ["executive", "ops", "field", "procurement", "finance"], keywords: ["reconciliation", "wastage", "consumption", "tolerance", "variance", "stock"] },
  { path: "/m/material-sales", title: "Material Sales", parent: "/m/inventory", kind: "list", module: "inventory", perm: "sales.view", icon: Banknote, hint: "Sell raw material directly", flowId: "materialSale", desktopPath: "/material-sales", personas: ["executive", "ops", "procurement", "field"], keywords: ["surplus", "scrap", "resale", "material sale", "cost recovery", "by-product"] },
  { path: "/m/material-sales/[id]", title: "Material Sale", parent: "/m/material-sales", kind: "detail", module: "inventory", perm: "sales.view", icon: Banknote, flowId: "materialSale" },
  { path: "/m/material-sales/new", title: "New Material Sale", parent: "/m/material-sales", kind: "create", module: "inventory", perm: "sales.manage", icon: Banknote },
  { path: "/m/materials", title: "Materials & Stock", parent: "/m/inventory", kind: "list", module: "inventory", perm: "inventory.view", icon: Boxes, hint: "Catalogue, current stock by location", desktopPath: "/materials", personas: ["executive", "ops", "procurement", "field"], keywords: ["item", "sku", "catalog", "cement", "steel", "material", "rate"] },
  { path: "/m/materials/[id]", title: "Material Detail", parent: "/m/materials", kind: "detail", module: "inventory", perm: "inventory.view", icon: Boxes },
  { path: "/m/materials/[id]/edit", title: "Edit Material", parent: "/m/materials/[id]", kind: "edit", module: "inventory", perm: "inventory.manage", icon: Boxes },
  { path: "/m/materials/new", title: "New Material", parent: "/m/materials", kind: "create", module: "inventory", perm: "inventory.manage", icon: Boxes },
  { path: "/m/me", title: "My Profile", parent: "/m/settings", kind: "list", module: "settings", icon: User, hint: "Account, role, preferences", desktopPath: "/me", keywords: ["me", "profile", "personal", "password", "phone", "account", "my account", "settings"] },
  { path: "/m/measurement-book", title: "Measurement Book", parent: "/m/inventory", kind: "list", module: "inventory", perm: "mb.view", icon: Ruler, hint: "Site engineer's verified record of actual quantities executed", desktopPath: "/measurement-book", keywords: ["mb", "measurement", "quantity", "site", "executed", "verified", "approved"] },
  { path: "/m/measurement-book/[id]", title: "Measurement Entry", parent: "/m/measurement-book", kind: "detail", module: "inventory", perm: "mb.view", icon: Ruler },
  { path: "/m/permissions", title: "Permissions & Legal", parent: "/m/inventory", kind: "list", module: "inventory", perm: "assets.view", icon: Scale, hint: "NOCs, licenses, certificates, expiry alerts", desktopPath: "/permissions", personas: ["executive", "ops", "sales"], keywords: ["permission", "legal", "noc", "sanction", "license", "certificate", "fire", "pollution", "completion", "occupancy", "agreement to sell", "transfer duty", "building permission", "map approval", "cla", "registry"] },
  { path: "/m/petty-cash", title: "Petty Cash", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: Banknote, hint: "Site/office cash floats — top-ups and balances", desktopPath: "/finance?tab=petty-cash", keywords: ["petty cash", "float", "cash", "imprest"], sharesListWith: ["/m/accounts"] },
  { path: "/m/petty-cash/new", title: "New Petty Cash Float", parent: "/m/petty-cash", kind: "create", module: "accounts", perm: "finance.manage", icon: Banknote },
  { path: "/m/portal-listings", title: "Portal Listings", parent: "/m/inventory", kind: "list", module: "inventory", perm: "sales.view", icon: Globe, hint: "99acres, MagicBricks sync", personas: ["executive", "ops", "sales"] },
  { path: "/m/portal-listings/[id]", title: "Portal Listing", parent: "/m/portal-listings", kind: "detail", module: "inventory", icon: Globe },
  { path: "/m/portal-listings/new", title: "New Portal Listing", parent: "/m/portal-listings", kind: "create", module: "inventory", perm: "sales.manage", icon: Globe },
  { path: "/m/procurement", title: "Procurement", parent: "/m/inventory", kind: "hub", module: "inventory", perm: "procurement.view", icon: FileText, hint: "What you've ordered, from whom, and what's still to arrive at site", flowId: "procurement", desktopPath: "/procurement", personas: ["executive", "ops", "procurement", "field"], keywords: ["po", "order", "buy", "procure", "procurement", "purchase order"], badge: { endpoint: "/api/purchase-orders?status=DRAFT" } },
  { path: "/m/procurement/[id]", title: "Purchase Order", parent: "/m/procurement", kind: "detail", module: "inventory", perm: "procurement.view", icon: FileText, flowId: "procurement" },
  { path: "/m/procurement/new", title: "New Purchase Order", parent: "/m/procurement", kind: "create", module: "inventory", perm: "procurement.manage", icon: FileText },
  { path: "/m/profit-center", title: "Profit Center", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: PieChart, hint: "Per-project revenue, cost, margin", desktopPath: "/cost-control?tab=profit-center", personas: ["executive", "finance", "ops"], keywords: ["profit", "loss", "pnl", "margin", "revenue", "cost per sqft", "job costing"] },
  { path: "/m/project-control", title: "Project Control", parent: "/m/inventory", kind: "list", module: "inventory", perm: "project_control.view", icon: Gauge, hint: "Earned value: CPI, SPI, EAC", desktopPath: "/cost-control?tab=project-control", personas: ["executive", "ops", "field"], keywords: ["evm", "earned value", "cpi", "spi", "cost overrun", "forecast", "commitment", "take off", "mto"] },
  { path: "/m/project-control/[id]", title: "Project Control", parent: "/m/project-control", kind: "detail", module: "inventory", perm: "project_control.view", icon: Gauge },
  { path: "/m/projects", title: "Projects", parent: "/m/inventory", kind: "list", module: "inventory", perm: "projects.view", icon: HardHat, hint: "Each site: its phases, its spend, and its cost per sq.ft", desktopPath: "/projects", keywords: ["site", "tower", "phase", "construction", "wip", "project", "rera"], sharesListWith: ["/m/real-estate"] },
  { path: "/m/projects/[id]", title: "Project Detail", parent: "/m/projects", kind: "detail", module: "inventory", perm: "projects.view", icon: HardHat },
  { path: "/m/pulse", title: "Executive Dashboard", parent: "/m/home", kind: "hub", module: "home", perm: "projects.view", icon: Sun, hint: "Portfolio KPIs, project health, approvals" },
  { path: "/m/pulse/approvals", title: "Approvals", parent: "/m/pulse", kind: "list", module: "home", perm: "po.approve", icon: ClipboardCheck, hint: "POs, requisitions awaiting sign-off", redirectTo: "/m/hr/pending" },
  { path: "/m/pulse/attention", title: "Attention Queue", parent: "/m/pulse", kind: "list", module: "home", perm: "tasks.view", icon: AlertTriangle, hint: "All alerts in one place" },
  { path: "/m/quality-control", title: "Quality Control", parent: "/m/inventory", kind: "list", module: "inventory", perm: "projects.view", icon: ShieldAlert, hint: "Non-Conformance Reports (NCR) and Corrective And Preventive Actions (CAPA)", desktopPath: "/quality-control", keywords: ["quality", "ncr", "capa", "non-conformance", "corrective", "preventive", "qa", "qc", "defect", "rework"], sharesListWith: ["/m/construction"] },
  { path: "/m/quality-control/ncr/[id]", title: "NCR", parent: "/m/quality-control", kind: "detail", module: "inventory", perm: "projects.view", icon: ShieldAlert },
  { path: "/m/queue", title: "Offline Queue", parent: "/m/home", kind: "list", module: "home", icon: ClipboardList, hint: "Pending sync items & recent actions" },
  { path: "/m/quotations", title: "Quotations", parent: "/m/inventory", kind: "list", module: "inventory", perm: "procurement.view", icon: Tags, hint: "Collect supplier quotes, compare per-piece landed cost (with auto GST), and approve the winner", redirectTo: "/m/procurement?tab=quotations", desktopPath: "/procurement?tab=quotations", keywords: ["quote", "quotation", "vendor quote", "comparative", "rate", "price", "tender", "bid", "hsn", "gst", "landed cost", "per piece"] },
  { path: "/m/quotations/[id]", title: "Quotation Detail", parent: "/m/procurement", kind: "redirect", module: "inventory", icon: Tags, redirectTo: "/m/procurement?tab=quotations&open=${id}" },
  { path: "/m/quotations/new", title: "New Quotation", parent: "/m/procurement", kind: "redirect", module: "inventory", icon: Tags, redirectTo: "/m/procurement?tab=quotations&new=1" },
  { path: "/m/rate-contracts", title: "Rate Contracts", parent: "/m/inventory", kind: "list", module: "inventory", perm: "procurement.view", icon: FileSignature, hint: "Fixed-rate supplier agreements", desktopPath: "/rate-contracts", personas: ["executive", "ops", "procurement", "field"], keywords: ["rate contract", "framework agreement", "fixed rate", "supplier agreement"] },
  { path: "/m/rate-contracts/[id]", title: "Rate Contract", parent: "/m/rate-contracts", kind: "detail", module: "inventory", perm: "procurement.view", icon: FileSignature },
  { path: "/m/real-estate", title: "Real Estate", parent: "/m/inventory", kind: "hub", module: "inventory", perm: "projects.view", icon: Building2, hint: "Projects, units, land, customers, rentals", personas: ["executive", "ops", "sales"], sharesListWith: ["/m/brokers", "/m/land", "/m/projects", "/m/rentals", "/m/units"] },
  { path: "/m/rent", title: "Rent", parent: "/m/home", kind: "list", module: "home", perm: "rentals.view", icon: Key, hint: "Units you've rented out and the rent due each month", redirectTo: "/m/real-estate?tab=rentals" },
  { path: "/m/rentals", title: "Rentals", parent: "/m/home", kind: "list", module: "home", perm: "rentals.view", icon: Key, hint: "Units you've rented out and the rent due each month", desktopPath: "/rentals", keywords: ["lease", "tenant", "rent", "monthly", "leave and license"], sharesListWith: ["/m/real-estate"] },
  { path: "/m/rentals/[id]", title: "Rental Detail", parent: "/m/rentals", kind: "detail", module: "home", perm: "rentals.view", icon: Key },
  { path: "/m/reports", title: "Reports", parent: "/m/home", kind: "hub", module: "home", perm: "finance.view", icon: BarChart3, hint: "Every report, grouped by the Build lifecycle stage it belongs to", desktopPath: "/reports", keywords: ["report", "analysis", "analytics", "insight", "insights"] },
  { path: "/m/reports/balance-sheet", title: "Balance Sheet", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: BarChart3, hint: "Assets = Liabilities + Equity — the company's financial position", desktopPath: "/reports/balance-sheet", keywords: ["balance sheet", "position", "assets", "liabilities", "equity", "net worth"] },
  { path: "/m/reports/cash-flow", title: "Cash Flow Forecast", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: IndianRupee, hint: "Projected inflows vs outflows", desktopPath: "/reports/cash-flow", personas: ["executive", "ops", "finance"], keywords: ["cash flow", "forecast", "inflow", "outflow", "liquidity", "treasury"] },
  { path: "/m/reports/comparative", title: "Comparative", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: BarChart3, hint: "This period against last — side by side, any metric", desktopPath: "/reports/comparative", keywords: ["compare", "period", "variance", "month on month", "yoy", "year on year"] },
  { path: "/m/reports/department-consumption", title: "Dept Consumption", parent: "/m/reports", kind: "report", module: "home", perm: "inventory.view", icon: PieChart, hint: "Material use by department", desktopPath: "/reports/department-consumption", personas: ["executive", "ops", "procurement", "finance"], keywords: ["department", "consumption", "cost center", "usage", "cost centre"] },
  { path: "/m/reports/expenses", title: "Expenses", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: Wallet, hint: "All expenses by category", desktopPath: "/reports/expenses", personas: ["executive", "ops", "finance"], keywords: ["spend", "opex", "category", "overhead", "expense"] },
  { path: "/m/reports/gst", title: "GST Report", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: FileSpreadsheet, hint: "GSTR-1, GSTR-3B reconciliation", desktopPath: "/reports/gst", personas: ["executive", "ops", "finance"], keywords: ["tax", "gst", "itc", "input tax credit", "return", "filing", "gstr"] },
  { path: "/m/reports/inventory-value", title: "Inventory Valuation", parent: "/m/reports", kind: "report", module: "home", perm: "inventory.view", icon: Scale, hint: "Stock value by location", desktopPath: "/reports/inventory-value", personas: ["executive", "ops", "procurement", "finance"], keywords: ["valuation", "stock value", "closing stock", "mac", "inventory value"] },
  { path: "/m/reports/issue-register", title: "Issue Register", parent: "/m/reports", kind: "report", module: "home", perm: "inventory.view", icon: ScrollText, hint: "All stock issue slips", desktopPath: "/reports/issue-register", personas: ["executive", "ops", "procurement", "finance"], keywords: ["issue slip", "issue register", "sa", "stock issue summary", "material issue"] },
  { path: "/m/reports/job-costing", title: "Job Costing", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: Calculator, hint: "Per-project cost breakdown", desktopPath: "/reports/job-costing", personas: ["executive", "ops", "finance"], keywords: ["job costing", "direct cost", "indirect cost", "overhead", "absorption", "cost accounting"] },
  { path: "/m/reports/payroll-expense", title: "Payroll Expense", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: Landmark, hint: "Monthly payroll by trade/crew", desktopPath: "/reports/payroll-expense", personas: ["executive", "ops", "hr", "finance"], keywords: ["payroll", "wage", "labour cost", "salary expense", "labour"] },
  { path: "/m/reports/pending-payments", title: "Pending Payments", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: AlertTriangle, hint: "Overdue POs + receivables", desktopPath: "/reports/pending-payments", personas: ["executive", "ops", "finance"], keywords: ["receivable", "payable", "outstanding", "overdue", "dues", "pending payment"] },
  { path: "/m/reports/profit", title: "Profit & Loss", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: PieChart, hint: "Income vs expense statement", desktopPath: "/reports/profit", personas: ["executive", "ops", "finance"], keywords: ["pnl", "profit", "margin", "loss", "bottom line", "profit and loss"] },
  { path: "/m/reports/project-progress", title: "Project Progress", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: BarChart3, hint: "Budget vs actual, P&L per project", desktopPath: "/reports/project-progress", personas: ["executive", "ops", "finance"], keywords: ["progress", "schedule", "delay", "phase", "completion", "project progress"] },
  { path: "/m/reports/purchase-register", title: "Purchase Register", parent: "/m/reports", kind: "report", module: "home", perm: "procurement.view", icon: ScrollText, hint: "Cash purchases + returns", desktopPath: "/reports/purchase-register", personas: ["executive", "ops", "procurement", "finance"], keywords: ["purchase register", "bill register", "p-register", "return register", "purchase bill"] },
  { path: "/m/reports/purchase-trends", title: "Purchase Trends", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: TrendingUp, hint: "12-month spend, top suppliers", desktopPath: "/reports/purchase-trends", personas: ["executive", "ops", "procurement", "finance"], keywords: ["buying", "price", "rate", "supplier", "trend"] },
  { path: "/m/reports/purchaser-performance", title: "Purchaser Performance", parent: "/m/reports", kind: "report", module: "home", perm: "procurement.view", icon: BarChart3, hint: "Quote metrics, savings", desktopPath: "/reports/purchaser-performance", personas: ["executive", "ops", "procurement", "finance"], keywords: ["purchaser", "buyer", "performance", "quotes", "savings", "procurement kpi"] },
  { path: "/m/reports/real-estate-inventory", title: "Real Estate Inventory", parent: "/m/reports", kind: "report", module: "home", perm: "assets.view", icon: Building2, hint: "Available units, valuation", desktopPath: "/reports/real-estate-inventory", personas: ["executive", "ops", "finance"], keywords: ["real estate", "inventory", "units", "sold", "available", "construction cost", "land cost", "asset value", "monthly additions", "whole", "subdivided", "plots", "flats"] },
  { path: "/m/reports/sales-revenue", title: "Sales Revenue", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: TrendingUp, hint: "12-month revenue, top customers", desktopPath: "/reports/sales-revenue", personas: ["executive", "ops", "finance"], keywords: ["revenue", "sales", "booking", "trend", "collection"] },
  { path: "/m/reports/stock-movement-summary", title: "Stock Movement Summary", parent: "/m/reports", kind: "report", module: "home", perm: "inventory.view", icon: Package, hint: "Opening, received, issued, balance", desktopPath: "/reports/stock-movement-summary", personas: ["executive", "ops", "procurement", "finance"], keywords: ["saleable stock", "stock flow", "opening", "closing", "movement summary", "stock statement"] },
  { path: "/m/reports/tds-certificates", title: "TDS Certificates", parent: "/m/reports", kind: "report", module: "home", perm: "finance.view", icon: FileSignature, hint: "Subcontractor TDS tracking", desktopPath: "/reports/tds-certificates", personas: ["executive", "ops", "finance"], keywords: ["tds", "certificate", "194c", "form 16c", "subcontractor", "tax deducted", "tds certificate"] },
  { path: "/m/requisitions", title: "Indents", parent: "/m/inventory", kind: "list", module: "inventory", perm: "procurement.view", icon: Inbox, hint: "Site raises an indent for material. Approve it, then convert it to a purchase order", redirectTo: "/m/procurement?tab=indents", desktopPath: "/procurement?tab=indents", keywords: ["indent", "requisition", "request", "ask", "demand", "material request"] },
  { path: "/m/requisitions/[id]", title: "Indent", parent: "/m/procurement", kind: "detail", module: "inventory", perm: "procurement.view", icon: Inbox, flowId: "requisition" },
  { path: "/m/requisitions/new", title: "New Indent", parent: "/m/procurement", kind: "create", module: "inventory", perm: "procurement.manage", icon: Inbox },
  { path: "/m/safety", title: "Safety", parent: "/m/inventory", kind: "list", module: "inventory", perm: "projects.view", icon: LifeBuoy, hint: "Hazards, incidents, and safety inspections across all sites", desktopPath: "/safety", keywords: ["safety", "hazard", "incident", "inspection", "accident", "near miss", "ppe", "compliance"] },
  { path: "/m/safety/hazards/[id]", title: "Hazard", parent: "/m/safety", kind: "detail", module: "inventory", perm: "safety.view", icon: LifeBuoy },
  { path: "/m/safety/incidents/[id]", title: "Incident", parent: "/m/safety", kind: "detail", module: "inventory", perm: "safety.view", icon: LifeBuoy },
  { path: "/m/safety/inspections/[id]", title: "Inspection", parent: "/m/safety", kind: "detail", module: "inventory", perm: "safety.view", icon: LifeBuoy },
  { path: "/m/sales", title: "Sales", parent: "/m/home", kind: "list", module: "home", perm: "sales.view", icon: ShoppingCart, hint: "Bookings, payment plans and what's still to collect (customers tab inside)", desktopPath: "/sales", personas: ["executive", "ops", "sales"], keywords: ["booking", "sale", "deal", "agreement", "collection", "allotment", "buyer", "client", "tenant", "party", "customer"] },
  { path: "/m/sales/[id]", title: "Sale Detail", parent: "/m/sales", kind: "detail", module: "home", perm: "sales.view", icon: ShoppingCart },
  { path: "/m/sales/new", title: "New Sale", parent: "/m/sales", kind: "create", module: "home", perm: "sale.create", icon: ShoppingCart },
  { path: "/m/scrap-generations", title: "Scrap", parent: "/m/inventory", kind: "list", module: "inventory", perm: "inventory.view", icon: Trash2, hint: "Record and track scrap generation", redirectTo: "/m/stock?tab=scrap" },
  { path: "/m/scrap-generations/[id]", title: "Scrap Entry", parent: "/m/stock", kind: "detail", module: "inventory", perm: "inventory.view", icon: Trash2 },
  { path: "/m/scrap-generations/new", title: "New Scrap Entry", parent: "/m/stock", kind: "create", module: "inventory", perm: "inventory.manage", icon: Trash2 },
  { path: "/m/settings", title: "More", parent: "/m/home", kind: "hub", module: "settings", icon: Settings, hint: "Company details, locations, cost centres, people and users (WhatsApp/email alert templates panel inside)", desktopPath: "/settings", keywords: ["config", "company", "preferences", "users", "locations", "settings", "notification", "whatsapp", "alert"] },
  { path: "/m/settings/company", title: "Company Details", parent: "/m/settings", kind: "list", module: "settings", perm: "company.manage", icon: Building2, hint: "Name, GSTIN, PAN, address, phone", personas: ["executive"] },
  { path: "/m/settings/export", title: "Bulk Export", parent: "/m/settings", kind: "list", module: "settings", perm: "company.manage", icon: FileSpreadsheet, hint: "CSV/PDF data export", personas: ["executive"] },
  { path: "/m/settings/notifications", title: "Notifications", parent: "/m/settings", kind: "list", module: "settings", perm: "company.manage", icon: AlertTriangle, hint: "Alerts, templates, delivery", personas: ["executive"] },
  { path: "/m/settings/project-assignments", title: "Project Assignments", parent: "/m/settings", kind: "list", module: "settings", perm: "users.view", icon: ShieldCheck, hint: "Scope user access to specific projects", desktopPath: "/settings/project-assignments", personas: ["executive"], keywords: ["access", "permission", "role", "assignment", "scope", "sub admin", "user access"] },
  { path: "/m/settings/team", title: "Employees & Access", parent: "/m/settings", kind: "redirect", redirectTo: "/m/hr/employees", module: "settings", perm: "users.view", icon: Users, hint: "Manage employees, roles, access control", personas: ["executive"] },
  { path: "/m/site", title: "Field Dashboard", shortTitle: "Field", parent: "/m/home", kind: "hub", module: "home", perm: "tasks.view", icon: MapPin, hint: "Field dashboard — tasks, DPR, in-transit stock, attendance" },
  { path: "/m/site/attendance", title: "Mark Attendance", parent: "/m/site", kind: "list", module: "home", perm: "hr.view", icon: Calendar, hint: "Bulk check-in with GPS", personas: ["executive", "ops", "hr", "field"] },
  { path: "/m/site/dpr", title: "New DPR", parent: "/m/site", kind: "list", module: "home", perm: "dpr.view", icon: ClipboardList, hint: "Submit a new daily progress report", personas: ["executive", "ops", "hr", "field"] },
  { path: "/m/site/field", title: "Field", parent: "/m/site", kind: "list", module: "home", perm: "procurement.view", icon: Package, hint: "Barcode receiving with offline queue and qty validation" },
  { path: "/m/site/issue", title: "Issue", parent: "/m/site", kind: "list", module: "home", perm: "stock.issue", icon: ArrowLeftRight, hint: "Issue stock to projects and departments", redirectTo: "/m/stock-out?mode=issue", flowId: "materialIssue" },
  { path: "/m/site/me", title: "My Profile", parent: "/m/site", kind: "list", module: "home", icon: User, hint: "Supervisor profile — attendance, DPRs, tasks", personas: ["executive", "ops", "hr", "field"] },
  { path: "/m/site/receive", title: "Receive", parent: "/m/site", kind: "list", module: "home", perm: "procurement.view", icon: Package, hint: "In-transit POs — jump straight into barcode receiving", redirectTo: "/m/site/field" },
  { path: "/m/site/stock", title: "Site Stock", parent: "/m/site", kind: "list", module: "home", perm: "inventory.view", icon: Package, hint: "Stock by site + movements", personas: ["executive", "ops", "procurement", "field"] },
  { path: "/m/site/tasks", title: "Tasks", parent: "/m/site", kind: "list", module: "home", perm: "tasks.view", icon: ClipboardCheck, hint: "Tasks assigned to you, with steps and timers", personas: ["executive", "ops", "hr", "field"], badge: { endpoint: "/api/my-tasks" } },
  { path: "/m/sms", title: "Bank SMS", parent: "/m/home", kind: "list", module: "home", perm: "sales.view", icon: MessageSquare, hint: "Auto-parse bank SMS into payments", desktopPath: "/sales?tab=bank-sms", personas: ["executive", "finance"], keywords: ["sms", "bank", "payment", "auto", "upi", "text", "message", "parse", "credit", "received"] },
  { path: "/m/standard-consumptions", title: "Standard Consumptions", parent: "/m/inventory", kind: "list", module: "inventory", perm: "inventory.view", icon: Beaker, hint: "Material consumption benchmarks", desktopPath: "/standard-consumptions", personas: ["executive", "ops", "field", "hr", "finance"], keywords: ["standard consumption", "benchmark", "variance", "norms", "work type", "scrap detection"] },
  { path: "/m/standard-consumptions/[id]", title: "Standard Consumption", parent: "/m/standard-consumptions", kind: "detail", module: "inventory", perm: "inventory.view", icon: Beaker },
  { path: "/m/stock", title: "Stock", parent: "/m/inventory", kind: "hub", module: "inventory", perm: "inventory.view", icon: Package, hint: "The full stock lifecycle — on-hand by location, every movement, transfers, issues to site, scrap, and counts", desktopPath: "/stock", personas: ["executive", "ops", "procurement", "field"], keywords: ["stock", "on hand", "movement", "transfer", "issue", "audit", "history", "ledger", "stock register", "scrap", "count", "physical verification", "reconcile", "variance"] },
  { path: "/m/stock-counts", title: "Stock Inventory", parent: "/m/inventory", kind: "list", module: "inventory", perm: "inventory.view", icon: Calculator, hint: "Physical stock counts and reconciliation", redirectTo: "/m/stock?tab=counts" },
  { path: "/m/stock-counts/[id]", title: "Stock Count", parent: "/m/stock", kind: "detail", module: "inventory", perm: "inventory.view", icon: Package },
  { path: "/m/stock-counts/new", title: "New Stock Count", parent: "/m/stock", kind: "create", module: "inventory", perm: "inventory.manage", icon: Package },
  { path: "/m/stock-locations", title: "Stock Locations", parent: "/m/inventory", kind: "list", module: "inventory", perm: "inventory.view", icon: Warehouse, hint: "Warehouses, project sites, add new", personas: ["executive", "ops", "procurement", "field"] },
  { path: "/m/stock-locations/new", title: "New Stock Location", parent: "/m/stock-locations", kind: "create", module: "inventory", perm: "inventory.manage", icon: Warehouse },
  { path: "/m/stock-out", title: "Move Stock", parent: "/m/inventory", kind: "list", module: "inventory", perm: "stock.issue", icon: ArrowLeftRight, hint: "Transfer or issue stock", personas: ["executive", "ops", "procurement", "field"] },
  { path: "/m/stock/[id]", title: "Material Stock", parent: "/m/stock", kind: "detail", module: "inventory", perm: "inventory.view", icon: Package },
  { path: "/m/subcontractors", title: "Subcontractors", parent: "/m/inventory", kind: "list", module: "inventory", perm: "projects.view", icon: Award, hint: "Subcontractor master, scope, RA bills", desktopPath: "/subcontractors", personas: ["executive", "ops", "field"], keywords: ["subcontractor", "contractor", "vendor", "trade", "masonry", "plumbing", "electrical", "194c"] },
  { path: "/m/subcontractors/[id]", title: "Subcontractor Detail", parent: "/m/subcontractors", kind: "detail", module: "inventory", perm: "projects.view", icon: Award },
  { path: "/m/subcontractors/new", title: "New Subcontractor", parent: "/m/subcontractors", kind: "create", module: "inventory", perm: "projects.manage", icon: Award },
  { path: "/m/supplier-payments", title: "Supplier Payments", parent: "/m/accounts", kind: "list", module: "accounts", perm: "finance.view", icon: Receipt, hint: "Record and track all supplier payments — cheques, bank transfers, TDS", desktopPath: "/finance?tab=supplier-payments", keywords: ["supplier payment", "vendor payment", "cheque", "bank transfer", "tds", "ap payment"], sharesListWith: ["/m/accounts"] },
  { path: "/m/supplier-payments/new", title: "New Supplier Payment", parent: "/m/supplier-payments", kind: "create", module: "accounts", perm: "finance.manage", icon: Receipt },
  { path: "/m/supplier-returns", title: "Returns", parent: "/m/inventory", kind: "list", module: "inventory", perm: "procurement.view", icon: Undo2, hint: "Send defective or excess stock back to a supplier and track the debit note", redirectTo: "/m/procurement?tab=returns", desktopPath: "/procurement?tab=returns", keywords: ["return", "debit note", "credit note", "defective", "reject", "send back", "purchase return"] },
  { path: "/m/supplier-returns/[id]", title: "Return", parent: "/m/procurement", kind: "detail", module: "inventory", perm: "procurement.view", icon: Undo2 },
  { path: "/m/supplier-returns/new", title: "New Return", parent: "/m/procurement", kind: "create", module: "inventory", perm: "procurement.manage", icon: Undo2 },
  { path: "/m/suppliers", title: "Suppliers", parent: "/m/inventory", kind: "list", module: "inventory", perm: "procurement.view", icon: Building2, hint: "Vendors, balances", desktopPath: "/suppliers", personas: ["executive", "ops", "procurement", "field"], keywords: ["vendor", "seller", "party", "supplier", "vendor rating", "supplier score", "performance", "on-time", "quality", "price"] },
  { path: "/m/suppliers/[id]", title: "Supplier Detail", parent: "/m/suppliers", kind: "detail", module: "inventory", perm: "procurement.view", icon: Building2 },
  { path: "/m/suppliers/new", title: "New Supplier", parent: "/m/suppliers", kind: "create", module: "inventory", perm: "procurement.manage", icon: Building2 },
  { path: "/m/telephony", title: "Telephony", parent: "/m/home", kind: "list", module: "home", perm: "telephony.view", icon: Phone, hint: "Phone numbers, providers, consent", desktopPath: "/calls?tab=telephony", personas: ["executive"], keywords: ["telephony", "phone number", "call recording", "exotel", "knowlarity", "twilio", "consent", "ivr", "virtual number"] },
  { path: "/m/transfers", title: "Transfers", parent: "/m/inventory", kind: "list", module: "inventory", perm: "inventory.view", icon: ArrowLeftRight, hint: "Transfer stock between locations", redirectTo: "/m/stock?tab=transfers" },
  { path: "/m/transfers/[id]", title: "Transfer Detail", parent: "/m/stock", kind: "detail", module: "inventory", perm: "inventory.view", icon: Package, flowId: "stockTransfer" },
  { path: "/m/transfers/new", title: "New Transfer", parent: "/m/stock", kind: "redirect", module: "inventory", icon: Package, redirectTo: "/m/stock-out?mode=transfer" },
  { path: "/m/units", title: "Built Units", parent: "/m/inventory", kind: "list", module: "inventory", perm: "assets.view", icon: DoorOpen, hint: "Flats, shops, plots — what's available, booked, or sold (renovations + portal listings tabs inside)", flowId: "builtUnit", desktopPath: "/units", keywords: ["flat", "shop", "apartment", "unit", "available", "stock", "inventory", "99acres", "magicbricks", "housing.com", "portal", "listing", "property", "sync", "marketplace", "renovation", "addition", "improvement", "refurbish", "value add", "repair"], sharesListWith: ["/m/real-estate"] },
  { path: "/m/units/[id]", title: "Built Unit", parent: "/m/units", kind: "detail", module: "inventory", perm: "assets.view", icon: DoorOpen },
  { path: "/m/vehicles", title: "Vehicles", parent: "/m/inventory", kind: "list", module: "inventory", perm: "vehicle.view", icon: Truck, hint: "Auto-built vehicle master + trip log", desktopPath: "/vehicles", personas: ["executive", "ops", "procurement", "field", "finance"], keywords: ["vehicle", "truck", "tempo", "pickup", "tractor", "transporter", "driver", "trip", "logistics", "transport"] },
  { path: "/m/wbs", title: "Work Breakdown Structure", parent: "/m/inventory", kind: "list", module: "inventory", perm: "wbs.view", icon: Network, hint: "Work Breakdown Structure — activities, dependencies, critical path", desktopPath: "/wbs", keywords: ["wbs", "schedule", "gantt", "critical path", "dependency", "milestone", "activity"] },
  { path: "/m/wbs/[id]", title: "WBS Node", parent: "/m/wbs", kind: "detail", module: "inventory", perm: "wbs.view", icon: Network },
  { path: "/m/work-orders", title: "Work Orders", parent: "/m/inventory", kind: "list", module: "inventory", perm: "projects.view", icon: ListChecks, hint: "Subcontractor work orders and RA bills with TDS and retention", desktopPath: "/work-orders", keywords: ["subcontractor", "work order", "ra bill", "running account", "tds", "retention", "contractor"], sharesListWith: ["/m/construction"] },
  { path: "/m/work-orders/[id]", title: "Work Order", parent: "/m/work-orders", kind: "detail", module: "inventory", perm: "projects.view", icon: ListChecks },
  { path: "/m/workflows", title: "Workflows", parent: "/m/home", kind: "list", module: "home", perm: "canvas.view", icon: Workflow, hint: "Automate repetitive tasks — schedule and run", desktopPath: "/workflows", keywords: ["workflow", "approval", "routing", "multi-step", "automation", "trigger"] },
  { path: "/m/workflows/[id]", title: "Workflow Detail", parent: "/m/workflows", kind: "detail", module: "home", perm: "canvas.view", icon: Workflow },
  { path: "/m/workflows/new", title: "New Workflow", parent: "/m/workflows", kind: "create", module: "home", perm: "workflows.manage", icon: Workflow },
];

/* ═══════════════════════════════════════════════════════════════════════════
   PERSONA TAB ROOTS

   Four destinations per persona — Search and the menu live in the header, so
   no slot is spent on them (see docs/NAVIGATION.md §3.3). Every entry MUST be
   a real, non-redirect path in ROUTES; guard G3 enforces that.

   EVERY persona has Home as tab 1. That is not symmetry for its own sake: Home
   is the only root of the parent graph, so a Home tab is what guarantees the
   chain always terminates at a tab root and exactly one tab is ever active.
   The `field` set originally omitted it on the theory that a site engineer only
   touches Site/Tasks/DPR/Stock — the permission matrix disproved that. A
   SITE_ENGINEER holds boq.view, procurement.view, inventory.view, hr.view and
   assets.view, and 81 routes they are entitled to open had no tab to anchor
   them. Tasks lost the slot because /m/site already surfaces it one tap away.

   DRAFT: the remaining three slots per persona mirror today's PERSONA_TABS
   with the freed Search slot reassigned. Validate against real usage before
   treating them as settled (docs/NAVIGATION.md §7 Q1).
   ═══════════════════════════════════════════════════════════════════════════ */

export const PERSONA_TAB_PATHS: Record<Persona, string[]> = {
  executive: ["/m/home", "/m/inventory", "/m/hr", "/m/accounts"],
  ops: ["/m/home", "/m/inventory", "/m/stock", "/m/site"],
  procurement: ["/m/home", "/m/procurement", "/m/stock", "/m/suppliers"],
  field: ["/m/home", "/m/site", "/m/dprs", "/m/stock"],
  sales: ["/m/home", "/m/sales", "/m/customers", "/m/leads"],
  finance: ["/m/home", "/m/accounts", "/m/books/gl", "/m/reports"],
  hr: ["/m/home", "/m/hr", "/m/attendance", "/m/dprs"],
};

/* ═══════════════════════════════════════════════════════════════════════════
   DERIVATION — every navigation surface reads from here
   ═══════════════════════════════════════════════════════════════════════════ */

export const ROUTE_BY_PATH: ReadonlyMap<string, RouteEntry> = new Map(
  ROUTES.map((r) => [r.path, r]),
);

/** Kinds that never appear in the menu tree. */
const NON_MENU_KINDS: ReadonlySet<RouteKind> = new Set<RouteKind>([
  "detail", "create", "edit", "redirect",
]);

/**
 * Resolve a live pathname (with real ids) to its manifest entry.
 * Falls back to dynamic-segment matching: `/m/procurement/abc123`
 * matches the `/m/procurement/[id]` entry.
 */
export function matchRoute(pathname: string): RouteEntry | undefined {
  const clean = pathname.split("?")[0]!.replace(/\/$/, "") || "/m";
  const exact = ROUTE_BY_PATH.get(clean);
  if (exact) return exact;

  const segs = clean.split("/");
  let best: RouteEntry | undefined;
  let bestStatic = -1;
  for (const r of ROUTES) {
    const rs = r.path.split("/");
    if (rs.length !== segs.length) continue;
    let staticHits = 0;
    let ok = true;
    for (let i = 0; i < rs.length; i++) {
      if (rs[i] === segs[i]) staticHits++;
      else if (rs[i]?.startsWith("[")) continue;
      else { ok = false; break; }
    }
    // Prefer the most specific match (most literal segments).
    if (ok && staticHits > bestStatic) { best = r; bestStatic = staticHits; }
  }
  return best;
}

/** Header title for a pathname. `entityLabel` (from the page-context store)
 *  wins when present — that is what stops a person's page saying "Employees". */
export function titleFor(pathname: string, entityLabel?: string): string {
  if (entityLabel) return entityLabel;
  return matchRoute(pathname)?.title ?? "Nirman";
}

/**
 * The Up target: hierarchical and deterministic, unlike `history.back()`,
 * which leaves the app entirely when the page was opened from a deep link.
 * Dynamic parents are resolved against the live pathname, so the Up target of
 * `/m/materials/abc/edit` is `/m/materials/abc`, not `/m/materials/[id]`.
 */
export function upHref(pathname: string): string | null {
  const entry = matchRoute(pathname);
  if (!entry?.parent) return null;
  const parent = ROUTE_BY_PATH.get(entry.parent);
  if (!parent?.path.includes("[")) return entry.parent;
  const live = pathname.split("/");
  return parent.path.split("/").map((s, i) => (s.startsWith("[") ? live[i] ?? s : s)).join("/");
}

/** Full ancestor chain, root first, including the current route. */
export function breadcrumbs(pathname: string): RouteEntry[] {
  const chain: RouteEntry[] = [];
  let cur = matchRoute(pathname);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.path)) {
    seen.add(cur.path);
    chain.unshift(cur);
    cur = cur.parent ? ROUTE_BY_PATH.get(cur.parent) : undefined;
  }
  return chain;
}

export function childrenOf(path: string): RouteEntry[] {
  return ROUTES.filter((r) => r.parent === path);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAPABILITY MODEL

   Two questions the old navigation conflated, now kept strictly apart:

     "MAY I open this?"      → capability. A hard gate, and it must give the
                               SAME answer as the server. Effective permissions
                               = role matrix + RolePermission + UserPermission
                               (see getUserPermissions() in lib/server.ts).

     "Is it PROMINENT for me?" → ranking. Persona decides tab slots, section
                               order and what starts expanded. It never hides
                               anything you are allowed to open.

   This is what makes arbitrary per-user permission patterns work with zero
   extra navigation config. Grant one store keeper `finance.view` and Books
   appears in their menu; nothing in this file changes. Under the old
   persona-gated model that grant was invisible — the server would authorise
   the request, but no link to it existed anywhere in the UI.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface NavContext {
  /** Effective permissions from /api/me — role matrix + all overrides. */
  permissions: string[];
  /** Derived from role. Ranking only. */
  persona: Persona;
}

/**
 * The permission gating a route, walking up the parent chain when the route
 * does not declare its own. Returns undefined for universal routes.
 */
export function permFor(route: RouteEntry): string | undefined {
  let cur: RouteEntry | undefined = route;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.path)) {
    if (cur.perm) return cur.perm;
    seen.add(cur.path);
    cur = cur.parent ? ROUTE_BY_PATH.get(cur.parent) : undefined;
  }
  return undefined;
}

/** The hard gate. Universal routes (no perm anywhere up the chain) always pass. */
export function canAccess(route: RouteEntry, permissions: string[]): boolean {
  const perm = permFor(route);
  return !perm || permissions.includes(perm);
}

/**
 * Fallback tab order, used to backfill when a persona's preferred tabs are not
 * all permitted. Ordered most- to least-broadly-useful. The last four entries
 * are universal, which is what guarantees every user gets four valid tabs no
 * matter how narrow their permission set.
 */
const TAB_BACKFILL: string[] = [
  "/m/home", "/m/inventory", "/m/hr", "/m/accounts", "/m/stock",
  "/m/procurement", "/m/sales", "/m/site", "/m/reports",
  "/m/settings", "/m/me", "/m/queue",
];

/**
 * The four bottom tabs for this user: the persona's preferences, minus
 * anything they cannot access, backfilled to exactly four.
 *
 * A store keeper granted `finance.view` keeps their store-keeper tabs — the
 * grant surfaces in the menu, not by silently rearranging the bar underneath
 * them. Prominence is stable; access is not gated by it.
 */
export function tabsFor(ctx: NavContext): RouteEntry[] {
  const preferred = PERSONA_TAB_PATHS[ctx.persona] ?? PERSONA_TAB_PATHS.executive;
  const picked: RouteEntry[] = [];
  const take = (p: string) => {
    if (picked.length >= 4 || picked.some((r) => r.path === p)) return;
    const entry = ROUTE_BY_PATH.get(p);
    if (entry && entry.kind !== "redirect" && canAccess(entry, ctx.permissions)) picked.push(entry);
  };
  preferred.forEach(take);
  TAB_BACKFILL.forEach(take);
  return picked;
}

/**
 * Which tab should light up for a pathname. Walks the `parent` chain to the
 * nearest tab root, so a detail page five levels deep still highlights the
 * right tab — and, because it returns at most ONE path, three tabs can never
 * light up at once (the old `isModuleActive` compared query-stripped hrefs
 * and matched several tabs on `/m/hr`).
 */
export function activeTabFor(pathname: string, ctx: NavContext): string | undefined {
  const tabPaths = new Set(tabsFor(ctx).map((r) => r.path));
  let cur = matchRoute(pathname);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.path)) {
    seen.add(cur.path);
    if (tabPaths.has(cur.path)) return cur.path;
    cur = cur.parent ? ROUTE_BY_PATH.get(cur.parent) : undefined;
  }
  // Outside every tab root — render no active tab rather than guessing.
  return undefined;
}

/**
 * A menu section. Everything the user can access is present; `prominent`
 * only controls ordering and whether the section starts expanded.
 */
export interface MenuSection {
  module: ModuleId;
  routes: RouteEntry[];
  prominent: boolean;
}

/**
 * The menu: every route this user may open, grouped by module.
 *
 * Nothing accessible is hidden — that is what makes a bespoke permission set
 * usable, and it is why the 17 routes that were reachable only by typing a URL
 * come back into the navigation for the people entitled to them.
 *
 * To avoid the flat-20-item anti-pattern the research warns about, persona
 * decides ORDER and which sections start open, not membership.
 */
export function menuFor(ctx: NavContext): MenuSection[] {
  const buckets: Record<ModuleId, RouteEntry[]> =
    { home: [], inventory: [], hr: [], accounts: [], settings: [] };
  for (const r of ROUTES) {
    if (NON_MENU_KINDS.has(r.kind) || r.hidden) continue;
    if (!canAccess(r, ctx.permissions)) continue;
    buckets[r.module].push(r);
  }
  const prominentModules = new Set(
    tabsFor(ctx).map((t) => t.module).concat(
      ROUTES.filter((r) => r.personas?.includes(ctx.persona)).map((r) => r.module),
    ),
  );
  return (Object.keys(buckets) as ModuleId[])
    .filter((m) => buckets[m].length > 0)
    .map((m) => ({ module: m, routes: buckets[m], prominent: prominentModules.has(m) }))
    .sort((a, b) => Number(b.prominent) - Number(a.prominent));
}

/** Only the badges this user's own tabs need — the old shell fetched every
 *  badge on every page load regardless of persona. */
export function badgeEndpointsFor(ctx: NavContext): { path: string; endpoint: string }[] {
  return tabsFor(ctx)
    .filter((r) => r.badge)
    .map((r) => ({ path: r.path, endpoint: r.badge!.endpoint }));
}

/** Search results must respect the same gate as the menu — otherwise search
 *  becomes a way to walk into a 403. */
export function searchableFor(ctx: NavContext): typeof SEARCH_INDEX {
  return SEARCH_INDEX.filter((r) => {
    const entry = ROUTE_BY_PATH.get(r.path);
    return entry ? canAccess(entry, ctx.permissions) : false;
  });
}

/**
 * Grouped menu for the NavSheet. Returns modules → sub-groups → routes,
 * matching the NavGroup shape the NavSheet expects. Routes within a module
 * are grouped by their immediate parent: top-level routes (parent = module
 * hub) go in a group named after the module; routes under a hub go in a
 * group named after that hub.
 */
export interface MenuGroup {
  title: string;
  routes: RouteEntry[];
}
/**
 * Persona-only menu groups (no permission filtering). Used by the NavSheet
 * sitemap, which shows all routes for the persona — permission gating happens
 * at the page level, not in the navigation tree.
 */
export function menuGroupsForPersona(persona: Persona): Record<string, MenuGroup[]> {
  const buckets: Record<ModuleId, RouteEntry[]> =
    { home: [], inventory: [], hr: [], accounts: [], settings: [] };
  for (const r of ROUTES) {
    if (NON_MENU_KINDS.has(r.kind) || r.hidden) continue;
    if (r.personas && !r.personas.includes(persona)) continue;
    buckets[r.module].push(r);
  }
  const result: Record<string, MenuGroup[]> = {};
  for (const moduleId of Object.keys(buckets) as ModuleId[]) {
    const routes = buckets[moduleId];
    if (routes.length === 0) continue;
    const groups: MenuGroup[] = [];
    const byParent = new Map<string, RouteEntry[]>();
    for (const route of routes) {
      const parentKey = route.parent ?? moduleId;
      if (!byParent.has(parentKey)) byParent.set(parentKey, []);
      byParent.get(parentKey)!.push(route);
    }
    for (const [parentPath, rs] of byParent) {
      const parentEntry = ROUTE_BY_PATH.get(parentPath);
      const title = parentEntry?.title ?? moduleId;
      const kindOrder: Record<string, number> = { hub: 0, list: 1, report: 2, tool: 3 };
      rs.sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9));
      groups.push({ title, routes: rs });
    }
    groups.sort((a, b) => {
      const aIsModule = a.title === moduleId || a.routes.some((r) => r.kind === "hub");
      const bIsModule = b.title === moduleId || b.routes.some((r) => r.kind === "hub");
      if (aIsModule && !bIsModule) return -1;
      if (!aIsModule && bIsModule) return 1;
      return a.title.localeCompare(b.title);
    });
    result[moduleId] = groups;
  }
  return result;
}

export function menuGroupsFor(ctx: NavContext): Record<string, MenuGroup[]> {
  const sections = menuFor(ctx);
  const result: Record<string, MenuGroup[]> = {};
  for (const section of sections) {
    const groups: MenuGroup[] = [];
    // Group routes by their immediate parent
    const byParent = new Map<string, RouteEntry[]>();
    for (const route of section.routes) {
      const parentKey = route.parent ?? section.module;
      if (!byParent.has(parentKey)) byParent.set(parentKey, []);
      byParent.get(parentKey)!.push(route);
    }
    // For each parent group, use the parent's title as the group title
    for (const [parentPath, routes] of byParent) {
      const parentEntry = ROUTE_BY_PATH.get(parentPath);
      const title = parentEntry?.title ?? section.module;
      // Sort: hubs first, then lists, then reports, then tools.
      // Secondary key: persona prominence (routes whose `personas` include
      // the current persona rank higher). This ensures the first 7 routes
      // shown in a progressive-disclosure group are the most relevant.
      const kindOrder: Record<string, number> = { hub: 0, list: 1, report: 2, tool: 3 };
      routes.sort((a, b) => {
        const kd = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
        if (kd !== 0) return kd;
        const aProminent = a.personas?.includes(ctx.persona) ? 0 : 1;
        const bProminent = b.personas?.includes(ctx.persona) ? 0 : 1;
        if (aProminent !== bProminent) return aProminent - bProminent;
        return a.title.localeCompare(b.title);
      });
      groups.push({ title, routes });
    }
    // Sort groups: the module hub's own group first, then alphabetical
    groups.sort((a, b) => {
      const aIsModule = a.title === section.module || a.routes.some((r) => r.kind === "hub");
      const bIsModule = b.title === section.module || b.routes.some((r) => r.kind === "hub");
      if (aIsModule && !bIsModule) return -1;
      if (!aIsModule && bIsModule) return 1;
      return a.title.localeCompare(b.title);
    });
    result[section.module] = groups;
  }
  return result;
}

/** Flat index for the global search overlay and the command palette.
 *  `icon` is included so the search UI can render the same icon the menu
 *  uses, without a second lookup into ROUTE_BY_PATH. */
export const SEARCH_INDEX: { path: string; title: string; hint: string; terms: string; icon: LucideIcon }[] =
  ROUTES.filter((r) => r.kind !== "redirect" && !r.path.includes("["))
    .map((r) => ({
      path: r.path,
      title: r.title,
      hint: r.hint ?? "",
      terms: [r.title, r.hint ?? "", ...(r.keywords ?? [])].join(" ").toLowerCase(),
      icon: r.icon,
    }));

/** Workflow neighbours: same-flow routes plus siblings under the same parent. */
export function relatedTo(pathname: string, limit = 4): RouteEntry[] {
  const entry = matchRoute(pathname);
  if (!entry) return [];
  const sameFlow = entry.flowId
    ? ROUTES.filter((r) => r.flowId === entry.flowId && r.path !== entry.path)
    : [];
  const siblings = entry.parent
    ? childrenOf(entry.parent).filter((r) => r.path !== entry.path && !NON_MENU_KINDS.has(r.kind))
    : [];
  const seen = new Set<string>();
  return [...sameFlow, ...siblings]
    .filter((r) => !seen.has(r.path) && seen.add(r.path))
    .slice(0, limit);
}
