import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * BADGE — a piece of state, rendered small.
 *
 * Badges use the *soft* + *border* semantic token pairs rather than an
 * alpha overlay, so they stay legible on any surface (card, subtle
 * well, hover row, dark mode) instead of shifting with whatever is
 * behind them.
 *
 * The tinted 1px border is what makes a badge read as a *tag* rather
 * than as coloured text with a smudge behind it — v1 had border-
 * transparent everywhere, which is why the chips looked unfinished.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium",
    "transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "border-border-strong bg-muted text-foreground",
        brand: "border-brand-border bg-brand-soft text-brand-strong",
        success: "border-success-border bg-success-soft text-success",
        warning: "border-warning-border bg-warning-soft text-warning",
        danger: "border-danger-border bg-danger-soft text-danger",
        info: "border-info-border bg-info-soft text-info",
        outline: "border-border-strong bg-transparent text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        /** For counts on nav/tabs — solid, high-contrast, unmissable. */
        solid: "border-transparent bg-primary text-primary-foreground",
      },
      size: {
        default: "h-5 px-2 text-[11px] leading-none",
        sm: "h-[18px] px-1.5 text-[10px] leading-none",
        lg: "h-6 px-2.5 text-[12px] leading-none",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * Prefixes a 5px filled dot in the badge's own colour. Use for
   * lifecycle states (Draft / Approved / Received) where the dot gives
   * a second, pre-attentive channel beyond the tint — the difference
   * between "amber-ish" and "green-ish" is not reliable for the ~8% of
   * male users with a colour-vision deficiency, but position + dot is.
   */
  dot?: boolean;
}

export function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && <span className="size-[5px] shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/**
 * A bare count — no tint, no border. For nav items and tab strips where
 * a full badge would out-shout the label it belongs to.
 */
export function CountChip({
  count,
  className,
  tone = "muted",
}: {
  count: number;
  className?: string;
  tone?: "muted" | "brand" | "danger";
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
        "text-[10px] font-semibold tabular-nums leading-none",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "brand" && "bg-brand-soft text-brand-strong",
        tone === "danger" && "bg-danger text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
