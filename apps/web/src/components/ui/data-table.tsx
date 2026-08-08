"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, CheckSquare, Square, Search, X, Columns3 } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD, TDNum, THNum } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════
 * DATA TABLE — the enterprise data grid
 *
 * The existing Table primitives (Table/THead/TR/TH/TD/TDNum) are
 * well-designed but are just styled HTML — no sorting, no selection,
 * no column config. This component wraps them to provide:
 *
 *  1. Sortable columns — click any header to sort asc/desc. A second
 *     click toggles direction. A `sortValue` function lets you sort
 *     by a derived/nested value rather than the render output.
 *  2. Bulk selection — an optional checkbox column. `selectable`
 *     turns it on; `selectedIds` + `onSelectionChange` are
 *     controlled. A header checkbox selects/deselects all visible.
 *  3. Column definitions — declarative `{ key, label, align, render }`
 *     so every list page has the same structure, not a hand-rolled
 *     table each time.
 *  4. Row click — optional `onRowClick` makes rows navigable.
 *
 * Sorting is client-side. For pages with hundreds of rows (the common
 * case here — most queries `take: 50-200`) this is instant. Pages
 * that need server-side pagination can bypass this component.
 * ═══════════════════════════════════════════════════════════════════
 */

export interface Column<T> {
  /** Unique key — used as the sort field and React key. */
  key: string;
  /** Header label. */
  label: string;
  /** Enable click-to-sort on this column. Default: false. */
  sortable?: boolean;
  /** "right" → TDNum (tabular mono, right-aligned). Default: "left". */
  align?: "left" | "right";
  /** Custom cell renderer. Receives the full row. */
  render?: (row: T) => React.ReactNode;
  /**
   * Function to extract the sort value from a row. If omitted, the
   * column `key` is used as a property path on the row (supports
   * `supplier.name` style nested keys).
   */
  sortValue?: (row: T) => string | number | Date;
  /** Extra className on the header cell. */
  headClassName?: string;
  /** Extra className on every body cell in this column. */
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Called when a row is clicked (excluding checkbox clicks). */
  onRowClick?: (row: T) => void;
  /** Stable ID for each row. Defaults to `(row) => row.id`. */
  getRowId?: (row: T) => string;
  /** Empty-state node shown when `data` is empty. */
  emptyState?: React.ReactNode;
  /** Enable the checkbox column for bulk selection. */
  selectable?: boolean;
  /** Controlled set of selected row IDs. */
  selectedIds?: Set<string>;
  /** Called when the selection changes. */
  onSelectionChange?: (ids: Set<string>) => void;
  /** Initial sort state. */
  initialSort?: { key: string; direction: "asc" | "desc" } | null;
  /** Extra className on the wrapper. */
  className?: string;
  /** Enable the text search bar above the table. Filters all string columns. */
  searchable?: boolean;
  /** Placeholder for the search input. */
  searchPlaceholder?: string;
  /** Show a sticky footer totals row summing numeric columns. */
  showTotals?: boolean;
  /** Which column keys to sum in the footer. Defaults to all columns with align: "right". */
  sumColumns?: string[];
  /** Render function for the footer total of a specific column. */
  totalFormat?: (key: string, sum: number) => string;
  /** Enable column visibility toggle. A "Columns" button appears next to the search bar. */
  hideable?: boolean;
  /** Column keys that are always visible (cannot be hidden). Default: first column. */
  pinnedColumns?: string[];
  /** Enable client-side pagination with the given page size. Set to 0 or omit to disable. */
  pageSize?: number;
}

type SortState = { key: string; direction: "asc" | "desc" } | null;

/** Resolve a dotted path on an object (e.g. "supplier.name"). */
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  getRowId = (row) => (row as { id?: string }).id ?? "",
  emptyState,
  selectable = false,
  selectedIds,
  onSelectionChange,
  initialSort = null as SortState,
  className,
  searchable = false,
  searchPlaceholder = "Search…",
  showTotals = false,
  sumColumns,
  totalFormat,
  hideable = false,
  pinnedColumns,
  pageSize = 0,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [search, setSearch] = useState("");
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [page, setPage] = useState(0);

  // ── Sorting ──────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;

    const getVal = col.sortValue
      ? col.sortValue
      : (row: T) => getPath(row, col.key) as string | number | Date;

    return [...data].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av == null && bv == null) return 0;
      if (av == null) return sort.direction === "asc" ? -1 : 1;
      if (bv == null) return sort.direction === "asc" ? 1 : -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [data, sort, columns]);

  const toggleSort = useCallback(
    (key: string) => {
      setSort((prev) => {
        if (prev?.key === key) {
          if (prev.direction === "asc") return { key, direction: "desc" };
          return null; // third click clears sort
        }
        return { key, direction: "asc" };
      });
    },
    [],
  );

  // ── Search filter ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((row) =>
      columns.some((col) => {
        const val = col.sortValue
          ? String(col.sortValue(row))
          : String(getPath(row, col.key) ?? "");
        return val.toLowerCase().includes(q);
      }),
    );
  }, [sorted, search, columns]);

  // ── Pagination ───────────────────────────────────────────────
  const totalPages = pageSize > 0 ? Math.ceil(filtered.length / pageSize) : 1;
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const paged = pageSize > 0
    ? filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
    : filtered;
  // Reset page when search/sort changes
  useMemo(() => { setPage(0); }, [search, sort?.key, sort?.direction]);

  // ── Selection ────────────────────────────────────────────────
  const allVisibleIds = filtered.map(getRowId);
  const allSelected =
    selectable && allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds?.has(id));
  const someSelected =
    selectable && !allSelected && allVisibleIds.some((id) => selectedIds?.has(id));

  const toggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (allSelected) {
      allVisibleIds.forEach((id) => next.delete(id));
    } else {
      allVisibleIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  }, [allSelected, allVisibleIds, selectedIds, onSelectionChange]);

  const toggleRow = useCallback(
    (id: string) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  // ── Totals ───────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!showTotals) return null;
    const colsToSum = sumColumns ?? columns.filter((c) => c.align === "right").map((c) => c.key);
    const result: Record<string, number> = {};
    for (const key of colsToSum) {
      result[key] = filtered.reduce((sum, row) => {
        const v = getPath(row, key);
        return sum + (typeof v === "number" && !isNaN(v) ? v : 0);
      }, 0);
    }
    return { colsToSum, result };
  }, [showTotals, sumColumns, columns, filtered]);

  // ── Render ───────────────────────────────────────────────────
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  // Columns that are visible (not hidden by the user)
  const visibleColumns = useMemo(
    () => hideable ? columns.filter((c) => !hiddenCols.has(c.key)) : columns,
    [columns, hideable, hiddenCols],
  );
  const pinnedSet = useMemo(
    () => new Set(pinnedColumns ?? [columns[0]?.key].filter(Boolean) as string[]),
    [pinnedColumns, columns],
  );

  return (
    <div className={cn("space-y-0", className)}>
      {(searchable || hideable) && (
        <div className="flex items-center gap-2 border-b border-border bg-subtle/50 px-3 py-1.5">
          {searchable && (
            <>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground/50"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
          {hideable && (
            <div className="relative shrink-0">
              <button
                onClick={() => setColMenuOpen((v) => !v)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-caption text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Columns3 className="h-3.5 w-3.5" /> Columns
              </button>
              {colMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-md border border-border bg-popover p-1 shadow-lg">
                    {columns.map((col) => {
                      const isPinned = pinnedSet.has(col.key);
                      const isHidden = hiddenCols.has(col.key);
                      return (
                        <button
                          key={col.key}
                          disabled={isPinned}
                          onClick={() => {
                            setHiddenCols((prev) => {
                              const next = new Set(prev);
                              if (isHidden) next.delete(col.key);
                              else next.add(col.key);
                              return next;
                            });
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body hover:bg-accent disabled:opacity-40"
                        >
                          {isHidden ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                          {col.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          {searchable && (
            <span className="text-caption text-muted-foreground tnum shrink-0">
              {filtered.length}{filtered.length !== data.length && ` / ${data.length}`}
            </span>
          )}
        </div>
      )}
    <Table>
      <THead>
        <TR>
          {selectable && (
            <th className="h-8 w-8 px-3">
              <button
                onClick={toggleAll}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={allSelected ? "Deselect all" : "Select all"}
              >
                {allSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-foreground" />
                ) : someSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-muted-foreground/50" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
              </button>
            </th>
          )}
          {visibleColumns.map((col) => {
            const isSorted = sort?.key === col.key;
            const SortIcon = isSorted
              ? sort?.direction === "asc"
                ? ChevronUp
                : ChevronDown
              : ChevronsUpDown;
            const Cell = col.align === "right" ? THNum : TH;
            return (
              <Cell
                key={col.key}
                className={cn(
                  col.sortable && "cursor-pointer select-none hover:text-foreground",
                  col.headClassName,
                )}
                onClick={col.sortable ? () => toggleSort(col.key) : undefined}
              >
                {col.sortable ? (
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon
                      className={cn(
                        "h-3 w-3",
                        isSorted ? "text-foreground" : "text-muted-foreground/40",
                      )}
                    />
                  </span>
                ) : (
                  col.label
                )}
              </Cell>
            );
          })}
        </TR>
      </THead>
      <TBody>
        {paged.map((row) => {
          const id = getRowId(row);
          const isSelected = selectable && selectedIds?.has(id);
          return (
            <TR
              key={id}
              className={cn(
                onRowClick && "cursor-pointer",
                isSelected && "bg-accent",
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {selectable && (
                <td
                  className="w-8 px-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRow(id);
                  }}
                >
                  <button
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={isSelected ? "Deselect" : "Select"}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-3.5 w-3.5 text-foreground" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                  </button>
                </td>
              )}
              {visibleColumns.map((col) => {
                const Cell = col.align === "right" ? TDNum : TD;
                return (
                  <Cell key={col.key} className={col.cellClassName}>
                    {col.render
                      ? col.render(row)
                      : (getPath(row, col.key) as React.ReactNode)}
                  </Cell>
                );
              })}
            </TR>
          );
        })}
      </TBody>
      {totals && filtered.length > 0 && (
        <tfoot className="sticky bottom-0 z-10 bg-subtle border-t-2 border-border">
          <tr className="font-semibold">
            {selectable && <td className="w-8 px-3" />}
            {visibleColumns.map((col) => {
              const isSumCol = totals.colsToSum.includes(col.key);
              if (isSumCol) {
                const sum = totals.result[col.key] ?? 0;
                const display = totalFormat ? totalFormat(col.key, sum) : String(sum);
                const Cell = col.align === "right" ? TDNum : TD;
                return (
                  <Cell key={col.key} className={cn("font-semibold", col.cellClassName)}>
                    {display}
                  </Cell>
                );
              }
              // First non-sum column gets "Total" label
              const firstNonSum = visibleColumns.find((c) => !totals!.colsToSum.includes(c.key));
              if (firstNonSum && col.key === firstNonSum.key) {
                return <TD key={col.key} className="font-semibold">Total</TD>;
              }
              return <TD key={col.key} />;
            })}
          </tr>
        </tfoot>
      )}
    </Table>
      {pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-caption text-muted-foreground">
          <span className="tnum">
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded px-2 py-0.5 hover:bg-accent disabled:opacity-30"
            >
              Prev
            </button>
            <span className="tnum px-1">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="rounded px-2 py-0.5 hover:bg-accent disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
