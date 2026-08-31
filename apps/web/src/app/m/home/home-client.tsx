"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileText, ShoppingCart, Building2, Boxes, Truck, Users,
  Package, LandPlot, ClipboardList, Wrench, ArrowLeftRight,
  TrendingUp, Clock, type LucideIcon,
} from "lucide-react";
import { OrbitNavigator } from "@/components/mobile/v2/orbit-navigator";
import { useRecentItems, type RecentItem } from "@/lib/use-recent-items";
import { MobileCompanyFab } from "./MobileCompanyFab";

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
  const router = useRouter();
  const { items: recentItems } = useRecentItems();

  return (
    <div>
      {/* ── Recent items ("Jump Back In") ── */}
      {recentItems.length > 0 ? (
        <RecentItemsCarousel items={recentItems} onSelect={(href) => router.push(href)} />
      ) : null}

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
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Clock className="size-3.5" style={{ color: "var(--color-ink-400)" }} />
        <span
          className="text-m-label font-bold uppercase tracking-wide"
          style={{ color: "var(--color-ink-400)" }}
        >
          Recent
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {items.slice(0, 10).map((item) => {
          const Icon = RECENT_ICONS[item.type] ?? FileText;
          return (
            <button
              key={`${item.type}:${item.id}`}
              onClick={() => onSelect(item.href)}
              className="text-m-body press shrink-0 w-[8.5rem] rounded-[0.625rem] border p-2.5 text-left"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div
                  className="flex items-center justify-center size-6 rounded-md shrink-0"
                  style={{ backgroundColor: "var(--color-surface)" }}
                >
                  <Icon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
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
