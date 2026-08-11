import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * TABLE — where most of this app's work actually happens, so it gets
 * the most attention.
 *
 * Decisions:
 *  · The header sticks, and it's opaque with a bottom rule that reads
 *    as a fixed edge. Site data is long; a header that scrolls away
 *    turns every column into a guess.
 *  · Rows are 36px, hairline-separated, not zebra-striped. Stripes
 *    fight with the status tints that live in these rows.
 *  · Row hover is a full-row tint plus an `opacity-0 group-hover` slot
 *    for per-row actions, so the actions column isn't a permanent wall
 *    of grey icons.
 *  · Numeric cells get `TDNum` — right-aligned tabular mono — so
 *    columns of money align on the decimal and don't jitter on change.
 *  · The horizontal scroll container fades its right edge when there's
 *    more table off-screen, which is the only honest way to tell
 *    someone a wide table continues.
 */

export function Table({
  className,
  containerClassName,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string }) {
  return (
    <div className={cn("relative w-full overflow-auto scrollbar-thin", containerClassName)}>
      <table
        className={cn("w-full caption-bottom border-collapse text-body", className)}
        {...props}
      />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 bg-subtle backdrop-blur-sm",
        "[&_tr]:border-b [&_tr]:border-border-strong [&_tr]:hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

/**
 * `TFoot` — the totals row. Sticks to the bottom so a running total is
 * visible while you scroll a 400-line issue slip.
 */
export function TFoot({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={cn(
        "sticky bottom-0 z-10 bg-subtle font-semibold",
        "[&_tr]:border-t [&_tr]:border-border-strong [&_tr]:hover:bg-transparent [&_td]:py-2",
        className,
      )}
      {...props}
    />
  );
}

export function TR({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        "group border-b border-border transition-colors last:border-0",
        selected ? "bg-brand-soft/60" : "hover:bg-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-9 whitespace-nowrap px-3 text-left align-middle text-label text-muted-foreground",
        "[&:not([align])]:text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle text-body", className)} {...props} />;
}

/**
 * Numeric cell — right-aligned, tabular monospace. Use for every
 * quantity, rate, amount and count so columns read as columns.
 */
export function TDNum({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-3 py-2.5 text-right align-middle text-body tnum", className)} {...props} />
  );
}

/** Numeric header — pairs with TDNum. */
export function THNum({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-9 whitespace-nowrap px-3 text-right align-middle text-label text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The primary cell in a row — the name/number you'd read to identify
 * the record. Slightly heavier so the eye can run down one column and
 * find its row rather than reading the whole grid.
 */
export function TDPrimary({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-3 py-2.5 align-middle text-body font-medium text-foreground", className)}
      {...props}
    />
  );
}

/**
 * A cell for per-row actions. Hidden until the row is hovered or
 * keyboard-focused, so 40 rows don't render 120 grey icons.
 */
export function TDActions({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "w-px whitespace-nowrap px-3 py-1.5 text-right align-middle",
        "[&>*]:opacity-0 [&>*]:transition-opacity",
        "group-hover:[&>*]:opacity-100 group-focus-within:[&>*]:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A full-width row for "nothing here" inside an existing table, so the
 * header stays put and the column layout doesn't collapse.
 */
export function TREmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-14 text-center text-meta text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
