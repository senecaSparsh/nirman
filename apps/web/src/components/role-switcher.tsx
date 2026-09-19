"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Check, ChevronDown, Loader2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Header role switcher — multi-role "one hat at a time" model.
 *
 * Shows the hat the user currently wears (membership.activeRole ?? role)
 * and lets them switch to any other role in their held set
 * ({ primary } ∪ secondaryRoles). Hidden when the user holds exactly one
 * role — the common case.
 *
 * Mirrors the CompanySwitcher pattern: optimistic label + checkmark on
 * click, POST to the switch endpoint, then router.refresh() + SWR
 * revalidation so every permission-gated surface re-renders under the
 * new hat. A "nirman-role-switched" event is dispatched for other shells
 * (mobile) listening for it.
 */
export function RoleSwitcher({
  roles,
  activeRole,
  roleLabels,
}: {
  /** All hats the member holds (primary + secondary). */
  roles: string[];
  /** The hat currently worn (server-resolved). */
  activeRole: string;
  /** Display label per held role key. */
  roleLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  // Optimistic selection — the label and checkmark move instantly on
  // click; cleared when the server round-trip (router.refresh) delivers
  // the new activeRole or when the switch fails.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Clear the optimistic selection once the server payload catches up.
  useEffect(() => {
    if (optimistic && optimistic === activeRole) setOptimistic(null);
  }, [optimistic, activeRole]);

  const current = optimistic ?? activeRole;

  // Single-hat users get no switcher — nothing to switch to.
  if (roles.length < 2) return null;

  async function switchTo(role: string) {
    setOpen(false);
    if (role === current || switching) return;
    const previous = current;
    setOptimistic(role);
    setSwitching(role);
    try {
      const res = await fetch("/api/me/active-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to switch role");
      // Let other shells (mobile) react instantly, then revalidate.
      window.dispatchEvent(
        new CustomEvent("nirman-role-switched", { detail: { role, label: roleLabels[role] ?? role } }),
      );
      await mutate("/api/me");
      router.refresh();
      toast.success(`Now acting as ${roleLabels[role] ?? role}`);
    } catch (err) {
      setOptimistic(previous);
      toast.error(err instanceof Error ? err.message : "Failed to switch role");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div ref={ref} className="relative flex items-stretch">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching !== null}
        className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-caption text-foreground transition-colors hover:border-foreground/20 hover:bg-muted/40 disabled:opacity-60"
        title="Switch role"
        aria-label="Switch role"
      >
        {switching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="max-w-[110px] truncate">{roleLabels[current] ?? current}</span>
        <ChevronDown
          className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-card p-1 shadow-xl">
          <div className="px-2.5 py-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
            Act as
          </div>
          <div className="max-h-72 overflow-y-auto">
            {roles.map((r) => (
              <button
                key={r}
                onClick={() => switchTo(r)}
                disabled={switching !== null}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body transition-colors hover:bg-muted disabled:opacity-50",
                  r === current && "bg-muted/50",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {roleLabels[r] ?? r}
                </span>
                {r === current && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                {switching === r && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
