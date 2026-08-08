import { NextRequest } from "next/server";
import { createPortalListing, listPortalListings, getPortalListingStats, syncListingToPortal } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/portal-listings?status=LISTED&portalName=99acres
 * List portal listings + stats for the current company.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as "DRAFT" | "LISTED" | "DELISTED" | "SYNC_FAILED" | null;
  const portalName = searchParams.get("portalName") ?? undefined;

  const [listings, stats] = await Promise.all([
    listPortalListings(company.id, { status: status ?? undefined, portalName }),
    getPortalListingStats(company.id),
  ]);

  return json({
    stats,
    rows: listings.map((l) => ({
      id: l.id,
      builtUnitId: l.builtUnitId,
      unitNumber: l.builtUnit.unitNumber,
      unitType: l.builtUnit.unitType,
      unitStatus: l.builtUnit.status,
      projectName: l.builtUnit.project.name,
      portalName: l.portalName,
      listingId: l.listingId,
      listingUrl: l.listingUrl,
      status: l.status,
      title: l.title,
      description: l.description,
      askingPrice: toNum(l.askingPrice),
      area: toNum(l.area),
      areaUnit: l.areaUnit,
      floor: l.floor,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      furnishing: l.furnishing,
      photos: l.photos,
      listedAt: l.listedAt?.toISOString() ?? null,
      lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
      syncError: l.syncError,
    })),
  });
});

const createSchema = z.object({
  builtUnitId: z.string().min(1),
  portalName: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  askingPrice: z.coerce.number().positive(),
  bedrooms: z.number().int().min(0).max(10).optional(),
  bathrooms: z.number().int().min(0).max(10).optional(),
  furnishing: z.string().max(50).optional(),
  photos: z.array(z.string().url()).optional(),
});

/**
 * POST /api/portal-listings
 * Create a new portal listing (in DRAFT status).
 * POST /api/portal-listings?action=sync-all — bulk-sync all pending listings.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // ── Bulk sync all pending listings ──
  if (action === "sync-all") {
    const pending = await prisma.portalListing.findMany({
      where: { companyId: company.id, status: { in: ["DRAFT", "SYNC_FAILED"] } },
      select: { id: true, title: true, portalName: true },
    });

    const results: { id: string; title: string; portalName: string; success: boolean; error?: string }[] = [];
    for (const l of pending) {
      try {
        const updated = await syncListingToPortal(l.id, user.id);
        results.push({ id: l.id, title: l.title, portalName: l.portalName, success: updated.status === "LISTED", error: updated.syncError ?? undefined });
      } catch (err: unknown) {
        results.push({ id: l.id, title: l.title, portalName: l.portalName, success: false, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    return json({ total: results.length, succeeded, failed, results });
  }

  // ── Default: create a new listing ──
  const body = await req.json();
  const parsed = createSchema.parse(body);

  const listing = await createPortalListing({
    companyId: company.id,
    builtUnitId: parsed.builtUnitId,
    portalName: parsed.portalName,
    title: parsed.title,
    description: parsed.description,
    askingPrice: parsed.askingPrice,
    bedrooms: parsed.bedrooms,
    bathrooms: parsed.bathrooms,
    furnishing: parsed.furnishing,
    photos: parsed.photos,
    userId: user.id,
  });

  return json({ id: listing.id }, { status: 201 });
});
