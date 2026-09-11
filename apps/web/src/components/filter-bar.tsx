"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * FILTER BAR — a horizontal row of filters + search + clear button.
 *
 * Replaces the ~20 inline filter rows that each re-implement: search
 * input + status dropdown + date range + clear button. The bar is
 * responsive: filters wrap on narrow viewports, and the clear button
 * only appears when at least one filter is active.
 *
 * Usage:
 *   <FilterBar
 *     search={<SearchInput value={q} onChange={setQ} placeholder="Search..." />}
 *     filters={[
 *       { label: "Status", options: [{value: "", label: "All"}, {value: "DRAFT", label: "Draft"}], value: status, onChange: setStatus },
 *     ]}
 *     onClear={() => { setQ(""); setStatus(""); }}
 *   />
 */
export function FilterBar({
  search,
  filters,
  onClear,
  className,
  hasActiveFilters,
}: {
  /** A SearchInput or any search control. */
  search?: React.ReactNode;
  /** Array of filter dropdowns. */
  filters?: {
    label?: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    /** Render as a plain text input instead of a select. */
    type?: "select" | "text" | "date";
  }[];
  /** Clear-all handler. Button only shows if hasActiveFilters is true. */
  onClear?: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {search && <div className="min-w-[180px] flex-1">{search}</div>}
      {filters?.map((f, i) => (
        <div key={i} className="min-w-[130px]">
          {f.type === "text" ? (
            <input
              type="text"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.label}
              className={cn(
                "h-11 w-full rounded-md border border-input bg-card px-3 text-[14px] text-foreground",
                "transition-[border-color,box-shadow] duration-100",
                "placeholder:text-faint hover:border-border-strong",
                "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
                "sm:h-8 sm:px-2.5 sm:text-[13px]",
              )}
            />
          ) : f.type === "date" ? (
            <input
              type="date"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className={cn(
                "h-11 w-full rounded-md border border-input bg-card px-3 text-[14px] text-foreground tnum",
                "transition-[border-color,box-shadow] duration-100",
                "hover:border-border-strong",
                "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
                "sm:h-8 sm:px-2.5 sm:text-[13px]",
              )}
            />
          ) : (
            <Select value={f.value} onChange={(e) => f.onChange(e.target.value)}>
              {f.label && <option value="">{f.label}</option>}
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      ))}
      {onClear && hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
