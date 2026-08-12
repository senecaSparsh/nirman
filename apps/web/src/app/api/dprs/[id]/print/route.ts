import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.DPR_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const dpr = await prisma.dailyProgressReport.findFirst({
    where: { id, companyId: company.id },
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      subAdminApprovedBy: { select: { name: true } },
      adminApprovedBy: { select: { name: true } },
      materialLines: {
        include: { material: { select: { name: true, unit: true, code: true } } },
      },
      laborLines: {
        include: {
          employee: { select: { name: true } },
          crew: { select: { name: true } },
        },
      },
    },
  });

  if (!dpr) {
    return new Response("<html><body><h1>DPR not found</h1></body></html>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

  const fmtNumber = (n: number, decimals = 0) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(n);

  const totalMaterialCost = dpr.materialLines.reduce(
    (s, l) => s + toNum(l.qty) * toNum(l.unitCost),
    0,
  );
  const totalHours = dpr.laborLines.reduce((s, l) => s + toNum(l.hoursWorked), 0);

  const materialRows = dpr.materialLines.length
    ? dpr.materialLines
        .map(
          (l) => `
        <tr>
          <td>${l.material.code}</td>
          <td>${l.material.name}</td>
          <td style="text-align:right">${fmtNumber(toNum(l.qty))} ${l.material.unit}</td>
          <td style="text-align:right">${fmtCurrency(toNum(l.unitCost))}</td>
          <td style="text-align:right">${fmtCurrency(toNum(l.qty) * toNum(l.unitCost))}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" style="text-align:center;color:#888">No materials recorded</td></tr>`;

  const laborRows = dpr.laborLines.length
    ? dpr.laborLines
        .map(
          (l) => `
        <tr>
          <td>${l.taskDescription ?? "—"}</td>
          <td>${l.employee?.name ?? l.crew?.name ?? "—"}</td>
          <td style="text-align:right">${fmtNumber(toNum(l.hoursWorked), 1)} h</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="text-align:center;color:#888">No labor recorded</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DPR — ${fmtDate(dpr.date)} — ${dpr.project.name}</title>
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
  .section { margin-bottom: 16px; }
  .section p { font-size: 0.8125rem; line-height: 1.5; }
  .label { font-weight: 700; font-size: 0.6875rem; text-transform: uppercase; color: #888; }
  .notes { background: #f9f9f9; padding: 12px; border-radius: 6px; font-size: 0.8125rem; line-height: 1.5; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 0.6875rem; color: #888; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
  <h1>Daily Progress Report</h1>
  <div class="meta">
    <span><strong>Date:</strong> ${fmtDate(dpr.date)}</span>
    <span><strong>Project:</strong> ${dpr.project.name}</span>
    <span class="badge">${dpr.approvalStatus.replace(/_/g, " ")}</span>
  </div>
  <div class="meta">
    <span><strong>Submitted By:</strong> ${dpr.submittedBy?.name ?? "—"}</span>
    ${dpr.workType ? `<span><strong>Work Type:</strong> ${dpr.workType}</span>` : ""}
    ${dpr.weather ? `<span><strong>Weather:</strong> ${dpr.weather}</span>` : ""}
    <span><strong>Progress:</strong> ${fmtNumber(toNum(dpr.progressPct))}%</span>
  </div>

  ${dpr.workSummary ? `<div class="section"><p class="label">Work Summary</p><p>${dpr.workSummary}</p></div>` : ""}
  ${dpr.blockers ? `<div class="section"><p class="label">Blockers</p><p>${dpr.blockers}</p></div>` : ""}
  ${dpr.tomorrowPlan ? `<div class="section"><p class="label">Tomorrow's Plan</p><p>${dpr.tomorrowPlan}</p></div>` : ""}

  <h2>Material Consumption</h2>
  <table>
    <thead>
      <tr><th>Code</th><th>Material</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>
      ${materialRows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right">Total Material Cost</td>
        <td style="text-align:right">${fmtCurrency(totalMaterialCost)}</td>
      </tr>
    </tbody>
  </table>

  <h2>Labor</h2>
  <table>
    <thead>
      <tr><th>Task</th><th>Worker / Crew</th><th style="text-align:right">Hours</th></tr>
    </thead>
    <tbody>
      ${laborRows}
      <tr class="total-row">
        <td colspan="2" style="text-align:right">Total Hours</td>
        <td style="text-align:right">${fmtNumber(totalHours, 1)} h</td>
      </tr>
    </tbody>
  </table>

  ${dpr.notes ? `<h2>Notes</h2><div class="notes">${dpr.notes}</div>` : ""}

  ${(dpr.subAdminApprovedBy?.name || dpr.adminApprovedBy?.name) ? `
  <h2>Approval Trail</h2>
  <table>
    <thead><tr><th>Stage</th><th>Approved By</th><th>Date</th></tr></thead>
    <tbody>
      <tr><td>Submitted</td><td>${dpr.submittedBy?.name ?? "—"}</td><td>${fmtDate(dpr.date)}</td></tr>
      ${dpr.subAdminApprovedBy?.name ? `<tr><td>Sub-Admin</td><td>${dpr.subAdminApprovedBy.name}</td><td>${dpr.subAdminApprovedAt ? fmtDate(dpr.subAdminApprovedAt) : "—"}</td></tr>` : ""}
      ${dpr.adminApprovedBy?.name ? `<tr><td>Admin</td><td>${dpr.adminApprovedBy.name}</td><td>${dpr.adminApprovedAt ? fmtDate(dpr.adminApprovedAt) : "—"}</td></tr>` : ""}
    </tbody>
  </table>` : ""}

  <div class="footer">
    Nirman Inventory OS — DPR Printout · Generated ${new Date().toLocaleString("en-IN")}
  </div>

  <script>window.print();</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
