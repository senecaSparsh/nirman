import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * BUTTON — the hierarchy is the design.
 *
 *   default      ink. THE primary action. One per screen.
 *   brand        ochre. Reserved for the single "start here" moment on
 *                an otherwise empty screen — never beside a default.
 *   outline      the common secondary. Safe, reversible actions.
 *   ghost        tertiary / icon actions inside dense rows.
 *   destructive  irreversible. Always paired with a confirm step.
 *
 * If a screen has two `default` buttons then it has no primary action,
 * and the user is left making a decision we should have made for them.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-all disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.985]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-raised hover:bg-primary/90",
        brand: "bg-brand text-brand-foreground shadow-raised hover:bg-brand/90",
        destructive: "bg-danger text-white shadow-raised hover:bg-danger/90",
        outline: "border border-input bg-card shadow-raised hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-muted text-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-brand underline-offset-4 hover:underline",
        success: "bg-success text-white shadow-raised hover:bg-success/90",
      },
      size: {
        default: "h-9 px-3.5 text-[13px]",
        sm: "h-8 rounded-md px-3 text-meta",
        xs: "h-7 rounded-md px-2 text-caption",
        lg: "h-10 rounded-md px-5 text-[13px]",
        // `touch` is the field size — 44px, thumb-reachable, gloves on.
        touch: "h-11 rounded-md px-4 text-[14px]",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-touch": "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<Record<string, unknown>>;
      return React.cloneElement(child, {
        ref,
        className: cn(buttonVariants({ variant, size }), className, child.props.className as string | undefined),
        ...props,
      });
    }
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
