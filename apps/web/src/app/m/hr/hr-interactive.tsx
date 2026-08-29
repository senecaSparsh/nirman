"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList,
  CalendarCheck,
  FileText,
  ListChecks,
  ShieldAlert,
  MapPin,
  Users,
  CalendarDays,
  Wallet,
  TrendingUp,
  HardHat,
  type LucideIcon,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   HR HOME — interactive client layer

   Two toggle tabs (Field / People) that switch the quick actions grid
   below. Mirrors the inventory home's Raw Material / Real Estate toggle.

   • Field  — what happens on site every day: DPRs, attendance, tasks,
              safety, field reports.
   • People — the roster and the money: employees, leaves, payroll,
              labour cost, crews.
   ═══════════════════════════════════════════════════════════════════════════ */

interface QuickAction {
  href: string;
  icon: LucideIcon;
  label: string;
}

const FIELD_ACTIONS: QuickAction[] = [
  { href: "/m/dprs", icon: ClipboardList, label: "DPRs" },
  { href: "/m/attendance", icon: CalendarCheck, label: "Attendance" },
  { href: "/m/site/dpr", icon: FileText, label: "Add DPR" },
  { href: "/m/site/tasks", icon: ListChecks, label: "Tasks" },
  { href: "/m/safety", icon: ShieldAlert, label: "Safety" },
  { href: "/m/site/field", icon: MapPin, label: "Field" },
  { href: "/m/site", icon: HardHat, label: "Site" },
  { href: "/m/dprs", icon: TrendingUp, label: "Progress" },
];

const PEOPLE_ACTIONS: QuickAction[] = [
  { href: "/m/hr/employees", icon: Users, label: "Employees" },
  { href: "/m/hr/leaves", icon: CalendarDays, label: "Leaves" },
  { href: "/m/books/payroll", icon: Wallet, label: "Payroll" },
  { href: "/m/reports/payroll-expense", icon: TrendingUp, label: "Labour Cost" },
  { href: "/m/hr/employees", icon: HardHat, label: "Crews" },
  { href: "/m/hr/leaves", icon: CalendarDays, label: "Approvals" },
];

type CategoryId = "field" | "people";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: string;
  actions: QuickAction[];
}[] = [
  {
    id: "field",
    label: "Field",
    icon: "👷",
    actions: FIELD_ACTIONS,
  },
  {
    id: "people",
    label: "People",
    icon: "🧑",
    actions: PEOPLE_ACTIONS,
  },
];

export function HrInteractive() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read the tab from the URL (?tab=people) so the selection survives
  // refresh and back/forward navigation. Falls back to "field".
  const paramTab = searchParams.get("tab");
  const initialTab: CategoryId =
    paramTab === "people" || paramTab === "field" ? paramTab : "field";
  const [activeTab, setActiveTab] = React.useState<CategoryId>(initialTab);

  // Keep state in sync if the URL changes (e.g. browser back/forward).
  React.useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "people" || t === "field") {
      setActiveTab(t);
    } else {
      setActiveTab("field");
    }
  }, [searchParams]);

  const active = CATEGORIES.find((c) => c.id === activeTab)!;

  function selectTab(id: CategoryId) {
    setActiveTab(id);
    // Shallow-update the URL without scrolling so the choice is bookmarkable
    // and survives refresh / back navigation.
    const params = new URLSearchParams(searchParams.toString());
    if (id === "field") {
      params.delete("tab"); // default — keep URL clean
    } else {
      params.set("tab", id);
    }
    const qs = params.toString();
    router.replace(qs ? `/m/hr?${qs}` : "/m/hr", { scroll: false });
  }

  return (
    <>
      {/* ── Toggle tabs — Field / People ── */}
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
              className="flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-body text-m-body press transition-colors"
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

      {/* ── Quick actions — grid switches with tab ── */}
      <div className={`grid gap-1.5 mb-3 ${active.actions.length % 3 === 0 ? "grid-cols-3" : "grid-cols-4"}`}>
        {active.actions.map((action) => (
          <QuickActionTile
            key={action.label}
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
