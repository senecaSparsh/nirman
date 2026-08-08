import { NextRequest } from "next/server";
import { z } from "zod";
import { syncListingToPortal, delistPortalListing, updatePortalListing, deletePortalListing } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/portal-listings/[id]
 * Fetch a single portal listing with full detail.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const l = await prisma.portalListing.findFirst({
    where: { id, companyId: company.id },
    include: {
      builtUnit: {
        select: {
          id: true,
          unitNumber: true,
          unitType: true,
          status: true,
          area: true,
          areaUnit: true,
          floor: true,
          askingPrice: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!l) return json({ error: "Portal listing not found" }, { status: 404 });

  return json({
    id: l.id,
    builtUnitId: l.builtUnitId,
    unitNumber: l.builtUnit.unitNumber,
    unitType: l.builtUnit.unitType,
    unitStatus: l.builtUnit.status,
    projectName: l.builtUnit.project.name,
    projectId: l.builtUnit.project.id,
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
    delistedAt: l.delistedAt?.toISOString() ?? null,
    lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
    syncError: l.syncError,
    createdAt: l.createdAt.toISOString(),
  });
});

/**
 * POST /api/portal-listings/[id]?action=sync   — push listing to portal
 * POST /api/portal-listings/[id]?action=delist — remove listing from portal
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Verify company ownership
  const existing = await prisma.portalListing.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing || existing.companyId !== company.id) {
    return json({ error: "Portal listing not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "sync";

  if (action === "delist") {
    const listing = await delistPortalListing(id, user.id);
    return json({ id: listing.id, status: listing.status });
  }

  // Default: sync (push to portal)
  const listing = await syncListingToPortal(id, user.id);
  return json({
    id: listing.id,
    status: listing.status,
    listingId: listing.listingId,
    listingUrl: listing.listingUrl,
    syncError: listing.syncError,
  });
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  askingPrice: z.coerce.number().positive().optional(),
  bedrooms: z.number().int().min(0).max(10).optional().nullable(),
  bathrooms: z.number().int().min(0).max(10).optional().nullable(),
  furnishing: z.string().max(50).optional().nullable(),
  photos: z.array(z.string().url()).optional(),
});

/**
 * PATCH /api/portal-listings/[id]
 * Update editable fields of a portal listing (title, description, price, etc.)
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Verify company ownership
  const existing = await prisma.portalListing.findUnique({ where: { id }, select: { companyId: true, status: true } });
  if (!existing || existing.companyId !== company.id) {
    return json({ error: "Portal listing not found" }, { status: 404 });
  }
  if (existing.status === "LISTED") {
    return json({ error: "Cannot edit a LISTED listing — delist or re-sync instead" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateSchema.parse(body);

  const listing = await updatePortalListing(id, {
    title: parsed.title,
    description: parsed.description,
    askingPrice: parsed.askingPrice,
    bedrooms: parsed.bedrooms,
    bathrooms: parsed.bathrooms,
    furnishing: parsed.furnishing,
    photos: parsed.photos,
  }, user.id);

  return json({ id: listing.id });
});

/**
 * DELETE /api/portal-listings/[id]
 * Delete a portal listing record (only DRAFT, SYNC_FAILED, or DELISTED).
 */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Verify company ownership
  const existing = await prisma.portalListing.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing || existing.companyId !== company.id) {
    return json({ error: "Portal listing not found" }, { status: 404 });
  }

  try {
    await deletePortalListing(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    const status = err instanceof Error && err.message.includes("LISTED") ? 400 : 500;
    return json({ error: err instanceof Error ? err.message : "Failed to delete listing" }, { status });
  }
});
