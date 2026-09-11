"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { signOut as authSignOut } from "@/lib/auth-client";

/**
 * Mobile sign-out button — client component.
 *
 * Calls Better-Auth's signOut() (which POSTs to /api/auth/sign-out with
 * JSON), awaits the cookie clearance, then hard-redirects to /sign-in.
 * The hard redirect (window.location) is intentional: it drops all
 * in-memory React state and cached fetch data so no stale data leaks
 * across the session boundary.
 */
export function MobileSignOutButton({
  label = "Sign out",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await authSignOut();
    } catch {
      // Even if the server call fails, clear the client and redirect.
    }
    // Hard redirect — drops all client state/cache, ensures a clean session.
    window.location.href = "/sign-in";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className={
        className ??
        "w-full flex items-center justify-center gap-2 rounded-[0.625rem] border-2 p-2.5 text-m-section font-semibold text-m-body press disabled:opacity-50"
      }
      style={
        className
          ? undefined
          : {
              borderColor: "var(--color-stop)",
              color: "var(--color-stop)",
              backgroundColor: "var(--color-paper)",
            }
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      {label}
    </button>
  );
}
