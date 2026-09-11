"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useTodayDateState } from "@/lib/use-today-date";

/**
 * DATE INPUT — a hydration-safe date picker that defaults to today.
 *
 * Replaces the 67+ inline `<Input type="date" />` +
 * `useTodayDateState()` patterns scattered across the app. The
 * hydration safety (empty string on SSR, real date after mount) is
 * built in so callers never need to think about it.
 *
 * Usage:
 *   <DateInput value={date} onChange={setDate} label="Issue Date" />
 *   <DateInput value={date} onChange={setDate} defaultToToday />
 */
export const DateInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "defaultValue"> & {
    value: string;
    onChange: (value: string) => void;
    /** If value is empty on mount, fill with today's date (hydration-safe). */
    defaultToToday?: boolean;
  }
>(({ value, onChange, defaultToToday, className, ...props }, ref) => {
  const [today] = useTodayDateState();
  const currentValue = defaultToToday && !value && today ? today : value;

  return (
    <input
      ref={ref}
      type="date"
      value={currentValue}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded-md border border-input bg-card text-foreground",
        "transition-[border-color,box-shadow] duration-100",
        "placeholder:text-faint tnum",
        "hover:border-border-strong",
        "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
        "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
        "h-11 px-3 text-[14px] sm:h-8 sm:px-2.5 sm:text-[13px]",
        className,
      )}
      {...props}
    />
  );
});
DateInput.displayName = "DateInput";
