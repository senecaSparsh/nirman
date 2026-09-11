import { NextRequest } from "next/server";
import { seedHsnGstRates, relinkCategoryGstRates, getBundledMasterVersion } from "@nirman/services";
import { apiHandler, json } from "@/lib/server";

/**
 * POST /api/cron/hsn-seed — auto re-seed the HSN/GST master + relink categories.
 *
 * Two modes:
 *   1. If GSTA_API_KEY is set → enriches from the gstaccelerator.in API
 *      (real-time CBIC data, 48,752 HSN codes).
 *   2. Always → re-seeds from the bundled JSON (which is kept in sync
 *      with the hsn-code-package npm package via `pnpm hsn:auto-sync`).
 *
 * The bundled JSON covers 12,604 HSN codes + our curated SAC codes.
 * Run `pnpm hsn:auto-sync` after `pnpm update hsn-code-package` to
 * refresh the JSON, then this cron pushes it to the DB.
 *
 * After seeding, runs `relinkCategoryGstRates()` to propagate any GST
 * rate changes from the government master to MaterialCategory rows,
 * so the category dropdown always shows the current rate.
 *
 * Auth: requires CRON_SECRET header.
 *
 * Render cron config (in render.yaml):
 *   schedule: "0 3 * * 1"  # weekly on Monday at 3am UTC
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!(process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const version = getBundledMasterVersion();
  const result = await seedHsnGstRates();

  // Relink: propagate any GST rate changes from the government master
  // to MaterialCategory rows so the category dropdown stays current.
  const relink = await relinkCategoryGstRates();

  return json({
    seeded: result.created,
    version,
    relink: {
      checked: relink.checked,
      updated: relink.updated,
      changes: relink.changes,
      orphans: relink.orphans,
    },
    message: `HSN/GST master re-seeded (v${version}, ${result.created} entries). ${relink.updated} category GST rate${relink.updated !== 1 ? "s" : ""} updated.`,
  });
}, { skipSession: true, rateLimit: false });
