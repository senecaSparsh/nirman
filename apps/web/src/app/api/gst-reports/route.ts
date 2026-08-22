import { NextRequest } from "next/server";
import { generateGstr1, generateGstr3b } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * GET /api/gst-reports?type=gstr1&from=2026-04-01&to=2026-06-30
 * GET /api/gst-reports?type=gstr3b&from=2026-04-01&to=2026-06-30
 *
 * Returns GST reconciliation data for filing GSTR-1 (outward supplies) or
 * GSTR-3B (summary return with ITC reconciliation).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "gstr3b";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return json({ error: "from and to query params are required (YYYY-MM-DD)" }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  if (type === "gstr1") {
    const report = await generateGstr1(company.id, fromDate, toDate);
    return json({
      fromDate: report.fromDate.toISOString(),
      toDate: report.toDate.toISOString(),
      totalTaxableValue: report.totalTaxableValue.toNumber(),
      totalOutputGst: report.totalOutputGst.toNumber(),
      totalCgst: report.totalCgst.toNumber(),
      totalSgst: report.totalSgst.toNumber(),
      totalIgst: report.totalIgst.toNumber(),
      totalInvoiceCount: report.totalInvoiceCount,
      entries: report.entries.map((e) => ({
        journalEntryId: e.journalEntryId,
        date: e.date.toISOString(),
        sourceType: e.sourceType,
        memo: e.memo,
        taxableValue: e.taxableValue.toNumber(),
        gstAmount: e.gstAmount.toNumber(),
        gstRate: e.gstRate.toNumber(),
      })),
    });
  }

  if (type === "gstr3b") {
    const report = await generateGstr3b(company.id, fromDate, toDate);
    return json({
      fromDate: report.fromDate.toISOString(),
      toDate: report.toDate.toISOString(),
      outwardTaxableValue: report.outwardTaxableValue.toNumber(),
      outwardOutputGst: report.outwardOutputGst.toNumber(),
      inwardTaxableValue: report.inwardTaxableValue.toNumber(),
      inwardInputGst: report.inwardInputGst.toNumber(),
      itcAvailable: report.itcAvailable.toNumber(),
      itcReversed: report.itcReversed.toNumber(),
      netGstPayable: report.netGstPayable.toNumber(),
      itcCarriedForward: report.itcCarriedForward.toNumber(),
    });
  }

  return json({ error: "Invalid type. Use gstr1 or gstr3b." }, { status: 400 });
});
