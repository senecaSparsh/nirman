import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { searchHsnGst, lookupGstByHsn, suggestHsnByMaterial, seedHsnGstRates, relinkCategoryGstRates } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission, requireUser } from "@/lib/server";
import Decimal from "decimal.js";

/**
 * GET /api/hsn-gst
 *   ?q=...          — search by HSN code or description
 *   ?hsn=...        — exact lookup by HSN code (returns the GST rate)
 *                     Falls back to gstaccelerator.in API if not in DB
 *                     (requires GSTA_API_KEY env var) and caches the result.
 *   ?suggest=...    — suggest HSN codes by material name (+ optional category)
 *                    (empty suggest + category = category-only suggestions)
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
    if (result) {
      return json({
        hsnCode: hsn.toUpperCase(),
        gstRate: result.gstRate.toNumber(),
        description: result.description,
        sacCode: result.sacCode,
        category: result.category,
      });
    }

    // ── API fallback: if not in DB, try gstaccelerator.in (if key is set) ──
    const apiKey = process.env.GSTA_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch(`https://gstaccelerator.in/api/v1/hsn/${encodeURIComponent(hsn)}`, {
          headers: { "X-API-Key": apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          const gstRate = data.tax_rates?.igst;
          const description = data.hsn_description ?? hsn;
          if (gstRate != null) {
            // Cache the result in the DB for future lookups
            await prisma.hsnGstRate.upsert({
              where: { hsnCode: hsn.toUpperCase() },
              create: {
                hsnCode: hsn.toUpperCase(),
                description,
                gstRate: new Decimal(gstRate),
                sacCode: null,
                category: "Goods",
              },
              update: {
                description,
                gstRate: new Decimal(gstRate),
              },
            });
            return json({
              hsnCode: hsn.toUpperCase(),
              gstRate,
              description,
              sacCode: null,
              category: "Goods",
            });
          }
        }
      } catch {
        // Silent fail — fall through to 404
      }
    }

    return json({ error: "HSN code not found" }, { status: 404 });
  }

  if (suggest !== null) {
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
  const relink = await relinkCategoryGstRates();
  return json({
    seeded: result.created,
    relink: { checked: relink.checked, updated: relink.updated, changes: relink.changes, orphans: relink.orphans },
    message: `HSN/GST master seeded. ${relink.updated} category GST rate${relink.updated !== 1 ? "s" : ""} relinked.`,
  });
});
