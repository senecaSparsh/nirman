"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Check, ChevronDown } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   COMPANY SWITCHER / HEADER

   Renders as the company context header (avatar + name + currency/role).
   When there are multiple companies, the header is tappable and opens a
   dropdown to switch. When there's only one company, it renders as a
   static header (no chevron, no dropdown).

   Sets the nirman-company-id cookie and refreshes the page on switch.
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
  const router = useRouter();
  // Switching is only for OWNER/ADMIN at the top of the hierarchy (no parent).
  // Child company users see a static header — they can't switch to siblings.
  const canSwitch =
    (role === "OWNER" || role === "ADMIN") &&
    !parentCompanyId &&
    companies.length > 1;
  const hasMultiple = canSwitch;
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
    await fetch("/api/company/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: id }),
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent("nirman-company-switched"));
    startTransition(() => {
      router.refresh();
    });
    setSwitching(false);
    setOpen(false);
  }

  const current = companies.find((c) => c.id === currentCompanyId);
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
          {displayName}
        </p>
        <p
          className="text-m-caption mt-0.5"
          style={{ color: "var(--color-ink-500)" }}
        >
          {currency} · {role}
        </p>
      </div>
      {/* Chevron — only when switchable */}
      {hasMultiple ? (
        <ChevronDown
          className="size-4 shrink-0 transition-transform"
          style={{
            color: "var(--color-ink-500)",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      ) : null}
    </>
  );

  const headerCls =
    "w-full flex items-center gap-2.5 rounded-[0.625rem] border p-3";
  const headerStyle: React.CSSProperties = {
    borderColor: open ? "var(--color-ink-950)" : "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };

  return (
    <div ref={ref} className="relative">
      {hasMultiple ? (
        <button
          onClick={() => setOpen(!open)}
          className={`${headerCls} press`}
          style={headerStyle}
        >
          {headerContent}
        </button>
      ) : (
        <div className={headerCls} style={headerStyle}>
          {headerContent}
        </div>
      )}

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
              onClick={() => switchCompany(c.id)}
              disabled={switching}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-m-body press disabled:opacity-50"
              style={{
                backgroundColor:
                  c.id === currentCompanyId
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
