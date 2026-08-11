"use client";

import { useRouter } from "next/navigation";
import { Search, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Interactive mobile primitives — search, filter chips, refresh.
 * These need "use client" because they use hooks (useRouter) or
 * event handlers (onChange, onClick). The rest of the mobile
 * primitives live in mobile-primitives.tsx as shared/Server
 * Components so they can receive icon components from Server
 * Components without serialization errors.
 */

/**
 * Search bar with a magnifier icon and clear button. Controlled
 * component — parent owns the `value` and `onChange`.
 *
 * 44px tall and 16px text: anything smaller and iOS zooms the viewport
 * on focus, which throws the whole layout out and is the single most
 * common "the app is broken" report from a phone.
 */
export function MobileSearchBar({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="bg-background px-4 py-2.5">
      <div className="flex h-11 items-center gap-2.5 rounded-lg border border-input bg-card px-3 focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20">
        <Search className="size-4 shrink-0 text-faint" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Horizontally scrollable filter chips. `chips` is an array of
 * { label, value } pairs — the first chip should be the "All"
 * option. The parent owns `active` and `onChange`.
 *
 * Chips carry an optional count, because "Pending" is a filter but
 * "Pending 7" is also the answer to why you opened the screen.
 */
export function MobileFilterChips<T extends string>({
  chips,
  active,
  onChange,
}: {
  chips: { label: string; value: T; count?: number }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto bg-background px-4 pb-2.5 scrollbar-none">
      {chips.map((chip) => {
        const isActive = chip.value === active;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(chip.value)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-card text-muted-foreground active:bg-muted",
            )}
          >
            {chip.label}
            {chip.count !== undefined && chip.count > 0 && (
              <span
                className={cn(
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums leading-none",
                  isActive ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {chip.count > 99 ? "99+" : chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Refresh button for the page header `right` slot. Calls
 * `router.refresh()` which re-fetches server component data
 * without a full page reload — the Next.js equivalent of
 * pull-to-refresh.
 */
export function MobileRefreshButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
      aria-label="Refresh"
    >
      <RotateCw className="size-[18px]" />
    </button>
  );
}
