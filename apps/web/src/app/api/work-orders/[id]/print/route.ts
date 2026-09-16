import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, requirePermission, toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatCurrencyDetailed } from "@/lib/utils";

/**
 * GET /api/work-orders/[id]/print — printable subcontractor work order.
 * Returns a standalone HTML doc (the mobile doc-viewer iframes it; the
 * embedded script auto-triggers the print dialog).
 */

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const wo = await prisma.subcontractorWorkOrder.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("SubcontractorWorkOrder") },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { name: true } },
      subcontractor: { select: { name: true, phone: true, gstin: true, trade: true } },
      lines: {
        include: {
          boqItem: { select: { serialNo: true, description: true, unit: true, estimatedQty: true } },
        },
      },
      raBills: {
        select: { raBillNumber: true, status: true, netPayable: true, billDate: true },
        orderBy: { billDate: "asc" },
      },
    },
  });

  if (!wo) {
    return new Response("<html><body><h1>Work order not found</h1></body></html>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  const fmtDate = (d: Date | null | undefined) =>
    d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
  const fmtCurrency = (n: number) => formatCurrencyDetailed(n);
  const fmtNumber = (n: number, decimals = 0) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(n);

  const contractTotal = wo.lines.reduce(
    (s, l) => s + toNum(l.boqItem.estimatedQty) * toNum(l.agreedRate),
    0,
  );

  const lineRows = wo.lines.length
    ? wo.lines
        .map(
          (l) => `
        <tr>
          <td>${esc(l.boqItem.serialNo)}</td>
          <td>${esc(l.boqItem.description)}</td>
          <td style="text-align:right">${fmtNumber(toNum(l.boqItem.estimatedQty), 3)} ${esc(l.boqItem.unit ?? "")}</td>
          <td style="text-align:right">${fmtCurrency(toNum(l.agreedRate))}</td>
          <td style="text-align:right">${fmtCurrency(toNum(l.boqItem.estimatedQty) * toNum(l.agreedRate))}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" style="text-align:center;color:#888">No scope lines</td></tr>`;

  const raBillRows = wo.raBills.length
    ? wo.raBills
        .map(
          (b) => `
        <tr>
          <td>${esc(b.raBillNumber)}</td>
          <td>${esc(b.status)}</td>
          <td>${fmtDate(b.billDate)}</td>
          <td style="text-align:right">${fmtCurrency(toNum(b.netPayable))}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="text-align:center;color:#888">No RA bills raised yet</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Work Order ${esc(wo.workOrderNumber)} — ${esc(wo.project.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; padding: 24px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 4px; }
  h2 { font-size: 1rem; margin: 20px 0 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
  .meta { color: #666; font-size: 0.8125rem; margin-bottom: 16px; }
  .meta span { margin-right: 16px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; background: #e5e7eb; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 0.8125rem; }
  th, td { padding: 6px 8px; border: 1px solid #ddd; }
  th { background: #f5f5f5; text-align: left; font-size: 0.6875rem; text-transform: uppercase; }
  .total-row td { font-weight: 700; border-top: 2px solid #333; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 12px; font-size: 0.8125rem; }
  .label { font-weight: 700; font-size: 0.6875rem; text-transform: uppercase; color: #888; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
  .sign div { border-top: 1px solid #333; padding-top: 6px; font-size: 0.75rem; color: #555; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 0.6875rem; color: #888; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <h1>Work Order</h1>
  <div class="meta">
    <span><strong>${esc(wo.workOrderNumber)}</strong></span>
    <span class="badge">${esc(wo.status)}</span>
    <span><strong>Issued:</strong> ${fmtDate(wo.issueDate)}</span>
  </div>

  <h2>Parties &amp; Site</h2>
  <div class="grid">
    <div><div class="label">Subcontractor</div>${esc(wo.subcontractor.name)}${wo.subcontractor.phone ? ` · ${esc(wo.subcontractor.phone)}` : ""}${wo.subcontractor.trade ? ` · ${esc(wo.subcontractor.trade)}` : ""}</div>
    <div><div class="label">Project</div>${esc(wo.project.name)}${wo.phase ? ` — ${esc(wo.phase.name)}` : ""}</div>
    ${wo.subcontractor.gstin ? `<div><div class="label">GSTIN</div>${esc(wo.subcontractor.gstin)}</div>` : ""}
    <div><div class="label">Work period</div>${fmtDate(wo.startDate)} → ${fmtDate(wo.endDate)}</div>
  </div>

  <h2>Work</h2>
  <div class="grid">
    <div style="grid-column:1/-1"><div class="label">Title</div>${esc(wo.workTitle)}</div>
    ${wo.description ? `<div style="grid-column:1/-1"><div class="label">Description</div>${esc(wo.description)}</div>` : ""}
  </div>

  <h2>Scope — BOQ Lines</h2>
  <table>
    <thead><tr><th>Sr.</th><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Agreed Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${lineRows}
      <tr class="total-row"><td colspan="4">Contract Value</td><td style="text-align:right">${fmtCurrency(contractTotal)}</td></tr>
    </tbody>
  </table>

  <h2>Commercial Terms</h2>
  <div class="grid">
    <div><div class="label">Retention</div>${toNum(wo.retentionPct)}% per bill (released after ${wo.defectLiabilityMonths} mo defect liability)</div>
    <div><div class="label">TDS</div>${toNum(wo.tdsPct)}% (${esc(wo.tdsCategory)})</div>
    ${toNum(wo.advanceAmount) > 0 ? `<div><div class="label">Advance</div>${fmtCurrency(toNum(wo.advanceAmount))} — recovered @ ${toNum(wo.advanceRecoveryPct)}%/bill</div>` : ""}
  </div>

  <h2>Billing Summary</h2>
  <div class="grid">
    <div><div class="label">Work done</div>${fmtCurrency(toNum(wo.totalWorkDone))}</div>
    <div><div class="label">Deductions</div>${fmtCurrency(toNum(wo.totalDeductions))}</div>
    <div><div class="label">Paid</div>${fmtCurrency(toNum(wo.totalPaid))}</div>
    <div><div class="label">Retention held</div>${fmtCurrency(toNum(wo.retentionBalance))}</div>
  </div>

  <h2>RA Bills</h2>
  <table>
    <thead><tr><th>Bill No.</th><th>Status</th><th>Date</th><th style="text-align:right">Net Payable</th></tr></thead>
    <tbody>${raBillRows}</tbody>
  </table>

  <div class="sign">
    <div>Company Representative</div>
    <div>Subcontractor — ${esc(wo.subcontractor.name)}</div>
  </div>

  <div class="footer">
    Nirman Inventory OS — Work Order Printout · Generated ${new Date().toLocaleString("en-IN")}
  </div>

  <script>window.print();</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
