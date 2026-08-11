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

  const selected = materials.find((m) => m.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return materials.slice(0, 20);
    const q = query.toLowerCase();
    return materials
      .filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [materials, query]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
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
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-body text-foreground hover:border-brand/50 active:scale-[0.99] transition-all"
      >
        {selected ? (
          <span className="truncate">
            {selected.name}
            {selected.unit && <span className="ml-1 text-caption text-muted-foreground">({selected.unit})</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <Search className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="flex items-center gap-2 rounded-md border border-brand/50 bg-background px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-9 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="search"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectMaterial(m.id)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-body active:bg-subtle transition-colors ${
                m.id === value ? "bg-brand/5 text-brand" : "text-foreground"
              }`}
            >
              <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{m.name}</span>
              {m.unit && (
                <span className="shrink-0 text-caption text-muted-foreground">{m.unit}</span>
              )}
            </button>
          ))}
          {filtered.length === 20 && materials.length > 20 && (
            <div className="border-t border-border px-3 py-1.5 text-center text-caption text-muted-foreground">
              {query ? `Showing first 20 matches` : `Showing first 20 of ${materials.length}`}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover px-3 py-4 text-center text-caption text-muted-foreground shadow-lg">
          No materials found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
