"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Package,
  LandPlot,
  ClipboardList,
  Wrench,
  TrendingUp,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { useRecentItems } from "@/lib/use-recent-items";
import { formatDate, formatCurrencyCompact } from "@/lib/utils";

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
    total: number;
    canApprovePo: boolean;
    canApproveReq: boolean;
    canApproveGp: boolean;
    canApproveDpr: boolean;
  };
  lowStock: Array<{ materialId: string; materialName: string; materialCode: string; qty: number; unit: string; reorderPoint: number | null }>;
  deliveriesToday: Array<{ poNumber: string; supplierName: string; projectName: string | null; total: number }>;
  paymentsDue: Array<{ description: string; amount: number; dueDate: string; type: string }>;
};

export function HomeTree({ userName }: { userName: string | null }) {
  const _router = useRouter();
  const { items: recentItems } = useRecentItems();
  const [briefing, setBriefing] = React.useState<BriefingData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState(false);

  const fetchBriefing = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/briefing", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setBriefing(json);
    } catch (e) {
      console.error("[HomeTree] briefing fetch failed:", e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-retry once after 2s if the first fetch fails (Brave shields can
  // block the initial request before the page fully loads)
  React.useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  React.useEffect(() => {
    if (error && !loading) {
      const t = setTimeout(() => fetchBriefing(true), 2000);
      return () => clearTimeout(t);
    }
  }, [error, loading, fetchBriefing]);

  // Greeting
  const hour = new Date().getHours();
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
      briefingChildren.push({
        icon: ClipboardCheck,
        iconBg: "var(--color-signal)",
        name: "Approvals",
        sub: `${briefing.approvals.poCount} PO · ${briefing.approvals.reqCount} indent · ${briefing.approvals.dprCount} DPR`,
        href: "/m/pulse/approvals",
        count: briefing.approvals.total,
      });
    }
    if (briefing.lowStock.length > 0) {
      briefingChildren.push({
        icon: PackageX,
        iconBg: "#d97706",
        name: "Low stock",
        sub: briefing.lowStock[0]?.materialName,
        href: "/m/inventory",
        count: briefing.lowStock.length,
      });
    }
    if (briefing.deliveriesToday.length > 0) {
      briefingChildren.push({
        icon: Truck,
        iconBg: "#2d5a8c",
        name: "Deliveries today",
        sub: briefing.deliveriesToday[0]?.poNumber,
        href: "/m/procurement",
        count: briefing.deliveriesToday.length,
      });
    }
    if (briefing.paymentsDue.length > 0) {
      briefingChildren.push({
        icon: CalendarClock,
        iconBg: "#b91c1c",
        name: "Payments overdue",
        sub: formatCurrencyCompact(briefing.paymentsDue[0]?.amount ?? 0),
        href: "/m/books/finance",
        count: briefing.paymentsDue.length,
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
          <Sun className="size-3.5" style={{ color: "var(--color-signal)" }} />
          <span className="text-m-body font-bold" style={{ color: "var(--color-ink-950)" }}>
            {greeting}, {firstName}
          </span>
          <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
            · {formatDate(new Date())}
          </span>
        </div>
        <button
          onClick={() => fetchBriefing(true)}
          disabled={refreshing}
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
        {!hasBriefing && !hasRecent && !loading ? (
          <div className="py-3 text-center">
            <CheckCircle2 className="mx-auto size-4 mb-1" style={{ color: "var(--color-go)" }} />
            <p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>
              All caught up!
            </p>
          </div>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: (loading || hasBriefing || error) && hasRecent ? "1fr 1fr" : "1fr" }}
          >
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

            {/* ── Recent folder ── */}
            {hasRecent ? (
              <TreeFolder
                name="Recent"
                icon={<Clock className="size-2.5" style={{ color: "var(--color-ink-700)" }} />}
                iconBg="var(--color-concrete)"
                count={recentItems.length}
                defaultOpen={true}
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
                      sub={item.sublabel ?? timeAgo(item.ts)}
                      href={item.href}
                      isLast={i === Math.min(recentItems.length, 10) - 1}
                    />
                  );
                })}
              </TreeFolder>
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
            className="text-m-caption font-bold tabular-nums shrink-0"
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
            className="text-m-caption font-bold tabular-nums shrink-0"
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
          <button type="button" onClick={onChevronClick} className="text-m-body press">
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
          className={`min-w-0 truncate press ml-1.5 ${nameBold ? "text-m-body font-bold" : "text-m-label font-semibold"}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          <span className="truncate">{name}</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={nameOnClick}
          className={`min-w-0 truncate text-left press ml-1.5 ${nameBold ? "text-m-body font-bold" : "text-m-label font-semibold"}`}
          style={{ color: "var(--color-ink-950)" }}
        >
          <span className="truncate">{name}</span>
        </button>
      )}

      {/* ── Sub-label ── */}
      {sub ? (
        <span
          className="text-m-caption shrink-0 ml-1 truncate max-w-[35%]"
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
