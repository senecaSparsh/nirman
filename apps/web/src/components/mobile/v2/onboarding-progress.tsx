"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { haptic } from "@/lib/haptic";
import {
  buildOnboardingSteps,
  type OnboardingStep,
} from "@/lib/onboarding-steps";

// Re-export for backwards compatibility — existing imports use
// `from "@/components/mobile/v2/onboarding-progress"`.
export { buildOnboardingSteps, type OnboardingStep };

/* ═══════════════════════════════════════════════════════════════════════════
   OnboardingProgress — shared onboarding checklist + progress bar.

   Used by:
     · /m/me              (read-only, employee viewing their own progress)
     · /m/hr/onboarding   (queue page, clickable cards)
     · /m/hr/employees/[id] (HR onboarding tab, with complete button)

   Props:
     steps            — the canonical 11/12 step list
     completedCount   — number of done steps
     isComplete       — all steps done
     canManage        — HR_MANAGE or OWNER: shows the "Complete Onboarding" button
     employeeId       — for the complete-onboarding API call
     onboardingComplete — the DB flag (onboardingComplete === true)
     href             — where the progress bar links to (onboarding detail page)
     showCompleteButton — whether to show the button at all (false on /m/me)
   ═══════════════════════════════════════════════════════════════════════════ */

export function OnboardingProgress({
  steps,
  completedCount,
  isComplete,
  canManage = false,
  employeeId,
  onboardingComplete = false,
  href,
  showCompleteButton = true,
  compact = false,
  bare = false,
}: {
  steps: OnboardingStep[];
  completedCount: number;
  isComplete: boolean;
  canManage?: boolean;
  employeeId?: string;
  onboardingComplete?: boolean;
  /** Where the progress bar navigates when tapped. If null, not clickable. */
  href?: string;
  /** Whether to show the "Complete Onboarding" button. False on /m/me. */
  showCompleteButton?: boolean;
  /** Compact mode — hides the step labels grid (for queue cards). */
  compact?: boolean;
  /** Bare mode — renders without card border + "Onboarding" header. */
  bare?: boolean;
}) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const pct = Math.round((completedCount / steps.length) * 100);

  async function completeOnboarding() {
    if (!employeeId) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/complete-onboarding`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Onboarding complete");
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCompleting(false);
    }
  }

  const progressContent = (
    <>
      {!bare && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
            Onboarding
          </p>
          <span
            className="text-m-label font-bold tabular-nums"
            style={{ color: isComplete ? "var(--color-go)" : "var(--color-ink-500)" }}
          >
            {completedCount}/{steps.length}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden mb-2.5"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: isComplete ? "var(--color-go)" : "var(--color-ink-950)",
            transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>

      {/* Steps — compact 2-col grid (hidden in compact mode) */}
      {!compact && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {step.done ? (
                <CheckCircle2 className="size-3 shrink-0" style={{ color: "var(--color-go)" }} />
              ) : (
                <Circle className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />
              )}
              <span
                className="text-m-caption truncate"
                style={{ color: step.done ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Compact step dots (for queue cards) */}
      {compact && (
        <div className="flex items-center gap-1">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-0.5" title={step.label}>
              {step.done ? (
                <CheckCircle2 className="size-3" style={{ color: "var(--color-go)" }} />
              ) : (
                <Circle className="size-3" style={{ color: "var(--color-ink-300)" }} />
              )}
              {i < steps.length - 1 && (
                <div className="w-2 h-px" style={{ backgroundColor: "var(--color-line)" }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Already complete badge */}
      {isComplete && onboardingComplete && (
        <div
          className="flex items-center gap-1.5 rounded-[0.375rem] px-2 py-1.5 mt-2 text-m-caption"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)", color: "var(--color-go)" }}
        >
          <CheckCircle2 className="size-3.5" />
          <span className="font-semibold">Onboarding complete</span>
        </div>
      )}

      {/* Complete Onboarding button — gated by canManage (HR_MANAGE or OWNER) */}
      {showCompleteButton && canManage && employeeId && !onboardingComplete && (
        <button
          onClick={completeOnboarding}
          disabled={completing}
          className="w-full rounded-[0.5rem] p-2.5 text-m-label font-semibold flex items-center justify-center gap-2 press disabled:opacity-50 mt-2"
          style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
        >
          {completing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {completing ? "Completing…" : "Complete Onboarding"}
        </button>
      )}
    </>
  );

  // ── If href is provided, wrap the progress bar in a link ──
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-[0.75rem] border p-3 press"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {progressContent}
        <div className="flex items-center justify-center mt-2">
          <ChevronRight className="size-3.5" style={{ color: "var(--color-ink-400)" }} />
        </div>
      </Link>
    );
  }

  if (bare) {
    return <>{progressContent}</>;
  }

  return (
    <div
      className="rounded-[0.75rem] border p-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {progressContent}
    </div>
  );
}

