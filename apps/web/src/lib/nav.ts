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
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group: "Overview" | "Inventory" | "Assets" | "Sales" | "System";
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, group: "Overview" },
  { label: "Projects", href: "/projects", icon: Building2, group: "Overview" },

  { label: "Materials", href: "/materials", icon: Package, group: "Inventory" },
  { label: "Procurement", href: "/procurement", icon: Truck, group: "Inventory" },
  { label: "Stock Movements", href: "/stock-movements", icon: Package, group: "Inventory" },

  { label: "Land", href: "/land", icon: LandPlot, group: "Assets" },
  { label: "Built Units", href: "/units", icon: Home, group: "Assets" },

  { label: "Sales", href: "/sales", icon: ShoppingCart, group: "Sales" },
  { label: "Customers", href: "/customers", icon: ShoppingCart, group: "Sales" },

  { label: "Finance", href: "/finance", icon: Wallet, group: "System" },
  { label: "Settings", href: "/settings", icon: Settings, group: "System" },
];

export const navGroups: NavItem["group"][] = [
  "Overview",
  "Inventory",
  "Assets",
  "Sales",
  "System",
];
