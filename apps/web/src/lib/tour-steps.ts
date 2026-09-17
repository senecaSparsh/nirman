import type { Persona } from "@/lib/mobile-nav-v2";
import { QUICK_ACTION_CATALOGS } from "@/lib/quick-action-catalogs";

/* ═══════════════════════════════════════════════════════════════════════════
   PRODUCT TOUR — step definitions

   A persona-driven walkthrough of the mobile shell, built around one idea:
   the Quick Actions grid is where daily work starts, so it is step 1 — the
   tour navigates to the persona's own module hub to show it. Everything
   after that is shell chrome that exists on every page (tab bar, dept fan,
   search, menu, bell), ending on a persona-specific "your daily loop" card.

   Steps are DECLARATIVE — the engine (<ProductTour>) resolves each one:
     · route  — navigate here before spotlighting (client-side push; the
                /m layout keeps the tour mounted across the navigation)
     · target — a `data-tour` attribute value, looked up in the live DOM
     · no target → rendered as a centered card (welcome-style steps)

   A step whose target never mounts (a gated feature, a DeptFab that isn't
   rendered because every department already fits the tab bar, the sales
   hub which has no QuickActionsBar yet) is SKIPPED, never an error. That
   is what lets one step list serve all 7 personas and every permission
   pattern.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TourStep {
  id: string;
  /** Navigate to this route before resolving `target`. */
  route?: string;
  /** `data-tour` attribute value of the element to spotlight. */
  target?: string;
  title: string;
  body: string;
  /** Where the tooltip sits relative to the target. "auto" picks above
   *  or below based on available space. Ignored for centered steps. */
  placement?: "top" | "bottom" | "auto";
}

/**
 * The module hub where each persona's QuickActionsBar lives — where the
 * tour's step 1 takes them. (Sales is listed for completeness: its hub
 * has no bar today, so the step skips cleanly until one is wired.)
 */
const PERSONA_HUB: Record<Persona, { route: string; module: keyof typeof QUICK_ACTION_CATALOGS }> = {
  executive: { route: "/m/inventory", module: "inventory" },
  ops: { route: "/m/site", module: "site" },
  procurement: { route: "/m/inventory", module: "inventory" },
  field: { route: "/m/site", module: "site" },
  sales: { route: "/m/sales", module: "sales" },
  finance: { route: "/m/accounts", module: "accounts" },
  hr: { route: "/m/hr", module: "hr" },
};

/**
 * The persona's "daily loop" — the one-paragraph answer to "what do I
 * actually do in here all day?" Shown as the tour's closing card.
 */
const PERSONA_LOOP: Record<Persona, string> = {
  executive:
    "Every department tab — Inventory, HR, Accounts — carries the same quick-action grid tuned to it. The badges on your tabs count what needs a decision.",
  ops: "Your day: Approvals first, then DPRs and Tasks. The Site tab is where your projects live — quick actions get you to each in one tap.",
  procurement:
    "Your day: indents waiting → purchase orders → receive at the gate. The Inventory tab holds all of it; pin the tiles you touch most.",
  field:
    "Your day: mark Attendance when you reach site, then Quick Issue / Receive / DPR from these tiles as work happens. Submit your DPR before you leave.",
  sales:
    "Your day: new leads on top, collections below — both live on the Sales tab. Pin the customers and reports tiles you open most.",
  finance:
    "Your day: Receipts, Payments, Expenses on the Accounts tab — Books for ledgers and GST, Reports for the bigger picture.",
  hr: "Your day: attendance exceptions, leaves to approve, the employees register — all on the HR tab's quick actions.",
};

/** Top-N action labels this persona sees on their hub's first tab —
 *  computed from the real catalog so the copy never drifts from the UI. */
function topTileNames(module: keyof typeof QUICK_ACTION_CATALOGS, persona: Persona, n = 3): string {
  const first = QUICK_ACTION_CATALOGS[module]?.[0];
  if (!first) return "";
  const labels = first.actions
    .filter((a) => !a.personas || a.personas.includes(persona))
    .slice(0, n)
    .map((a) => a.label);
  return labels.join(", ");
}

/**
 * Build the ordered step list for a user. Quick actions is ALWAYS step 1 —
 * that ordering is deliberate (it's the feature users must learn first).
 * `canSwitchCompany` adds a company-switcher step that single-company
 * users don't need.
 */
export function buildTourSteps(
  persona: Persona,
  opts: { canSwitchCompany?: boolean } = {},
): TourStep[] {
  const hub = PERSONA_HUB[persona] ?? PERSONA_HUB.executive;
  const tiles = topTileNames(hub.module, persona);

  const steps: TourStep[] = [
    {
      id: "quick-actions",
      route: hub.route,
      target: "quick-actions",
      title: "Start here — Quick Actions",
      body:
        `These tiles are your fastest way into daily work${tiles ? ` — ${tiles}` : ""}. ` +
        "Tap one to jump straight in. To choose which actions show here, tap Edit (or long-press any tile) — your layout is saved to your account.",
      placement: "auto",
    },
    {
      id: "tab-bar",
      target: "tab-bar",
      title: "Your departments",
      body: "This bar is built for your role. Amber marks where you are; a badge counts things waiting on you — approvals, receipts, indents.",
      placement: "top",
    },
    {
      id: "dept-fab",
      target: "dept-fab",
      title: "More departments",
      body: "The + fans out the departments that didn't fit your tab bar. “All” opens the full menu.",
      placement: "top",
    },
    {
      id: "search",
      target: "search",
      title: "Find anything",
      body: "One search for the whole app — pages, people, materials, orders.",
      placement: "bottom",
    },
    {
      id: "menu",
      target: "menu",
      title: "The full menu",
      body: "Every screen you can open, your recent pages, and your profile live behind ⋮.",
      placement: "bottom",
    },
    {
      id: "notifications",
      target: "notifications",
      title: "Replies land here",
      body: "Approved leaves, assigned tasks, mentions — the bell is where the office answers you.",
      placement: "bottom",
    },
  ];

  if (opts.canSwitchCompany) {
    steps.push({
      id: "company",
      target: "company",
      title: "Multiple companies",
      body: "You belong to more than one company — tap the name to switch the books you're working in.",
      placement: "bottom",
    });
  }

  steps.push({
    id: "loop",
    title: "That's the whole map",
    body: PERSONA_LOOP[persona] ?? PERSONA_LOOP.executive,
  });

  return steps;
}
