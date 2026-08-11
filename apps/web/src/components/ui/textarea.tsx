import * as React from "react";
import { cn } from "@/lib/utils";

/** Matches Input's border/focus treatment exactly — see input.tsx. */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-20 w-full resize-y rounded-md border border-input bg-card px-2.5 py-2 text-body leading-relaxed",
      "transition-[border-color,box-shadow] duration-100",
      "placeholder:text-faint",
      "hover:border-border-strong",
      "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
      "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
      "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
