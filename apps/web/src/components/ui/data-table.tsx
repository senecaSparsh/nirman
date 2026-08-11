"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Download,
  Filter,
  Minus,
  Plus,
  Rows3,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════
 * DATA TABLE — the workbench, not a list of cards.
 *
 * Almost every screen in this app answers a question of the form "show
 * me these records, let me compare them, then let me act on some of
 * them". That is a spreadsheet's job, and a grid of cards is the worst
 * possible shape for it: you cannot scan a column, cannot sort, cannot
 * total, cannot multi-select, and four fields per record eat a whole
 * screen. So this component is deliberately spreadsheet-like.
 *
 * What it does:
 *
 *   SCAN      sticky header, sticky totals row, optional frozen first
 *             column, zebra-free hairline rows, tabular mono numerics,
 *             group-by with collapsible group headers and subtotals.
 *   FIND      instant search across all columns, per-column sort with a
 *             third click to clear, column visibility, density toggle.
 *   COMPARE   right-aligned numeric columns with a footer sum, and a
 *             `bar` column type that draws an inline magnitude bar so
 *             relative size is pre-attentive.
 *   ACT       row selection with shift-click ranges, a floating bulk
 *             action bar, row click-through, and per-row actions that
 *             appear on hover.
 *   KEYBOARD  ↑/↓ move the active row, Enter opens it, Space selects,
 *             ⌘A selects all, / focuses search, Esc clears.
 *   EXPORT    one-click CSV of exactly what's on screen (filtered,
 *             sorted, visible columns) — because someone always needs
 *             it in Excel, and if we don't give them a button they will
 *             copy-paste the HTML and lose the numbers.
 *   REMEMBER  sort, density, hidden columns and page size persist per
 *             table via `storageKey`, so nobody reconfigures a report
 *             twice.
 *
 * The v1 API (`columns`, `data`, `searchable`, `selectable`, …) is kept
 * intact so existing call sites keep working; everything new is opt-in.
 * ═══════════════════════════════════════════════════════════════════
 */

export interface Column<T> {
  /** Unique key — used as the sort field and React key. */
  key: string;
  /** Header label. */
  label: string;
  /** Enable click-to-sort on this column. Default: false. */
  sortable?: boolean;
  /** "right" → tabular mono, right-aligned. Default: "left". */
  align?: "left" | "right" | "center";
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
  /** A fixed width, e.g. "160px" or "12rem". Otherwise content-sized. */
  width?: string;
  /** One-line explanation of the column, shown on hover of the header. */
  hint?: string;
  /**
   * Draws an inline magnitude bar behind the value, scaled against the
   * largest value in the column. For "how big is this relative to the
   * rest" questions, which is most of them.
   */
  bar?: boolean;
  /** Exclude from the CSV export (e.g. an actions column). */
  noExport?: boolean;
  /** Plain-text value for CSV export. Defaults to the sort value. */
  exportValue?: (row: T) => string | number;
  /** Hidden by default; the user can switch it on from the Columns menu. */
  defaultHidden?: boolean;
  /**
   * Enable a per-column value filter (Excel auto-filter style). A filter
   * icon appears in the header; clicking it opens a dropdown of unique
   * values with checkboxes. Defaults to the rendered/exported value.
   */
  filterable?: boolean;
  /** Extract the value to filter on. Defaults to `exportValue` → `sortValue` → `valueOf`. */
  filterValue?: (row: T) => string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Called when a row is clicked (excluding checkbox clicks). */
  onRowClick?: (row: T) => void;
  /** Stable ID for each row. Defaults to `row.id`. */
  getRowId?: (row: T, index: number) => string;
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
  /** Enable the text search bar above the table. Filters all columns. */
  searchable?: boolean;
  /** Placeholder for the search input. */
  searchPlaceholder?: string;
  /** Show a sticky footer totals row summing numeric columns. */
  showTotals?: boolean;
  /** Which column keys to sum in the footer. Defaults to all `align: "right"`. */
  sumColumns?: string[];
  /** Render function for the footer total of a specific column. */
  totalFormat?: (key: string, sum: number) => string;
  /** Enable column visibility toggle. */
  hideable?: boolean;
  /** Column keys that can never be hidden. Default: the first column. */
  pinnedColumns?: string[];
  /** Client-side pagination page size. 0 / omitted = show everything. */
  pageSize?: number;

  // ── New in v2 ──────────────────────────────────────────────────
  /** Persist sort / density / hidden columns / page size under this key. */
  storageKey?: string;
  /** Freeze the first column horizontally. For wide tables with long names. */
  freezeFirstColumn?: boolean;
  /** Extra controls rendered in the toolbar (filters, date range, …). */
  toolbar?: React.ReactNode;
  /** Controls rendered BEFORE the search box in the toolbar (e.g. view toggles). */
  toolbarLeading?: React.ReactNode;
  /** Controls rendered after the CSV export button in the toolbar's right side. */
  toolbarTrailing?: React.ReactNode;
  /** Actions shown in the bulk bar when rows are selected. */
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  /** Offer a CSV download of the current view. */
  exportFileName?: string;
  /** Group rows by a derived key, with collapsible headers and subtotals. */
  groupBy?: { key: string; label: (row: T) => string } | null;
  /** Row tint for exception states — overdue, negative stock, blocked. */
  rowTone?: (row: T) => "danger" | "warning" | "success" | null | undefined;
  /** Per-row action node, revealed on row hover. */
  rowActions?: (row: T) => React.ReactNode;
  /** Hide the toolbar entirely (for tables embedded in a card that has its own). */
  hideToolbar?: boolean;
  /** Show a "+" add-row button at the bottom of the table. */
  onAddRow?: () => void;
  /** Label for the add-row button. */
  addRowLabel?: string;
  /** Draw thin vertical dividers between columns. */
  columnDividers?: boolean;
}

type SortState = { key: string; direction: "asc" | "desc" } | null;
type Density = "compact" | "default" | "relaxed";

const DENSITY_CLASS: Record<Density, string> = {
  compact: "[&_td]:py-1 [&_th]:h-8",
  default: "[&_td]:py-2.5 [&_th]:h-9",
  relaxed: "[&_td]:py-4 [&_th]:h-10",
};

/** Resolve a dotted path on an object (e.g. "supplier.name"). */
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** localStorage-backed view preferences. Silent on failure (private mode). */
function loadPrefs(key?: string): Record<string, unknown> {
  if (!key) return {};
  try {
    return JSON.parse(localStorage.getItem(`nirman.table.${key}`) ?? "{}");
  } catch {
    return {};
  }
}

function savePrefs(key: string, prefs: Record<string, unknown>) {
  try {
    localStorage.setItem(`nirman.table.${key}`, JSON.stringify(prefs));
  } catch {
    /* private mode — the preference just won't persist */
  }
}

// ── Saved Views (named snapshots of the full table state) ──────────

interface SavedView {
  name: string;
  sort: SortState;
  density: Density;
  hidden: string[];
  search: string;
  colFilters: Record<string, string[]>;
  savedAt: string;
}

function loadViews(storageKey: string): SavedView[] {
  try {
    const raw = localStorage.getItem(`nirman.table.views.${storageKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedView[];
  } catch {
    return [];
  }
}

function saveViews(storageKey: string, views: SavedView[]) {
  try {
    localStorage.setItem(`nirman.table.views.${storageKey}`, JSON.stringify(views));
  } catch {
    /* private mode */
  }
}

function saveView(storageKey: string, view: SavedView) {
  const views = loadViews(storageKey);
  // Replace if a view with the same name exists
  const idx = views.findIndex((v) => v.name === view.name);
  if (idx >= 0) views[idx] = view;
  else views.push(view);
  saveViews(storageKey, views);
}

function deleteView(storageKey: string, name: string) {
  const views = loadViews(storageKey).filter((v) => v.name !== name);
  saveViews(storageKey, views);
}

export function DataTable<T>({
  columns,
  data,
  onRowClick,
  getRowId = (row, index) => (row as { id?: string }).id ?? `__row_${index}`,
  emptyState,
  selectable = false,
  selectedIds,
  onSelectionChange,
  initialSort = null,
  className,
  searchable = false,
  searchPlaceholder = "Search…",
  showTotals = false,
  sumColumns,
  totalFormat,
  hideable = false,
  pinnedColumns,
  pageSize = 0,
  storageKey,
  freezeFirstColumn = false,
  toolbar,
  toolbarLeading,
  toolbarTrailing,
  bulkActions,
  exportFileName,
  groupBy = null,
  rowTone,
  rowActions,
  hideToolbar = false,
  onAddRow,
  addRowLabel = "Add row",
  columnDividers = false,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  const [filterCol, setFilterCol] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const [density, setDensity] = useState<Density>("default");
  const [menu, setMenu] = useState<"columns" | "density" | "views" | "saveView" | null>(null);
  const [page, setPage] = useState(0);
  const [activeRow, setActiveRow] = useState(-1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // ── Saved Views state ──
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const lastClicked = useRef<number | null>(null);

  // ── Restore persisted view prefs (once, after mount) ──────────
  // EC-5.3: validate column keys on load — filter out keys that no longer exist
  // in the current column set (e.g. after a schema change removes a column).
  useEffect(() => {
    const p = loadPrefs(storageKey);
    if (p.sort !== undefined) setSort(p.sort as SortState);
    if (typeof p.density === "string") setDensity(p.density as Density);
    if (Array.isArray(p.hidden)) {
      const validKeys = new Set(columns.map((c) => c.key));
      setHiddenCols(new Set((p.hidden as string[]).filter((k) => validKeys.has(k))));
    }
    if (typeof p.search === "string") setSearch(p.search);
    if (p.colFilters && typeof p.colFilters === "object") {
      const validKeys = new Set(columns.map((c) => c.key));
      const restored: Record<string, Set<string>> = {};
      for (const [colKey, values] of Object.entries(p.colFilters as Record<string, unknown>)) {
        if (validKeys.has(colKey) && Array.isArray(values)) {
          restored[colKey] = new Set(values as string[]);
        }
      }
      setColFilters(restored);
    }
    // Load saved views list
    if (storageKey) setSavedViews(loadViews(storageKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    // Serialize colFilters (Set → array) for JSON storage
    const colFiltersSerialized: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(colFilters)) {
      colFiltersSerialized[k] = [...v];
    }
    savePrefs(storageKey, {
      sort,
      density,
      hidden: [...hiddenCols],
      search,
      colFilters: colFiltersSerialized,
    });
  }, [storageKey, sort, density, hiddenCols, search, colFilters]);

  // ── Columns ──────────────────────────────────────────────────
  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenCols.has(c.key)),
    [columns, hiddenCols],
  );
  const pinnedSet = useMemo(
    () => new Set(pinnedColumns ?? ([columns[0]?.key].filter(Boolean) as string[])),
    [pinnedColumns, columns],
  );

  const valueOf = useCallback(
    (col: Column<T>, row: T) =>
      col.sortValue ? col.sortValue(row) : (getPath(row, col.key) as string | number | Date),
    [],
  );

  // ── Search + per-column filters ──────────────────────────────
  const filterableColumns = useMemo(
    () => columns.filter((c) => c.filterable),
    [columns],
  );

  const colFilterValue = useCallback(
    (col: Column<T>, row: T): string => {
      if (col.filterValue) return col.filterValue(row);
      if (col.exportValue) return String(col.exportValue(row));
      return String(valueOf(col, row) ?? "");
    },
    [valueOf],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hasColFilters = filterableColumns.some((c) => colFilters[c.key]?.size);
    if (!q && !hasColFilters) return data;
    return data.filter((row) => {
      if (q && !columns.some((col) => String(valueOf(col, row) ?? "").toLowerCase().includes(q))) return false;
      for (const col of filterableColumns) {
        const selected = colFilters[col.key];
        if (selected && selected.size > 0) {
          if (!selected.has(colFilterValue(col, row))) return false;
        }
      }
      return true;
    });
  }, [data, search, columns, valueOf, filterableColumns, colFilters, colFilterValue]);

  // ── Sort ─────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const av = valueOf(col, a);
      const bv = valueOf(col, b);
      if (av == null && bv == null) return 0;
      if (av == null) return sort.direction === "asc" ? -1 : 1;
      if (bv == null) return sort.direction === "asc" ? 1 : -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort, columns, valueOf]);

  const toggleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (prev?.key === key) return prev.direction === "asc" ? { key, direction: "desc" } : null;
      return { key, direction: "asc" };
    });
  }, []);

  // ── Pagination ───────────────────────────────────────────────
  // Auto-paginate when the dataset is large and no explicit pageSize was set,
  // to avoid rendering 500+ DOM rows at once (performance optimization).
  const AUTO_PAGE_THRESHOLD = 200;
  const AUTO_PAGE_SIZE = 50;
  const effectivePageSize = pageSize > 0 ? pageSize : (sorted.length > AUTO_PAGE_THRESHOLD ? AUTO_PAGE_SIZE : 0);
  const totalPages = effectivePageSize > 0 ? Math.max(1, Math.ceil(sorted.length / effectivePageSize)) : 1;
  const currentPage = Math.min(page, totalPages - 1);
  const paged = useMemo(
    () =>
      effectivePageSize > 0
        ? sorted.slice(currentPage * effectivePageSize, currentPage * effectivePageSize + effectivePageSize)
        : sorted,
    [sorted, effectivePageSize, currentPage],
  );

  useEffect(() => {
    setPage(0);
    setActiveRow(-1);
  }, [search, sort?.key, sort?.direction]);

  // ── Grouping ─────────────────────────────────────────────────
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, T[]>();
    for (const row of paged) {
      const label = groupBy.label(row);
      const list = map.get(label);
      if (list) list.push(row);
      else map.set(label, [row]);
    }
    return [...map.entries()];
  }, [paged, groupBy]);

  // ── Selection ────────────────────────────────────────────────
  const visibleIds = useMemo(() => sorted.map(getRowId), [sorted, getRowId]);
  const selectedCount = selectedIds
    ? visibleIds.filter((id) => selectedIds.has(id)).length
    : 0;
  const allSelected = selectable && visibleIds.length > 0 && selectedCount === visibleIds.length;
  const someSelected = selectable && selectedCount > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (allSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    onSelectionChange(next);
  }, [allSelected, visibleIds, selectedIds, onSelectionChange]);

  const clearSelection = useCallback(() => onSelectionChange?.(new Set()), [onSelectionChange]);

  /**
   * Shift-click extends from the last clicked row. Anyone who has ever
   * approved 30 POs expects this to work; without it they click 30 times.
   */
  const toggleRow = useCallback(
    (index: number, shift: boolean) => {
      if (!onSelectionChange) return;
      const row = paged[index];
      if (!row) return;
      const next = new Set(selectedIds);
      const id = getRowId(row, index);
      if (shift && lastClicked.current !== null) {
        const from = Math.min(lastClicked.current, index);
        const to = Math.max(lastClicked.current, index);
        const add = !next.has(id);
        for (let i = from; i <= to; i++) {
          const r = paged[i];
          if (!r) continue;
          const rid = getRowId(r, i);
          if (add) next.add(rid);
          else next.delete(rid);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastClicked.current = index;
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange, paged, getRowId],
  );

  // ── Totals ───────────────────────────────────────────────────
  const sumKeys = useMemo(
    () => sumColumns ?? columns.filter((c) => c.align === "right").map((c) => c.key),
    [sumColumns, columns],
  );

  const sumFor = useCallback(
    (rows: T[], key: string) => {
      const col = columns.find((c) => c.key === key);
      return rows.reduce((acc, row) => {
        const v = col ? valueOf(col, row) : getPath(row, key);
        return acc + (typeof v === "number" && !Number.isNaN(v) ? v : 0);
      }, 0);
    },
    [columns, valueOf],
  );

  const formatTotal = useCallback(
    (key: string, sum: number) =>
      totalFormat ? totalFormat(key, sum) : sum.toLocaleString("en-IN"),
    [totalFormat],
  );

  /** Column maxima, for the inline magnitude bars. */
  const maxima = useMemo(() => {
    const out: Record<string, number> = {};
    for (const col of visibleColumns) {
      if (!col.bar) continue;
      out[col.key] = sorted.reduce((m, row) => {
        const v = valueOf(col, row);
        return typeof v === "number" ? Math.max(m, Math.abs(v)) : m;
      }, 0);
    }
    return out;
  }, [visibleColumns, sorted, valueOf]);

  // ── CSV export ───────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const cols = visibleColumns.filter((c) => !c.noExport);
    const head = cols.map((c) => csvCell(c.label)).join(",");
    const body = sorted
      .map((row) =>
        cols
          .map((c) => csvCell(c.exportValue ? c.exportValue(row) : valueOf(c, row)))
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${head}\n${body}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportFileName ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [visibleColumns, sorted, valueOf, exportFileName]);

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) {
        if (e.key === "Escape") (el as HTMLElement).blur();
        return;
      }
      if (!bodyRef.current?.closest("[data-table-root]")?.matches(":hover") && activeRow < 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveRow((r) => Math.min(paged.length - 1, r + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveRow((r) => Math.max(0, r - 1));
      } else if (e.key === "Enter" && activeRow >= 0 && onRowClick) {
        e.preventDefault();
        const row = paged[activeRow];
        if (row) onRowClick(row);
      } else if (e.key === " " && activeRow >= 0 && selectable) {
        e.preventDefault();
        toggleRow(activeRow, false);
      } else if (e.key === "Escape") {
        setActiveRow(-1);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paged, activeRow, onRowClick, selectable, toggleRow]);

  // ── Render ───────────────────────────────────────────────────
  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  const colCount = visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  const showToolbar =
    !hideToolbar && (searchable || hideable || toolbar || toolbarLeading || toolbarTrailing || exportFileName || groupBy || storageKey);
  const selectedRows = selectedIds ? sorted.filter((r, i) => selectedIds.has(getRowId(r, i))) : [];

  // Unique values per filterable column (computed once, outside headerCell)
  const colFilterOptions = useMemo(() => {
    const map: Record<string, [string, number][]> = {};
    for (const col of filterableColumns) {
      const seen = new Map<string, number>();
      for (const row of data) {
        const v = colFilterValue(col, row);
        seen.set(v, (seen.get(v) ?? 0) + 1);
      }
      map[col.key] = Array.from(seen.entries()).sort((a, b) =>
        a[0].localeCompare(b[0], undefined, { numeric: true }),
      );
    }
    return map;
  }, [filterableColumns, data, colFilterValue]);

  function toggleFilterValue(colKey: string, v: string) {
    setColFilters((prev) => {
      const next = new Set(prev[colKey] ?? []);
      if (next.has(v)) next.delete(v); else next.add(v);
      return { ...prev, [colKey]: next };
    });
  }

  function headerCell(col: Column<T>, index: number) {
    const isSorted = sort?.key === col.key;
    const frozen = freezeFirstColumn && index === 0;
    const activeFilter = colFilters[col.key];
    const hasFilter = activeFilter && activeFilter.size > 0;
    const isOpen = filterCol === col.key;
    const uniqueValues = col.filterable ? (colFilterOptions[col.key] ?? []) : [];

    return (
      <th
        key={col.key}
        title={col.hint}
        style={col.width ? { width: col.width } : undefined}
        aria-sort={isSorted ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
        className={cn(
          "group/head whitespace-nowrap bg-subtle px-3 align-middle text-label text-muted-foreground",
          col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
          col.sortable && "cursor-pointer select-none transition-colors hover:text-foreground",
          columnDividers && index > 0 && "[box-shadow:inset_1px_0_0_0_var(--color-border)]",
          frozen && "sticky left-0 z-20",
          col.headClassName,
        )}
        onClick={col.sortable && !col.filterable ? () => toggleSort(col.key) : undefined}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1",
            col.align === "right" && "flex-row-reverse",
          )}
        >
          {col.label}
          {col.sortable &&
            (isSorted ? (
              sort!.direction === "asc" ? (
                <ChevronUp className="size-3 text-foreground" />
              ) : (
                <ChevronDown className="size-3 text-foreground" />
              )
            ) : (
              <ArrowDownUp className="size-3 text-transparent transition-colors group-hover/head:text-faint" />
            ))}
          {col.filterable && (
            <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setFilterCol(isOpen ? null : col.key)}
                className={cn(
                  "inline-flex items-center rounded p-0.5 transition-colors",
                  hasFilter
                    ? "text-brand"
                    : "text-transparent hover:text-foreground group-hover/head:text-faint",
                  isOpen && "text-foreground",
                )}
                aria-label={`Filter by ${col.label}`}
              >
                <Filter className="size-3" />
                {hasFilter && (
                  <span className="ml-0.5 rounded-full bg-brand px-1 text-[9px] font-bold leading-none text-brand-foreground tnum">
                    {activeFilter!.size}
                  </span>
                )}
              </button>
              {isOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFilterCol(null)} />
                  <div className="overlay-in absolute left-0 top-full z-50 mt-1 max-h-72 min-w-48 overflow-y-auto rounded-lg border border-border bg-elevated p-1 shadow-overlay scrollbar-thin">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-1.5 pb-1.5 mb-1">
                      <span className="text-caption font-medium text-foreground">Filter</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setColFilters((prev) => ({ ...prev, [col.key]: new Set() }))}
                          className="text-micro text-muted-foreground hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    {uniqueValues.map(([v, count]) => {
                      const checked = activeFilter?.has(v) ?? false;
                      return (
                        <button
                          key={v}
                          onClick={() => toggleFilterValue(col.key, v)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-caption transition-colors hover:bg-subtle",
                            checked && "bg-brand-soft/50",
                          )}
                        >
                          <span className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                            checked ? "border-brand bg-brand text-brand-foreground" : "border-border",
                          )}>
                            {checked && <Check className="size-2.5" />}
                          </span>
                          <span className="truncate text-foreground">{v || "—"}</span>
                          <span className="ml-auto text-micro text-faint tnum">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </span>
          )}
        </span>
      </th>
    );
  }

  function bodyRow(row: T, index: number, absoluteIndex: number) {
    const id = getRowId(row, index);
    const isSelected = selectable && selectedIds?.has(id);
    const tone = rowTone?.(row);
    return (
      <tr
        key={id}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={cn(
          "group border-b border-border last:border-0",
          onRowClick && "cursor-pointer",
          isSelected && "bg-brand-soft/60",
          !isSelected && activeRow === absoluteIndex && "bg-subtle",
          !isSelected && tone === "danger" && "bg-danger-soft/40 hover:bg-danger-soft/60",
          !isSelected && tone === "warning" && "bg-warning-soft/40 hover:bg-warning-soft/60",
          !isSelected && tone === "success" && "bg-success-soft/40 hover:bg-success-soft/60",
          !isSelected && !tone && "hover:bg-subtle",
        )}
      >
        {selectable && (
          <td
            className="w-9 px-3"
            onClick={(e) => {
              e.stopPropagation();
              toggleRow(absoluteIndex, e.shiftKey);
            }}
          >
            <Checkbox checked={!!isSelected} />
          </td>
        )}
        {visibleColumns.map((col, ci) => {
          const raw = valueOf(col, row);
          const frozen = freezeFirstColumn && ci === 0;
          const max = maxima[col.key] ?? 0;
          const pct =
            col.bar && typeof raw === "number" && max > 0 ? (Math.abs(raw) / max) * 100 : null;
          return (
            <td
              key={col.key}
              className={cn(
                "relative px-3 align-middle text-body",
                col.align === "right"
                  ? "text-right tnum"
                  : col.align === "center"
                    ? "text-center"
                    : "text-left",
                ci === 0 && "font-medium text-foreground",
                columnDividers && ci > 0 && "[box-shadow:inset_1px_0_0_0_var(--color-border)]",
                frozen &&
                  "sticky left-0 z-10 bg-card group-hover:bg-subtle",
                col.cellClassName,
              )}
            >
              {pct !== null && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-1 right-0 rounded-sm bg-brand/12 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative">{col.render ? col.render(row) : (raw as React.ReactNode)}</span>
            </td>
          );
        })}
        {rowActions && (
          <td
            className="w-px whitespace-nowrap px-3 text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {rowActions(row)}
            </span>
          </td>
        )}
      </tr>
    );
  }

  let cursor = -1;

  return (
    <div data-table-root className={cn("relative flex min-w-0 flex-col", className)}>
      {/* ── Toolbar ───────────────────────────────────────────── */}
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-subtle/60 px-2.5 py-2">
          {toolbarLeading}
          {searchable && (
            <div className="relative min-w-40 flex-1 sm:max-w-64">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className={cn(
                  "h-7 w-full rounded-md border border-input bg-card pl-7 pr-7 text-meta",
                  "transition-[border-color,box-shadow] placeholder:text-faint",
                  "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
                )}
              />
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-faint hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="kbd absolute right-1.5 top-1/2 -translate-y-1/2">/</kbd>
              )}
            </div>
          )}

          {toolbar}

          <div className="ml-auto flex items-center gap-1.5">
            {hideable && (
              <Popover
                open={menu === "columns"}
                onOpenChange={(o) => setMenu(o ? "columns" : null)}
                trigger={
                  <>
                    <Columns3 className="size-3.5" />
                    <span className="hidden sm:inline">Columns</span>
                  </>
                }
              >
                {columns.map((col) => {
                  const locked = pinnedSet.has(col.key);
                  const hidden = hiddenCols.has(col.key);
                  return (
                    <button
                      key={col.key}
                      disabled={locked}
                      onClick={() =>
                        setHiddenCols((prev) => {
                          const next = new Set(prev);
                          if (hidden) next.delete(col.key);
                          else next.add(col.key);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-meta transition-colors hover:bg-muted disabled:opacity-40"
                    >
                      <span className="flex size-3.5 shrink-0 items-center justify-center">
                        {!hidden && <Check className="size-3.5 text-brand-strong" />}
                      </span>
                      <span className="truncate">{col.label || col.key}</span>
                    </button>
                  );
                })}
              </Popover>
            )}

            <Popover
              open={menu === "density"}
              onOpenChange={(o) => setMenu(o ? "density" : null)}
              trigger={<Rows3 className="size-3.5" />}
              label="Row height"
            >
              {(["compact", "default", "relaxed"] as Density[]).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDensity(d);
                    setMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-meta capitalize transition-colors hover:bg-muted"
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    {density === d && <Check className="size-3.5 text-brand-strong" />}
                  </span>
                  {d}
                </button>
              ))}
            </Popover>

            {exportFileName && (
              <button
                onClick={exportCsv}
                title="Download this view as CSV"
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                <Download className="size-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            )}

            {/* ── Saved Views ─────────────────────────────────────── */}
            {storageKey && (
              <>
                {/* Save View button */}
                <button
                  onClick={() => {
                    setViewName("");
                    setMenu("saveView");
                  }}
                  title="Save current view (sort, filters, search, hidden columns)"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <Save className="size-3.5" />
                  <span className="hidden sm:inline">Save View</span>
                </button>

                {/* Save View dialog (inline) */}
                {menu === "saveView" && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                    <div className="overlay-in absolute right-0 top-full z-50 mt-1 min-w-64 rounded-lg border border-border bg-elevated p-3 shadow-overlay">
                      <label className="mb-1 block text-caption font-medium text-foreground">
                        View name
                      </label>
                      <input
                        type="text"
                        value={viewName}
                        autoFocus
                        onChange={(e) => setViewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && viewName.trim()) {
                            const colFiltersSerialized: Record<string, string[]> = {};
                            for (const [k, v] of Object.entries(colFilters)) {
                              colFiltersSerialized[k] = [...v];
                            }
                            saveView(storageKey, {
                              name: viewName.trim(),
                              sort,
                              density,
                              hidden: [...hiddenCols],
                              search,
                              colFilters: colFiltersSerialized,
                              savedAt: new Date().toISOString(),
                            });
                            setSavedViews(loadViews(storageKey));
                            setMenu(null);
                            setViewName("");
                          }
                          if (e.key === "Escape") setMenu(null);
                        }}
                        placeholder="e.g. High margin units"
                        className="h-7 w-full rounded-md border border-input bg-card px-2 text-meta placeholder:text-faint focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => setMenu(null)}
                          className="h-7 rounded-md px-2 text-caption font-medium text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (!viewName.trim()) return;
                            const colFiltersSerialized: Record<string, string[]> = {};
                            for (const [k, v] of Object.entries(colFilters)) {
                              colFiltersSerialized[k] = [...v];
                            }
                            saveView(storageKey, {
                              name: viewName.trim(),
                              sort,
                              density,
                              hidden: [...hiddenCols],
                              search,
                              colFilters: colFiltersSerialized,
                              savedAt: new Date().toISOString(),
                            });
                            setSavedViews(loadViews(storageKey));
                            setMenu(null);
                            setViewName("");
                          }}
                          disabled={!viewName.trim()}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-brand px-2 text-caption font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-40"
                        >
                          <Save className="size-3.5" />
                          Save
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Views dropdown (load / delete) */}
                <Popover
                  open={menu === "views"}
                  onOpenChange={(o) => setMenu(o ? "views" : null)}
                  trigger={
                    <>
                      <Bookmark className="size-3.5" />
                      <span className="hidden sm:inline">Views</span>
                      {savedViews.length > 0 && (
                        <span className="ml-0.5 rounded bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {savedViews.length}
                        </span>
                      )}
                    </>
                  }
                  label="Load or delete saved views"
                >
                  {savedViews.length === 0 ? (
                    <p className="px-2 py-3 text-center text-caption text-muted-foreground">
                      No saved views yet.
                      <br />
                      Use &ldquo;Save View&rdquo; to capture the current sort, filters, and search.
                    </p>
                  ) : (
                    savedViews.map((v) => (
                      <div
                        key={v.name}
                        className="group flex items-center gap-1 rounded-md px-1 py-1 text-meta transition-colors hover:bg-muted"
                      >
                        <button
                          onClick={() => {
                            // EC-5.3: validate column keys on load —
                            // filter out hidden keys and colFilter keys
                            // that no longer exist in the current column set
                            const validKeys = new Set(columns.map((c) => c.key));
                            setSort(v.sort);
                            setDensity(v.density);
                            setHiddenCols(
                              new Set(v.hidden.filter((k) => validKeys.has(k))),
                            );
                            setSearch(v.search);
                            const restored: Record<string, Set<string>> = {};
                            for (const [colKey, values] of Object.entries(v.colFilters)) {
                              if (validKeys.has(colKey)) {
                                restored[colKey] = new Set(values);
                              }
                            }
                            setColFilters(restored);
                            setMenu(null);
                          }}
                          className="flex flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:text-foreground"
                        >
                          <Bookmark className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{v.name}</span>
                          <span className="shrink-0 text-[10px] text-faint">
                            {new Date(v.savedAt).toLocaleDateString()}
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            deleteView(storageKey, v.name);
                            setSavedViews(loadViews(storageKey));
                          }}
                          title="Delete this saved view"
                          className="shrink-0 rounded-md p-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </Popover>
              </>
            )}

            {toolbarTrailing}
          </div>
        </div>
      )}

      {/* ── Grid ──────────────────────────────────────────────── */}
      <div className="relative w-full flex-1 overflow-auto scrollbar-thin">
        <table
          className={cn(
            "w-full caption-bottom border-collapse text-body",
            DENSITY_CLASS[density],
          )}
        >
          <thead className="group/head sticky top-0 z-20">
            <tr className="border-b border-border-strong">
              {selectable && (
                <th className="w-9 bg-subtle px-3">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onClick={toggleAll}
                    label={allSelected ? "Deselect all" : "Select all"}
                  />
                </th>
              )}
              {visibleColumns.map(headerCell)}
              {rowActions && <th className="w-px bg-subtle px-3" />}
            </tr>
          </thead>

          <tbody ref={bodyRef}>
            {paged.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-12 text-center">
                  <p className="text-body font-medium text-foreground">
                    {data.length === 0 ? "No rows yet" : "No matching rows"}
                  </p>
                  <p className="mt-1 text-meta text-muted-foreground">
                    {search ? (
                      <>
                        Nothing matches “{search}”.{" "}
                        <button
                          onClick={() => setSearch("")}
                          className="font-medium text-brand-strong underline-offset-2 hover:underline"
                        >
                          Clear the search
                        </button>
                      </>
                    ) : data.length === 0 ? (
                      onAddRow ? "Click below to add the first row." : "Adjust the filters above to widen the result."
                    ) : (
                      "Adjust the filters above to widen the result."
                    )}
                  </p>
                </td>
              </tr>
            )}

            {groups
              ? groups.map(([label, rows]) => {
                  const isCollapsed = collapsed.has(label);
                  return (
                    <>
                      <tr key={`g-${label}`} className="border-b border-border bg-muted/70">
                        <td
                          colSpan={colCount}
                          className="cursor-pointer px-3 py-1.5"
                          onClick={() =>
                            setCollapsed((prev) => {
                              const next = new Set(prev);
                              if (next.has(label)) next.delete(label);
                              else next.add(label);
                              return next;
                            })
                          }
                        >
                          <span className="flex items-center gap-1.5 text-meta font-semibold text-foreground">
                            <ChevronRight
                              className={cn(
                                "size-3.5 text-muted-foreground transition-transform",
                                !isCollapsed && "rotate-90",
                              )}
                            />
                            {label}
                            <span className="text-caption font-normal text-muted-foreground">
                              {rows.length} {rows.length === 1 ? "row" : "rows"}
                            </span>
                            {showTotals &&
                              sumKeys.slice(0, 2).map((k) => (
                                <span
                                  key={k}
                                  className="ml-2 text-caption font-normal tnum text-muted-foreground"
                                >
                                  {columns.find((c) => c.key === k)?.label}:{" "}
                                  <span className="font-semibold text-foreground">
                                    {formatTotal(k, sumFor(rows, k))}
                                  </span>
                                </span>
                              ))}
                          </span>
                        </td>
                      </tr>
                      {!isCollapsed &&
                        rows.map((row, i) => {
                          cursor += 1;
                          return bodyRow(row, i, cursor);
                        })}
                    </>
                  );
                })
              : paged.map((row, i) => bodyRow(row, i, i))}
          </tbody>

          {showTotals && sumKeys.length > 0 && paged.length > 0 && (
            <tfoot className="sticky bottom-0 z-20">
              <tr className="border-t border-border-strong bg-subtle">
                {selectable && <td className="w-9 px-3" />}
                {visibleColumns.map((col, ci) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 py-2 align-middle text-body font-semibold",
                      col.align === "right" ? "text-right tnum" : "text-left",
                      columnDividers && ci > 0 && "[box-shadow:inset_1px_0_0_0_var(--color-border)]",
                      freezeFirstColumn && ci === 0 && "sticky left-0 z-10 bg-subtle",
                    )}
                  >
                    {ci === 0 && !sumKeys.includes(col.key) ? (
                      <span className="text-label text-muted-foreground">Total</span>
                    ) : sumKeys.includes(col.key) ? (
                      formatTotal(col.key, sumFor(sorted, col.key))
                    ) : null}
                  </td>
                ))}
                {rowActions && <td className="w-px" />}
              </tr>
            </tfoot>
          )}

          {onAddRow && (
            <tfoot>
              <tr>
                <td colSpan={colCount} className="px-3 py-0 [box-shadow:inset_0_1px_0_0_var(--color-border)]">
                  <button
                    type="button"
                    onClick={onAddRow}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-meta font-medium text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground hover:border-border-strong"
                  >
                    <Plus className="size-3.5" />
                    {addRowLabel}
                  </button>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────── */}
      {effectivePageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-subtle/60 px-3 py-2">
          <span className="text-caption tabular-nums text-muted-foreground">
            {currentPage * effectivePageSize + 1}–{Math.min((currentPage + 1) * effectivePageSize, sorted.length)} of{" "}
            {sorted.length.toLocaleString("en-IN")}
          </span>
          <div className="flex items-center gap-1">
            <PageBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>
              <ChevronLeft className="size-3.5" /> Prev
            </PageBtn>
            <span className="px-1.5 text-caption tabular-nums text-muted-foreground">
              {currentPage + 1} / {totalPages}
            </span>
            <PageBtn
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              Next <ChevronRight className="size-3.5" />
            </PageBtn>
          </div>
        </div>
      )}

      {/* ── Bulk action bar ───────────────────────────────────────
          Floats over the content rather than pushing it: the rows you
          selected must stay where they are while you decide. */}
      {selectable && bulkActions && selectedCount > 0 && (
        <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-elevated px-2 py-1.5 pl-3.5 shadow-overlay">
            <span className="text-meta font-semibold tabular-nums text-foreground">
              {selectedCount} selected
            </span>
            <span aria-hidden className="h-4 w-px bg-border" />
            {bulkActions(selectedRows, clearSelection)}
            <button
              onClick={clearSelection}
              aria-label="Clear selection"
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small internals ────────────────────────────────────────────────

function Checkbox({
  checked,
  indeterminate,
  onClick,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-4 items-center justify-center rounded-[4px] border transition-colors",
        checked || indeterminate
          ? "border-brand-strong bg-brand-strong text-white"
          : "border-border-strong bg-card hover:border-faint",
      )}
    >
      {indeterminate ? (
        <Minus className="size-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="size-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Popover({
  open,
  onOpenChange,
  trigger,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => onOpenChange(!open)}
        title={label}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-card px-2",
          "text-caption font-medium text-muted-foreground transition-colors",
          "hover:border-border-strong hover:text-foreground",
          open && "border-border-strong text-foreground",
        )}
      >
        {trigger}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />
          <div className="overlay-in absolute right-0 top-full z-50 mt-1 max-h-80 min-w-48 overflow-y-auto rounded-lg border border-border bg-elevated p-1 shadow-overlay scrollbar-thin">
            {children}
          </div>
        </>
      )}
    </div>
  );
}
