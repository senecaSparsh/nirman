"use client";

import * as React from "react";
import Link from "next/link";
import {
  Boxes, Users, BookOpen, HardHat, Truck,
  ClipboardList, TrendingUp, ShoppingCart,
  FileText, Package,
  ArrowRight, ShieldAlert, GitBranch, ListTree,
  Wrench, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Persona } from "@/lib/mobile-nav-v2";
import { QuickActionsBar, type QuickActionTab, type ExtraActionDef } from "@/components/mobile/v2/quick-actions-bar";
import {
  INVENTORY_QUICK_ACTIONS,
  HR_QUICK_ACTIONS,
  ACCOUNTS_QUICK_ACTIONS,
  SITE_QUICK_ACTIONS,
  SALES_QUICK_ACTIONS,
} from "@/lib/quick-action-catalogs";

/* ═══════════════════════════════════════════════════════════════════════════
   PERSONA HOME DASHBOARD

   Shown on /m/home for non-executive personas instead of the OrbitNavigator.

   The home page already shows:
     • HomeTree — greeting + briefing (approvals, low stock, deliveries,
       payments overdue) + recent items
     • Self-check-in widget (for field staff with Employee records)

   This dashboard adds what the HomeTree does NOT cover:
     1. A persona header with company + role context
     2. Quick actions — one-tap access to the most common actions for
        this persona's primary module (editable, drag-to-reorder)
     3. Cross-module links — navigation to destinations NOT already in
        the quick action catalog, specific to what this role needs
        beyond their primary module

   Executive persona (OWNER, ADMIN, etc.) sees the OrbitNavigator instead.
   ═══════════════════════════════════════════════════════════════════════════ */

interface PersonaHomeDashboardProps {
  persona: Persona;
  role: string;
  currentCompany: { id: string; name: string; businessType: string | null; currency: string };
}

// ── Persona config ──

interface PersonaConfig {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  quickActionModule: "inventory" | "hr" | "accounts" | "site" | "sales";
  quickActionTabs: QuickActionTab[];
  /** Cross-module links — destinations NOT in the quick action catalog. */
  links: { label: string; href: string; icon: LucideIcon }[];
}

const PERSONA_CONFIGS: Record<Persona, PersonaConfig> = {
  executive: {
    title: "Executive",
    subtitle: "Enterprise overview",
    icon: Boxes,
    quickActionModule: "inventory",
    quickActionTabs: INVENTORY_QUICK_ACTIONS as QuickActionTab[],
    links: [],
  },

  // ── Ops / Project Manager ──
  // Quick actions: site catalog (Daily + Site Ops) covers DPR, attendance,
  // tasks, safety, receive, stock-out, scrap, site stock, field, projects,
  // work orders, MB, all DPRs.
  // Cross-module links: things a PM needs beyond site operations.
  ops: {
    title: "Operations",
    subtitle: "Project execution & site ops",
    icon: HardHat,
    quickActionModule: "site",
    quickActionTabs: SITE_QUICK_ACTIONS as QuickActionTab[],
    links: [
      { label: "Change Orders", href: "/m/change-orders", icon: GitBranch },
      { label: "WBS", href: "/m/wbs", icon: ListTree },
      { label: "Quality Control", href: "/m/quality-control", icon: ShieldAlert },
      { label: "Inventory", href: "/m/inventory", icon: Boxes },
    ],
  },

  // ── Procurement Manager / Store Keeper ──
  // Quick actions: inventory catalog (Raw Material + Real Estate) covers
  // indents, quotations, POs, receive, stock-out, materials, stock,
  // material sales, sales, projects, units, land, customers, rentals,
  // work orders, portal listings.
  // Cross-module links: procurement-adjacent destinations not in the catalog.
  procurement: {
    title: "Procurement",
    subtitle: "Orders, receipts & stock",
    icon: ShoppingCart,
    quickActionModule: "inventory",
    quickActionTabs: INVENTORY_QUICK_ACTIONS as QuickActionTab[],
    links: [
      { label: "Suppliers", href: "/m/suppliers", icon: Truck },
      { label: "Rate Contracts", href: "/m/rate-contracts", icon: FileText },
      { label: "Gate Pass", href: "/m/gate-pass", icon: Package },
      { label: "Equipment", href: "/m/equipment", icon: Wrench },
    ],
  },

  // ── Field Engineer / Supervisor / QAQC ──
  // Quick actions: site catalog (same as ops) covers daily site actions.
  // Check-in widget already handles attendance.
  // Cross-module links: things field staff need beyond the site.
  field: {
    title: "Site",
    subtitle: "Field operations & reporting",
    icon: ClipboardList,
    quickActionModule: "site",
    quickActionTabs: SITE_QUICK_ACTIONS as QuickActionTab[],
    links: [
      { label: "Gate Pass", href: "/m/gate-pass", icon: Package },
      { label: "HR / Leaves", href: "/m/hr/leaves", icon: Users },
      { label: "Procurement", href: "/m/procurement", icon: ShoppingCart },
      { label: "Expenses", href: "/m/accounts?tab=expenses", icon: Wallet },
    ],
  },

  // ── Sales Manager ──
  // Quick actions: sales catalog (Pipeline + Deals) covers leads,
  // customers, sales, material sales, portal listings, rentals, units,
  // brokers, projects, land, tasks, bookings, collections, sales reports.
  // Cross-module links: cross-functional destinations that support sales.
  sales: {
    title: "Sales",
    subtitle: "Leads, customers & deals",
    icon: TrendingUp,
    quickActionModule: "sales",
    quickActionTabs: SALES_QUICK_ACTIONS as QuickActionTab[],
    links: [
      { label: "Inventory", href: "/m/inventory", icon: Boxes },
      { label: "Accounts", href: "/m/accounts", icon: BookOpen },
      { label: "Procurement", href: "/m/procurement", icon: ShoppingCart },
      { label: "HR", href: "/m/hr", icon: Users },
    ],
  },

  // ── Finance / Accountant ──
  // Quick actions: accounts catalog (Cash + Books) covers receipts,
  // payments, expenses, payroll, dues, cash flow, spend, project cost,
  // ledger, tally sync, GST, TDS, P&L, job cost, compare, reports.
  // Cross-module links: finance needs visibility into other modules.
  finance: {
    title: "Finance",
    subtitle: "Expenses, claims & payments",
    icon: BookOpen,
    quickActionModule: "accounts",
    quickActionTabs: ACCOUNTS_QUICK_ACTIONS as QuickActionTab[],
    links: [
      { label: "Procurement", href: "/m/procurement", icon: ShoppingCart },
      { label: "Suppliers", href: "/m/suppliers", icon: Truck },
      { label: "Projects", href: "/m/projects", icon: HardHat },
      { label: "HR", href: "/m/hr", icon: Users },
    ],
  },

  // ── HR Manager ──
  // Quick actions: hr catalog (Field + People) covers DPRs, attendance,
  // add DPR, tasks, safety, field, site, progress, employees, leaves,
  // payroll, labour cost, crews, approvals.
  // Cross-module links: HR-adjacent destinations not in the HR catalog.
  hr: {
    title: "HR",
    subtitle: "People, attendance & payroll",
    icon: Users,
    quickActionModule: "hr",
    quickActionTabs: HR_QUICK_ACTIONS as QuickActionTab[],
    links: [
      { label: "Departments", href: "/m/departments", icon: Boxes },
      { label: "Quality Control", href: "/m/quality-control", icon: ShieldAlert },
      { label: "Equipment", href: "/m/equipment", icon: Wrench },
      { label: "Accounts", href: "/m/accounts", icon: BookOpen },
    ],
  },
};

export function PersonaHomeDashboard({ persona, role: _role, currentCompany }: PersonaHomeDashboardProps) {
  const config = PERSONA_CONFIGS[persona] ?? PERSONA_CONFIGS.executive;
  const [qaData, setQaData] = React.useState<{ persona: string; savedLayouts: Record<string, string[]>; extraActions: ExtraActionDef[] } | null>(null);
  const [qaLoading, setQaLoading] = React.useState(true);

  // Fetch quick-action context (saved layouts + extra actions for this module)
  React.useEffect(() => {
    setQaLoading(true);
    fetch("/api/me/quick-actions-context?module=" + config.quickActionModule)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((qa) => {
        if (qa) setQaData(qa);
        setQaLoading(false);
      });
  }, [config.quickActionModule]);

  const Icon = config.icon;

  return (
    <div className="space-y-3">
      {/* ── Persona header ── */}
      <div
        className="flex items-center gap-2.5 rounded-[0.75rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div
          className="grid place-items-center w-9 h-9 rounded-[0.5rem] shrink-0"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <Icon className="size-4" style={{ color: "var(--color-ink-700)" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-m-body font-bold leading-tight" style={{ color: "var(--color-ink-950)" }}>
            {config.title}
          </p>
          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
            {currentCompany.name} · {config.subtitle}
          </p>
        </div>
      </div>

      {/* ── Quick actions (shared QuickActionsBar) ── */}
      {qaLoading ? (
        <div
          className="rounded-[0.5rem] border p-4 flex items-center justify-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-2">
            <div className="size-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-ink-300)", borderTopColor: "transparent" }} />
            <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Loading actions…</span>
          </div>
        </div>
      ) : qaData ? (
        <QuickActionsBar
          module={config.quickActionModule}
          persona={qaData.persona as "executive" | "ops" | "procurement" | "field" | "sales" | "finance" | "hr"}
          tabs={config.quickActionTabs}
          savedLayouts={qaData.savedLayouts}
          extraActions={qaData.extraActions}
          syncUrl={false}
        />
      ) : null}

      {/* ── Cross-module links (destinations NOT in the quick action catalog) ── */}
      {config.links.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {config.links.map((link) => {
            const LinkIcon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-[0.5rem] border p-2.5 press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
                    style={{ backgroundColor: "var(--color-concrete)" }}
                  >
                    <LinkIcon className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
                  </div>
                  <span className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {link.label}
                  </span>
                </div>
                <ArrowRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
