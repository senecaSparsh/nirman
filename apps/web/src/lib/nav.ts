import {
  Package,
  Truck,
  LandPlot,
  Home,
  ShoppingCart,
  KeyRound,
  Wallet,
  Settings,
  Workflow,
  Wrench,
  ClipboardList,
  ScrollText,
  CheckSquare,
  Zap,
  ListChecks,
  ClipboardCheck,
  ScanLine,
  Undo2,
  BookOpen,
  Users,
  BarChart3,
  CalendarCheck,
  TrendingUp,
  Receipt,
  ShieldCheck,
  Boxes,
  Building2,
  HardHat,
  Sun,
  Landmark,
  FileText,
  Layers,
  UserCheck,
  Ruler,
  Globe,
  Recycle,
  type LucideIcon,
} from "lucide-react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * INFORMATION ARCHITECTURE — 4 worlds + settings gear
 *
 * The owner's map is a pipeline, not a tree:
 *
 *   Today        who you are + what needs you      (cross-cutting)
 *   Build        the entire asset lifecycle
 *     ├─ Acquire     land · suppliers · rate contracts
 *     ├─ Procure     indents → PO → GRN → returns
 *     ├─ Stock       on-hand · transfers · issues · scrap · counts
 *     ├─ Construct   projects · BOQ · WBS · MB · work orders
 *     └─ Sell        units · sales · rentals · portal listings
 *   People       labour · attendance · DPR · payroll
 *   Books        cash · GL · tax · analysis
 *   ⚙ Settings   company · access · automation (gear, not a world)
 *
 * The old Inventory world had two sub-branches (Raw Material, Real
 * Estate) that added a navigation layer and hid the pipeline. Build
 * merges them into five flat lifecycle sections — the pipeline is
 * visible in the nav itself. Role-adaptive section visibility makes
 * the panel genuinely smaller for SALES (Sell only) and SUPERVISOR
 * (Procure + Stock + Construct).
 *
 * Rules this file enforces:
 *  - Four worlds in the rail. Settings is a gear at the bottom.
 *  - Every world has a colour used purely for wayfinding.
 *  - Every link declares which roles may see it. A SALES user's nav
 *    is genuinely smaller, not the same nav with dead ends.
 *  - Every link has a `hint` — one plain-language line. It powers the
 *    world overview cards, the command palette and tooltips, so we
 *    write the explanation once.
 *  - A link may be `hidden` — present in the command palette and on the
 *    reports page, but not rendered in the sidebar.
 *  - A link may carry a `group` — the Build lifecycle section it
 *    belongs to, used by the /reports page to cluster reports.
 * ═══════════════════════════════════════════════════════════════════
 */

export type WorldKey = "today" | "build" | "hr" | "finance";

/** Every role in the system. Shorthand for "everyone sees this". */
export const EVERYONE = ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "SALES", "ACCOUNTANT"];
/** Roles that run the business day-to-day. */
const OPS = ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR"];
/** Roles that touch money. */
const BOOKS = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"];
/** Roles that touch selling. */
const SELLING = ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"];
/** Leadership only. */
const LEADERSHIP = ["OWNER", "ADMIN", "MANAGER"];
const OWNERS = ["OWNER", "ADMIN"];
/** Roles that see reports (finance users plus field/sales who need a few). */
const REPORTS = [...BOOKS, "SUPERVISOR", "SALES"];

export type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One plain-language line. Written once, reused everywhere. */
  hint: string;
  /** Roles allowed to see this link. Omit = everyone. */
  roles?: string[];
  /** Live count badge — endpoint returns an array; we show its length. */
  badge?: { endpoint: string };
  /** Extra search terms for the command palette. */
  keywords?: string[];
  /**
   * Present in the command palette and on the reports page, but not
   * rendered in the sidebar. Used for the individual report links so
   * the Books sidebar stays short — the /reports page is their picker.
   */
  hidden?: boolean;
  /** The lifecycle section this report belongs to — drives grouping on /reports. */
  group?: string;
};

export type NavSection = {
  label: string;
  items: NavLink[];
};

/**
 * Kept for back-compat — older code may reference NavSubBranch. Build
 * no longer uses sub-branches (it's flat sections), but the type is
 * harmless to keep.
 */
export type NavSubBranch = {
  label: string;
  icon: LucideIcon;
  hint?: string;
  sections: NavSection[];
};

export type World = {
  key: WorldKey;
  label: string;
  /** What this branch is, in the owner's words. Shown under the title. */
  tagline: string;
  icon: LucideIcon;
  /** Wayfinding colour — CSS var reference. */
  color: string;
  /** Where entering the branch takes you. */
  href: string;
  /** Roles that can see this branch at all. */
  roles?: string[];
  /**
   * Flat sections — the lifecycle groups. For Build these are the
   * five pipeline stages (Acquire, Procure, Stock, Construct, Sell).
   * Role-adaptive: sections with no visible items are filtered out
   * by `worldsFor()`, so each role sees only their stages.
   */
  sections: NavSection[];
  /**
   * Kept for back-compat — always undefined now. Build is flat.
   */
  branches?: NavSubBranch[];
};

// ── Report group labels (Build lifecycle sections) ──────────────────
const RG = {
  PROCURE: "Procurement",
  STOCK: "Stock & Materials",
  CONSTRUCT: "Construction & Cost",
  SELL: "Sales & Revenue",
  PEOPLE: "People & Payroll",
  BOOKS: "Books & Tax",
} as const;

export const WORLDS: World[] = [
  // ══ TODAY ═══════════════════════════════════════════════════════
  {
    key: "today",
    label: "Today",
    tagline: "Everything about you — your role, your work, your activity",
    icon: Sun,
    color: "var(--color-world-today)",
    href: "/",
    sections: [
      {
        label: "Overview",
        items: [
          {
            label: "Profile",
            href: "/",
            icon: Sun,
            hint: "Your profile — identity, role, permissions, activity, and everything waiting on you",
            keywords: ["home", "dashboard", "profile", "me", "my account", "overview", "today", "who am i"],
          },
        ],
      },
      {
        label: "Your work",
        items: [
          {
            label: "My Tasks",
            href: "/my-tasks",
            icon: CheckSquare,
            hint: "Tasks assigned to you, with steps and timers (team tasks tab inside for leads)",
            badge: { endpoint: "/api/my-tasks?status=PENDING,IN_PROGRESS" },
            keywords: ["todo", "assigned", "mine", "my tasks", "delegate", "assign", "team work", "task manager"],
          },
          {
            label: "Approvals",
            href: "/approvals",
            icon: ClipboardCheck,
            hint: "One queue for every purchase order and indent awaiting your sign-off",
            roles: LEADERSHIP,
            badge: { endpoint: "/api/approvals" },
            keywords: ["approve", "sign off", "authorise", "pending", "approval"],
          },
        ],
      },
      {
        label: "Insights",
        items: [
          {
            label: "All Insights",
            href: "/reports",
            icon: BarChart3,
            hint: "Every report, grouped by the Build lifecycle stage it belongs to",
            roles: REPORTS,
            keywords: ["report", "analysis", "analytics", "insight", "insights"],
          },
        ],
      },
    ],
  },

  // ══ BUILD ════════════════════════════════════════════════════════
  // The merged pipeline. Five flat lifecycle sections — no sub-branches.
  // Entry point is /projects (viewable by every role) so a SALES user
  // who enters Build lands on a page they can see. Sections they can't
  // act on are filtered out by worldsFor(), so their panel is genuinely
  // smaller.
  {
    key: "build",
    label: "Build",
    tagline: "The asset lifecycle — acquire land, buy material, build, sell",
    icon: Building2,
    color: "var(--color-world-inventory)",
    href: "/projects",
    roles: EVERYONE,
    sections: [
      // ── Acquire ────────────────────────────────────────────────
      {
        label: "Acquire",
        items: [
          {
            label: "Land Parcels",
            href: "/land",
            icon: LandPlot,
            hint: "What land you own, what it cost, and how it's been subdivided",
            roles: SELLING,
            keywords: ["plot", "parcel", "partition", "subdivide", "khasra", "acquisition", "land bank"],
          },
          {
            label: "Suppliers",
            href: "/suppliers",
            icon: Landmark,
            hint: "Who you buy from, what you owe them, and how they've performed (ratings tab inside)",
            roles: [...OPS, "ACCOUNTANT"],
            keywords: ["vendor", "seller", "party", "supplier", "vendor rating", "supplier score", "performance", "on-time", "quality", "price"],
          },
          {
            label: "Rate Contracts",
            href: "/rate-contracts",
            icon: FileText,
            hint: "Pre-negotiated framework agreements with suppliers at fixed rates",
            roles: BOOKS,
            keywords: ["rate contract", "framework agreement", "fixed rate", "supplier agreement"],
          },
        ],
      },
      // ── Procure ────────────────────────────────────────────────
      {
        label: "Procure",
        items: [
          {
            label: "Material Indents",
            href: "/requisitions",
            icon: ClipboardList,
            hint: "Site raises an indent for material. Approve it, then convert it to a purchase order",
            roles: [...OPS, "ACCOUNTANT"],
            badge: { endpoint: "/api/requisitions?status=SUBMITTED" },
            keywords: ["indent", "requisition", "request", "ask", "demand", "material request"],
          },
          {
            label: "Purchase Orders",
            href: "/procurement",
            icon: Truck,
            hint: "What you've ordered, from whom, and what's still to arrive at site",
            roles: [...OPS, "ACCOUNTANT"],
            badge: { endpoint: "/api/purchase-orders?status=DRAFT,APPROVED,ORDERED,PARTIAL" },
            keywords: ["po", "order", "buy", "procure", "procurement", "purchase order"],
          },
          {
            label: "GRN / Receive",
            href: "/field",
            icon: ScanLine,
            hint: "Make a goods receipt note (GRN) by scanning the delivery from your phone — works with no signal",
            roles: OPS,
            keywords: ["grn", "goods receipt note", "delivery", "gate entry", "inward", "scan", "receive"],
          },
          {
            label: "Purchase Returns",
            href: "/supplier-returns",
            icon: Undo2,
            hint: "Send defective or excess stock back to a supplier and track the debit note",
            roles: [...OPS, "ACCOUNTANT"],
            keywords: ["return", "debit note", "credit note", "defective", "reject", "send back", "purchase return"],
          },
          // ── Procurement reports (hidden from sidebar, on /reports) ──
          {
            label: "Purchase Register",
            href: "/reports/purchase-register",
            icon: Receipt,
            hint: "Every purchase bill and purchase return in the period",
            roles: [...BOOKS, "SUPERVISOR"],
            keywords: ["purchase register", "bill register", "p-register", "return register", "purchase bill"],
            hidden: true,
            group: RG.PROCURE,
          },
          {
            label: "Purchase Trends",
            href: "/reports/purchase-trends",
            icon: Truck,
            hint: "What you buy most, from whom, and whether rates are moving",
            roles: BOOKS,
            keywords: ["buying", "price", "rate", "supplier", "trend"],
            hidden: true,
            group: RG.PROCURE,
          },
          {
            label: "Purchaser Performance",
            href: "/reports/purchaser-performance",
            icon: UserCheck,
            hint: "How many quotes each purchaser collected and how cost-efficient their buys are",
            roles: BOOKS,
            keywords: ["purchaser", "buyer", "performance", "quotes", "savings", "procurement kpi"],
            hidden: true,
            group: RG.PROCURE,
          },
        ],
      },
      // ── Stock ──────────────────────────────────────────────────
      {
        label: "Stock",
        items: [
          {
            label: "Stock Ledger",
            href: "/stock",
            icon: Boxes,
            hint: "The full stock lifecycle — on-hand by location, every movement, transfers, issues to site, scrap, and counts",
            roles: [...OPS, "ACCOUNTANT"],
            keywords: ["stock", "on hand", "movement", "transfer", "issue", "audit", "history", "ledger", "stock register", "scrap", "count", "physical verification", "reconcile", "variance"],
          },
          {
            label: "Material Catalogue",
            href: "/materials",
            icon: Package,
            hint: "Every item you buy — its unit, reorder level and current cost",
            roles: OPS,
            keywords: ["item", "sku", "catalog", "cement", "steel", "material", "rate"],
          },
          {
            label: "Equipment",
            href: "/equipment",
            icon: Wrench,
            hint: "Machines and tools — where they are, who has them, and when they were last serviced",
            roles: OPS,
            keywords: ["machine", "tool", "asset", "plant", "maintenance", "equipment"],
          },
          {
            label: "Consumption Benchmarks",
            href: "/standard-consumptions",
            icon: Ruler,
            hint: "Define standard material consumption rates per work type — the system auto-detects over-consumption and scrap during DPR submission",
            roles: [...OPS, "ACCOUNTANT"],
            keywords: ["standard consumption", "benchmark", "variance", "norms", "work type", "scrap detection"],
          },
          {
            label: "Material Reconciliation",
            href: "/material-reconciliation",
            icon: ClipboardCheck,
            hint: "Required vs issued vs consumed vs stock — wastage flags and tolerance alerts per project",
            roles: OPS,
            keywords: ["reconciliation", "wastage", "consumption", "tolerance", "variance", "stock"],
          },
          // ── Stock reports (hidden from sidebar, on /reports) ──
          {
            label: "Inventory Value",
            href: "/reports/inventory-value",
            icon: Package,
            hint: "What your stock is worth right now, by location",
            roles: [...BOOKS, "SUPERVISOR"],
            keywords: ["valuation", "stock value", "closing stock", "mac", "inventory value"],
            hidden: true,
            group: RG.STOCK,
          },
          {
            label: "Stock Movement",
            href: "/reports/stock-movement-summary",
            icon: ScrollText,
            hint: "Opening, received, issued and balance — the stock flow statement",
            roles: [...BOOKS, "SUPERVISOR"],
            keywords: ["saleable stock", "stock flow", "opening", "closing", "movement summary", "stock statement"],
            hidden: true,
            group: RG.STOCK,
          },
          {
            label: "Issue Register",
            href: "/reports/issue-register",
            icon: ClipboardList,
            hint: "Every stock issue slip in the period — with number, date and amount",
            roles: [...OPS, "ACCOUNTANT"],
            keywords: ["issue slip", "issue register", "sa", "stock issue summary", "material issue"],
            hidden: true,
            group: RG.STOCK,
          },
          {
            label: "Cost Centres",
            href: "/reports/department-consumption",
            icon: BarChart3,
            hint: "Which department or site consumed what",
            roles: [...BOOKS, "SUPERVISOR"],
            keywords: ["department", "consumption", "cost center", "usage", "cost centre"],
            hidden: true,
            group: RG.STOCK,
          },
        ],
      },
      // ── Construct ──────────────────────────────────────────────
      {
        label: "Construct",
        items: [
          {
            label: "Projects",
            href: "/projects",
            icon: Building2,
            hint: "Each site: its phases, its spend, and its cost per sq.ft (renovations shown via type filter)",
            roles: EVERYONE,
            keywords: ["site", "tower", "phase", "construction", "wip", "project", "rera", "renovation", "addition", "improvement", "refurbish", "value add"],
          },
          {
            label: "BOQ",
            href: "/boq",
            icon: ClipboardList,
            hint: "Bill of Quantities — the project cost budget, item by item",
            roles: BOOKS,
            keywords: ["bill of quantities", "boq", "estimate", "budget", "rate analysis", "quantity survey"],
          },
          {
            label: "Schedule (WBS)",
            href: "/wbs",
            icon: ListChecks,
            hint: "Work Breakdown Structure — activities, dependencies, critical path",
            roles: BOOKS,
            keywords: ["wbs", "schedule", "gantt", "critical path", "dependency", "milestone", "activity"],
          },
          {
            label: "Measurement Book",
            href: "/measurement-book",
            icon: Ruler,
            hint: "Site engineer's verified record of actual quantities executed",
            roles: OPS,
            keywords: ["mb", "measurement", "quantity", "site", "executed", "verified", "approved"],
          },
          {
            label: "Work Orders",
            href: "/work-orders",
            icon: HardHat,
            hint: "Subcontractor work orders and RA bills with TDS and retention",
            roles: BOOKS,
            keywords: ["subcontractor", "work order", "ra bill", "running account", "tds", "retention", "contractor"],
          },
          // ── Construction reports (hidden from sidebar, on /reports) ──
          {
            label: "Project Progress",
            href: "/reports/project-progress",
            icon: Building2,
            hint: "Planned against actual — per site",
            roles: [...BOOKS, "SUPERVISOR", "SALES"],
            keywords: ["progress", "schedule", "delay", "phase", "completion", "project progress"],
            hidden: true,
            group: RG.CONSTRUCT,
          },
          {
            label: "Budget Variance",
            href: "/budget-variance",
            icon: BarChart3,
            hint: "BOQ budget vs actual cost — line by line, with overrun flags per project",
            roles: BOOKS,
            keywords: ["budget", "variance", "boq vs actual", "overrun", "cost control"],
            hidden: true,
            group: RG.CONSTRUCT,
          },
          {
            label: "Project Control",
            href: "/project-control",
            icon: TrendingUp,
            hint: "EVM metrics, cost-overrun forecast, material take-off and commitments — across all live projects",
            roles: LEADERSHIP,
            keywords: ["evm", "earned value", "cpi", "spi", "cost overrun", "forecast", "commitment", "take off", "mto"],
            hidden: true,
            group: RG.CONSTRUCT,
          },
          {
            label: "Profit Center",
            href: "/profit-center",
            icon: Wallet,
            hint: "Per-project P&L — revenue vs cost, margin and cost per sq.ft for a single project",
            roles: LEADERSHIP,
            keywords: ["profit", "loss", "pnl", "margin", "revenue", "cost per sqft", "job costing"],
            hidden: true,
            group: RG.CONSTRUCT,
          },
        ],
      },
      // ── Sell ───────────────────────────────────────────────────
      {
        label: "Sell",
        items: [
          {
            label: "Built Units",
            href: "/units",
            icon: Home,
            hint: "Flats, shops, plots — what's available, booked, or sold (portal listings tab inside)",
            roles: SELLING,
            keywords: ["flat", "shop", "apartment", "unit", "available", "stock", "inventory", "99acres", "magicbricks", "housing.com", "portal", "listing", "property", "sync", "marketplace"],
          },
          {
            label: "Sales",
            href: "/sales",
            icon: ShoppingCart,
            hint: "Bookings, payment plans and what's still to collect (customers tab inside)",
            roles: SELLING,
            keywords: ["booking", "sale", "deal", "agreement", "collection", "allotment", "buyer", "client", "tenant", "party", "customer"],
          },
          {
            label: "Rentals",
            href: "/rentals",
            icon: KeyRound,
            hint: "Units you've rented out and the rent due each month",
            roles: SELLING,
            keywords: ["lease", "tenant", "rent", "monthly", "leave and license"],
          },
          {
            label: "Material Sales",
            href: "/material-sales",
            icon: Recycle,
            hint: "Sell surplus or scrap material — revenue recovers project cost when linked to a project",
            roles: SELLING,
            keywords: ["surplus", "scrap", "resale", "material sale", "cost recovery", "by-product"],
          },
          {
            label: "Portal Listings",
            href: "/portal-listings",
            icon: Globe,
            hint: "Sync available built units to 99acres, MagicBricks and Housing.com",
            roles: SELLING,
            keywords: ["99acres", "magicbricks", "housing.com", "portal", "listing", "sync", "marketplace", "property portal"],
          },
          // ── Sales reports (hidden from sidebar, on /reports) ──
          {
            label: "Sales & Revenue",
            href: "/reports/sales-revenue",
            icon: ShoppingCart,
            hint: "What sold, at what price, and the trend",
            roles: [...BOOKS, "SALES"],
            keywords: ["revenue", "sales", "booking", "trend", "collection"],
            hidden: true,
            group: RG.SELL,
          },
        ],
      },
    ],
  },

  // ══ PEOPLE ═══════════════════════════════════════════════════════
  {
    key: "hr",
    label: "People",
    tagline: "Labour, attendance and time — and what it all costs",
    icon: HardHat,
    color: "var(--color-world-hr)",
    href: "/hr",
    roles: [...OPS, "ACCOUNTANT"],
    sections: [
      {
        label: "Overview",
        items: [
          {
            label: "People Today",
            href: "/hr",
            icon: HardHat,
            hint: "Who's on site right now, and this month's labour cost",
            roles: [...OPS, "ACCOUNTANT"],
            keywords: ["hr", "workforce", "overview", "headcount", "labour"],
          },
        ],
      },
      {
        label: "Who works here",
        items: [
          {
            label: "Employees",
            href: "/hr/employees",
            icon: Users,
            hint: "Staff and labour — their wage rate and where they're posted (crews/gangs tab inside)",
            roles: [...OPS, "ACCOUNTANT"],
            keywords: ["staff", "labour", "worker", "mazdoor", "roster", "employee", "gang", "crew", "team", "group", "contractor", "mazdoor gang"],
          },
        ],
      },
      {
        label: "Every day",
        items: [
          {
            label: "Attendance",
            href: "/hr/attendance",
            icon: CalendarCheck,
            hint: "Mark present, half-day or absent — and the hours worked (haziri). Leave tab inside.",
            roles: [...OPS, "ACCOUNTANT"],
            keywords: ["present", "absent", "haziri", "muster", "time", "hours", "attendance", "leave", "holiday", "off", "chutti", "absence"],
          },
          {
            label: "Daily Progress",
            href: "/hr/dprs",
            icon: ClipboardList,
            hint: "The DPR — what work got done on site today, and by whom",
            roles: OPS,
            keywords: ["dpr", "daily progress report", "daily report", "progress", "site report", "work done"],
          },
        ],
      },
      {
        label: "Pay",
        items: [
          {
            label: "Payroll",
            href: "/hr/payroll",
            icon: Wallet,
            hint: "Turn attendance into salary — run it, review it, pay it",
            roles: BOOKS,
            keywords: ["salary", "wage", "pay", "tankha", "run", "payroll"],
          },
          // ── People reports (hidden from sidebar, on /reports) ──
          {
            label: "Labour Cost",
            href: "/reports/payroll-expense",
            icon: HardHat,
            hint: "What people cost — per site and per month",
            roles: BOOKS,
            keywords: ["payroll", "wage", "labour cost", "salary expense", "labour"],
            hidden: true,
            group: RG.PEOPLE,
          },
        ],
      },
    ],
  },

  // ══ BOOKS ════════════════════════════════════════════════════════
  // Pure accounting: cash, GL, GST, P&L. Reports about operations
  // (procurement, stock, construction, sales, labour) live in their
  // respective Build/People sections now — you find a report where you
  // find the data. Books is only for the books themselves.
  // Entry point is /finance. Only BOOKS roles (OWNER, ADMIN, MANAGER,
  // ACCOUNTANT) can see this world.
  {
    key: "finance",
    label: "Books",
    tagline: "Cash in, cash out, books that balance",
    icon: Wallet,
    color: "var(--color-world-finance)",
    href: "/finance",
    roles: BOOKS,
    sections: [
      {
        label: "Cash",
        items: [
          {
            label: "Cash & Expenses",
            href: "/finance",
            icon: Wallet,
            hint: "Expenses, project costs and payments — all in one place",
            roles: BOOKS,
            keywords: ["cash", "expense", "payment", "cost", "spend", "finance"],
          },
          {
            label: "Outstanding Dues",
            href: "/reports/pending-payments",
            icon: ClipboardCheck,
            hint: "Who owes you, who you owe, and how overdue it is",
            roles: BOOKS,
            keywords: ["receivable", "payable", "outstanding", "overdue", "dues", "pending payment"],
          },
          {
            label: "Expenses",
            href: "/reports/expenses",
            icon: Receipt,
            hint: "Where the money went — by category and by site",
            roles: BOOKS,
            keywords: ["spend", "opex", "category", "overhead", "expense"],
          },
        ],
      },
      {
        label: "Books",
        items: [
          {
            label: "General Ledger",
            href: "/gl",
            icon: BookOpen,
            hint: "Double-entry books, posted automatically — trial balance always ties (Tally sync panel inside)",
            roles: BOOKS,
            keywords: ["gl", "journal", "trial balance", "accounting", "tally", "double entry", "ledger"],
          },
          {
            label: "GST",
            href: "/reports/gst",
            icon: FileText,
            hint: "Input tax credit (ITC), output tax and what's payable this period",
            roles: BOOKS,
            keywords: ["tax", "gst", "itc", "input tax credit", "return", "filing", "gstr"],
          },
          // ── Books reports (hidden from sidebar, on /reports) ──
          {
            label: "Profit & Loss",
            href: "/reports/profit",
            icon: TrendingUp,
            hint: "Company-wide P&L — revenue minus cost across all projects",
            roles: BOOKS,
            keywords: ["pnl", "profit", "margin", "loss", "bottom line", "profit and loss"],
            hidden: true,
            group: RG.BOOKS,
          },
          {
            label: "Comparative Analysis",
            href: "/reports/comparative",
            icon: Layers,
            hint: "This period against last — side by side, any metric",
            roles: BOOKS,
            keywords: ["compare", "period", "variance", "month on month", "yoy", "year on year"],
            hidden: true,
            group: RG.BOOKS,
          },
        ],
      },
    ],
  },
];

// ── Settings links (gear, not a world) ──────────────────────────────
// These are rendered as a gear icon at the bottom of the rail, not as
// a world. The gear opens the settings page directly.
export const SETTINGS_LINKS: NavLink[] = [
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    hint: "Company details, locations, cost centres, people and users (WhatsApp/email alert templates panel inside)",
    roles: OWNERS,
    keywords: ["config", "company", "preferences", "users", "locations", "settings", "notification", "whatsapp", "alert"],
  },
  {
    label: "Who Sees What",
    href: "/settings/project-assignments",
    icon: ShieldCheck,
    hint: "Scope a person to a site so they only see their own work",
    roles: OWNERS,
    keywords: ["access", "permission", "role", "assignment", "scope", "sub admin", "user access"],
  },
  {
    label: "Workflows",
    href: "/workflows",
    icon: Zap,
    hint: "Rules that act on their own — reorder, remind, escalate",
    roles: LEADERSHIP,
    keywords: ["automation", "rule", "trigger", "auto", "workflow"],
  },
  {
    label: "Workspaces",
    href: "/playground",
    icon: Workflow,
    hint: "Model your business on a canvas before you commit to it",
    roles: LEADERSHIP,
    keywords: ["canvas", "playground", "model", "diagram", "plan", "workspace"],
  },
];

// ── Lookups ───────────────────────────────────────────────────────

export const WORLD_BY_KEY: Record<WorldKey, World> = WORLDS.reduce(
  (acc, w) => ({ ...acc, [w.key]: w }),
  {} as Record<WorldKey, World>,
);

/** Flat list of every link, in world order. Includes hidden links. */
export const ALL_LINKS: (NavLink & { world: WorldKey })[] = WORLDS.flatMap((w) =>
  w.sections.flatMap((s) => s.items.map((i) => ({ ...i, world: w.key }))),
);

/** Flat list of settings links (not part of any world). */
export const ALL_SETTINGS_LINKS: NavLink[] = SETTINGS_LINKS;

function roleAllowed(roles: string[] | undefined, role: string): boolean {
  return !roles || roles.includes(role);
}

/** Worlds this role may enter, with sections/items already filtered. */
export function worldsFor(role: string): World[] {
  return WORLDS.map((w) => ({
    ...w,
    sections: w.sections
      .map((s) => ({ ...s, items: s.items.filter((i) => roleAllowed(i.roles, role)) }))
      .filter((s) => s.items.length > 0),
  })).filter((w) => roleAllowed(w.roles, role) && w.sections.length > 0);
}

/** Settings links this role may see. */
export function settingsLinksFor(role: string): NavLink[] {
  return SETTINGS_LINKS.filter((l) => roleAllowed(l.roles, role));
}

/** Links this role may see, flat. Used by the command palette. */
export function linksFor(role: string): (NavLink & { world: WorldKey })[] {
  const allowed = new Set(worldsFor(role).map((w) => w.key));
  return ALL_LINKS.filter((l) => allowed.has(l.world) && roleAllowed(l.roles, role));
}

/**
 * Which world does this path belong to?
 *
 * Longest-prefix wins so `/reports/gst` resolves to Books (which
 * owns that link) rather than Today, and `/` only ever matches Today.
 * Settings paths (/settings, /workflows, /playground) don't belong to
 * any world — they return the Today world as a neutral fallback (the
 * rail highlights the gear, not a world).
 */
export function worldForPath(pathname: string): World {
  let best: { world: World; len: number } | null = null;
  for (const w of WORLDS) {
    for (const s of w.sections) {
      for (const i of s.items) {
        const matches = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
        if (matches && (!best || i.href.length > best.len)) {
          best = { world: w, len: i.href.length };
        }
      }
    }
  }
  // Unmapped detail routes fall back to their path root.
  if (!best) {
    const root = "/" + pathname.split("/").filter(Boolean)[0];
    for (const w of WORLDS) {
      if (w.sections.some((s) => s.items.some((i) => i.href.startsWith(root) && root !== "/"))) {
        return w;
      }
    }
    return WORLD_BY_KEY.today;
  }
  return best.world;
}

/** True if this path belongs to the settings gear, not any world. */
export function isSettingsPath(pathname: string): boolean {
  return SETTINGS_LINKS.some((l) => pathname.startsWith(l.href));
}

/** The exact link matching a path, if any. Used for page titles. */
export function linkForPath(pathname: string): (NavLink & { world: WorldKey }) | undefined {
  return ALL_LINKS.filter((l) =>
    l.href === "/" ? pathname === "/" : pathname.startsWith(l.href),
  ).sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Where a role lands after sign-in. A supervisor's job starts on site,
 * not in a boardroom dashboard; an accountant's starts in the books.
 * SALES lands in Build (their world is Sell). Books is now pure
 * accounting — only BOOKS roles can enter it, and its default entry
 * is /finance.
 */
export function homeWorldFor(role: string): World {
  const map: Record<string, WorldKey> = {
    SUPERVISOR: "hr",
    SALES: "build",
    ACCOUNTANT: "finance",
  };
  const key = map[role];
  if (key) {
    const w = WORLD_BY_KEY[key];
    if (w && roleAllowed(w.roles, role)) return w;
  }
  return WORLD_BY_KEY.today;
}

/** Every badge endpoint a role can see — fetched once by the shell. */
export function badgeLinksFor(role: string): NavLink[] {
  return linksFor(role).filter((l) => l.badge);
}

// ── Back-compat shims ─────────────────────────────────────────────
// Older components imported a flat `navItems` list and `STAGE_COLORS`.
// Keep them working while they migrate to the world model.

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group: string;
  badge?: { endpoint: string };
  roles?: string[];
};

export const navItems: NavItem[] = ALL_LINKS.map((l) => ({
  label: l.label,
  href: l.href,
  icon: l.icon,
  group: WORLD_BY_KEY[l.world].label,
  badge: l.badge,
  roles: l.roles,
}));

export const navGroups: string[] = WORLDS.map((w) => w.label);

export const STAGE_COLORS: Record<string, string> = WORLDS.reduce(
  (acc, w) => ({ ...acc, [w.label]: w.color }),
  {} as Record<string, string>,
);

export type WorkspaceNavItem = { label: string; href: string };
