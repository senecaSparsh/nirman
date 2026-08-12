"use client";

import * as React from "react";
import Link from "next/link";
import { X, ChevronRight, type LucideIcon } from "lucide-react";
import { NAV_GROUPS, type NavLink } from "@/lib/mobile-nav-v2";

/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY HOME — interactive client layer

   Provides category cards (Raw Material / Real Estate) that open a popup
   sheet with all navigation links for that category.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Category card data ── */
const CATEGORY_CARDS = [
  {
    id: "raw-material",
    title: "Raw Material",
    subtitle: "Procurement, stock, suppliers",
    icon: "📦" as const,
    groupTitles: ["Procurement", "Stock"],
  },
  {
    id: "real-estate",
    title: "Real Estate",
    subtitle: "Projects, units, customers",
    icon: "🏗️" as const,
    groupTitles: ["Real Estate"],
  },
];

export function InventoryInteractive() {
  const [categoryPopup, setCategoryPopup] = React.useState<string | null>(null);

  return (
    <>
      {/* ── Category cards — 2-col grid ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {CATEGORY_CARDS.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryPopup(cat.id)}
            className="flex flex-col items-center gap-1.5 rounded-[0.625rem] border p-2.5 press"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
            }}
          >
            <span
              className="grid place-items-center w-9 h-9 rounded-[0.5rem] text-[1.125rem]"
              style={{ backgroundColor: "var(--color-paper-2)" }}
            >
              {cat.icon}
            </span>
            <div className="text-center">
              <p
                className="font-semibold text-[0.75rem]"
                style={{ color: "var(--color-ink-950)" }}
              >
                {cat.title}
              </p>
              <p
                className="text-[0.5rem] mt-0.5"
                style={{ color: "var(--color-ink-500)" }}
              >
                {cat.subtitle}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Category popup sheet ── */}
      {categoryPopup ? (
        <CategoryPopup
          categoryId={categoryPopup}
          onClose={() => setCategoryPopup(null)}
        />
      ) : null}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CATEGORY POPUP — bottom sheet with nav links
   Opens when tapping "Raw Material" or "Real Estate" category cards.
   ═══════════════════════════════════════════════════════════════════════════ */
function CategoryPopup({
  categoryId,
  onClose,
}: {
  categoryId: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setMounted((prev) => (prev ? prev : true));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleClose = React.useCallback(() => {
    setExiting(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setMounted(false);
      onClose();
    }, 220);
  }, [onClose]);

  React.useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  // Get links from NAV_GROUPS — match all group titles for this category
  const card = CATEGORY_CARDS.find((c) => c.id === categoryId);
  const allGroups = NAV_GROUPS["inventory"] ?? [];
  const groups = allGroups.filter((g) => card?.groupTitles.includes(g.title));

  if (groups.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className={exiting ? "overlay-out" : "overlay-in"}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(18, 17, 13, 0.4)",
        }}
        onClick={handleClose}
      />
      <div
        className={exiting ? "sheet-out" : "sheet-in"}
        style={{
          position: "relative",
          maxHeight: "75vh",
          backgroundColor: "var(--color-paper-2)",
          borderTopLeftRadius: "0.875rem",
          borderTopRightRadius: "0.875rem",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: "var(--color-line)" }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 shrink-0">
          <h2
            className="text-[1.0625rem] font-semibold"
            style={{ color: "var(--color-ink-950)" }}
          >
            {card?.title}
          </h2>
          <button
            onClick={handleClose}
            className="press grid place-items-center size-7 rounded-[0.5rem]"
            style={{
              color: "var(--color-ink-500)",
              backgroundColor: "var(--color-concrete)",
            }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Link list — grouped by section */}
        <div className="overflow-y-auto px-4 pb-4 pb-safe">
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                {groups.length > 1 ? (
                  <p
                    className="text-[0.5625rem] font-bold uppercase tracking-wide px-1"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {group.title}
                  </p>
                ) : null}
                {group.links.map((link) => (
                  <CategoryLinkRow key={link.href} link={link} onClick={handleClose} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryLinkRow({
  link,
  onClick,
}: {
  link: NavLink;
  onClick: () => void;
}) {
  const Icon = link.icon as LucideIcon;
  return (
    <Link
      href={link.href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-[0.875rem] border p-3 press"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <span
        className="shrink-0 grid place-items-center w-9 h-9 rounded-[0.5rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Icon className="size-4" style={{ color: "var(--color-ink-500)" }} />
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="text-[0.8125rem] font-semibold leading-tight"
          style={{ color: "var(--color-ink-950)" }}
        >
          {link.label}
        </p>
        {link.subtitle ? (
          <p
            className="text-[0.6875rem] mt-0.5 truncate"
            style={{ color: "var(--color-ink-500)" }}
          >
            {link.subtitle}
          </p>
        ) : null}
      </div>
      <ChevronRight
        className="size-4 shrink-0"
        style={{ color: "var(--color-ink-300)" }}
      />
    </Link>
  );
}
