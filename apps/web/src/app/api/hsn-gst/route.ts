import { NextRequest } from "next/server";
import { searchHsnGst, lookupGstByHsn, suggestHsnByMaterial, seedHsnGstRates } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission, requireUser } from "@/lib/server";

/**
 * GET /api/hsn-gst
 *   ?q=...          — search by HSN code or description
 *   ?hsn=...        — exact lookup by HSN code (returns the GST rate)
 *   ?suggest=...    — suggest HSN codes by material name (+ optional category)
 *   ?category=...   — used with suggest for better matching
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const hsn = url.searchParams.get("hsn");
  const suggest = url.searchParams.get("suggest");
  const category = url.searchParams.get("category");

  if (hsn) {
    const result = await lookupGstByHsn(hsn);
    if (!result) return json({ error: "HSN code not found" }, { status: 404 });
    return json({
      hsnCode: hsn.toUpperCase(),
      gstRate: result.gstRate.toNumber(),
      description: result.description,
      sacCode: result.sacCode,
      category: result.category,
    });
  }

  if (suggest) {
    const results = await suggestHsnByMaterial(suggest, category ?? undefined);
    return json(results.map((r) => ({
      hsnCode: r.hsnCode,
      description: r.description,
      gstRate: r.gstRate.toNumber(),
      category: r.category,
    })));
  }

  // Default: search by code or description.
  const results = await searchHsnGst(q ?? "");
  return json(results.map((r) => ({
    hsnCode: r.hsnCode,
    description: r.description,
    gstRate: r.gstRate.toNumber(),
    sacCode: r.sacCode,
    category: r.category,
  })));
});

/**
 * PUT /api/hsn-gst — seed the HSN/GST master from the curated
 * construction-industry data. Admin/manager only.
 */
export const PUT = apiHandler(async () => {
  await requirePermission(PERM.PROCUREMENT_MANAGE);
  const result = await seedHsnGstRates();
  return json({ seeded: result.created, message: "HSN/GST master seeded successfully" });
});
