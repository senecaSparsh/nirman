"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, Package } from "lucide-react";

/**
 * SearchableMaterialPicker — replaces the plain <Select> dropdown for
 * material selection on mobile forms. Provides a search-as-you-type
 * experience with a scrollable results list, optimized for touch.
 *
 * Usage:
 *   <SearchableMaterialPicker
 *     materials={materials}
 *     value={l.materialId}
 *     onChange={(id) => ...}
 *   />
 */
export function SearchableMaterialPicker({
  materials,
  value,
  onChange,
  placeholder = "Search material…",
}: {
  materials: { id: string; name: string; unit: string | null }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => materials.find((m) => m.id === value),
    [materials, value],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return materials.slice(0, 20);
    const q = query.toLowerCase();
    return materials
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [materials, query]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function selectMaterial(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center justify-between rounded-[0.375rem] border px-3 text-left text-m-body press transition-all"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink-950)",
        }}
      >
        {selected ? (
          <span className="truncate">
            {selected.name}
            {selected.unit && <span className="ml-1 text-m-caption" style={{ color: "var(--color-ink-500)" }}>({selected.unit})</span>}
          </span>
        ) : (
          <span style={{ color: "var(--color-ink-500)" }}>{placeholder}</span>
        )}
        <Search className="ml-2 size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div
        className="flex items-center gap-2 rounded-[0.375rem] border px-3"
        style={{ borderColor: "var(--color-ink-500)", backgroundColor: "var(--color-paper)" }}
      >
        <Search className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-9 flex-1 bg-transparent text-m-body outline-none"
          style={{ color: "var(--color-ink-950)" }}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="search"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="press"
            style={{ color: "var(--color-ink-500)" }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {filtered.length > 0 && (
        <div
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[0.375rem] border"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
            boxShadow: "0 4px 12px rgba(18, 17, 13, 0.12)",
          }}
        >
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectMaterial(m.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-m-body press transition-colors"
              style={{
                backgroundColor: m.id === value ? "color-mix(in srgb, var(--color-ink-500) 5%, transparent)" : "transparent",
                color: m.id === value ? "var(--color-ink-950)" : "var(--color-ink-700)",
              }}
            >
              <Package className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              <span className="truncate flex-1">{m.name}</span>
              {m.unit && (
                <span className="shrink-0 text-m-caption" style={{ color: "var(--color-ink-500)" }}>{m.unit}</span>
              )}
            </button>
          ))}
          {filtered.length === 20 && materials.length > 20 && (
            <div
              className="border-t px-3 py-1.5 text-center text-m-caption"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
            >
              {query ? `Showing first 20 matches` : `Showing first 20 of ${materials.length}`}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-[0.375rem] border px-3 py-4 text-center text-m-caption"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink-500)",
            boxShadow: "0 4px 12px rgba(18, 17, 13, 0.12)",
          }}
        >
          No materials found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
