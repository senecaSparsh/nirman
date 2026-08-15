"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   COMPANY SWITCHER
   For owners/managers with multiple company memberships.
   Sets the nirman-company-id cookie and refreshes the page.
   ═══════════════════════════════════════════════════════════════════════════ */

export function CompanySwitcher({
  currentCompanyId,
  companies,
}: {
  currentCompanyId: string;
  companies: { id: string; name: string; role: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

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

  async function switchCompany(id: string) {
    if (id === currentCompanyId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    // Set the cookie via a fetch to an API endpoint
    await fetch("/api/company/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: id }),
    }).catch(() => {});
    // Notify all client-side components (AppShell, MobileShell) that
    // the active company changed so they can re-fetch the company
    // name and update the document title + brand mark.
    window.dispatchEvent(new CustomEvent("nirman-company-switched"));
    router.refresh();
    setSwitching(false);
    setOpen(false);
  }

  const current = companies.find((c) => c.id === currentCompanyId);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press"
        style={{
          borderColor: open ? "var(--color-ink-950)" : "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <span
          className="grid place-items-center w-7 h-7 rounded-[0.375rem] shrink-0"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <Building2
            className="size-3.5"
            style={{ color: "var(--color-ink-500)" }}
          />
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p
            className="text-[0.5625rem] uppercase tracking-wide font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            Switch company
          </p>
          <p
            className="text-[0.75rem] font-semibold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {current?.name ?? "Select…"}
          </p>
        </div>
        <ChevronDown
          className="size-4 shrink-0 transition-transform"
          style={{
            color: "var(--color-ink-500)",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open ? (
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
              onClick={() => switchCompany(c.id)}
              disabled={switching}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left press disabled:opacity-50"
              style={{
                backgroundColor:
                  c.id === currentCompanyId
                    ? "var(--color-concrete)"
                    : "transparent",
              }}
            >
              <span
                className="grid place-items-center w-6 h-6 rounded-[0.25rem] text-[0.5rem] font-bold shrink-0"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "#fff",
                }}
              >
                {c.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[0.6875rem] font-semibold truncate"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {c.name}
                </p>
                <p
                  className="text-[0.5rem]"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {c.role}
                </p>
              </div>
              {c.id === currentCompanyId ? (
                <Check
                  className="size-3.5 shrink-0"
                  style={{ color: "var(--color-go)" }}
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
