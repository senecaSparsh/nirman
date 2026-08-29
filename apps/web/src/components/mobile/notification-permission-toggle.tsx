"use client";

import { useState } from "react";
import { Bell, BellOff, Loader2, CheckCircle2 } from "lucide-react";
import { usePushNotifications } from "@/lib/use-push-notifications";
import { haptic } from "@/lib/haptic";
import { toast } from "sonner";

/**
 * NotificationPermissionToggle — a compact button that lets the user
 * enable/disable push notifications. Shows the current permission state
 * and provides a clear CTA.
 *
 * Usage:
 *   <NotificationPermissionToggle />
 *   // Place in settings or profile page
 */
export function NotificationPermissionToggle() {
  const { permission, subscribed, loading, requestPermission, unsubscribe } = usePushNotifications();

  if (permission === "unsupported") {
    return (
      <div className="flex items-center gap-2 rounded-[0.5rem] border border-border bg-muted/20 px-3 py-2.5 text-caption text-muted-foreground">
        <BellOff className="size-3.5" />
        <span>Push notifications not supported on this device</span>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex items-center gap-2 rounded-[0.5rem] border border-border bg-muted/20 px-3 py-2.5 text-caption text-muted-foreground">
        <BellOff className="size-3.5" />
        <div>
          <div className="font-medium text-foreground">Notifications blocked</div>
          <div className="text-caption">Enable notifications in your browser settings to receive alerts.</div>
        </div>
      </div>
    );
  }

  if (permission === "granted" && subscribed) {
    return (
      <div className="flex items-center justify-between rounded-[0.5rem] border border-border bg-muted/20 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-success" />
          <div>
            <div className="text-caption font-medium text-foreground">Notifications enabled</div>
            <div className="text-caption text-muted-foreground">You&apos;ll receive push alerts for approvals, low stock, and tasks.</div>
          </div>
        </div>
        <button
          onClick={() => {
            haptic(10);
            unsubscribe();
            toast.success("Notifications disabled");
          }}
          className="rounded-md border border-border px-2 py-1 text-caption font-medium hover:bg-muted/20"
        >
          Disable
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        haptic(10);
        requestPermission();
      }}
      disabled={loading}
      className="flex w-full items-center gap-2 rounded-[0.5rem] border-2 border-signal/30 bg-signal/5 px-3 py-2.5 text-caption font-semibold press disabled:opacity-50"
      style={{ borderColor: "color-mix(in srgb, var(--color-signal) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--color-signal) 5%, transparent)" }}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" style={{ color: "var(--color-signal)" }} />}
      <span style={{ color: "var(--color-signal)" }}>Enable push notifications</span>
    </button>
  );
}
