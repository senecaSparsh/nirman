"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanySwitch } from "@/lib/use-company-switch";

type CompanyOption = {
  id: string;
  name: string;
  businessType: string | null;
  parentName: string | null;
  isCurrent: boolean;
};

/**
 * Header company switcher. Shows the active company name and lets the
 * user switch to any company they have access to. Hidden when there is
 * only one company (the common single-company case).
 *
 * Uses `useCompanySwitch` for optimistic UI + generation-counter race
 * protection. The header label and checkmark move instantly on click;
 * the content area dims while `router.refresh()` fetches the new data.
 */
export function CompanySwitcher({
  companies: initial,
}: {
  companies: CompanyOption[];
}) {
  const [open, setOpen] = useState(false);
  // Track the optimistically-selected company so the header label and the
  // checkmark move instantly on click — before router.refresh() round-trips
  // with fresh server props. Falls back to the server-provided isCurrent.
  const [activeId, setActiveId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { switchCompany, isSwitching, switchingToId } = useCompanySwitch({
    onOptimisticSwitch: (target) => setActiveId(target.id),
    onRevert: () => setActiveId(null),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Empty (still loading via SWR): render nothing until companies are fetched.
  if (initial.length === 0) return null;

  const serverCurrent = initial.find((c) => c.isCurrent) ?? initial[0]!;
  // Prefer the optimistic selection, then the server's current company.
  const current =
    (activeId && initial.find((c) => c.id === activeId)) || serverCurrent;

  // Single-company case: show the name as a link to the profile, but hide
  // the switcher chevron/dropdown (nothing to switch to).
  if (initial.length === 1) {
    return (
      <Link
        href={`/companies/${current.id}`}
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-caption text-foreground transition-colors hover:border-foreground/20 hover:bg-muted/40"
        title="View company profile"
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-[120px] truncate">{current.name}</span>
      </Link>
    );
  }

  async function switchTo(id: string) {
    const target = initial.find((c) => c.id === id);
    if (!target || target.id === current.id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    await switchCompany({
      id: target.id,
      name: target.name,
      parentCompanyId: target.parentName ? undefined : null,
    });
  }

  return (
    <div ref={ref} className="relative flex items-stretch">
      {/* Company name — links to the company profile page */}
      <Link
        href={`/companies/${current.id}`}
        className="flex items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-card px-2 py-1.5 text-caption text-foreground transition-colors hover:border-foreground/20 hover:bg-muted/40"
        title="View company profile"
      >
        {isSwitching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="max-w-[120px] truncate">{current.name}</span>
      </Link>
      {/* Chevron — opens the switcher dropdown */}
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isSwitching}
        className="flex items-center rounded-r-md border border-border bg-card px-1.5 py-1.5 text-caption text-foreground transition-colors hover:border-foreground/20 hover:bg-muted/40 disabled:opacity-60"
        title="Switch company"
        aria-label="Switch company"
      >
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-xl">
          <div className="max-h-72 overflow-y-auto">
            {initial.map((c) => (
              <button
                key={c.id}
                onClick={() => switchTo(c.id)}
                disabled={isSwitching}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-body transition-colors hover:bg-muted disabled:opacity-50",
                  c.id === current.id && "bg-muted/50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  {c.businessType && (
                    <div className="truncate text-micro text-muted-foreground">{c.businessType}</div>
                  )}
                  {c.parentName && (
                    <div className="truncate text-micro text-muted-foreground">under {c.parentName}</div>
                  )}
                </div>
                {c.id === current.id && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                {switchingToId === c.id && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
              </button>
            ))}
          </div>
          <div className="border-t border-border pt-1">
            <a
              href={`/companies/${current.id}`}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Building2 className="h-3.5 w-3.5" /> Company profile
            </a>
            <button
              onClick={() => {
                setOpen(false);
                window.location.href = "/settings?tab=companies";
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Manage companies
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
