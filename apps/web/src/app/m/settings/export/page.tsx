"use client";

import { useState, useEffect } from "react";
import {
  Download, FileText, Loader2, Package, TrendingUp,
  Wallet, Receipt, Scale, BarChart3, FileSpreadsheet,
  CheckCircle2, FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";

interface ReportType {
  id: string;
  label: string;
  description: string;
  icon: typeof Package;
  hasDateRange: boolean;
  needsProject?: boolean;
}

const REPORTS: ReportType[] = [
  { id: "inventory-value", label: "Inventory Valuation", description: "Stock value by location & material", icon: Package, hasDateRange: false },
  { id: "purchase-trends", label: "Purchase Trends", description: "Procurement spend over time", icon: TrendingUp, hasDateRange: true },
  { id: "sales-revenue", label: "Sales Revenue", description: "Revenue from material & asset sales", icon: Wallet, hasDateRange: true },
  { id: "project-progress", label: "Project Progress", description: "Project costs, units, completion", icon: BarChart3, hasDateRange: false },
  { id: "payroll-expense", label: "Payroll Expense", description: "Salary & wage expenses", icon: Receipt, hasDateRange: true },
  { id: "pending-payments", label: "Pending Payments", description: "Outstanding payables & receivables", icon: Wallet, hasDateRange: false },
  { id: "trial-balance", label: "Trial Balance", description: "GL account balances (debit/credit)", icon: Scale, hasDateRange: true },
  { id: "stock-movements", label: "Stock Movements", description: "All IN/OUT/TRANSFER movements", icon: Package, hasDateRange: true },
  { id: "purchaser-performance", label: "Purchaser Performance", description: "Quote selection rates & savings", icon: TrendingUp, hasDateRange: true },
  { id: "stock-issue-summary", label: "Stock Issue Summary", description: "Material issues by project", icon: Package, hasDateRange: true },
  { id: "issue-register", label: "Issue Register", description: "Detailed issue challan register", icon: FileText, hasDateRange: true },
  { id: "purchase-register", label: "Purchase Register", description: "PO & goods receipt register", icon: FileText, hasDateRange: true },
];

export default function MobileExportPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const report = REPORTS.find((r) => r.id === selected);

  // Fetch projects for reports that need a project selection
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d)) {
          setProjects(d.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
        } else if (d?.items && Array.isArray(d.items)) {
          setProjects(d.items.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
        }
      })
      .catch(() => {});
  }, []);

  const handleDownload = async () => {
    if (!selected) return;
    setDownloading(true);
    setDownloaded(null);
    try {
      const params = new URLSearchParams({
        type: selected,
        format,
      });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (report?.needsProject && selectedProjectId) {
        params.set("projectId", selectedProjectId);
      }

      const res = await fetch(`/api/export?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Export failed");
      }

      // Get the file as a blob and trigger download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("content-disposition");
      const filename = disposition
        ? disposition.match(/filename="?([^"]+)"?/)?.[1]
        : `${selected}-${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : "xlsx"}`;
      a.download = filename ?? `${selected}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${report?.label} exported successfully`);
      setDownloaded(selected);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MobileBackButton fallback="/m/settings" />
        <div>
          <h1 className="text-[0.9375rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Bulk Export
          </h1>
          <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
            Download reports as Excel or CSV
          </p>
        </div>
      </div>

      {/* Report selection */}
      <div>
        <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--color-ink-500)" }}>
          Select Report
        </p>
        <div className="space-y-1.5">
          {REPORTS.map((r) => {
            const isSelected = selected === r.id;
            const Icon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => {
                  setSelected(r.id);
                  setDownloaded(null);
                }}
                className="w-full flex items-center gap-3 rounded-[0.625rem] border p-3 text-left press transition-colors"
                style={{
                  borderColor: isSelected ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: isSelected ? "var(--color-paper-2)" : "var(--color-paper)",
                }}
              >
                <div
                  className="grid place-items-center size-9 rounded-[0.5rem] shrink-0"
                  style={{ backgroundColor: "var(--color-concrete)" }}
                >
                  <Icon className="size-4" style={{ color: "var(--color-steel)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {r.label}
                  </p>
                  <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                    {r.description}
                  </p>
                </div>
                {isSelected ? (
                  <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Options panel — shown when a report is selected */}
      {report ? (
        <div
          className="rounded-[0.625rem] border p-3 space-y-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {/* Format */}
          <div>
            <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--color-ink-500)" }}>
              Format
            </p>
            <div className="flex gap-2">
              {(["xlsx", "csv"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className="flex items-center gap-1.5 rounded-[0.5rem] border px-3 py-2 text-[0.6875rem] font-bold press"
                  style={{
                    borderColor: format === f ? "var(--color-ink-950)" : "var(--color-line)",
                    backgroundColor: format === f ? "var(--color-ink-950)" : "var(--color-paper)",
                    color: format === f ? "#fff" : "var(--color-ink-700)",
                  }}
                >
                  {f === "xlsx" ? <FileSpreadsheet className="size-3.5" /> : <FileText className="size-3.5" />}
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Date range (if applicable) */}
          {report.hasDateRange ? (
            <div>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--color-ink-500)" }}>
                Date Range (optional)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[0.5rem] font-semibold block mb-0.5" style={{ color: "var(--color-ink-500)" }}>From</label>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                  />
                </div>
                <div>
                  <label className="text-[0.5rem] font-semibold block mb-0.5" style={{ color: "var(--color-ink-500)" }}>To</label>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] outline-none"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                  />
                </div>
              </div>
              <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                Defaults to current financial year if left blank.
              </p>
            </div>
          ) : null}

          {/* Project selector (if applicable) */}
          {report.needsProject ? (
            <div>
              <p className="text-[0.5625rem] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--color-ink-500)" }}>
                Project
              </p>
              <div className="relative">
                <FolderOpen
                  className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--color-ink-500)" }}
                />
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-[0.375rem] border pl-8 pr-2 py-1.5 text-[0.6875rem] outline-none appearance-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                >
                  <option value="">Select project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {projects.length === 0 ? (
                <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                  No projects available.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-[0.8125rem] font-bold press transition-transform active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {downloading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Download className="size-4" />
                <span>Download {format.toUpperCase()}</span>
              </>
            )}
          </button>

          {downloaded === selected && !downloading ? (
            <p className="text-[0.5625rem] text-center font-semibold" style={{ color: "var(--color-go)" }}>
              Downloaded! Check your files app.
            </p>
          ) : null}
        </div>
      ) : (
        <div
          className="rounded-[0.625rem] border p-6 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <FileText className="size-8 mx-auto mb-2" style={{ color: "var(--color-ink-500)" }} />
          <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
            Pick a report above to start export
          </p>
        </div>
      )}
    </div>
  );
}
