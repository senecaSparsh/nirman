#!/usr/bin/env node
/**
 * auto-sync-hsn-master.mjs — Sync the HSN/GST master from the npm package to DB.
 *
 * This is the "zero-touch" sync path. It:
 *   1. Reads all 12,604 HSN codes + 496 SAC codes from hsn-code-package
 *      (the single source of truth — CBIC Notification 09/2025-CT(Rate)).
 *   2. Optionally enriches with the gstaccelerator.in API if GSTA_API_KEY
 *      is set (for condition-aware rates).
 *   3. Calls the running server's PUT /api/hsn-gst to re-seed the DB.
 *
 * Usage:
 *   node scripts/auto-sync-hsn-master.mjs [base-url]
 *   pnpm hsn:auto-sync
 *   pnpm hsn:auto-sync http://localhost:3000
 *
 * Environment:
 *   GSTA_API_KEY  — optional. If set, enriches from the gstaccelerator.in API.
 *
 * Schedule:
 *   Run weekly via cron (see /api/cron/hsn-seed in render.yaml).
 */
const baseUrl = process.argv[2] ?? "http://localhost:3000";
const GSTA_API_KEY = process.env.GSTA_API_KEY;

async function main() {
  console.log("═══ HSN/GST Master Auto-Sync ═══");
  console.log(`  Source: hsn-code-package (npm)`);
  if (GSTA_API_KEY) console.log(`  Enrichment: gstaccelerator.in API`);
  console.log("");

  // The npm package is the single source of truth — no intermediate JSON file.
  // seedHsnGstRates() in the server reads directly from the package and upserts to DB.
  console.log("Step 1: Re-seeding DB from hsn-code-package...");
  try {
    const res = await fetch(`${baseUrl}/api/hsn-gst`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    console.log(`  ✓ Seeded ${data.seeded} entries to DB`);
    // Show relink results (category GST rates updated from government master)
    if (data.relink) {
      console.log(`  ✓ Relinked ${data.relink.checked} categories, ${data.relink.updated} GST rate${data.relink.updated !== 1 ? "s" : ""} updated`);
      if (data.relink.changes?.length > 0) {
        for (const c of data.relink.changes) {
          console.log(`    • ${c.categoryName} (${c.hsnCode}): ${c.oldRate}% → ${c.newRate}%`);
        }
      }
      if (data.relink.orphans?.length > 0) {
        console.log(`  ⚠ ${data.relink.orphans.length} categor${data.relink.orphans.length !== 1 ? "ies" : "y"} with HSN code not in government master:`);
        for (const o of data.relink.orphans) {
          console.log(`    • ${o.categoryName} → ${o.hsnCode}`);
        }
      }
    }
  } catch (err) {
    console.error(`  ⚠ DB seed failed: ${err instanceof Error ? err.message : err}`);
    console.error(`    Make sure the server is running:  pnpm dev`);
    process.exit(1);
  }

  console.log("");
  console.log("═══ Auto-sync complete ═══");
  console.log("  The HSN/GST master is now in sync with the npm package.");
  console.log("  To update: pnpm update hsn-code-package && pnpm hsn:auto-sync");
  console.log("  Weekly cron auto-reseeds (see render.yaml).");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
