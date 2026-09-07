"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileText, ShoppingCart, Building2, Boxes, Truck, Users,
  Package, LandPlot, ClipboardList, Wrench, ArrowLeftRight,
  TrendingUp, Clock, Sun, type LucideIcon,
} from "lucide-react";
import { OrbitNavigator } from "@/components/mobile/v2/orbit-navigator";
import { useRecentItems, type RecentItem } from "@/lib/use-recent-items";
import { useAutoScroll } from "@/lib/use-auto-scroll";
import { formatDate } from "@/lib/utils";
import { MobileCompanyFab } from "./MobileCompanyFab";
import { useHydratedDate } from "@/lib/use-hydrated-date";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE HOME — Orbit Navigation Hub

   Shows the orbit for the currently selected company directly on the page.
   Company switching happens via the header/settings switcher — the
   nirman-company-switched event updates the orbit here.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CompanyCardData {
  id: string;
  name: string;
  businessType: string | null;
  currency: string;
  projectCount: number;
  landCount: number;
  employeeCount: number;
}

interface CurrentCompany {
  id: string;
  name: string;
  businessType: string | null;
  currency: string;
}

export function MobileHomeClient({
  currentCompany: initialCompany,
  companies,
  canCreateCompany,
}: {
  currentCompany: CurrentCompany;
  companies: CompanyCardData[];
  canCreateCompany: boolean;
}) {
  const [activeCompany, setActiveCompany] = React.useState<CurrentCompany>(initialCompany);

  // ── Listen for company-switched events from the header/settings switcher ──
  React.useEffect(() => {
    function onCompanySwitched() {
      fetch("/api/company")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (c?.id) {
            setActiveCompany({
              id: c.id,
              name: c.name,
              businessType: c.businessType,
              currency: c.currency,
            });
          }
        })
        .catch(() => {});
    }
    window.addEventListener("nirman-company-switched", onCompanySwitched);
    return () => window.removeEventListener("nirman-company-switched", onCompanySwitched);
  }, []);

  // Key forces OrbitNavigator to re-mount when company changes
  const orbitKey = activeCompany.id;

  return (
    <div>
      {/* ── Orbit for the active company (always visible, no grid) ── */}
      <OrbitNavigator
        key={orbitKey}
        initialNode={{
          id: activeCompany.id,
          type: "company",
          title: activeCompany.name,
          subtitle: activeCompany.businessType ?? "Construction & Real Estate",
          meta: activeCompany.currency === "INR" ? "₹ INR" : activeCompany.currency,
        }}
        inline={true}
        open={true}
      />

      {/* ── FAB: Create new company (owner/admin only) ── */}
      {canCreateCompany ? (
        <MobileCompanyFab
          parentOptions={companies.map((c) => ({ id: c.id, name: c.name }))}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOME TOP SECTION — greeting (left) + recent carousel (right) in a 2-col grid.
   Rendered at the very top of the mobile home page, above the MorningBriefing.
   ═══════════════════════════════════════════════════════════════════════════ */

export function HomeTopSection({ userName }: { userName: string | null }) {
  const router = useRouter();
  const { items: recentItems } = useRecentItems();

  return (
    <div
      className="grid gap-2 pt-3 pb-1"
      style={{ gridTemplateColumns: "2fr 3fr" }}
    >
      <GreetingHeader userName={userName} />
      {recentItems.length > 0 ? (
        <RecentItemsCarousel items={recentItems} onSelect={(href) => router.push(href)} />
      ) : (
        <div />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GREETING HEADER — compact, flush-left, sits in the left grid column
   ═══════════════════════════════════════════════════════════════════════════ */

function GreetingHeader({ userName }: { userName: string | null }) {
  const now = useHydratedDate();
  const hour = now?.getHours() ?? 12;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName ? userName.split(" ")[0] : "there";
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <Sun className="size-3.5 shrink-0 mt-0.5" style={{ color: "var(--color-signal)" }} />
      <div className="min-w-0">
        <div className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
          {greeting}, {firstName}
        </div>
        <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          {now ? formatDate(now) : ""}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RECENT ITEMS CAROUSEL — "Jump Back In"
   Horizontal scroll of recently viewed entities. Tap to navigate.
   ═══════════════════════════════════════════════════════════════════════════ */

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

function RecentItemsCarousel({
  items,
  onSelect,
}: {
  items: RecentItem[];
  onSelect: (href: string) => void;
}) {
  const scrollerRef = useAutoScroll<HTMLDivElement>([items.length]);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Clock className="size-3" style={{ color: "var(--color-ink-400)" }} />
        <span
          className="text-m-caption font-bold uppercase tracking-wide"
          style={{ color: "var(--color-ink-400)" }}
        >
          Recent
        </span>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-1.5 overflow-x-auto pb-0.5"
        style={{ scrollbarWidth: "none" }}
      >
        {items.slice(0, 10).map((item) => {
          const Icon = RECENT_ICONS[item.type] ?? FileText;
          return (
            <button
              key={`${item.type}:${item.id}`}
              onClick={() => onSelect(item.href)}
              className="text-m-body press shrink-0 border p-1.5 text-left"
              style={{
                width: "5rem",
                borderRadius: "0.5rem",
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper)",
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <div
                  className="flex items-center justify-center size-4 rounded-md shrink-0"
                  style={{ backgroundColor: "var(--color-surface)" }}
                >
                  <Icon className="size-2.5" style={{ color: "var(--color-ink-500)" }} />
                </div>
                <span
                  className="text-m-caption font-medium uppercase tracking-wide"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  {timeAgo(item.ts)}
                </span>
              </div>
              <div
                className="text-m-caption font-semibold truncate"
                style={{ color: "var(--color-ink-950)" }}
              >
                {item.label}
              </div>
              {item.sublabel ? (
                <div
                  className="text-m-label truncate mt-0.5"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  {item.sublabel}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
