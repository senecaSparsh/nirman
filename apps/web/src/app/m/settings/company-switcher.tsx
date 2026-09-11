"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useCompanySwitch } from "@/lib/use-company-switch";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════════════════
   COMPANY SWITCHER / HEADER (mobile settings page)

   Renders as the company context header (avatar + name + currency/role).
   When there are multiple companies, the header is tappable and opens a
   dropdown to switch. When there's only one company, it renders as a
   static header (no chevron, no dropdown).

   Uses useCompanySwitch for optimistic UI + generation-counter race
   protection + event-with-data. The header updates instantly on click.
   ═══════════════════════════════════════════════════════════════════════════ */

export function CompanySwitcher({
  currentCompanyId,
  companies,
  currency,
  role,
  parentCompanyId,
}: {
  currentCompanyId: string;
  companies: { id: string; name: string; role: string }[];
  currency: string;
  role: string;
  parentCompanyId: string | null;
}) {
  // Switching is only for OWNER/ADMIN at the top of the hierarchy (no parent).
  // Child company users see a static header — they can't switch to siblings.
  const canSwitch =
    (role === "OWNER" || role === "ADMIN") &&
    !parentCompanyId &&
    companies.length > 1;
  const hasMultiple = canSwitch;
  const [open, setOpen] = React.useState(false);
  // Optimistic selection — moves the checkmark instantly on click
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  // Previous state for rollback on failure
  const prevIdRef = React.useRef<string | null>(null);

  const { switchCompany, isSwitching, switchingToId } = useCompanySwitch({
    endpoint: "/api/company/switch",
    onOptimisticSwitch: (target) => {
      prevIdRef.current = currentCompanyId;
      setActiveId(target.id);
    },
    onRevert: () => {
      setActiveId(prevIdRef.current);
      toast.error("Failed to switch company. Please try again.");
    },
  });

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function switchTo(id: string) {
    if (id === (activeId ?? currentCompanyId)) {
      setOpen(false);
      return;
    }
    const target = companies.find((c) => c.id === id);
    if (!target) return;
    setOpen(false);
    await switchCompany({ id: target.id, name: target.name });
  }

  const currentId = activeId ?? currentCompanyId;
  const current = companies.find((c) => c.id === currentId);
  const displayName = current?.name ?? companies[0]?.name ?? "—";

  const headerContent = (
    <>
      {/* Avatar */}
      <span
        className="grid place-items-center w-10 h-10 rounded-[0.5rem] shrink-0 text-m-section font-bold"
        style={{
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
        }}
      >
        {displayName.slice(0, 2).toUpperCase()}
      </span>
      {/* Name + meta */}
      <div className="min-w-0 flex-1 text-left">
        <p
          className="font-bold text-m-section truncate"
          style={{ color: "var(--color-ink-950)" }}
        >
          {isSwitching ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" style={{ color: "var(--color-ink-500)" }} />
              Switching…
            </span>
          ) : (
            displayName
          )}
        </p>
        <p
          className="text-m-caption mt-0.5"
          style={{ color: "var(--color-ink-500)" }}
        >
          {currency} · {role}
        </p>
      </div>
    </>
  );

  const headerCls =
    "flex items-center gap-2.5 rounded-[0.625rem] border p-3";
  const headerStyle: React.CSSProperties = {
    borderColor: open ? "var(--color-ink-950)" : "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-stretch gap-0">
        {/* Company name — links to the mobile company settings page */}
        <Link
          href="/m/settings/company"
          className={`${headerCls} flex-1 press`}
          style={headerStyle}
        >
          {headerContent}
        </Link>
        {/* Chevron — opens the switcher dropdown (only when multiple) */}
        {hasMultiple ? (
          <button
            onClick={() => setOpen(!open)}
            disabled={isSwitching}
            className="flex items-center justify-center px-3 rounded-[0.625rem] border border-l-0 press disabled:opacity-60"
            style={headerStyle}
            aria-label="Switch company"
          >
            <ChevronDown
              className="size-4 shrink-0 transition-transform"
              style={{
                color: "var(--color-ink-500)",
                transform: open ? "rotate(180deg)" : "none",
              }}
            />
          </button>
        ) : null}
      </div>

      {/* Dropdown — only when multiple companies */}
      {hasMultiple && open ? (
        <div
          className="absolute top-full left-0 right-0 z-30 mt-1 rounded-[0.625rem] border-2 shadow-lg overflow-hidden"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => switchTo(c.id)}
              disabled={isSwitching}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-m-body press disabled:opacity-50"
              style={{
                backgroundColor:
                  c.id === currentId
                    ? "var(--color-concrete)"
                    : "transparent",
              }}
            >
              <span
                className="grid place-items-center w-6 h-6 rounded-[0.25rem] text-m-caption font-bold shrink-0"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                {c.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-m-body font-semibold truncate"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {c.name}
                </p>
                <p
                  className="text-m-caption"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {c.role}
                </p>
              </div>
              {c.id === currentId ? (
                <Check
                  className="size-3.5 shrink-0"
                  style={{ color: "var(--color-go)" }}
                />
              ) : switchingToId === c.id ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" style={{ color: "var(--color-ink-500)" }} />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
