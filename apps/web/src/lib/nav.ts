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
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group: "Overview" | "Inventory" | "Assets" | "Finance" | "Sales" | "Workspaces" | "System";
  /** Optional badge endpoint — returns a number to show as a count badge. */
  badge?: { endpoint: string; filter?: string };
  /** Optional role gate — if set, only these roles see the nav item. */
  roles?: string[];
};

/** Lightweight shape for dynamically-loaded workspace nav tabs (fetched client-side). */
export type WorkspaceNavItem = {
  label: string;
  href: string;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, group: "Overview" },
  { label: "My Tasks", href: "/my-tasks", icon: CheckSquare, group: "Overview", badge: { endpoint: "/api/my-tasks?status=PENDING,IN_PROGRESS" } },
  { label: "Task Manager", href: "/tasks", icon: ListChecks, group: "Overview", roles: ["OWNER", "ADMIN", "MANAGER"], badge: { endpoint: "/api/tasks?status=PENDING,IN_PROGRESS" } },
  { label: "Approvals", href: "/approvals", icon: ClipboardCheck, group: "Overview", roles: ["OWNER", "ADMIN", "MANAGER"], badge: { endpoint: "/api/approvals" } },
  { label: "Projects", href: "/projects", icon: Building2, group: "Overview", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT", "SALES"] },

  { label: "Materials", href: "/materials", icon: Package, group: "Inventory", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR"] },
  { label: "Procurement", href: "/procurement", icon: Truck, group: "Inventory", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT"], badge: { endpoint: "/api/purchase-orders?status=DRAFT,APPROVED,ORDERED,PARTIAL" } },
  { label: "Requisitions", href: "/requisitions", icon: ClipboardList, group: "Inventory", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT"], badge: { endpoint: "/api/requisitions?status=SUBMITTED" } },
  { label: "Stock Ledger", href: "/stock-movements", icon: ScrollText, group: "Inventory", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "ACCOUNTANT"] },

  { label: "Land", href: "/land", icon: LandPlot, group: "Assets", roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"] },
  { label: "Built Units", href: "/units", icon: Home, group: "Assets", roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"] },
  { label: "Equipment", href: "/equipment", icon: Wrench, group: "Assets", roles: ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR"] },

  { label: "Finance", href: "/finance", icon: Wallet, group: "Finance", roles: ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] },

  { label: "Sales", href: "/sales", icon: ShoppingCart, group: "Sales", roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"] },
  { label: "Customers", href: "/customers", icon: ShoppingCart, group: "Sales", roles: ["OWNER", "ADMIN", "MANAGER", "SALES"] },

  { label: "Workspaces", href: "/playground", icon: Workflow, group: "Workspaces", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { label: "Workflows", href: "/workflows", icon: Zap, group: "Workspaces", roles: ["OWNER", "ADMIN", "MANAGER"] },

  { label: "Settings", href: "/settings", icon: Settings, group: "System", roles: ["OWNER", "ADMIN"] },
];

export const navGroups: NavItem["group"][] = [
  "Overview",
  "Inventory",
  "Assets",
  "Finance",
  "Sales",
  "Workspaces",
  "System",
];
