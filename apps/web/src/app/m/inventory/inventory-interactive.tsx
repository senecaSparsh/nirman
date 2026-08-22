"use client";

import * as React from "react";
import Link from "next/link";
import {
  Truck,
  ScanLine,
  Send,
  ArrowLeftRight,
  PackagePlus,
  ClipboardCheck,
  TrendingUp,
  FileText,
  ShoppingCart,
  Building2,
  Package,
  LandPlot,
  Users,
  Home,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY HOME — interactive client layer

   Two toggle tabs (Raw Material / Real Estate) that switch the quick
   actions grid below. No popups — actions are direct inline buttons.
   The most important actions for each category are shown here; the rest
   live in the 3-dot side nav (NavSheet).
   ═══════════════════════════════════════════════════════════════════════════ */

interface QuickAction {
  href: string;
  icon: LucideIcon;
  label: string;
}

const RAW_MATERIAL_ACTIONS: QuickAction[] = [
  { href: "/m/quotations", icon: FileText, label: "Quotations" },
  { href: "/m/procurement", icon: Truck, label: "Purchase Orders" },
  { href: "/m/site/receive", icon: ScanLine, label: "Receive" },
  { href: "/m/site/issue", icon: Send, label: "Issue" },
  { href: "/m/transfers", icon: ArrowLeftRight, label: "Transfers" },
  { href: "/m/materials", icon: PackagePlus, label: "Materials" },
  { href: "/m/stock-counts", icon: ClipboardCheck, label: "Stock Counts" },
  { href: "/m/material-sales", icon: TrendingUp, label: "Material Sales" },
];

const REAL_ESTATE_ACTIONS: QuickAction[] = [
  { href: "/m/sales", icon: ShoppingCart, label: "Sales" },
  { href: "/m/projects", icon: Building2, label: "Projects" },
  { href: "/m/units", icon: Package, label: "Units" },
  { href: "/m/land", icon: LandPlot, label: "Land" },
  { href: "/m/customers", icon: Users, label: "Customers" },
  { href: "/m/rentals", icon: Home, label: "Rentals" },
  { href: "/m/work-orders", icon: Wrench, label: "Work Orders" },
  { href: "/m/portal-listings", icon: TrendingUp, label: "Portal Listings" },
];

type CategoryId = "raw-material" | "real-estate";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: string;
  actions: QuickAction[];
}[] = [
  {
    id: "raw-material",
    label: "Raw Material",
    icon: "📦",
    actions: RAW_MATERIAL_ACTIONS,
  },
  {
    id: "real-estate",
    label: "Real Estate",
    icon: "🏗️",
    actions: REAL_ESTATE_ACTIONS,
  },
];

export function InventoryInteractive() {
  const [activeTab, setActiveTab] = React.useState<CategoryId>("raw-material");

  const active = CATEGORIES.find((c) => c.id === activeTab)!;

  return (
    <>
      {/* ── Toggle tabs — Raw Material / Real Estate ── */}
      <div
        className="grid grid-cols-2 gap-1 rounded-[0.625rem] border p-1 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = cat.id === activeTab;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 press transition-colors"
              style={{
                backgroundColor: isActive
                  ? "var(--color-ink-950)"
                  : "transparent",
                color: isActive ? "#fff" : "var(--color-ink-500)",
              }}
            >
              <span className="text-[0.875rem]">{cat.icon}</span>
              <span className="text-[0.6875rem] font-bold">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Quick actions — 4-col grid, switches with tab ── */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {active.actions.map((action) => (
          <QuickActionTile
            key={action.href}
            href={action.href}
            icon={action.icon}
            label={action.label}
          />
        ))}
      </div>
    </>
  );
}

/* ── Quick action tile ── */
function QuickActionTile({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-[0.625rem] border p-2 press"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <span
        className="grid place-items-center w-7 h-7 rounded-[0.375rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Icon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
      </span>
      <span
        className="font-semibold text-[0.5625rem] text-center leading-tight"
        style={{ color: "var(--color-ink-950)" }}
      >
        {label}
      </span>
    </Link>
  );
}
