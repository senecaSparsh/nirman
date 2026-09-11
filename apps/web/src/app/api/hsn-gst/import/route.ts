import { NextRequest } from "next/server";
import { parseHsnCsv, importHsnEntries, relinkCategoryGstRates } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission } from "@/lib/server";

/**
 * POST /api/hsn-gst/import — bulk-import HSN/GST entries from a CSV body.
 *
 * Body: raw CSV text (text/csv content type, or plain text).
 * Format: hsnCode,description,gstRate[,category][,sacCode]
 *
 * Admin/manager only. Upserts by hsnCode — existing entries are updated,
 * new entries are created. Returns the count of processed entries.
 *
 * After import, runs `relinkCategoryGstRates()` to propagate any GST rate
 * changes to MaterialCategory rows so the category dropdown stays current.
 *
 * This is the "automatic sync" path: download a CSV from gst.gov.in,
 * POST it here, and the DB is updated without code changes or a deploy.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_MANAGE);
  const csvText = await req.text();
  if (!csvText.trim()) {
    return json({ error: "CSV body is empty" }, { status: 400 });
  }
  const entries = parseHsnCsv(csvText);
  if (entries.length === 0) {
    return json({ error: "No valid entries found in CSV" }, { status: 400 });
  }
  const result = await importHsnEntries(entries);
  const relink = await relinkCategoryGstRates();
  return json({
    imported: result.created,
    total: entries.length,
    relink: { checked: relink.checked, updated: relink.updated, changes: relink.changes, orphans: relink.orphans },
    message: `Imported ${entries.length} HSN/GST entries. ${relink.updated} category GST rate${relink.updated !== 1 ? "s" : ""} relinked.`,
  });
}, { rateLimit: "heavy" });
