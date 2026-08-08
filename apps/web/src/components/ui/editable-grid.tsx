"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════
 * EDITABLE GRID — a spreadsheet-grade data entry grid
 *
 * This is NOT a replacement for DataTable. DataTable is for read-only
 * lists with sorting. EditableGrid is for line-item entry inside
 * dialogs and forms — where the user is actively typing numbers into
 * cells, tabbing between them, and pasting from Excel.
 *
 * Features:
 *  1. Inline cell editing — click or keyboard-navigate to a cell,
 *     type to replace, Enter/Tab to commit.
 *  2. Keyboard navigation — Arrow keys, Tab (next cell), Shift+Tab
 *     (prev cell), Enter (next row), Escape (cancel edit).
 *  3. Computed columns — a column whose value is derived from other
 *     columns in the same row (e.g. qty × rate = amount). Read-only,
 *     recalculated on every keystroke.
 *  4. Row totals — a sticky footer row showing column sums.
 *  5. Copy-paste from Excel — paste a tab-separated block into the
 *     grid; it fills cells starting from the focused cell.
 *  6. Validation — cells can have min/max/required; invalid cells
 *     get a red ring.
 *
 * The grid is uncontrolled internally but calls `onChange` with the
 * full row array on every edit so the parent can submit/validate.
 * ═══════════════════════════════════════════════════════════════════
 */

export interface EditableColumn<R> {
  /** Unique key — matches a property on the row object. */
  key: string;
  /** Header label. */
  label: string;
  /**
   * "text" | "number" — controls the input type and parsing.
   * "select" — dropdown with options.
   * "computed" — read-only, derived from `compute`.
   * "readonly" — displayed but not editable (e.g. material name).
   */
  type: "text" | "number" | "select" | "computed" | "readonly";
  /** For "computed" columns: function deriving value from the row. */
  compute?: (row: R) => string | number;
  /** For "select" columns: the options. */
  options?: { value: string; label: string }[];
  /** For "number" columns: step, min, max. */
  step?: string;
  min?: number;
  max?: number;
  /** Placeholder for empty cells. */
  placeholder?: string;
  /** Right-align (for numbers). Default: type === "number" || "computed". */
  align?: "left" | "right";
  /** Width hint — e.g. "120px" or "1fr". */
  width?: string;
  /** Extra className on cells in this column. Can be a function of the row for per-cell styling. */
  cellClassName?: string | ((row: R) => string);
  /** Format function for display in computed/readonly cells. */
  format?: (value: string | number) => string;
}

export interface EditableGridProps<R> {
  columns: EditableColumn<R>[];
  rows: R[];
  onChange: (rows: R[]) => void;
  /** Stable ID for each row. Defaults to index. */
  getRowId?: (row: R, index: number) => string;
  /** Show the sticky footer totals row. Default: true. */
  showTotals?: boolean;
  /** Which columns to sum in the footer. Defaults to all "number" columns. */
  sumColumns?: string[];
  /** Extra className on the wrapper. */
  className?: string;
  /** Empty-state node. */
  emptyState?: React.ReactNode;
  /** Per-row action buttons rendered in a trailing column. */
  actions?: {
    icon: React.ReactNode;
    title: string;
    onClick: (row: R, index: number) => void;
    className?: string;
    show?: (row: R) => boolean;
  }[];
}

type CellPos = { row: number; col: number } | null;

export function EditableGrid<R extends Record<string, unknown>>({
  columns,
  rows,
  onChange,
  getRowId = (_row, i) => String(i),
  showTotals = true,
  sumColumns,
  className,
  emptyState,
  actions,
}: EditableGridProps<R>) {
  const [editing, setEditing] = useState<CellPos>(null);
  const [selected, setSelected] = useState<CellPos>(null);
  const [draft, setDraft] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve per-cell className (supports string or function of row)
  const cellClass = useCallback(
    (col: EditableColumn<R>, row: R) =>
      typeof col.cellClassName === "function" ? col.cellClassName(row) : col.cellClassName,
    [],
  );

  // Columns that are actually editable
  const editableCols = useMemo(
    () => columns.filter((c) => c.type === "text" || c.type === "number" || c.type === "select").map((c) => c.key),
    [columns],
  );

  // Navigate to the next editable cell
  const move = useCallback(
    (dir: "right" | "left" | "down" | "up") => {
      setSelected((prev) => {
        if (!prev) return { row: 0, col: editableCols.length ? 0 : -1 };
        let { row, col } = prev;
        const colKey = columns[col]?.key;
        if (!colKey) return prev;
        const colIdx = editableCols.indexOf(colKey);

        if (dir === "right") {
          if (colIdx < editableCols.length - 1) {
            col = columns.findIndex((c) => c.key === editableCols[colIdx + 1]);
          } else {
            row = Math.min(row + 1, rows.length - 1);
            col = columns.findIndex((c) => c.key === editableCols[0]);
          }
        } else if (dir === "left") {
          if (colIdx > 0) {
            col = columns.findIndex((c) => c.key === editableCols[colIdx - 1]);
          } else if (row > 0) {
            row = row - 1;
            col = columns.findIndex((c) => c.key === editableCols[editableCols.length - 1]);
          }
        } else if (dir === "down") {
          row = Math.min(row + 1, rows.length - 1);
        } else if (dir === "up") {
          row = Math.max(row - 1, 0);
        }
        return { row, col };
      });
    },
    [columns, editableCols, rows.length],
  );

  // Start editing the current cell
  const startEdit = useCallback(
    (row: number, col: number) => {
      const colDef = columns[col];
      if (!colDef || colDef.type === "computed" || colDef.type === "readonly") return;
      const val = rows[row]?.[colDef.key];
      setDraft(val != null ? String(val) : "");
      setEditing({ row, col });
    },
    [columns, rows],
  );

  // Update a select cell immediately (no draft needed)
  const updateSelect = useCallback(
    (row: number, colKey: string, value: string) => {
      const newRows = [...rows];
      newRows[row] = { ...newRows[row], [colKey]: value } as R;
      onChange(newRows);
    },
    [rows, onChange],
  );

  // Commit the current edit
  const commitEdit = useCallback(() => {
    if (!editing) return;
    const { row, col } = editing;
    const colDef = columns[col];
    if (!colDef) return;

    let parsed: unknown = draft;
    if (colDef.type === "number") {
      parsed = draft === "" ? undefined : Number(draft);
      if (parsed != null && isNaN(parsed as number)) parsed = undefined;
    }

    const newRows = [...rows];
    newRows[row] = { ...newRows[row], [colDef.key]: parsed } as R;
    onChange(newRows);
    setEditing(null);
  }, [editing, draft, columns, rows, onChange]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditing(null);
    setDraft("");
  }, []);

  // Focus the input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Handle paste from Excel (tab-separated values)
  const handlePaste = useCallback(
    (e: React.ClipboardEvent, startRow: number, startCol: number) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text || !text.includes("\t")) return; // not a multi-cell paste
      e.preventDefault();

      const pasteRows = text.split("\n").filter((r) => r.trim());
      const newRows = [...rows];
      const startColKey = columns[startCol]?.key;
      if (!startColKey) return;
      const startColIdx = editableCols.indexOf(startColKey);

      pasteRows.forEach((pasteRow, dr) => {
        const cells = pasteRow.split("\t");
        const targetRow = startRow + dr;
        if (targetRow >= rows.length) return;

        cells.forEach((cellVal, dc) => {
          const targetColKey = editableCols[startColIdx + dc];
          if (!targetColKey) return;
          const colDef = columns.find((c) => c.key === targetColKey);
          if (!colDef) return;

          let parsed: unknown = cellVal.trim();
          if (colDef.type === "number") {
            parsed = cellVal.trim() === "" ? undefined : Number(cellVal.trim());
            if (isNaN(parsed as number)) parsed = undefined;
          }
          newRows[targetRow] = { ...newRows[targetRow], [targetColKey]: parsed } as R;
        });
      });

      onChange(newRows);
    },
    [columns, editableCols, rows, onChange],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editing) {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEdit();
          move("down");
        } else if (e.key === "Tab") {
          e.preventDefault();
          commitEdit();
          move(e.shiftKey ? "left" : "right");
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        }
        return;
      }

      if (!selected) return;

      if (e.key === "ArrowRight" || e.key === "Tab") {
        e.preventDefault();
        move(e.key === "Tab" && e.shiftKey ? "left" : "right");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        move("left");
      } else if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        move("down");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move("up");
      } else if (e.key === "F2" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
        // Start editing on any printable key or F2
        e.preventDefault();
        startEdit(selected.row, selected.col);
        if (e.key.length === 1) setDraft(e.key);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const colDef = columns[selected.col];
        if (!colDef || colDef.type === "computed" || colDef.type === "readonly") return;
        const newRows = [...rows];
        newRows[selected.row] = { ...newRows[selected.row], [colDef.key]: undefined } as R;
        onChange(newRows);
      }
    },
    [editing, selected, move, startEdit, commitEdit, cancelEdit, columns, rows, onChange],
  );

  // Compute totals for footer
  const totals = useMemo(() => {
    const colsToSum = sumColumns ?? editableCols;
    const result: Record<string, number> = {};
    for (const key of colsToSum) {
      result[key] = rows.reduce((sum, r) => {
        const v = r[key];
        return sum + (typeof v === "number" && !isNaN(v) ? v : 0);
      }, 0);
    }
    return result;
  }, [rows, sumColumns, editableCols]);

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-auto scrollbar-thin outline-none", className)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <table className="w-full border-collapse text-body">
        <thead className="sticky top-0 z-10 bg-subtle border-b border-border">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "h-8 whitespace-nowrap px-2 text-label font-medium text-muted-foreground/80 align-middle",
                  (col.align === "right" || col.type === "number" || col.type === "computed") && "text-right",
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
            {actions && actions.length > 0 && (
              <th className="h-8 px-1 text-label font-medium text-muted-foreground/80" style={{ width: `${actions.length * 28 + 8}px` }}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={getRowId(row, ri)}
              className="border-b border-border/70 transition-colors hover:bg-subtle/50"
            >
              {columns.map((col, ci) => {
                const isEditing = editing?.row === ri && editing?.col === ci;
                const isSelected = selected?.row === ri && selected?.col === ci;
                const isEditable = col.type === "text" || col.type === "number";

                // Computed column
                if (col.type === "computed" && col.compute) {
                  const val = col.compute(row);
                  const display = col.format ? col.format(val) : String(val);
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-2 py-1.5 align-middle tnum text-right",
                        cellClass(col, row),
                      )}
                    >
                      {display}
                    </td>
                  );
                }

                // Readonly column
                if (col.type === "readonly") {
                  const val = row[col.key];
                  const display = col.format && val != null ? col.format(val as string | number) : (val as React.ReactNode);
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-2 py-1.5 align-middle text-body",
                        cellClass(col, row),
                      )}
                    >
                      {display ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  );
                }

                // Editable cell
                const val = row[col.key];
                const isRight = col.align === "right" || col.type === "number";
                const hasError =
                  col.type === "number" &&
                  val != null &&
                  ((col.min != null && (val as number) < col.min) ||
                   (col.max != null && (val as number) > col.max));

                // Select column — always shows a dropdown, no draft state
                if (col.type === "select") {
                  const selectedOpt = col.options?.find((o) => o.value === val);
                  return (
                    <td
                      key={col.key}
                      className={cn("px-0.5 py-0 align-middle", cellClass(col, row))}
                      onClick={() => setSelected({ row: ri, col: ci })}
                    >
                      <select
                        value={(val as string) ?? ""}
                        onChange={(e) => {
                          updateSelect(ri, col.key, e.target.value);
                        }}
                        className={cn(
                          "w-full h-8 px-2 bg-transparent border border-transparent rounded-sm outline-none cursor-cell text-body",
                          isSelected && "border-foreground/20 bg-accent",
                          !val && "text-muted-foreground/40",
                          "hover:border-border focus:border-foreground focus:ring-1 focus:ring-foreground/20",
                        )}
                      >
                        <option value="" disabled>{col.placeholder ?? "Select…"}</option>
                        {col.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                  );
                }

                return (
                  <td
                    key={col.key}
                    className={cn(
                      "px-0.5 py-0 align-middle relative",
                      isRight && "text-right tnum",
                      cellClass(col, row),
                    )}
                    onClick={() => {
                      setSelected({ row: ri, col: ci });
                      if (!isEditing) startEdit(ri, ci);
                    }}
                    onPaste={(e) => handlePaste(e, ri, ci)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        type={col.type === "number" ? "number" : "text"}
                        step={col.step}
                        min={col.min}
                        max={col.max}
                        value={draft}
                        placeholder={col.placeholder}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitEdit(); move("down"); }
                          else if (e.key === "Tab") { e.preventDefault(); commitEdit(); move(e.shiftKey ? "left" : "right"); }
                          else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                        }}
                        className={cn(
                          "w-full h-8 px-2 bg-background border border-border rounded-sm outline-none",
                          isRight && "text-right tnum",
                          hasError && "border-danger ring-1 ring-danger/30",
                          "focus:border-foreground focus:ring-1 focus:ring-foreground/20",
                        )}
                      />
                    ) : (
                      <div
                        className={cn(
                          "h-8 px-2 flex items-center text-body cursor-cell rounded-sm transition-colors",
                          isRight && "justify-end",
                          isSelected && "bg-accent ring-1 ring-inset ring-foreground/20",
                          hasError && "text-danger",
                          val == null || val === "" ? "text-muted-foreground/40" : "",
                        )}
                      >
                        {val != null && val !== ""
                          ? col.format
                            ? col.format(val as string | number)
                            : String(val)
                          : col.placeholder ?? ""}
                      </div>
                    )}
                  </td>
                );
              })}
              {actions && actions.length > 0 && (
                <td className="px-1 py-0 align-middle">
                  <div className="flex h-8 items-center gap-0.5">
                    {actions.map((a, ai) => {
                      if (a.show && !a.show(row)) return null;
                      return (
                        <button
                          key={ai}
                          type="button"
                          title={a.title}
                          onClick={(e) => { e.stopPropagation(); a.onClick(row, ri); }}
                          className={cn("rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", a.className)}
                        >
                          {a.icon}
                        </button>
                      );
                    })}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {showTotals && rows.length > 0 && (
          <tfoot className="sticky bottom-0 z-10 bg-subtle border-t-2 border-border">
            <tr className="font-semibold">
              {columns.map((col) => {
                const isSumCol = (sumColumns ?? editableCols).includes(col.key);
                if (isSumCol) {
                  const total = totals[col.key] ?? 0;
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-2 py-2 align-middle tnum text-right text-body",
                        col.cellClassName,
                      )}
                    >
                      {col.format ? col.format(total) : total}
                    </td>
                  );
                }
                // First non-sum column gets "Total" label
                const firstNonSum = columns.find((c) => !(sumColumns ?? editableCols).includes(c.key));
                if (firstNonSum && col.key === firstNonSum.key) {
                  return (
                    <td key={col.key} className="px-2 py-2 align-middle text-body font-semibold">
                      Total
                    </td>
                  );
                }
                return <td key={col.key} className="px-2 py-2" />;
              })}
              {actions && actions.length > 0 && <td className="px-1 py-2" />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
