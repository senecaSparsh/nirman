import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════
 * PIPELINE STEPPER — a compact "you are here" strip for transactional
 * pages.
 *
 * The Build lifecycle is a pipeline: Indent → Quote → PO → GRN → Issue.
 * A user opening any of those records should see their place in the
 * flow at a glance, without reading status text. This component draws
 * that as a single row of dots connected by a line — filled for done,
 * ringed for current, hollow for pending. ~28px tall, no labels unless
 * space allows.
 *
 * It is deliberately tiny. The status pill already carries the text;
 * this carries the *position*. Together they answer "what stage and
 * how far along" in one glance.
 * ═══════════════════════════════════════════════════════════════════
 */

export type PipelineStep = {
  label: string;
  /** "done" = filled, "current" = ringed accent, "pending" = hollow, "skipped" = dashed. */
  state: "done" | "current" | "pending" | "skipped";
  /** Optional href — makes the step clickable (e.g. jump to the linked requisition). */
  href?: string;
};

export function PipelineStepper({
  steps,
  className,
}: {
  steps: PipelineStep[];
  className?: string;
}) {
  if (steps.length === 0) return null;

  return (
    <nav
      aria-label="Pipeline position"
      className={cn("flex items-center gap-0", className)}
    >
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const nextDone = !isLast && steps[i + 1]?.state === "done";
        const lineDone = step.state === "done";

        const dot = (
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
              step.state === "done" && "border-foreground bg-foreground",
              step.state === "current" && "border-brand bg-brand",
              step.state === "pending" && "border-border-strong bg-transparent",
              step.state === "skipped" && "border-dashed border-border-strong bg-transparent",
            )}
          >
            {step.state === "done" && (
              <span className="size-1.5 rounded-full bg-background" />
            )}
            {step.state === "current" && (
              <span className="size-1.5 rounded-full bg-brand-foreground" />
            )}
          </span>
        );

        return (
          <div key={i} className="flex items-center">
            {step.href && step.state !== "pending" ? (
              <a href={step.href} className="group flex items-center gap-1.5" title={step.label}>
                {dot}
                <span
                  className={cn(
                    "whitespace-nowrap text-caption font-medium",
                    step.state === "current" ? "text-foreground" : "text-muted-foreground",
                    "group-hover:text-foreground",
                  )}
                >
                  {step.label}
                </span>
              </a>
            ) : (
              <div className="flex items-center gap-1.5">
                {dot}
                <span
                  className={cn(
                    "whitespace-nowrap text-caption font-medium",
                    step.state === "current" ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
            )}
            {!isLast && (
              <span
                className={cn(
                  "mx-1 h-px w-4 shrink-0 sm:w-6",
                  lineDone ? "bg-foreground" : nextDone ? "bg-foreground/50" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
