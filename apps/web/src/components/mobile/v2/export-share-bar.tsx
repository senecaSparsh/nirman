"use client";

import * as React from "react";
import { Download, Share2, FileSpreadsheet, FileText, Check } from "lucide-react";

/**
 * MobileExportShareBar — sticky action bar for downloading and sharing
 * list/report data on the mobile surface.
 *
 * Features:
 * - CSV download (client-side, works offline)
 * - Excel download (server-side via /api/export, for report types that support it)
 * - Web Share API (navigator.share) with clipboard fallback
 * - Compact, touch-friendly design matching the warm mobile palette
 *
 * Uses MobileColumnSpec (format type strings) instead of function-based
 * ColumnDef so it can be passed from Server Components without
 * serialization errors.
 */

/** Column spec that is safe to pass from Server → Client Components. */
export interface MobileColumnSpec {
  /** Property name on the row object (may be dotted, e.g. "customer.name") */
  key: string;
  /** Column header in the CSV */
  label: string;
  /** Optional format type — handled client-side */
  format?: "currency" | "date" | "number" | "percent";
}

interface MobileExportShareBarProps {
  /** Report/list title — used in filenames and share text */
  title: string;
  /** Row data for CSV export (must be plain serializable objects) */
  rows: Record<string, unknown>[];
  /** Column specifications for CSV export */
  columns: MobileColumnSpec[];
  /** Server-side export type key (e.g. "inventory-value") for Excel via /api/export.
   *  If omitted, only CSV download is available. */
  exportType?: string;
  /** Optional params for server-side export (from, to, asOn, projectId) */
  exportParams?: { from?: string; to?: string; asOn?: string; projectId?: string };
  /** Optional summary text for sharing (e.g. "Total: ₹1,23,456 · 5 deals") */
  summary?: string;
}

/** Format a value based on the format type. */
function formatValue(value: unknown, format?: MobileColumnSpec["format"]): string {
  if (value == null) return "";
  switch (format) {
    case "currency":
      return formatCurrency(Number(value));
    case "date":
      return formatDate(String(value));
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "number":
      return String(value);
    default:
      return String(value);
  }
}

/** Indian-style currency formatter (client-side, matches lib/utils). */
function formatCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const paise = Math.round((abs - whole) * 100);
  const wholeStr = whole.toLocaleString("en-IN");
  const paiseStr = paise > 0 ? `.${String(paise).padStart(2, "0")}` : "";
  return `${sign}₹${wholeStr}${paiseStr}`;
}

/** Date formatter (client-side, matches lib/utils). */
function formatDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Get nested value from object by dotted path. */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Escape a cell value for CSV. */
function escapeCell(val: string): string {
  if (/[",\n\r]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/** Convert rows + columns to a CSV string (client-side). */
function toCSV(rows: Record<string, unknown>[], columns: MobileColumnSpec[]): string {
  if (rows.length === 0) {
    return columns.map((c) => escapeCell(c.label)).join(",") + "\n";
  }
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const raw = getNestedValue(row, col.key);
          const formatted = formatValue(raw, col.format);
          return escapeCell(formatted);
        })
        .join(","),
    )
    .join("\n");
  return header + "\n" + body;
}

/** Trigger a CSV file download in the browser. */
function downloadCSVFile(filename: string, rows: Record<string, unknown>[], columns: MobileColumnSpec[]): void {
  const csv = toCSV(rows, columns);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function MobileExportShareBar({
  title,
  rows,
  columns,
  exportType,
  exportParams,
  summary,
}: MobileExportShareBarProps) {
  const [downloading, setDownloading] = React.useState(false);
  const [shared, setShared] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);

  const filename = `${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;

  async function handleCSV() {
    downloadCSVFile(filename, rows, columns);
    setShowMenu(false);
  }

  async function handleExcel() {
    if (!exportType) return;
    setDownloading(true);
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("type", exportType);
      searchParams.set("format", "xlsx");
      if (exportParams?.from) searchParams.set("from", exportParams.from);
      if (exportParams?.to) searchParams.set("to", exportParams.to);
      if (exportParams?.asOn) searchParams.set("asOn", exportParams.asOn);
      if (exportParams?.projectId) searchParams.set("projectId", exportParams.projectId);

      const res = await fetch(`/api/export?${searchParams.toString()}`);
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      link.download = filenameMatch?.[1] ?? `${exportType}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback to CSV if Excel fails
      downloadCSVFile(filename, rows, columns);
    } finally {
      setDownloading(false);
      setShowMenu(false);
    }
  }

  async function handleShare() {
    const shareText = summary ? `${title}\n${summary}` : title;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // User cancelled — no action needed
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // Clipboard failed
      }
    }
    setShowMenu(false);
  }

  if (rows.length === 0) return null;

  return (
    <div className="relative">
      {/* Action bar */}
      <div
        className="flex items-center gap-1.5 rounded-[0.625rem] border p-1.5"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        <button
          onClick={() => setShowMenu(!showMenu)}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-[0.5rem] px-3 h-9 press active:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: "var(--color-concrete)" }}
        >
          <Download className="size-3.5" style={{ color: "var(--color-ink-700)" }} />
          <span className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            {downloading ? "Exporting…" : "Export"}
          </span>
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-[0.5rem] px-3 h-9 press active:opacity-80 flex-1 justify-center"
          style={{ backgroundColor: "var(--color-ink-950)" }}
        >
          {shared ? (
            <Check className="size-3.5" style={{ color: "var(--color-go)" }} />
          ) : (
            <Share2 className="size-3.5" style={{ color: "#fff" }} />
          )}
          <span className="text-[0.6875rem] font-semibold" style={{ color: shared ? "var(--color-go)" : "#fff" }}>
            {shared ? "Shared" : "Share"}
          </span>
        </button>
      </div>

      {/* Export dropdown */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className="absolute z-50 top-full left-0 right-0 mt-1 rounded-[0.625rem] border overflow-hidden"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
          >
            <button
              onClick={handleCSV}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 press active:opacity-80 text-left"
            >
              <FileText className="size-4 shrink-0" style={{ color: "var(--color-ink-600)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
                  Download CSV
                </p>
                <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  {rows.length} rows · opens in Excel/Sheets
                </p>
              </div>
            </button>
            {exportType && (
              <button
                onClick={handleExcel}
                disabled={downloading}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 press active:opacity-80 text-left border-t disabled:opacity-40"
                style={{ borderColor: "var(--color-line)" }}
              >
                <FileSpreadsheet className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[0.75rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
                    {downloading ? "Generating…" : "Download Excel"}
                  </p>
                  <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                    Formatted workbook with summary
                  </p>
                </div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
