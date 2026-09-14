"use client";

import { LogOut, Loader2 } from "lucide-react";
import { useSignOut } from "@/lib/use-sign-out";

/**
 * Mobile sign-out button — client component.
 *
 * Runs the shared sign-out flow (useSignOut): warns if the offline queue
 * has unsynced items, wipes local caches/queue/drafts, then ends the
 * session and hard-redirects to /sign-in. The hard redirect is intentional:
 * it drops all in-memory React state so nothing leaks across the session
 * boundary.
 */
export function MobileSignOutButton({
  label = "Sign out",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const { handleSignOut, signingOut, dialog } = useSignOut();

  return (
    <>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
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
        {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
        {label}
      </button>
      {dialog}
    </>
  );
}
