"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface HsnGstResult {
  hsnCode: string;
  description: string;
  gstRate: number;
  sacCode: string | null;
  category: string | null;
}

interface HsnSacSearchProps {
  value: string;
  onCodeChange: (code: string) => void;
  onGstRateChange?: (gstRate: number) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  /** Material name — when provided, the component auto-suggests an HSN code
   *  based on the material name + category. The user can still override. */
  materialName?: string;
  /** Category name — used with materialName for better HSN matching. */
  categoryName?: string;
}

/**
 * HSN/SAC code search input with autocomplete dropdown + smart auto-detection.
 *
 * Features:
 *   1. **Smart auto-detect**: Pass `materialName` + `categoryName` and the
 *      component will debounce-call `/api/hsn-gst?suggest=...` and auto-fill
 *      the best-matching HSN code + GST rate. This happens only when the HSN
 *      field is empty or was previously auto-filled (not manually overridden).
 *   2. **Search picker**: As the user types, a dropdown shows matching HSN/SAC
 *      codes from the DB-backed government master. The user can pick from the
 *      list or type a code manually.
 *   3. **GST auto-lookup**: When a code is entered (typed or picked), the GST
 *      rate is auto-looked-up from the master. The user can still override the
 *      GST rate in the parent form.
 *   4. **Always shows suggestions on focus**: Even before typing, the user
 *      sees the full list of HSN codes to pick from.
 */
export function HsnSacSearch({
  value,
  onCodeChange,
  onGstRateChange,
  placeholder = "Search or type HSN/SAC code…",
  className,
  inputClassName,
  inputStyle,
  materialName,
  categoryName,
}: HsnSacSearchProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<HsnGstResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [manuallySet, setManuallySet] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref to read current value inside async closures without stale captures
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);

  // Sync external value changes (but don't reset manual flag)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Reset manuallySet when materialName changes — a new material should
  // re-trigger auto-suggest even if the user previously overrode the HSN
  // for a different material.
  useEffect(() => {
    setManuallySet(false);
  }, [materialName]);

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

  // ── Smart auto-detect: suggest HSN from material name + category ──
  // Only auto-fills when the user hasn't manually set the HSN code.
  useEffect(() => {
    if (!materialName || materialName.trim().length < 3 || manuallySet) return;
    const controller = new AbortController();
    if (suggestRef.current) clearTimeout(suggestRef.current);
    suggestRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ suggest: materialName.trim() });
        if (categoryName) params.set("category", categoryName);
        const res = await fetch(`/api/hsn-gst?${params}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const top = data[0]!;
            // Read from ref to avoid stale closure — only auto-fill if
            // the user hasn't manually typed something in the meantime.
            if (!valueRef.current && !manuallySet) {
              onCodeChange(top.hsnCode);
              if (onGstRateChange) onGstRateChange(top.gstRate);
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // silent fail
      }
    }, 600);
    return () => {
      controller.abort();
      if (suggestRef.current) clearTimeout(suggestRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialName, categoryName, manuallySet]);

  // ── GST auto-lookup when HSN code changes (debounced) ──
  useEffect(() => {
    if (!value.trim() || value.trim().length < 4) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hsn-gst?hsn=${encodeURIComponent(value.trim())}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (onGstRateChange) onGstRateChange(data.gstRate);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // silent fail — user can set GST manually
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/hsn-gst?${params}`);
        if (res.ok) {
          const data = await res.json();
          const arr = Array.isArray(data) ? data : [];
          setResults(arr);
          setOpen(true);
          setHighlighted(-1);
        }
      } catch {
        // Silent fail — user can still type manually
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  // Show suggestions on focus
  function handleFocus() {
    setOpen(true);
    if (results.length === 0) {
      search(query);
    }
  }

  function selectResult(r: HsnGstResult) {
    setManuallySet(true);
    onCodeChange(r.hsnCode);
    if (onGstRateChange) onGstRateChange(r.gstRate);
    setQuery(r.hsnCode);
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
          setManuallySet(true);
          setQuery(e.target.value);
          onCodeChange(e.target.value);
          search(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
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
              key={`${r.hsnCode}-${i}`}
              type="button"
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent",
                i === highlighted && "bg-accent"
              )}
              onClick={() => selectResult(r)}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.hsnCode}</div>
                <div className="truncate text-xs text-muted-foreground">{r.description}</div>
              </div>
              <div className="ml-2 flex shrink-0 items-center gap-1.5">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
                  {r.gstRate}%
                </span>
                {r.category && (
                  <span className="text-xs text-muted-foreground">{r.category === "Services" ? "SAC" : "HSN"}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
