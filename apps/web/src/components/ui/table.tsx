import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * TABLE — where most of this app's work actually happens.
 *
 * Decisions:
 *  · The header sticks. Site data is long; a header that scrolls away
 *    turns every column into a guess.
 *  · Rows are 36px and hairline-separated, not zebra-striped. Stripes
 *    fight with the status colours that live in these rows.
 *  · Numeric cells get `num` — right-aligned tabular mono — so columns
 *    of money line up on the decimal and don't jitter when they change.
 */

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto scrollbar-thin">
      <table className={cn("w-full caption-bottom border-collapse text-body", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 bg-subtle [&_tr]:border-b [&_tr]:border-border",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-border/70 transition-colors hover:bg-subtle", className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-8 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground/80 [&:not([align])]:text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 align-middle text-body", className)} {...props} />;
}

/**
 * Numeric cell — right-aligned, tabular monospace. Use for every
 * quantity, rate, amount and count so columns are readable as columns.
 */
export function TDNum({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 text-right align-middle text-body tnum", className)} {...props} />;
}

/** Numeric header — pairs with TDNum. */
export function THNum({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-8 whitespace-nowrap px-3 text-right align-middle text-label text-muted-foreground/80",
        className,
      )}
      {...props}
    />
  );
}
