"use client";

import { useState } from "react";
import { Milestone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * MobileCheckMilestonesButton — renders a "Check Milestones" button in
 * the project detail hero card. Calls POST /api/milestone-payments/check
 * to scan linked payment-schedule items and surface any newly-due
 * milestone payments. Mirrors the desktop ProjectDetailActions behavior.
 */
export function MobileCheckMilestonesButton({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);

  async function checkMilestones() {
    setBusy(true);
    try {
      const res = await fetch(`/api/milestone-payments/check?projectId=${projectId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to check milestones");
      haptic(10);
      if (data.newlyDue > 0) {
        toast.success(`${data.newlyDue} milestone payment${data.newlyDue === 1 ? "" : "s"} now due`, {
          description: `Checked ${data.checked} linked payment schedule items.`,
        });
      } else {
        toast.info(`No new milestone payments due`, {
          description: `Checked ${data.checked} linked payment schedule items — all still pending.`,
        });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to check milestones");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={checkMilestones}
      disabled={busy}
      className="flex items-center gap-1.5 h-8 px-3 rounded-[0.5rem] border-2 text-m-body font-bold press"
      style={{
        borderColor: "color-mix(in srgb, var(--color-steel) 30%, var(--color-line))",
        color: "var(--color-steel)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Milestone className="size-3.5" />}
      Check Milestones
    </button>
  );
}
