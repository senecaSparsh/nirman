"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";

/**
 * Generic inline action bar for mobile detail pages. Surfaces
 * RBAC-gated action buttons that call an API endpoint via fetch,
 * then `router.refresh()` to re-render the server component.
 *
 * Mirrors the pattern in `MobilePoActions` but is reusable across
 * modules (supplier-returns, stock-counts, material-sales, …).
 *
 * Each action specifies:
 *  - `label`      — button text
 *  - `icon`       — lucide icon
 *  - `method`     — HTTP method ("PATCH" | "POST")
 *  - `endpoint`   — full API path (e.g. `/api/supplier-returns/${id}`)
 *  - `body`       — request body (JSON)
 *  - `successMsg` — toast message on success
 *  - `variant`    — "primary" | "outline" | "danger"
 *  - `confirm`    — optional confirmation prompt text
 */

export interface MobileAction {
  label: string;
  icon: LucideIcon;
  method?: "PATCH" | "POST";
  endpoint: string;
  body?: Record<string, unknown>;
  successMsg: string;
  variant?: "primary" | "outline" | "danger";
  confirm?: string;
}

/**
 * Link-style action (navigates instead of calling an API).
 * Used for print buttons etc.
 */
export interface MobileActionLink {
  label: string;
  icon: LucideIcon;
  href: string;
  variant?: "primary" | "outline" | "danger";
}

export function MobileDetailActions({
  actions = [],
  links = [],
}: {
  actions?: MobileAction[];
  links?: MobileActionLink[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  if (actions.length === 0 && links.length === 0) return null;

  async function act(action: MobileAction, index: number) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    haptic(10);
    setBusy(index);
    try {
      const res = await fetch(action.endpoint, {
        method: action.method ?? "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed: ${res.status}`);
      toast.success(action.successMsg);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 px-4 pb-6 pt-3">
      {actions.map((a, i) => (
        <ActionButton
          key={i}
          onClick={() => act(a, i)}
          busy={busy === i}
          icon={a.icon}
          label={a.label}
          variant={a.variant ?? "primary"}
        />
      ))}
      {links.map((l, i) => (
        <LinkButton
          key={`link-${i}`}
          href={l.href}
          icon={l.icon}
          label={l.label}
          variant={l.variant ?? "outline"}
        />
      ))}
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  icon: Icon,
  label,
  variant,
}: {
  onClick: () => void;
  busy: boolean;
  icon: LucideIcon;
  label: string;
  variant: "primary" | "outline" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors active:scale-[0.99] disabled:opacity-60",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-raised"
          : variant === "danger"
            ? "border border-danger/30 bg-danger/5 text-danger"
            : "border border-border bg-card text-foreground",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

function LinkButton({
  href,
  icon: Icon,
  label,
  variant,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  variant: "primary" | "outline" | "danger";
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors active:scale-[0.99]",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-raised"
          : variant === "danger"
            ? "border border-danger/30 bg-danger/5 text-danger"
            : "border border-border bg-card text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}

/**
 * Convenience wrapper: render children only when `show` is true.
 * Useful for conditionally including a linked-entity row.
 */
export function MobileConditionalLink({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  if (!show) return null;
  return <>{children}</>;
}
