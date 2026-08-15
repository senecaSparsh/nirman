"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Triggers DPR variance analysis via POST /api/dprs/[id]/variance.
 * Only shown when the DPR has a workType (required for standard consumption
 * comparison) and the user has DPR_SUBMIT permission.
 *
 * If varianceAnalysis is already present, shows a "Re-run" button instead.
 */
export function MobileDprVarianceButton({
  dprId,
  hasWorkType,
  hasVariance,
  canRun,
}: {
  dprId: string;
  hasWorkType: boolean;
  hasVariance: boolean;
  canRun: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!canRun || !hasWorkType) return null;

  async function runVariance() {
    haptic(10);
    setBusy(true);
    try {
      const res = await fetch(`/api/dprs/${dprId}/variance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoGenerateScrap: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to run variance analysis");

      const overCount = data.variances?.filter((v: { isOverConsumption: boolean }) => v.isOverConsumption).length ?? 0;
      if (overCount > 0) {
        toast.warning(`Variance detected`, {
          description: `${overCount} material(s) over-consumed vs standard`,
        });
      } else {
        toast.success("No variance detected", {
          description: "All materials within standard consumption",
        });
      }
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Variance analysis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={runVariance}
      disabled={busy}
      className="w-full flex items-center justify-center gap-2 h-10 rounded-[0.625rem] border-2 font-bold text-[0.75rem] press active:scale-95 disabled:opacity-50 mb-4"
      style={{
        borderColor: hasVariance ? "var(--color-signal)" : "var(--color-line)",
        color: hasVariance ? "var(--color-signal-dark)" : "var(--color-ink-700)",
        backgroundColor: hasVariance ? "color-mix(in srgb, var(--color-signal) 6%, transparent)" : "var(--color-paper)",
      }}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : hasVariance ? (
        <AlertTriangle className="size-4" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {hasVariance ? "Re-run Variance Analysis" : "Run Variance Analysis"}
    </button>
  );
}
