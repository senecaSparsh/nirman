"use client";

import { useState, useCallback, useEffect } from "react";
import { Receipt, Printer, FileText, Building2, User, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

type TdsSubcontractor = {
  subcontractorId: string;
  subcontractorName: string;
  trade: string | null;
  pan: string | null;
  billCount: number;
  totalGross: number;
  totalTds: number;
};

type TdsCertificate = {
  subcontractor: { id: string; name: string; gstin: string | null; pan: string | null; trade: string | null };
  company: { id: string; name: string; gstin: string | null; pan: string | null };
  financialYear: string;
  tdsRate: number;
  tdsSection: string;
  bills: Array<{
    raBillNumber: string;
    billDate: string;
    grossAmount: number;
    tdsAmount: number;
    workOrderNumber: string;
    projectName: string;
  }>;
  totalGross: number;
  totalTds: number;
  billCount: number;
};

function currentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const fyStart = month < 3 ? year - 1 : year;
  const fyEnd = (fyStart + 1).toString().slice(2);
  return `${fyStart}-${fyEnd}`;
}

export function TdsCertificatesView() {
  const [fy, setFy] = useState(currentFY());
  const [subcontractors, setSubcontractors] = useState<TdsSubcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TdsCertificate | null>(null);
  const [certLoading, setCertLoading] = useState(false);

  const fetchList = useCallback(() => {
    setLoading(true);
    fetch(`/api/subcontractors/tds-certificates?fy=${fy}`)
      .then((r) => r.json())
      .then((data) => setSubcontractors(data?.subcontractors ?? []))
      .catch(() => toast.error("Failed to load TDS data"))
      .finally(() => setLoading(false));
  }, [fy]);

  useEffect(() => { fetchList(); }, [fetchList]);

  function openCertificate(subId: string) {
    setCertLoading(true);
    fetch(`/api/subcontractors/tds-certificates/${subId}?fy=${fy}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSelected(data);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed"))
      .finally(() => setCertLoading(false));
  }

  const totalTds = subcontractors.reduce((s, x) => s + x.totalTds, 0);
  const totalGross = subcontractors.reduce((s, x) => s + x.totalGross, 0);

  const tdsColumns: Column<TdsSubcontractor>[] = [
    {
      key: "subcontractorName",
      label: "Subcontractor",
      sortable: true,
      filterable: true,
      render: (s) => <span className="font-medium text-foreground">{s.subcontractorName}</span>,
      filterValue: (s) => s.subcontractorName,
      exportValue: (s) => s.subcontractorName,
    },
    {
      key: "trade",
      label: "Trade",
      sortable: true,
      filterable: true,
      render: (s) => <span className="text-muted-foreground">{s.trade ?? "—"}</span>,
      filterValue: (s) => s.trade ?? "—",
      exportValue: (s) => s.trade ?? "",
    },
    {
      key: "pan",
      label: "PAN",
      sortable: true,
      render: (s) => <span className="font-mono text-caption">{s.pan ?? "—"}</span>,
      exportValue: (s) => s.pan ?? "",
    },
    {
      key: "billCount",
      label: "Bills",
      align: "right",
      sortable: true,
      render: (s) => <span className="tnum">{s.billCount}</span>,
      exportValue: (s) => s.billCount,
    },
    {
      key: "totalGross",
      label: "Gross Paid",
      align: "right",
      sortable: true,
      render: (s) => <span className="tnum">{formatCurrency(s.totalGross)}</span>,
      exportValue: (s) => s.totalGross,
    },
    {
      key: "totalTds",
      label: "TDS Deducted",
      align: "right",
      sortable: true,
      render: (s) => <span className="tnum font-semibold text-warning">{formatCurrency(s.totalTds)}</span>,
      exportValue: (s) => s.totalTds,
    },
  ];

  function tdsRowActions(s: TdsSubcontractor) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={certLoading}
        onClick={(e) => { e.stopPropagation(); openCertificate(s.subcontractorId); }}
      >
        <FileText className="mr-1 h-3.5 w-3.5" /> View Certificate
      </Button>
    );
  }

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No matches"
      description="Adjust the search or column filters."
    />
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5" /> TDS Certificates
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Form 16C-style certificates for subcontractors — Section 194C
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Field label="Financial Year">
            <Input
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              placeholder="2025-26"
              className="w-28"
            />
          </Field>
          <Button variant="outline" size="sm" onClick={fetchList} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Subcontractors</div>
          <div className="text-base font-bold tabular-nums">{subcontractors.length}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Total Gross Paid</div>
          <div className="text-base font-bold tabular-nums">{formatCurrency(totalGross)}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Total TDS Deducted</div>
          <div className="text-base font-bold tabular-nums text-amber-600">{formatCurrency(totalTds)}</div>
        </div>
      </div>

      {/* Subcontractor list */}
      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : subcontractors.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title={`No TDS deducted in FY ${fy}`}
          description="No paid RA bills with TDS found for this financial year."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={subcontractors}
            columns={tdsColumns}
            storageKey="tds-certificates"
            hideable
            exportFileName={`tds-summary-fy-${fy}`}
            initialSort={{ key: "totalTds", direction: "desc" }}
            searchable
            searchPlaceholder="Search subcontractor, trade, PAN…"
            rowActions={tdsRowActions}
            rowTone={(s) => (s.totalTds > 0 ? "warning" : null)}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Certificate dialog */}
      {selected && (
        <TdsCertificateDialog cert={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Certificate Dialog ──────────────────────────────────────

function TdsCertificateDialog({ cert, onClose }: { cert: TdsCertificate; onClose: () => void }) {
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="TDS Certificate"
      description={`Form 16C — Section ${cert.tdsSection} — FY ${cert.financialYear}`}
      size="xl"
      action={
        <Button size="sm" variant="outline" onClick={() => printTdsCertificate(cert)}>
          <Printer className="mr-1 h-3.5 w-3.5" /> Print
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Parties */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Deductor (Company)
            </div>
            <div className="text-sm font-semibold">{cert.company.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {cert.company.gstin && <div>GSTIN: {cert.company.gstin}</div>}
              {cert.company.pan && <div>PAN: {cert.company.pan}</div>}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1 flex items-center gap-1">
              <User className="h-3 w-3" /> Deductee (Subcontractor)
            </div>
            <div className="text-sm font-semibold">{cert.subcontractor.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {cert.subcontractor.trade && <div>Trade: {cert.subcontractor.trade}</div>}
              {cert.subcontractor.gstin && <div>GSTIN: {cert.subcontractor.gstin}</div>}
              {cert.subcontractor.pan && <div>PAN: {cert.subcontractor.pan}</div>}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-[10px] text-muted-foreground mb-0.5">TDS Section</div>
            <div className="text-sm font-semibold">{cert.tdsSection}</div>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-[10px] text-muted-foreground mb-0.5">TDS Rate</div>
            <div className="text-sm font-semibold tabular-nums">{cert.tdsRate}%</div>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-[10px] text-muted-foreground mb-0.5">Total Gross</div>
            <div className="text-sm font-semibold tabular-nums">{formatCurrency(cert.totalGross)}</div>
          </div>
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            <div className="text-[10px] text-muted-foreground mb-0.5">Total TDS</div>
            <div className="text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">{formatCurrency(cert.totalTds)}</div>
          </div>
        </div>

        {/* Bill-wise breakdown */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 text-[10px] uppercase text-muted-foreground tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left font-medium">RA Bill</th>
                <th className="px-3 py-2 text-left font-medium">Bill Date</th>
                <th className="px-3 py-2 text-left font-medium">Work Order</th>
                <th className="px-3 py-2 text-left font-medium">Project</th>
                <th className="px-3 py-2 text-right font-medium">Gross Amount</th>
                <th className="px-3 py-2 text-right font-medium">TDS Deducted</th>
              </tr>
            </thead>
            <tbody>
              {cert.bills.map((b) => (
                <tr key={b.raBillNumber} className="border-t border-border/40">
                  <td className="px-3 py-2 font-mono text-[11px]">{b.raBillNumber}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.billDate)}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{b.workOrderNumber}</td>
                  <td className="px-3 py-2 text-xs">{b.projectName}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{formatCurrency(b.grossAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-amber-600">{formatCurrency(b.tdsAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold">Total ({cert.billCount} bills)</td>
                <td className="px-3 py-2 text-right tabular-nums text-sm font-bold">{formatCurrency(cert.totalGross)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-sm font-bold text-amber-700 dark:text-amber-300">{formatCurrency(cert.totalTds)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {cert.billCount === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No TDS deducted for this subcontractor in FY {cert.financialYear}.
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── Print helper ────────────────────────────────────────────

function printTdsCertificate(cert: TdsCertificate) {
  const billsHtml = cert.bills.map((b) => `
    <tr>
      <td>${b.raBillNumber}</td>
      <td>${formatDate(b.billDate)}</td>
      <td>${b.workOrderNumber}</td>
      <td>${b.projectName}</td>
      <td style="text-align:right">${formatCurrency(b.grossAmount)}</td>
      <td style="text-align:right">${formatCurrency(b.tdsAmount)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>TDS Certificate — ${cert.subcontractor.name} — FY ${cert.financialYear}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .header { text-align: center; margin-bottom: 16px; }
  .header h1 { font-size: 18px; }
  .header .sub { font-size: 11px; color: #666; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .party { border: 1px solid #ddd; border-radius: 4px; padding: 10px; }
  .party .label { font-size: 9px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
  .party .name { font-weight: bold; font-size: 12px; }
  .party .details { font-size: 10px; color: #555; margin-top: 4px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
  .summary div { background: #f5f5f5; padding: 8px; border-radius: 4px; }
  .summary .label { font-size: 9px; text-transform: uppercase; color: #666; }
  .summary .value { font-weight: bold; font-size: 13px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 10px; }
  th { background: #f5f5f5; text-align: left; }
  .total-row { font-weight: bold; background: #f9f9f9; }
  .signature { margin-top: 40px; display: flex; justify-content: space-between; }
  .signature div { border-top: 1px solid #333; padding-top: 4px; width: 200px; font-size: 10px; color: #666; }
  .footer { margin-top: 20px; font-size: 9px; color: #999; text-align: center; }
</style></head><body>
  <div class="header">
    <h1>Form 16C — TDS Certificate</h1>
    <div class="sub">Section ${cert.tdsSection} of the Income Tax Act, 1961 — Financial Year ${cert.financialYear}</div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="label">Deductor</div>
      <div class="name">${cert.company.name}</div>
      <div class="details">
        ${cert.company.gstin ? `GSTIN: ${cert.company.gstin}<br>` : ""}
        ${cert.company.pan ? `PAN: ${cert.company.pan}<br>` : ""}
      </div>
    </div>
    <div class="party">
      <div class="label">Deductee (Subcontractor)</div>
      <div class="name">${cert.subcontractor.name}</div>
      <div class="details">
        ${cert.subcontractor.trade ? `Trade: ${cert.subcontractor.trade}<br>` : ""}
        ${cert.subcontractor.gstin ? `GSTIN: ${cert.subcontractor.gstin}<br>` : ""}
        ${cert.subcontractor.pan ? `PAN: ${cert.subcontractor.pan}<br>` : ""}
      </div>
    </div>
  </div>

  <div class="summary">
    <div><div class="label">TDS Section</div><div class="value">${cert.tdsSection}</div></div>
    <div><div class="label">TDS Rate</div><div class="value">${cert.tdsRate}%</div></div>
    <div><div class="label">Total Gross</div><div class="value">${formatCurrency(cert.totalGross)}</div></div>
    <div><div class="label">Total TDS</div><div class="value">${formatCurrency(cert.totalTds)}</div></div>
  </div>

  <h2>Bill-wise TDS Details</h2>
  <table>
    <thead><tr>
      <th>RA Bill</th><th>Bill Date</th><th>Work Order</th><th>Project</th>
      <th style="text-align:right">Gross Amount</th><th style="text-align:right">TDS Deducted</th>
    </tr></thead>
    <tbody>${billsHtml}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="4" style="text-align:right">Total (${cert.billCount} bills)</td>
      <td style="text-align:right">${formatCurrency(cert.totalGross)}</td>
      <td style="text-align:right">${formatCurrency(cert.totalTds)}</td>
    </tr></tfoot>
  </table>

  <div class="signature">
    <div>Authorised Signatory<br>(Deductor)</div>
    <div>Received by<br>(Deductee)</div>
  </div>

  <div class="footer">
    This is a system-generated certificate from Nirman Inventory OS. Verify with TDS return (Form 26Q) filed with TRACES.
  </div>
</body></html>`;

  const printWindow = window.open("", "_blank", "width=800,height=600");
  if (!printWindow) {
    toast.error("Pop-up blocked. Please allow pop-ups to print the certificate.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); }, 300);
}
