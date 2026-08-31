"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface HsnSacResult {
  code: string;
  description: string;
  gstRate: number;
  cessRate?: number;
  type: "HSN" | "SAC";
  hierarchy?: string[];
}

interface HsnSacSearchProps {
  value: string;
  onCodeChange: (code: string) => void;
  onGstRateChange?: (gstRate: number) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
}

/**
 * HSN/SAC code search input with autocomplete dropdown.
 * Searches the /api/hsn-sac/search endpoint as the user types.
 * When a result is selected, calls onCodeChange with the code
 * and onGstRateChange with the GST rate (if provided).
 */
export function HsnSacSearch({
  value,
  onCodeChange,
  onGstRateChange,
  placeholder = "Search HSN/SAC code…",
  className,
  inputClassName,
  inputStyle,
}: HsnSacSearchProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<HsnSacResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/hsn-sac/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setOpen(true);
          setHighlighted(-1);
        }
      } catch {
        // Silent fail — user can still type manually
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  function selectResult(r: HsnSacResult) {
    onCodeChange(r.code);
    if (onGstRateChange) onGstRateChange(r.gstRate);
    setQuery(r.code);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      const r = results[highlighted];
      if (r) selectResult(r);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onCodeChange(e.target.value);
          search(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
        style={inputStyle}
      />
      {open && (loading || results.length > 0) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
          {results.map((r, i) => (
            <button
              key={`${r.code}-${i}`}
              type="button"
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent",
                i === highlighted && "bg-accent"
              )}
              onClick={() => selectResult(r)}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.code}</div>
                <div className="truncate text-xs text-muted-foreground">{r.description}</div>
              </div>
              <div className="ml-2 flex shrink-0 items-center gap-1.5">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
                  {r.gstRate}%
                </span>
                <span className="text-xs text-muted-foreground">{r.type}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
