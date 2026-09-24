"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { haptic } from "@/lib/haptic";

/** Mark-everything-read button for the mobile notifications page. */
export function MobileNotificationsMarkAll() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    haptic(10);
    setBusy(true);
    try {
      const res = await fetch("/api/notifications/in-app", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      if (!res.ok) throw new Error("Failed to mark all read");
      toast.success("All notifications marked read");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={markAll}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-3 py-1.5 text-m-caption font-bold press disabled:opacity-50"
      style={{ color: "var(--color-brand)", backgroundColor: "color-mix(in srgb, var(--color-brand) 10%, transparent)" }}
    >
      <CheckCheck className="size-3.5" />
      {busy ? "…" : "Mark all read"}
    </button>
  );
}
