import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * CARD — a container for data, not a decorative panel.
 *
 * One structural border, one whisper of elevation. The header is
 * separated from the body by a hairline rule rather than by whitespace
 * alone, because in a dense app the eye needs a hard edge to know where
 * a block's chrome ends and its data begins.
 *
 * `variant`:
 *   default   the standard object on the page background
 *   flush     no elevation — for cards inside another container
 *   inset     sunken; for read-only detail wells inside a form
 */
export function Card({
  className,
  variant = "default",
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "flush" | "inset";
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border text-card-foreground",
        variant === "default" && "border-border bg-card shadow-raised",
        variant === "flush" && "border-border bg-card",
        variant === "inset" && "border-border bg-subtle",
        interactive && "card-interactive cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `divided` draws the hairline under the header. Opt in rather than
 * default, so a card whose header is purely a caption for one big
 * number doesn't get a rule it doesn't need.
 */
export function CardHeader({
  className,
  divided,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { divided?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 px-4 py-3",
        divided && "border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

/** The header's title row — title on the left, actions pinned right. */
export function CardToolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-section text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-meta text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-3.5", className)} {...props} />;
}

export function CardFooter({
  className,
  divided = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { divided?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-3",
        divided && "border-t border-border bg-subtle/60",
        className,
      )}
      {...props}
    />
  );
}
