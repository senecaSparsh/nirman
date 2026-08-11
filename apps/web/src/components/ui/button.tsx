import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * BUTTON — the hierarchy is the design.
 *
 *   default      ink. THE primary action. One per screen.
 *   brand        amber. Reserved for the single "start here" moment on
 *                an otherwise empty screen — never beside a default.
 *   outline      the common secondary. Safe, reversible actions.
 *   secondary    a filled-quiet alternative to outline, for toolbars
 *                where a row of outlines would read as a fence.
 *   ghost        tertiary / icon actions inside dense rows.
 *   destructive  irreversible. Always paired with a confirm step.
 *
 * If a screen has two `default` buttons then it has no primary action,
 * and the user is left making a decision we should have made for them.
 *
 * Two deliberate changes from v1:
 *
 *  · No `active:scale()`. A button that shrinks when pressed reads as
 *    playful — fine for a consumer app, wrong for a system where the
 *    press books a journal entry. Press feedback is now a darkening
 *    plus the loss of the top highlight, which is how a physical key
 *    behaves.
 *  · Filled variants carry a 1px inner top highlight (`shadow-inset`).
 *    That single line is what separates a "real" control from a
 *    coloured rectangle.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md font-medium transition-[background-color,border-color,box-shadow,color] duration-100",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-raised shadow-inset hover:bg-primary/88 active:bg-primary/95 active:shadow-none",
        brand:
          "bg-brand text-brand-foreground shadow-raised shadow-inset hover:bg-brand-strong active:shadow-none",
        destructive:
          "bg-danger text-white shadow-raised shadow-inset hover:bg-danger/88 active:shadow-none",
        success:
          "bg-success text-white shadow-raised shadow-inset hover:bg-success/88 active:shadow-none",
        outline:
          "border border-input bg-card text-foreground shadow-raised hover:border-border-strong hover:bg-muted active:bg-accent active:shadow-none",
        secondary:
          "bg-muted text-foreground hover:bg-accent active:bg-border",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 text-[13px]",
        sm: "h-7 px-2.5 text-[12px]",
        xs: "h-6 rounded-sm px-2 text-[11px] [&_svg]:size-3",
        lg: "h-10 rounded-lg px-5 text-[14px]",
        // `touch` is the field size — 44px, thumb-reachable, gloves on.
        touch: "h-11 rounded-lg px-4 text-[14px]",
        icon: "size-8",
        "icon-sm": "size-7",
        "icon-xs": "size-6 rounded-sm [&_svg]:size-3",
        "icon-touch": "size-11 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Swaps the leading icon for a spinner and blocks input. The label
   * stays put — a button that changes width mid-submit makes the user
   * think they mis-clicked.
   */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<Record<string, unknown>>;
      return React.cloneElement(child, {
        ref,
        className: cn(
          buttonVariants({ variant, size }),
          className,
          child.props.className as string | undefined,
        ),
        ...props,
      });
    }
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

/**
 * A group of buttons that reads as one segmented control: shared edges,
 * no doubled borders. Use for view switches (List / Board / Calendar)
 * and density toggles — never for unrelated actions.
 */
export function ButtonGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-input bg-card p-0.5 shadow-raised",
        "[&>*]:rounded-sm [&>*]:border-0 [&>*]:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

export { buttonVariants };
