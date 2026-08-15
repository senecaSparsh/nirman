"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Search, X, Check } from "lucide-react";

type ProjectItem = { id: string; name: string };

/**
 * MobileBudgetVarianceProjectSelector — tappable card that opens a
 * searchable bottom-sheet to pick a project. On select, navigates to
 * `?project=<id>` so the Server Component re-renders with the new data.
 */
export function MobileBudgetVarianceProjectSelector({
  projects,
  selectedId,
}: {
  projects: ProjectItem[];
  selectedId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = projects.find((p) => p.id === selectedId);

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  function handleSelect(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/m/budget-variance?project=${id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 rounded-[0.625rem] border p-2.5 press text-left"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <span
          className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <Building2 className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[0.4375rem] uppercase tracking-wide font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            Project
          </p>
          <p
            className="text-[0.75rem] font-bold truncate"
            style={{ color: "var(--color-ink-950)" }}
          >
            {selected ? selected.name : "Select a project…"}
          </p>
        </div>
        <ChevronDown className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 60%, transparent)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
            style={{ backgroundColor: "var(--color-paper)", maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-3 border-b"
              style={{ borderColor: "var(--color-line)" }}
            >
              <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                Select Project
              </p>
              <button onClick={() => setOpen(false)} className="press">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>

            {/* Search */}
            <div className="p-2 border-b" style={{ borderColor: "var(--color-line)" }}>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
                  style={{ color: "var(--color-ink-500)" }}
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  autoFocus
                  className="w-full h-9 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] outline-none"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "var(--color-paper)",
                    color: "var(--color-ink-950)",
                  }}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Search className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
                  <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                    No results
                  </p>
                </div>
              ) : (
                filtered.map((p) => {
                  const isSelected = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelect(p.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 press text-left"
                      style={{
                        backgroundColor: isSelected
                          ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)"
                          : "transparent",
                        borderBottom: "1px solid var(--color-line)",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[0.75rem] font-bold truncate"
                          style={{ color: "var(--color-ink-950)" }}
                        >
                          {p.name}
                        </p>
                      </div>
                      {isSelected ? (
                        <Check className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
