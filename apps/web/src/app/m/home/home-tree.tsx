"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Sun,
  Clock,
  ClipboardCheck,
  PackageX,
  Truck,
  CalendarClock,
  RefreshCw,
  Loader2,
  CheckCircle2,
  FileText,
  ShoppingCart,
  Building2,
  Boxes,
  Users,
  AlertTriangle,
  HardHat,
  CircleDot,
  Package,
  LandPlot,
  ClipboardList,
  Wrench,
  TrendingUp,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { useRecentItems } from "@/lib/use-recent-items";
import { useFetch } from "@/lib/use-fetch";
import { formatDate, formatCurrencyCompact } from "@/lib/utils";
import { useHydratedDate } from "@/lib/use-hydrated-date";
import { useMounted } from "@/lib/use-mounted";

/* ═══════════════════════════════════════════════════════════════════════════
   HOME TREE — file-system tree for the mobile home page

   Uses the same TreeRow visual pattern as the HR page's OrgHierarchy.
   Structure:
     📋 Briefing (expandable folder)
       ├─ ⚠️ Approvals (7) → /m/pulse/approvals
       ├─ 📦 Low stock (5) → /m/inventory
       ├─ 🚚 Deliveries (2) → /m/procurement
       └─ 💸 Payments (3) → /m/books/finance
     🕐 Recent (expandable folder)
       ├─ 📄 Hillview Corporate Park (12m)
       └─ ...
   All siblings "in a row" as tree nodes.
   ═══════════════════════════════════════════════════════════════════════════ */

const INDENT_PX = 20;

// ── Recent item icons ──
const RECENT_ICONS: Record<string, LucideIcon> = {
  po: FileText,
  requisition: ShoppingCart,
  project: Building2,
  material: Boxes,
  supplier: Truck,
  customer: Users,
  unit: Package,
  land: LandPlot,
  dpr: ClipboardList,
  employee: Users,
  equipment: Wrench,
  sale: TrendingUp,
  transfer: ArrowLeftRight,
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ── Briefing data type (mirrors /api/briefing response) ──
type BriefingData = {
  user: { id: string; name: string; role: string };
  approvals: {
    poCount: number;
    reqCount: number;
    gpCount: number;
    dprCount: number;
    expenseCount?: number;
    claimCount?: number;
    raCount?: number;
    leaveCount?: number;
    total: number;
    canApprovePo: boolean;
    canApproveReq: boolean;
    canApproveGp: boolean;
    canApproveDpr: boolean;
  };
  lowStock: Array<{ materialId: string; materialName: string; materialCode: string; qty: number; unit: string; reorderPoint: number | null }>;
  deliveriesToday: Array<{ poNumber: string; supplierName: string; projectName: string | null; total: number }>;
  paymentsDue: Array<{ description: string; amount: number; dueDate: string; type: string }>;
  sitePresence?: { checkedIn: number; onLeave: number } | null;
  setup?: { hasProjects: boolean; hasMembers: boolean; hasMaterials: boolean; hasSuppliers: boolean } | null;
};

export function HomeTree({ userName }: { userName: string | null }) {
  const { items: recentItems } = useRecentItems();
  const mounted = useMounted();
  const { data: briefing, loading, error, isValidating, retry } = useFetch<BriefingData>("/api/briefing");
  const [refreshing, setRefreshing] = React.useState(false);

  // useFetch already retries network errors with backoff — no custom
  // retry timer needed (replaces the old 2s auto-retry effect).
  const fetchBriefing = React.useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    retry();
  }, [retry]);

  React.useEffect(() => {
    if (!isValidating) setRefreshing(false);
  }, [isValidating]);

  // Greeting
  const now = useHydratedDate();
  const hour = now?.getHours() ?? 12;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName ? userName.split(" ")[0] : "there";

  // ── Build briefing child nodes ──
  type LeafNode = {
    icon: LucideIcon;
    iconBg: string;
    name: string;
    sub?: string;
    href: string;
    count: number;
  };
  const briefingChildren: LeafNode[] = [];
  if (briefing) {
    if (briefing.approvals.total > 0) {
      // Itemize only the types actually pending — "0 PO · 0 indent · 0 DPR"
      // under a count of 2 reads as "nothing pending" when the 2 are gate
      // passes (or claims/RA bills) the line didn't mention.
      const parts = [
        briefing.approvals.poCount && `${briefing.approvals.poCount} PO`,
        briefing.approvals.reqCount && `${briefing.approvals.reqCount} indent`,
        briefing.approvals.dprCount && `${briefing.approvals.dprCount} DPR`,
        briefing.approvals.gpCount && `${briefing.approvals.gpCount} gate pass`,
        briefing.approvals.expenseCount && `${briefing.approvals.expenseCount} expense`,
        briefing.approvals.claimCount && `${briefing.approvals.claimCount} claim`,
        briefing.approvals.raCount && `${briefing.approvals.raCount} RA bill`,
        briefing.approvals.leaveCount && `${briefing.approvals.leaveCount} leave`,
      ].filter(Boolean);
      briefingChildren.push({
        icon: ClipboardCheck,
        iconBg: "var(--color-signal)",
        name: "Approvals",
        sub: parts.join(" · "),
        href: "/m/pulse/approvals",
        count: briefing.approvals.total,
      });
    }
    if (briefing.lowStock.length > 0) {
      briefingChildren.push({
        icon: PackageX,
        iconBg: "var(--color-signal-dark)",
        name: "Low stock",
        sub: briefing.lowStock[0]?.materialName,
        href: "/m/inventory",
        count: briefing.lowStock.length,
      });
    }
    if (briefing.sitePresence && briefing.sitePresence.checkedIn > 0) {
      briefingChildren.push({
        icon: Users,
        iconBg: "var(--color-ok, #16a34a)",
        name: "On site today",
        sub: briefing.sitePresence.onLeave > 0
          ? `${briefing.sitePresence.onLeave} on leave`
          : "all hands present",
        href: "/m/attendance",
        count: briefing.sitePresence.checkedIn,
      });
    }
    if (briefing.deliveriesToday.length > 0) {
      briefingChildren.push({
        icon: Truck,
        iconBg: "var(--color-steel)",
        name: "Deliveries today",
        sub: briefing.deliveriesToday[0]?.poNumber,
        href: "/m/procurement",
        count: briefing.deliveriesToday.length,
      });
    }
    if (briefing.paymentsDue.length > 0) {
      briefingChildren.push({
        icon: CalendarClock,
        iconBg: "var(--color-stop)",
        name: "Payments overdue",
        sub: formatCurrencyCompact(briefing.paymentsDue[0]?.amount ?? 0),
        href: "/m/accounts?tab=payments",
        count: briefing.paymentsDue.length,
      });
    }
    // "See everything" — the attention queue aggregates ALL alerts (overdue
    // POs, cost overruns, Tally pending) that don't fit the briefing rows.
    // Without this link the page is orphaned: only reachable via search.
    if (briefingChildren.length > 1) {
      briefingChildren.push({
        icon: AlertTriangle,
        iconBg: "var(--color-ink-950)",
        name: "Everything that needs you",
        sub: "all alerts, one place",
        href: "/m/pulse/attention",
        count: 0,
      });
    }
  }

  const briefingTotal = briefingChildren.reduce((s, c) => s + c.count, 0);
  const hasBriefing = briefingChildren.length > 0;
  const hasRecent = recentItems.length > 0;

  return (
    <section className="mb-3">
      {/* ── Compact greeting header ── */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Sun className="size-4" style={{ color: "var(--color-signal)" }} />
          <span className="text-m-title" style={{ color: "var(--color-ink-950)" }}>
            {greeting}, {firstName}
          </span>
          <span className="text-m-caption self-end pb-px" style={{ color: "var(--color-ink-500)" }}>
            · {now ? formatDate(now) : ""}
          </span>
        </div>
        <button
          onClick={() => fetchBriefing(true)}
          disabled={refreshing}
          aria-label="Refresh briefing"
          className="grid place-items-center size-6 rounded-full press disabled:opacity-50"
          style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
        >
          {refreshing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
        </button>
      </div>

      {/* ── Tree container ── */}
      <div
        className="rounded-[0.625rem] border px-1 py-1.5"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {!hasBriefing && !hasRecent && !briefing?.setup && !loading ? (
          <div className="py-3 text-center">
            <CheckCircle2 className="mx-auto size-4 mb-1" style={{ color: "var(--color-go)" }} />
            <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>
              All caught up!
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Briefing and Recent stack full-width — at 390px a side-by-side
                split halves every row's label room and reads as two cramped
                columns instead of one calm tree. */}
            {/* ── Briefing folder ── */}
            {loading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--color-ink-500)" }} />
              </div>
            ) : error && !hasBriefing ? (
              <div className="flex flex-col items-center justify-center py-3 gap-1">
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Couldn&apos;t load briefing
                </p>
                <button
                  onClick={() => fetchBriefing(true)}
                  className="text-m-caption font-semibold press"
                  style={{ color: "var(--color-brand)" }}
                >
                  Retry
                </button>
              </div>
            ) : hasBriefing ? (
              <TreeFolder
                name="Briefing"
                icon={<ClipboardList className="size-2.5" style={{ color: "var(--color-paper)" }} />}
                iconBg="var(--color-ink-950)"
                count={briefingTotal}
                defaultOpen={true}
              >
                {briefingChildren.map((child, i) => (
                  <TreeLeaf
                    key={i}
                    icon={child.icon}
                    iconBg={child.iconBg}
                    name={child.name}
                    sub={child.sub}
                    href={child.href}
                    count={child.count}
                    isLast={i === briefingChildren.length - 1}
                  />
                ))}
              </TreeFolder>
            ) : null}

            {/* ── First-run setup checklist — fresh company, nothing built yet.
                 Only surfaces for OWNER/ADMIN while steps remain (API returns
                 null once the company is provisioned or for other roles). ── */}
            {briefing?.setup ? (
              <>
                {(loading || hasBriefing || hasRecent) && (
                  <div className="mx-2 my-0.5" style={{ borderTop: "1px solid var(--color-line)" }} />
                )}
                <TreeFolder
                  name="Set up your company"
                  icon={<HardHat className="size-2.5" style={{ color: "var(--color-paper)" }} />}
                  iconBg="var(--color-brand)"
                  count={[
                    briefing.setup.hasProjects,
                    briefing.setup.hasMembers,
                    briefing.setup.hasMaterials,
                    briefing.setup.hasSuppliers,
                  ].filter((s) => !s).length}
                  defaultOpen={true}
                >
                  {[
                    { done: briefing.setup.hasProjects, name: "Create your first project", sub: "sites, phases, budgets", href: "/m/projects" },
                    { done: briefing.setup.hasMembers, name: "Add your team", sub: "engineers, store keepers, guards", href: "/m/settings/team" },
                    { done: briefing.setup.hasMaterials, name: "Add materials", sub: "cement, steel, aggregate…", href: "/m/materials" },
                    { done: briefing.setup.hasSuppliers, name: "Add suppliers", sub: "who you buy from", href: "/m/suppliers" },
                  ].map((step, i, arr) => (
                    <TreeLeaf
                      key={step.name}
                      icon={step.done ? CheckCircle2 : CircleDot}
                      iconBg={step.done ? "var(--color-go)" : "var(--color-paper-2)"}
                      iconFg={step.done ? undefined : "var(--color-ink-500)"}
                      name={step.name}
                      sub={step.done ? "done" : step.sub}
                      href={step.href}
                      count={0}
                      isLast={i === arr.length - 1}
                    />
                  ))}
                </TreeFolder>
              </>
            ) : null}

            {/* ── Recent folder ── */}
            {hasRecent ? (
              <>
              {(loading || hasBriefing || error) && (
                <div
                  className="mx-2 my-0.5"
                  style={{ borderTop: "1px solid var(--color-line)" }}
                />
              )}
              <TreeFolder
                name="Recent"
                icon={<Clock className="size-2.5" style={{ color: "var(--color-ink-700)" }} />}
                iconBg="var(--color-concrete)"
                count={recentItems.length}
                defaultOpen={false}
              >
                {recentItems.slice(0, 10).map((item, i) => {
                  const Icon = RECENT_ICONS[item.type] ?? FileText;
                  return (
                    <TreeLeaf
                      key={`${item.type}:${item.id}`}
                      icon={Icon}
                      iconBg="var(--color-paper-2)"
                      iconFg="var(--color-ink-500)"
                      name={item.label}
                      sub={item.sublabel ?? (mounted ? timeAgo(item.ts) : "")}
                      href={item.href}
                      isLast={i === Math.min(recentItems.length, 10) - 1}
                    />
                  );
                })}
              </TreeFolder>
              </>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TREE FOLDER — expandable node (Briefing / Recent)
   ═══════════════════════════════════════════════════════════════════════════ */
function TreeFolder({
  name,
  icon,
  iconBg,
  count,
  defaultOpen,
  children,
}: {
  name: string;
  icon: React.ReactNode;
  iconBg: string;
  count: number;
  defaultOpen: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="min-w-0">
      <TreeRow
        depth={0}
        isLast={true}
        ancestorLast={[]}
        icon={icon}
        iconBg={iconBg}
        chevron
        chevronOpen={open}
        onChevronClick={() => setOpen((o) => !o)}
        name={name}
        nameBold
        nameOnClick={() => setOpen((o) => !o)}
        right={
          <span
            className="text-m-micro font-bold tabular-nums shrink-0"
            style={{ color: "var(--color-ink-500)" }}
          >
            {count}
          </span>
        }
      />
      {open && children ? <div>{children}</div> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TREE LEAF — a leaf node (briefing item / recent item)
   ═══════════════════════════════════════════════════════════════════════════ */
function TreeLeaf({
  icon: Icon,
  iconBg,
  iconFg,
  name,
  sub,
  href,
  count,
  isLast,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconFg?: string;
  name: string;
  sub?: string;
  href: string;
  count?: number;
  isLast: boolean;
}) {
  return (
    <TreeRow
      depth={1}
      isLast={isLast}
      ancestorLast={[false]}
      icon={<Icon className="size-2.5" style={{ color: iconFg ?? "var(--color-paper)" }} />}
      iconBg={iconBg}
      chevron={false}
      name={name}
      nameHref={href}
      nameBold={false}
      sub={sub}
      right={
        count != null ? (
          <span
            className="text-m-micro font-bold tabular-nums shrink-0"
            style={{ color: "var(--color-ink-500)" }}
          >
            {count}
          </span>
        ) : null
      }
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TREE ROW — the shared visual primitive (copied from OrgHierarchy.tsx)
   File-system style: connector lines, chevron, icon, name, sub, right content.
   ═══════════════════════════════════════════════════════════════════════════ */
function TreeRow({
  depth,
  isLast,
  ancestorLast,
  icon,
  iconBg,
  chevron,
  chevronOpen,
  onChevronClick,
  name,
  nameHref,
  nameOnClick,
  nameBold,
  sub,
  right,
}: {
  depth: number;
  isLast: boolean;
  ancestorLast: boolean[];
  icon: React.ReactNode;
  iconBg: string;
  chevron?: boolean;
  chevronOpen?: boolean;
  onChevronClick?: () => void;
  name: string;
  nameHref?: string;
  nameOnClick?: () => void;
  nameBold?: boolean;
  sub?: string;
  right?: React.ReactNode;
}) {
  const rowH = 24;
  return (
    <div className="flex items-center" style={{ height: rowH }}>
      {/* ── Connector columns ── */}
      {Array.from({ length: depth }, (_, i) => {
        const isElbowLevel = i === depth - 1;
        const ancestorWasLast = ancestorLast[i] ?? false;
        if (!isElbowLevel && ancestorWasLast) {
          return <div key={i} className="relative shrink-0" style={{ width: INDENT_PX, height: rowH }} />;
        }
        return (
          <div key={i} className="relative shrink-0" style={{ width: INDENT_PX, height: rowH }}>
            {isElbowLevel ? (
              <>
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: 0,
                    width: 1,
                    height: isLast ? rowH / 2 : rowH,
                    backgroundColor: "var(--color-line)",
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{
                    left: "50%",
                    width: INDENT_PX / 2,
                    height: 1,
                    backgroundColor: "var(--color-line)",
                  }}
                />
              </>
            ) : (
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ top: 0, bottom: 0, width: 1, backgroundColor: "var(--color-line)" }}
              />
            )}
          </div>
        );
      })}

      {/* ── Chevron ── */}
      <div className="shrink-0 w-4 flex items-center justify-center">
        {chevron ? (
          <button type="button" onClick={onChevronClick} aria-label="Expand section" className="text-m-body press">
            <ChevronRight
              className="size-3 transition-transform"
              style={{
                color: "var(--color-ink-500)",
                transform: chevronOpen ? "rotate(90deg)" : "none",
              }}
            />
          </button>
        ) : null}
      </div>

      {/* ── Icon ── */}
      <span
        className="grid place-items-center size-4 rounded-[0.1875rem] shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </span>

      {/* ── Name ── */}
      {nameHref ? (
        <Link
          href={nameHref}
          onClick={nameOnClick}
          className={`min-w-0 truncate press ml-1.5 ${nameBold ? "text-m-label font-bold" : "text-m-caption font-semibold"}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          <span className="truncate">{name}</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={nameOnClick}
          className={`min-w-0 truncate text-left press ml-1.5 ${nameBold ? "text-m-label font-bold" : "text-m-caption font-semibold"}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          <span className="truncate">{name}</span>
        </button>
      )}

      {/* ── Sub-label ── */}
      {sub ? (
        <span
          className="text-m-micro shrink-0 ml-1 truncate max-w-[35%]"
          style={{ color: "var(--color-ink-400)" }}
        >
          {sub}
        </span>
      ) : null}

      {/* ── Right content ── */}
      {right ? <div className="shrink-0 ml-1.5">{right}</div> : null}
    </div>
  );
}
