/**
 * CSV export utility — converts an array of row objects into a CSV
 * string and triggers a browser download. Used by data tables across
 * the app for audit trails, reports, and data export.
 */

export interface ColumnDef {
  /** Property name on the row object (may be dotted, e.g. "customer.name") */
  key: string;
  /** Column header in the CSV */
  label: string;
  /** Optional formatter function */
  format?: (value: unknown, row: Record<string, unknown>) => string;
}

/**
 * Convert an array of rows to a CSV string.
 */
export function toCSV(rows: Record<string, unknown>[], columns: ColumnDef[]): string {
  if (rows.length === 0) {
    return columns.map((c) => c.label).join(",") + "\n";
  }

  const escapeCell = (val: string): string => {
    // Escape quotes by doubling them, wrap in quotes if contains comma/quote/newline
    if (/[",\n\r]/.test(val)) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object") {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  };

  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const raw = getNestedValue(row, col.key);
          const formatted = col.format ? col.format(raw, row) : raw == null ? "" : String(raw);
          return escapeCell(formatted);
        })
        .join(","),
    )
    .join("\n");

  return header + "\n" + body;
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCSV(filename: string, rows: Record<string, unknown>[], columns: ColumnDef[]): void {
  const csv = toCSV(rows, columns);
  // Add BOM for Excel UTF-8 compatibility
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

/**
 * Trigger an Excel (XLSX) or CSV file download from the server-side
 * /api/export endpoint. The server generates the formatted workbook
 * with proper number formats, summary rows, and auto-filters.
 *
 * @param type - Report type key (e.g. "inventory-value", "trial-balance")
 * @param params - Optional query params (from, to, asOn, projectId, format)
 */
export async function downloadExcel(
  type: string,
  params?: { from?: string; to?: string; asOn?: string; projectId?: string; format?: "xlsx" | "csv" },
): Promise<void> {
  const searchParams = new URLSearchParams();
  searchParams.set("type", type);
  searchParams.set("format", params?.format ?? "xlsx");
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  if (params?.asOn) searchParams.set("asOn", params.asOn);
  if (params?.projectId) searchParams.set("projectId", params.projectId);

  const res = await fetch(`/api/export?${searchParams.toString()}`);
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  // Extract filename from Content-Disposition header, or derive from type
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const ext = params?.format === "csv" ? "csv" : "xlsx";
  link.download = filenameMatch?.[1] ?? `${type}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
