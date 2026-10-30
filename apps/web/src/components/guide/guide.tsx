"use client";

/**
 * In-app Guide — a floating "?" launcher that opens a help sheet with
 * role-aware interactive tours (driver.js element highlight) plus a
 * searchable "what can this do" capability index. Built for field users:
 * plain language, one-tap tours, works on mobile + desktop surfaces.
 *
 * Tours target stable `data-tour` attributes on real UI elements so they
 * survive layout changes. A Playwright script can later capture annotated
 * clips from the same tour definitions to embed as visual walkthroughs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { usePathname } from "next/navigation";
import { CircleHelp, Play, Search, X } from "lucide-react";

type Tour = {
  id: string;
  /** Where this tour is relevant — mobile or desktop surface prefix. */
  surface: "mobile" | "desktop" | "any";
  title: string;
  /** Plain-language one-liner for low-literacy users. */
  hint: string;
  /** Optional route the tour makes most sense on; we navigate there first. */
  route?: string;
  steps: DriveStep[];
};

/** Role-aware capability answers — deterministic, always correct. */
const CAPABILITIES: { q: string; a: string; tags: string[] }[] = [
  { q: "File a daily progress report (DPR)", a: "Mobile → Home → DPRs → +. Pick the site, date, write what happened, add labour & material used. Works offline — syncs when you're back.", tags: ["dpr", "progress", "site", "daily"] },
  { q: "Mark attendance / check-in", a: "Mobile → Home → Self check-in when you reach site. Check out when you leave. Locked after payroll is paid.", tags: ["attendance", "haziri", "check in", "checkin"] },
  { q: "Ask for material on site", a: "Mobile → Indents → +. Pick material + qty. It shows current stock, a manager approves, and it can become a purchase order.", tags: ["indent", "requisition", "material", "request"] },
  { q: "Claim petrol / site expenses", a: "Mobile → Expense → +. Add what, how much, photo of the bill. It goes to the approval queue.", tags: ["expense", "petrol", "claim", "reimbursement"] },
  { q: "Apply for leave", a: "Mobile → Me → Apply leave. Pick type + dates + reason. Days auto-count. HR approves.", tags: ["leave", "holiday", "sick", "off"] },
  { q: "See my payslip", a: "Mobile → Me → Payslips. Only you can see yours. Tap to print/PDF.", tags: ["payslip", "salary", "pay"] },
  { q: "Collect a payment from a customer", a: "Sales → booking → installment → Pay via UPI link or record manually. Bank feed auto-matches net-of-TDS credits.", tags: ["payment", "collection", "upi", "installment"] },
  { q: "Approve indents / bills / leaves", a: "Approvals inbox shows everything waiting on you. Creator can't self-approve — separation enforced.", tags: ["approve", "approval", "pending"] },
  { q: "Add staff to the app", a: "Settings → Users → Add user (one) or Bulk Import (many, e.g. a site crew). Phone-only login — no email needed.", tags: ["user", "staff", "worker", "add", "bulk", "invite"] },
  { q: "Create a custom role", a: "Settings → Users → Custom Roles. Start from a base role or build from scratch — e.g. Billing Clerk.", tags: ["role", "permission", "custom", "access"] },
  { q: "Switch between companies", a: "Settings → Companies → Switch to. Only companies you belong to. Each has its own data.", tags: ["company", "switch", "multiple"] },
  { q: "Set up payments, SMS, email", a: "Settings → Company for UPI ID. Settings → Integrations for SMS gateway, SMTP email, WhatsApp, Tally.", tags: ["setup", "integration", "sms", "email", "upi"] },
];

const TOURS: Tour[] = [
  {
    id: "m-dpr",
    surface: "mobile",
    title: "File today's DPR",
    hint: "Daily progress report — what happened on site today.",
    route: "/m/dprs",
    steps: [
      { popover: { title: "Your daily report", description: "The DPR is the site's daily diary — labour, material, progress. File one every day.", side: "over" } },
      { element: "[data-tour='dpr-fab']", popover: { title: "Start a new one", description: "Tap + to file today's report.", side: "top" } },
      { popover: { title: "Locked dates", description: "Dates where payroll is already paid are blocked — you'll see why. Future dates aren't allowed.", side: "over" } },
      { popover: { title: "Add labour & material", description: "Say who worked, how many hours, and what material was used. It flows to payroll and stock automatically.", side: "over" } },
    ],
  },
  {
    id: "m-indent",
    surface: "mobile",
    title: "Request material (indent)",
    hint: "Ask for cement, steel, anything — with live stock shown.",
    route: "/m/requisitions",
    steps: [
      { popover: { title: "Indents", description: "Ask for material from site. It shows live stock so the office sees it's actually needed.", side: "over" } },
      { element: "[data-tour='req-fab']", popover: { title: "New indent", description: "Pick material + quantity. A manager approves, and it can turn into a purchase order.", side: "top" } },
    ],
  },
  {
    id: "m-home",
    surface: "mobile",
    title: "Your daily home",
    hint: "Check-in, tasks, everything you need today.",
    route: "/m/home",
    steps: [
      { element: "[data-tour='m-checkin']", popover: { title: "Check in", description: "One tap when you reach site. Locked after payroll is paid.", side: "bottom" } },
      { popover: { title: "Today at a glance", description: "Tasks, low stock, anything waiting on you shows here.", side: "over" } },
    ],
  },
  {
    id: "d-approvals",
    surface: "desktop",
    title: "Approve work",
    hint: "Everything waiting on your approval, in one inbox.",
    route: "/approvals",
    steps: [
      { popover: { title: "Approvals inbox", description: "Indents, bills, leaves, purchases waiting on you — grouped by type.", side: "over" } },
      { popover: { title: "No self-approval", description: "You can never approve your own submission — the system blocks it. That's anti-fraud by design.", side: "over" } },
    ],
  },
  {
    id: "d-users",
    surface: "desktop",
    title: "Add your team",
    hint: "One user or a whole crew — phone login, no email.",
    route: "/settings?tab=users",
    steps: [
      { element: "[data-tour='add-user']", popover: { title: "Add one", description: "Wizard: name, role, project scope, temp password. Phone-only login.", side: "bottom" } },
      { element: "[data-tour='bulk-import']", popover: { title: "Or a whole crew", description: "Bulk import adds many at once — paste a site's full crew in one go.", side: "bottom" } },
      { element: "[data-tour='custom-role']", popover: { title: "Custom roles", description: "Need a role that doesn't exist? Build one — Billing Clerk, Counter Staff, anything.", side: "bottom" } },
    ],
  },
];

export function GuideLauncher({ mobile }: { mobile: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const surface = mobile ? "mobile" : "desktop";
  const tours = useMemo(() => TOURS.filter((t) => t.surface === "any" || t.surface === surface), [surface]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CAPABILITIES;
    return CAPABILITIES.filter(
      (c) => c.q.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q)),
    );
  }, [query]);

  // Driver instance, styled to match the app's dark zinc theme.
  const drv = useCallback(
    (steps: DriveStep[]): Driver =>
      driver({
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Done",
        popoverClass: "nirman-guide-popover",
        steps,
      }),
    [],
  );

  const runTour = useCallback(
    (tour: Tour) => {
      setOpen(false);
      if (tour.route && pathname !== tour.route) {
        // Navigate first, then start — driver needs elements mounted.
        window.location.href = `${tour.route}${tour.route.includes("?") ? "&" : "?"}__tour=${tour.id}`;
        return;
      }
      drv(tour.steps).drive();
    },
    [pathname, drv],
  );

  // Auto-launch a tour when arriving via ?__tour= links (tours that route).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("__tour");
    if (!id) return;
    const tour = TOURS.find((t) => t.id === id);
    if (!tour) return;
    const t = setTimeout(() => drv(tour.steps).drive(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = results;
  return (
    <>
      <button
        type="button"
        aria-label="Help & guide"
        data-tour="guide-launcher"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-[90] flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl ring-2 ring-emerald-400/50 hover:bg-emerald-500 md:bottom-6 md:right-6"
      >
        <CircleHelp className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-zinc-950 ring-1 ring-zinc-800 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 p-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Guide</h2>
                <p className="text-xs text-zinc-400">Show me how · or ask what this app can do</p>
              </div>
              <button type="button" aria-label="Close guide" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Show me</p>
                <div className="space-y-2">
                  {tours.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => runTour(t)}
                      className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left hover:border-zinc-600"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                        <Play className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-100">{t.title}</span>
                        <span className="block text-xs text-zinc-400">{t.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">What can this app do</p>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask: salary, leave, payment, add worker…"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  {filtered.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">Nothing found — try a simpler word.</p>}
                  {filtered.map((c) => (
                    <details key={c.q} className="group rounded-lg border border-zinc-800 bg-zinc-900/40 open:bg-zinc-900">
                      <summary className="cursor-pointer list-none p-3 text-sm font-medium text-zinc-200 marker:hidden">{c.q}</summary>
                      <p className="px-3 pb-3 text-sm leading-relaxed text-zinc-400">{c.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
