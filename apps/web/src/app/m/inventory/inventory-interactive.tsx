"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  { href: "/m/procurement?tab=indents", icon: ShoppingCart, label: "Indents" },
  { href: "/m/procurement?tab=quotations", icon: FileText, label: "Quotations" },
  { href: "/m/procurement", icon: Truck, label: "Purchase Orders" },
  { href: "/m/site/receive", icon: ScanLine, label: "Receive" },
  { href: "/m/stock-out", icon: Send, label: "Stock Out (Transfer / Issue)" },
  { href: "/m/materials", icon: PackagePlus, label: "Materials" },
  { href: "/m/stock", icon: Package, label: "Stock" },
  { href: "/m/material-sales", icon: TrendingUp, label: "Material Sales" },
];

const REAL_ESTATE_ACTIONS: QuickAction[] = [
  { href: "/m/sales?tab=collections", icon: ShoppingCart, label: "Sales" },
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
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read the tab from the URL (?tab=real-estate) so the selection survives
  // refresh and back/forward navigation. Falls back to "raw-material".
  const paramTab = searchParams.get("tab");
  const initialTab: CategoryId =
    paramTab === "real-estate" || paramTab === "raw-material"
      ? paramTab
      : "raw-material";
  const [activeTab, setActiveTab] = React.useState<CategoryId>(initialTab);

  // Keep state in sync if the URL changes (e.g. browser back/forward).
  React.useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "real-estate" || t === "raw-material") {
      setActiveTab(t);
    } else {
      setActiveTab("raw-material");
    }
  }, [searchParams]);

  const active = CATEGORIES.find((c) => c.id === activeTab)!;

  function selectTab(id: CategoryId) {
    setActiveTab(id);
    // Shallow-update the URL without scrolling so the choice is bookmarkable
    // and survives refresh / back navigation.
    const params = new URLSearchParams(searchParams.toString());
    if (id === "raw-material") {
      params.delete("tab"); // default — keep URL clean
    } else {
      params.set("tab", id);
    }
    const qs = params.toString();
    router.replace(qs ? `/m/inventory?${qs}` : "/m/inventory", {
      scroll: false,
    });
  }

  return (
    <>
      {/* ── Quick actions label ── */}
      <p className="text-m-caption font-bold uppercase tracking-wide mb-1.5 px-0.5" style={{ color: "var(--color-steel)" }}>
        Quick actions
      </p>

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
              onClick={() => selectTab(cat.id)}
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-body press transition-colors"
              style={{
                backgroundColor: isActive
                  ? "var(--color-ink-950)"
                  : "transparent",
                color: isActive ? "var(--color-paper)" : "var(--color-ink-500)",
              }}
            >
              <span className="text-m-section">{cat.icon}</span>
              <span className="text-m-body font-bold">{cat.label}</span>
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
      className="flex flex-col items-center gap-1 rounded-[0.625rem] border p-2 text-m-body text-m-body press"
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
        className="font-semibold text-m-caption text-center leading-tight"
        style={{ color: "var(--color-ink-950)" }}
      >
        {label}
      </span>
    </Link>
  );
}
