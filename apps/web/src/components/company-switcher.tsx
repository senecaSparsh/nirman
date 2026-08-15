"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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
 */
export function CompanySwitcher({
  companies: initial,
}: {
  companies: CompanyOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (initial.length <= 1) return null;
  const current = initial.find((c) => c.isCurrent) ?? initial[0]!;

  async function switchTo(id: string) {
    setSwitching(id);
    try {
      const res = await fetch("/api/companies/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: id }),
      });
      if (res.ok) {
        setOpen(false);
        // Notify all client-side components (AppShell, MobileShell) that
        // the active company changed so they can re-fetch the company
        // name and update the document title + brand mark. router.refresh()
        // alone only re-renders server components — client-side state like
        // companyName in AppShell wouldn't update without this event.
        window.dispatchEvent(new CustomEvent("nirman-company-switched"));
        router.refresh();
      }
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-caption text-foreground transition-colors hover:border-foreground/20"
        title="Switch company"
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden max-w-[120px] truncate sm:inline">{current.name}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-xl">
          <div className="max-h-72 overflow-y-auto">
            {initial.map((c) => (
              <button
                key={c.id}
                onClick={() => switchTo(c.id)}
                disabled={switching === c.id}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-body transition-colors hover:bg-muted",
                  c.isCurrent && "bg-muted/50",
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
                {c.isCurrent && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
          <div className="border-t border-border pt-1">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/settings?tab=companies");
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
