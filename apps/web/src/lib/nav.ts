import {
  LayoutDashboard,
  Building2,
  Package,
  Truck,
  LandPlot,
  Home,
  ShoppingCart,
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
  BookOpen,
  Users,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Lifecycle stage — the nav is grouped by the business flow, not by ERP module.
   * Procure: buying + receiving materials
   * Build: projects + stock + equipment
   * Sell: land + units + customers
   * Account: finance + GL
   * Manage: tasks + approvals
   * System: settings + workspaces
   */
  group: "Procure" | "Build" | "Sell" | "Account" | "Manage" | "System";
  /** Optional badge endpoint — returns a number to show as a count badge. */
  badge?: { endpoint: string; filter?: string };
  /** Optional role gate — if set, only these roles see the nav item. */
  roles?: string[];
};

/**
 * Stage colors — each lifecycle stage has a distinct color used as a
 * left-border accent on nav items and section headers. This gives the
 * app a visual identity that maps to the business flow.
 */
export const STAGE_COLORS: Record<NavItem["group"], string> = {
  Procure: "var(--color-stage-procure)",
  Build: "var(--color-stage-build)",
  Sell: "var(--color-stage-sell)",
  Account: "var(--color-stage-account)",
  Manage: "var(--color-stage-manage)",
  System: "var(--color-stage-system)",
};

/** Lightweight shape for dynamically-loaded workspace nav tabs (fetched client-side). */
export type WorkspaceNavItem = {
  label: string;
  href: string;
};

export const navItems: NavItem[] = [
  // ── Procure: buy + receive materials ──────────────────────────
  { label: "Requisitions", href: "/requisitions", icon: ClipboardList, group: "Procure", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT"], badge: { endpoint: "/api/requisitions?status=SUBMITTED" } },
  { label: "Procurement", href: "/procurement", icon: Truck, group: "Procure", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT"], badge: { endpoint: "/api/purchase-orders?status=DRAFT,APPROVED,ORDERED,PARTIAL" } },
  { label: "Field Receiving", href: "/field", icon: ScanLine, group: "Procure", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR"] },

  // ── Build: projects + stock + equipment ───────────────────────
  { label: "Projects", href: "/projects", icon: Building2, group: "Build", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT", "SALES"] },
  { label: "Materials", href: "/materials", icon: Package, group: "Build", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR"] },
  { label: "Stock Ledger", href: "/stock-movements", icon: ScrollText, group: "Build", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT"] },
  { label: "Cost-Center Report", href: "/reports/department-consumption", icon: BarChart3, group: "Build", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT"] },
  { label: "Equipment", href: "/equipment", icon: Wrench, group: "Build", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR"] },

  // ── Sell: land + units + customers ────────────────────────────
  { label: "Land", href: "/land", icon: LandPlot, group: "Sell", roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"] },
  { label: "Built Units", href: "/units", icon: Home, group: "Sell", roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"] },
  { label: "Sales", href: "/sales", icon: ShoppingCart, group: "Sell", roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"] },
  { label: "Customers", href: "/customers", icon: Users, group: "Sell", roles: ["OWNER", "ADMIN", "MANAGER", "SALES"] },

  // ── Account: finance + GL ─────────────────────────────────────
  { label: "Finance", href: "/finance", icon: Wallet, group: "Account", roles: ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { label: "General Ledger", href: "/gl", icon: BookOpen, group: "Account", roles: ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] },

  // ── Manage: tasks + approvals ─────────────────────────────────
  { label: "My Tasks", href: "/my-tasks", icon: CheckSquare, group: "Manage", badge: { endpoint: "/api/my-tasks?status=PENDING,IN_PROGRESS" } },
  { label: "Task Manager", href: "/tasks", icon: ListChecks, group: "Manage", roles: ["OWNER", "ADMIN", "MANAGER"], badge: { endpoint: "/api/tasks?status=PENDING,IN_PROGRESS" } },
  { label: "Approvals", href: "/approvals", icon: ClipboardCheck, group: "Manage", roles: ["OWNER", "ADMIN", "MANAGER"], badge: { endpoint: "/api/approvals" } },

  // ── System: settings + workspaces ─────────────────────────────
  { label: "Workspaces", href: "/playground", icon: Workflow, group: "System", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { label: "Workflows", href: "/workflows", icon: Zap, group: "System", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { label: "Settings", href: "/settings", icon: Settings, group: "System", roles: ["OWNER", "ADMIN"] },
];

/**
 * Lifecycle stages in business-flow order: Procure → Build → Sell → Account.
 * Manage + System are utility stages, shown after the flow.
 */
export const navGroups: NavItem["group"][] = [
  "Procure",
  "Build",
  "Sell",
  "Account",
  "Manage",
  "System",
];
