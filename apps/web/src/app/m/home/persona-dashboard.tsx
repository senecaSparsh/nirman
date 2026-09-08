"use client";

import * as React from "react";
import Link from "next/link";
import {
  Boxes, Users, BookOpen, HardHat, Truck,
  ClipboardList, TrendingUp, Wallet, CalendarCheck,
  FileText, ShoppingCart, Package, AlertTriangle,
  ArrowRight, type LucideIcon,
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
   Each persona gets:
     1. A persona-specific header with the most relevant stat cards
     2. Quick actions (using the shared QuickActionsBar with their module)
     3. Pending items from the briefing API
     4. Quick links to their module pages

   Executive persona (OWNER, ADMIN, etc.) sees the OrbitNavigator instead.
   ═══════════════════════════════════════════════════════════════════════════ */

interface PersonaHomeDashboardProps {
  persona: Persona;
  role: string;
  currentCompany: { id: string; name: string; businessType: string | null; currency: string };
}

// ── Persona config: title, icon, module for quick actions, stat cards, links ──

interface StatCardDef {
  label: string;
  icon: LucideIcon;
  href: string;
  // Which briefing field to pull the count from
  briefingKey?: "approvals.poCount" | "approvals.reqCount" | "approvals.gpCount" | "approvals.dprCount" | "approvals.total" | "lowStock" | "deliveriesToday" | "paymentsDue" | "myTasks";
  // Or a static fetch from a different source
  fetchEndpoint?: string;
  fetchPath?: string;
}

interface PersonaConfig {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  quickActionModule: "inventory" | "hr" | "accounts" | "site" | "sales";
  quickActionTabs: QuickActionTab[];
  stats: StatCardDef[];
  links: { label: string; href: string; icon: LucideIcon }[];
}

const PERSONA_CONFIGS: Record<Persona, PersonaConfig> = {
  executive: {
    title: "Executive",
    subtitle: "Enterprise overview",
    icon: Boxes,
    quickActionModule: "inventory",
    quickActionTabs: INVENTORY_QUICK_ACTIONS as QuickActionTab[],
    stats: [],
    links: [],
  },
  ops: {
    title: "Operations",
    subtitle: "Project execution & site ops",
    icon: HardHat,
    quickActionModule: "site",
    quickActionTabs: SITE_QUICK_ACTIONS as QuickActionTab[],
    stats: [
      { label: "Tasks", icon: ClipboardList, href: "/m/tasks", briefingKey: "myTasks" },
      { label: "DPRs", icon: FileText, href: "/m/dprs", briefingKey: "approvals.dprCount" },
      { label: "Deliveries", icon: Truck, href: "/m/procurement", briefingKey: "deliveriesToday" },
      { label: "Approvals", icon: AlertTriangle, href: "/m/hr/pending", briefingKey: "approvals.total" },
    ],
    links: [
      { label: "Projects", href: "/m/projects", icon: HardHat },
      { label: "Inventory", href: "/m/inventory", icon: Boxes },
      { label: "HR", href: "/m/hr", icon: Users },
      { label: "Site", href: "/m/site", icon: ClipboardList },
    ],
  },
  procurement: {
    title: "Procurement",
    subtitle: "Orders, receipts & stock",
    icon: ShoppingCart,
    quickActionModule: "inventory",
    quickActionTabs: INVENTORY_QUICK_ACTIONS as QuickActionTab[],
    stats: [
      { label: "POs", icon: FileText, href: "/m/procurement", briefingKey: "approvals.poCount" },
      { label: "Requisitions", icon: ShoppingCart, href: "/m/requisitions", briefingKey: "approvals.reqCount" },
      { label: "Low Stock", icon: AlertTriangle, href: "/m/inventory", briefingKey: "lowStock" },
      { label: "Deliveries", icon: Truck, href: "/m/procurement", briefingKey: "deliveriesToday" },
    ],
    links: [
      { label: "Inventory", href: "/m/inventory", icon: Boxes },
      { label: "POs", href: "/m/procurement", icon: FileText },
      { label: "Suppliers", href: "/m/suppliers", icon: Truck },
      { label: "Materials", href: "/m/materials", icon: Package },
    ],
  },
  field: {
    title: "Site",
    subtitle: "Field operations & reporting",
    icon: ClipboardList,
    quickActionModule: "site",
    quickActionTabs: SITE_QUICK_ACTIONS as QuickActionTab[],
    stats: [
      { label: "Tasks", icon: ClipboardList, href: "/m/tasks", briefingKey: "myTasks" },
      { label: "DPRs", icon: FileText, href: "/m/dprs", briefingKey: "approvals.dprCount" },
      { label: "Gate Pass", icon: AlertTriangle, href: "/m/gate-pass", briefingKey: "approvals.gpCount" },
      { label: "Approvals", icon: AlertTriangle, href: "/m/hr/pending", briefingKey: "approvals.total" },
    ],
    links: [
      { label: "Site Home", href: "/m/site", icon: ClipboardList },
      { label: "Attendance", href: "/m/attendance", icon: CalendarCheck },
      { label: "Inventory", href: "/m/inventory", icon: Boxes },
      { label: "HR", href: "/m/hr", icon: Users },
    ],
  },
  sales: {
    title: "Sales",
    subtitle: "Leads, customers & deals",
    icon: TrendingUp,
    quickActionModule: "sales",
    quickActionTabs: SALES_QUICK_ACTIONS as QuickActionTab[],
    stats: [
      { label: "Tasks", icon: ClipboardList, href: "/m/tasks", briefingKey: "myTasks" },
      { label: "Approvals", icon: AlertTriangle, href: "/m/hr/pending", briefingKey: "approvals.total" },
      { label: "Deliveries", icon: Truck, href: "/m/procurement", briefingKey: "deliveriesToday" },
      { label: "Payments", icon: Wallet, href: "/m/accounts", briefingKey: "paymentsDue" },
    ],
    links: [
      { label: "Leads", href: "/m/leads", icon: TrendingUp },
      { label: "Customers", href: "/m/customers", icon: Users },
      { label: "Sales", href: "/m/sales", icon: TrendingUp },
      { label: "Listings", href: "/m/portal-listings", icon: FileText },
    ],
  },
  finance: {
    title: "Finance",
    subtitle: "Expenses, claims & payments",
    icon: BookOpen,
    quickActionModule: "accounts",
    quickActionTabs: ACCOUNTS_QUICK_ACTIONS as QuickActionTab[],
    stats: [
      { label: "Payments Due", icon: Wallet, href: "/m/accounts", briefingKey: "paymentsDue" },
      { label: "Approvals", icon: AlertTriangle, href: "/m/hr/pending", briefingKey: "approvals.total" },
      { label: "POs", icon: FileText, href: "/m/procurement", briefingKey: "approvals.poCount" },
      { label: "Tasks", icon: ClipboardList, href: "/m/tasks", briefingKey: "myTasks" },
    ],
    links: [
      { label: "Accounts", href: "/m/accounts", icon: BookOpen },
      { label: "Expenses", href: "/m/expenses", icon: Wallet },
      { label: "Claims", href: "/m/expense-claims", icon: FileText },
      { label: "Petty Cash", href: "/m/petty-cash", icon: Wallet },
    ],
  },
  hr: {
    title: "HR",
    subtitle: "People, attendance & payroll",
    icon: Users,
    quickActionModule: "hr",
    quickActionTabs: HR_QUICK_ACTIONS as QuickActionTab[],
    stats: [
      { label: "DPRs", icon: FileText, href: "/m/dprs", briefingKey: "approvals.dprCount" },
      { label: "Gate Pass", icon: AlertTriangle, href: "/m/gate-pass", briefingKey: "approvals.gpCount" },
      { label: "Approvals", icon: AlertTriangle, href: "/m/hr/pending", briefingKey: "approvals.total" },
      { label: "Tasks", icon: ClipboardList, href: "/m/tasks", briefingKey: "myTasks" },
    ],
    links: [
      { label: "HR Hub", href: "/m/hr", icon: Users },
      { label: "Attendance", href: "/m/attendance", icon: CalendarCheck },
      { label: "DPRs", href: "/m/dprs", icon: ClipboardList },
      { label: "Employees", href: "/m/hr/employees", icon: Users },
    ],
  },
};

// ── Briefing data shape (mirrors /api/briefing response) ──
interface BriefingTask {
  id: string;
  title: string;
  projectName: string | null;
  dueDate: string | null;
  priority: string;
}
interface BriefingDelivery {
  poNumber: string;
  supplierName: string;
  projectName: string | null;
  total: number;
}
interface BriefingLowStock {
  materialId: string;
  materialName: string;
  materialCode: string;
  qty: number;
  unit: string;
  reorderPoint: number | null;
}
interface BriefingPayment {
  description: string;
  amount: number;
  dueDate: string;
  type: string;
}

interface BriefingData {
  approvals: {
    poCount: number; reqCount: number; gpCount: number; dprCount: number;
    total: number;
    canApprovePo: boolean; canApproveReq: boolean; canApproveGp: boolean; canApproveDpr: boolean;
  };
  lowStock: BriefingLowStock[];
  deliveriesToday: BriefingDelivery[];
  paymentsDue: BriefingPayment[];
  myTasks: BriefingTask[];
  myDpr: { submitted: boolean; date: string } | null;
  myAttendance: { checkedIn: boolean; status: string } | null;
}

function getBriefingValue(briefing: BriefingData | null, key: StatCardDef["briefingKey"]): number {
  if (!briefing || !key) return 0;
  switch (key) {
    case "approvals.poCount": return briefing.approvals.poCount;
    case "approvals.reqCount": return briefing.approvals.reqCount;
    case "approvals.gpCount": return briefing.approvals.gpCount;
    case "approvals.dprCount": return briefing.approvals.dprCount;
    case "approvals.total": return briefing.approvals.total;
    case "lowStock": return briefing.lowStock.length;
    case "deliveriesToday": return briefing.deliveriesToday.length;
    case "paymentsDue": return briefing.paymentsDue.length;
    case "myTasks": return briefing.myTasks.length;
    default: return 0;
  }
}

export function PersonaHomeDashboard({ persona, role: _role, currentCompany }: PersonaHomeDashboardProps) {
  const config = PERSONA_CONFIGS[persona] ?? PERSONA_CONFIGS.executive;
  const [briefing, setBriefing] = React.useState<BriefingData | null>(null);
  const [qaData, setQaData] = React.useState<{ persona: string; savedLayouts: Record<string, string[]>; extraActions: ExtraActionDef[] } | null>(null);
  const [qaLoading, setQaLoading] = React.useState(true);

  // Fetch briefing + quick-action context in parallel
  React.useEffect(() => {
    setQaLoading(true);
    Promise.all([
      fetch("/api/briefing", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/me/quick-actions-context?module=" + config.quickActionModule)
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null),
    ]).then(([b, qa]) => {
      if (b) setBriefing(b);
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

      {/* ── Stat cards (2x2 grid) ── */}
      {config.stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {config.stats.map((stat) => {
            const count = getBriefingValue(briefing, stat.briefingKey);
            const StatIcon = stat.icon;
            const isAlert = count > 0 && (stat.briefingKey === "lowStock" || stat.briefingKey === "approvals.total" || stat.briefingKey === "paymentsDue");
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className="flex items-center gap-2 rounded-[0.5rem] border p-2.5 press"
                style={{
                  borderColor: isAlert && count > 0 ? "var(--color-signal)" : "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                }}
              >
                <div
                  className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
                  style={{ backgroundColor: isAlert && count > 0 ? "var(--color-signal-bg, rgba(245,158,11,0.1))" : "var(--color-concrete)" }}
                >
                  <StatIcon
                    className="size-3.5"
                    style={{ color: isAlert && count > 0 ? "var(--color-signal)" : "var(--color-ink-500)" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-m-caption font-semibold leading-tight truncate" style={{ color: "var(--color-ink-500)" }}>
                    {stat.label}
                  </p>
                  <p className="text-m-body font-bold tabular-nums leading-tight" style={{ color: "var(--color-ink-950)" }}>
                    {briefing ? count : "—"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

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
        />
      ) : null}

      {/* ── Quick links to module pages ── */}
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
