import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  CheckSquare,
  ClipboardCheck,
  HardHat,
  Receipt,
  ScanLine,
  ShoppingCart,
  Sun,
  User,
  Users,
  Wallet,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/roles";
import { WORLD_BY_KEY, type WorldKey } from "@/lib/nav";

/**
 * ═══════════════════════════════════════════════════════════════════
 * MOBILE ARCHITECTURE — same worlds, fewer of them
 *
 * The owner's note says "mobile + desktop 100%". That does NOT mean
 * "cram the desktop onto a phone" — a supervisor at a gate does not
 * want thirty modules. It means the two must never teach you two
 * different vocabularies for the same thing.
 *
 * The old mobile IA had its own invented names — Pulse, Command, Site,
 * Book, Books — with their own icons and colours. So a supervisor
 * learned "Site → Stock" on their phone and had to re-learn it as
 * "Materials → Stock Ledger" on a desktop. Same data, two mental models.
 *
 * The fix separates two decisions that were tangled together:
 *
 *   WHAT'S ON THE TAB BAR  → the persona decides. Curation by role is
 *                            correct: five tabs, the five things that
 *                            role actually does on a phone.
 *   WHAT IT'S CALLED       → the WORLD decides. Labels, icons and
 *                            colours come from `nav.ts`, so a tab and
 *                            its desktop sidebar entry are visibly
 *                            the same thing.
 *
 * A tab may still promote a single deep action (a supervisor's most
 * common act is "Receive", not "browse Materials"). It keeps its
 * world's colour, so the promotion reads as a shortcut into a familiar
 * place rather than a new place.
 * ═══════════════════════════════════════════════════════════════════
 */

export type PersonaKey =
  | "executive" // OWNER / ADMIN  — approve, glance, delegate
  | "ops" //       MANAGER        — keep every site unblocked
  | "field" //     SUPERVISOR     — capture what happened on site
  | "sales" //     SALES          — availability + payments on the road
  | "finance"; //  ACCOUNTANT     — record money movement fast

export interface PersonaTab {
  label: string;
  href: string;
  icon: LucideIcon;
  /** The world this tab belongs to — supplies its wayfinding colour. */
  world: WorldKey;
  /** Optional badge endpoint returning a count to surface on the tab. */
  badge?: { endpoint: string; filter?: string };
}

export interface PersonaDef {
  key: PersonaKey;
  /** Greeting shown on the persona's home screen. */
  label: string;
  tagline: string;
  roles: Role[];
  home: string;
  tabs: PersonaTab[];
  /** Secondary links surfaced under "More". */
  more: { label: string; href: string; desktopOnly?: boolean }[];
}

export const PERSONAS: Record<PersonaKey, PersonaDef> = {
  // ── Executive (OWNER / ADMIN) ───────────────────────────────
  // Approve, glance, delegate. Deliberately no data entry on a phone.
  executive: {
    key: "executive",
    label: "Today",
    tagline: "Company health at a glance",
    roles: ["OWNER", "ADMIN"],
    home: "/m/pulse",
    tabs: [
      { label: "Today", href: "/m/pulse", icon: Sun, world: "today" },
      {
        label: "Approvals",
        href: "/m/pulse/approvals",
        icon: ClipboardCheck,
        world: "today",
        badge: { endpoint: "/api/approvals" },
      },
      { label: "Insights", href: "/m/books/reports", icon: BarChart3, world: "finance" },
      { label: "More", href: "/m/settings", icon: MoreHorizontal, world: "today" },
    ],
    more: [
      { label: "Full dashboard", href: "/", desktopOnly: true },
      { label: "Materials catalogue", href: "/m/materials" },
      { label: "Quotations", href: "/m/quotations" },
      { label: "Stock ledger", href: "/m/stock" },
      { label: "General Ledger", href: "/m/books/gl" },
      { label: "Settings", href: "/m/settings" },
    ],
  },

  // ── Operations (MANAGER) ────────────────────────────────────
  // Everything is a queue plus one decisive tap.
  ops: {
    key: "ops",
    label: "Today",
    tagline: "Keep every site unblocked",
    roles: ["PROJECT_MANAGER", "PROJECT_DIRECTOR", "PROCUREMENT_MANAGER"],
    home: "/m/command",
    tabs: [
      { label: "Today", href: "/m/command", icon: Sun, world: "today" },
      {
        label: "Materials",
        href: "/m/procurement",
        icon: Boxes,
        world: "build",
        badge: { endpoint: "/api/purchase-orders?status=DRAFT,APPROVED,ORDERED,PARTIAL" },
      },
      { label: "Property", href: "/m/projects", icon: Building2, world: "build" },
      { label: "People", href: "/m/hr", icon: HardHat, world: "hr" },
      {
        label: "Approvals",
        href: "/m/pulse/approvals",
        icon: ClipboardCheck,
        world: "today",
        badge: { endpoint: "/api/approvals" },
      },
    ],
    more: [
      { label: "Task Manager", href: "/m/site/tasks" },
      { label: "Quotations", href: "/m/quotations" },
      { label: "Stock Ledger", href: "/m/stock" },
      { label: "Equipment", href: "/m/equipment" },
      { label: "Insights", href: "/m/reports" },
    ],
  },

  // ── Field (SUPERVISOR) — the heaviest mobile user ───────────
  // Capture, don't browse. Big targets, offline-first, one thumb.
  field: {
    key: "field",
    label: "Today",
    tagline: "Today on site",
    roles: ["SUPERVISOR"],
    home: "/m/site",
    tabs: [
      { label: "Today", href: "/m/site", icon: Sun, world: "today" },
      { label: "Stock", href: "/m/site/stock", icon: Boxes, world: "build" },
      // Promoted: receiving is the single most frequent field action.
      { label: "Receive", href: "/m/site/receive", icon: ScanLine, world: "build" },
      {
        label: "Tasks",
        href: "/m/site/tasks",
        icon: CheckSquare,
        world: "today",
        badge: { endpoint: "/api/my-tasks?status=PENDING,IN_PROGRESS" },
      },
      { label: "Me", href: "/m/site/me", icon: User, world: "hr" },
    ],
    more: [
      { label: "Daily Progress", href: "/m/dprs" },
      { label: "Attendance", href: "/m/site/attendance" },
      { label: "Quotations", href: "/m/quotations" },
      { label: "Stock Counts", href: "/m/stock-counts" },
    ],
  },

  // ── Sales (SALES) ───────────────────────────────────────────
  // Availability and payments, answerable from a car park.
  sales: {
    key: "sales",
    label: "Property",
    tagline: "Close on the go",
    roles: ["SALES_MANAGER"],
    home: "/m/sales",
    tabs: [
      { label: "Units", href: "/m/units", icon: Building2, world: "build" },
      { label: "Customers", href: "/m/customers", icon: Users, world: "build" },
      { label: "Sales", href: "/m/sales", icon: ShoppingCart, world: "build" },
      { label: "Me", href: "/m/me", icon: User, world: "today" },
    ],
    more: [
      { label: "Land Parcels", href: "/m/land" },
      { label: "Projects", href: "/m/projects" },
      { label: "Rentals", href: "/m/rentals" },
      { label: "Portal Listings", href: "/m/portal-listings" },
      { label: "My Tasks", href: "/m/site/tasks" },
    ],
  },

  // ── Finance (ACCOUNTANT) ────────────────────────────────────
  // Record money movement fast: list, confirm, done.
  finance: {
    key: "finance",
    label: "Money",
    tagline: "Money in, money out",
    roles: ["ACCOUNTANT"],
    home: "/m/books",
    tabs: [
      { label: "Payables", href: "/m/books", icon: Receipt, world: "finance" },
      { label: "Receipts", href: "/m/books/receipts", icon: Wallet, world: "finance" },
      { label: "Payroll", href: "/m/books/payroll", icon: CalendarCheck, world: "hr" },
      { label: "Ledger", href: "/m/books/gl", icon: BookOpen, world: "finance" },
      { label: "More", href: "/m/settings", icon: MoreHorizontal, world: "today" },
    ],
    more: [
      { label: "Finance", href: "/m/books/finance" },
      { label: "General Ledger", href: "/m/books/gl" },
      { label: "Reports", href: "/m/books/reports" },
      { label: "Money Owed", href: "/m/reports/pending-payments" },
    ],
  },
};

/** Reverse map: role → persona key. */
export const ROLE_PERSONA: Partial<Record<Role, PersonaKey>> = {
  OWNER: "executive",
  ADMIN: "executive",
  PROJECT_DIRECTOR: "executive",
  FINANCE_HEAD: "finance",
  PROJECT_MANAGER: "ops",
  PROCUREMENT_MANAGER: "ops",
  HR_MANAGER: "field",
  SITE_ENGINEER: "field",
  STORE_KEEPER: "ops",
  ACCOUNTANT: "finance",
  SALES_MANAGER: "sales",
  SUPERVISOR: "field",
  QAQC_ENGINEER: "field",
};

/** Resolve a persona definition from a role string (falls back to ops). */
export function personaForRole(role: string | undefined | null): PersonaDef {
  const r = (role ?? "PROJECT_MANAGER") as Role;
  const key = ROLE_PERSONA[r] ?? "ops";
  return PERSONAS[key];
}

/** Resolve the persona that owns a given pathname (by home prefix). */
export function personaForPath(pathname: string): PersonaDef | null {
  for (const p of Object.values(PERSONAS)) {
    if (pathname.startsWith(p.home)) return p;
  }
  return null;
}

/** The wayfinding colour for a tab — same value the desktop nav uses. */
export function tabColor(tab: PersonaTab): string {
  return WORLD_BY_KEY[tab.world].color;
}
