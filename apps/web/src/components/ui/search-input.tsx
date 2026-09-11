"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/lib/use-debounce";

/**
 * SEARCH INPUT — a debounced search box with icon and clear button.
 *
 * Replaces the 33+ inline `<Input placeholder="Search..." />` +
 * `useDebounce` + filter logic patterns. The debounce is built in:
 * `onChange` fires after the debounce delay, not on every keystroke.
 *
 * Usage:
 *   <SearchInput value={query} onChange={setQuery} placeholder="Search POs..." />
 *   <SearchInput value={query} onChange={setQuery} debounceMs={500} />
 */
export const SearchInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
    value: string;
    onChange: (value: string) => void;
    /** Debounce delay in ms. Default 300. */
    debounceMs?: number;
  }
>(({ value, onChange, debounceMs = 300, className, placeholder = "Search...", ...props }, ref) => {
  const [local, setLocal] = React.useState(value);
  const debounced = useDebounce(local, debounceMs);

  React.useEffect(() => {
    setLocal(value);
  }, [value]);

  React.useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
      <input
        ref={ref}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-md border border-input bg-card text-foreground",
          "transition-[border-color,box-shadow] duration-100",
          "placeholder:text-faint",
          "hover:border-border-strong",
          "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
          "h-11 pl-8 pr-8 text-[14px] sm:h-8 sm:pl-7 sm:pr-7 sm:text-[13px]",
          className,
        )}
        {...props}
      />
      {local && (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
});
SearchInput.displayName = "SearchInput";
