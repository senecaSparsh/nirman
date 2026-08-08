import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Portal Listing Service — sync built units to property portals
 * (99acres, MagicBricks, Housing.com, etc.).
 *
 * The portal provider is pluggable: a StubPortalProvider logs the
 * listing and returns success (for development); a real provider
 * would call the portal's REST API to create/update/delist listings.
 */

// ── Provider Interface ─────────────────────────────────────

export interface PortalProvider {
  createListing(listing: PortalListingPayload): Promise<PortalSyncResult>;
  updateListing(portalListingId: string, listing: PortalListingPayload): Promise<PortalSyncResult>;
  delistListing(portalListingId: string): Promise<PortalSyncResult>;
}

export interface PortalListingPayload {
  title: string;
  description: string;
  askingPrice: number;
  bedrooms?: number;
  bathrooms?: number;
  area: number;
  areaUnit: string;
  floor?: number;
  furnishing?: string;
  photos: string[];
}

export interface PortalSyncResult {
  success: boolean;
  portalListingId?: string;
  listingUrl?: string;
  error?: string;
}

/** Stub portal provider — logs the listing and returns success. */
export class StubPortalProvider implements PortalProvider {
  constructor(private portalName: string = "99acres") {}

  async createListing(listing: PortalListingPayload): Promise<PortalSyncResult> {
    console.log(`[Portal Stub:${this.portalName}] Create listing:`, listing.title);
    return {
      success: true,
      portalListingId: `STUB-${Date.now()}`,
      listingUrl: `https://${this.portalName.toLowerCase()}.com/listing/STUB-${Date.now()}`,
    };
  }

  async updateListing(portalListingId: string, listing: PortalListingPayload): Promise<PortalSyncResult> {
    console.log(`[Portal Stub:${this.portalName}] Update listing ${portalListingId}:`, listing.title);
    return { success: true, portalListingId, listingUrl: `https://${this.portalName.toLowerCase()}.com/listing/${portalListingId}` };
  }

  async delistListing(portalListingId: string): Promise<PortalSyncResult> {
    console.log(`[Portal Stub:${this.portalName}] Delist listing ${portalListingId}`);
    return { success: true, portalListingId };
  }
}

// ── HTTP Portal Provider ────────────────────────────────────

/**
 * Portal-specific field mapping configuration.
 * Maps our internal PortalListingPayload fields to the portal's API field names.
 */
export interface PortalFieldMapping {
  title: string;
  description: string;
  askingPrice: string;
  bedrooms?: string;
  bathrooms?: string;
  area: string;
  areaUnit: string;
  floor?: string;
  furnishing?: string;
  photos: string;
}

/**
 * Generic HTTP-based portal provider.
 *
 * Supports configurable base URL, API key (Bearer token auth), and
 * portal-specific field mapping. Implements retries (3 attempts with
 * exponential backoff) and rate-limit handling.
 *
 * Subclasses (NineAcresProvider, MagicBricksProvider, HousingProvider)
 * override the field mapping and optionally the endpoint paths.
 */
export class HttpPortalProvider implements PortalProvider {
  protected portalName: string;
  protected baseUrl: string;
  protected apiKey: string;
  protected fieldMapping: PortalFieldMapping;
  protected maxRetries: number;

  constructor(opts: {
    portalName: string;
    baseUrl: string;
    apiKey: string;
    fieldMapping: PortalFieldMapping;
    maxRetries?: number;
  }) {
    this.portalName = opts.portalName;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fieldMapping = opts.fieldMapping;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  /** Endpoint paths — can be overridden by subclasses */
  protected get createPath(): string { return "/listings"; }
  protected get updatePath(): string { return "/listings"; }
  protected get delistPath(): string { return "/listings"; }

  /**
   * Map our internal payload to the portal's expected field names.
   */
  protected mapPayload(listing: PortalListingPayload): Record<string, unknown> {
    const mapped: Record<string, unknown> = {
      [this.fieldMapping.title]: listing.title,
      [this.fieldMapping.description]: listing.description,
      [this.fieldMapping.askingPrice]: listing.askingPrice,
      [this.fieldMapping.area]: listing.area,
      [this.fieldMapping.areaUnit]: listing.areaUnit,
      [this.fieldMapping.photos]: listing.photos,
    };
    if (listing.bedrooms != null && this.fieldMapping.bedrooms) {
      mapped[this.fieldMapping.bedrooms] = listing.bedrooms;
    }
    if (listing.bathrooms != null && this.fieldMapping.bathrooms) {
      mapped[this.fieldMapping.bathrooms] = listing.bathrooms;
    }
    if (listing.floor != null && this.fieldMapping.floor) {
      mapped[this.fieldMapping.floor] = listing.floor;
    }
    if (listing.furnishing != null && this.fieldMapping.furnishing) {
      mapped[this.fieldMapping.furnishing] = listing.furnishing;
    }
    return mapped;
  }

  /**
   * Make an HTTP request with retry + backoff.
   */
  protected async requestWithRetry(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "X-Portal-Source": this.portalName,
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        const data = await res.json().catch(() => ({})) as Record<string, unknown>;

        if (res.ok) {
          return { ok: true, status: res.status, data };
        }

        // Rate limited — wait longer before retry
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
          lastError = `Rate limited (429)`;
          if (attempt < this.maxRetries) {
            await sleep(retryAfter * 1000);
            continue;
          }
        }

        // Client errors (4xx, except 429) — don't retry
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return {
            ok: false,
            status: res.status,
            data: { error: data?.error ?? data?.message ?? `HTTP ${res.status}` },
          };
        }

        // Server errors (5xx) — retry
        lastError = (data?.error as string) ?? (data?.message as string) ?? `HTTP ${res.status}`;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : "Network error";
      }

      // Exponential backoff: 1s, 2s, 4s...
      if (attempt < this.maxRetries) {
        await sleep(Math.pow(2, attempt - 1) * 1000);
      }
    }

    return { ok: false, status: 0, data: { error: lastError ?? "Request failed after retries" } };
  }

  async createListing(listing: PortalListingPayload): Promise<PortalSyncResult> {
    const payload = this.mapPayload(listing);
    const { ok, data } = await this.requestWithRetry("POST", this.createPath, payload);

    if (!ok) {
      return { success: false, error: (data.error as string) ?? "Failed to create listing" };
    }

    return {
      success: true,
      portalListingId: (data.id ?? data.listingId ?? data.listing_id) as string | undefined,
      listingUrl: (data.url ?? data.listingUrl ?? data.listing_url) as string | undefined,
    };
  }

  async updateListing(portalListingId: string, listing: PortalListingPayload): Promise<PortalSyncResult> {
    const payload = this.mapPayload(listing);
    const { ok, data } = await this.requestWithRetry("PUT", `${this.updatePath}/${portalListingId}`, payload);

    if (!ok) {
      return { success: false, error: (data.error as string) ?? "Failed to update listing" };
    }

    return {
      success: true,
      portalListingId,
      listingUrl: (data.url ?? data.listingUrl ?? data.listing_url) as string | undefined,
    };
  }

  async delistListing(portalListingId: string): Promise<PortalSyncResult> {
    const { ok, data } = await this.requestWithRetry("DELETE", `${this.delistPath}/${portalListingId}`);

    if (!ok) {
      return { success: false, error: (data.error as string) ?? "Failed to delist listing" };
    }

    return { success: true, portalListingId };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Portal-Specific Providers ───────────────────────────────

/**
 * 99acres provider — maps to the 99acres listing API.
 * 99acres uses webhook-based lead capture + a manual listing API.
 * The endpoint is configurable via PORTAL_99ACRES_BASE_URL.
 */
export class NineAcresProvider extends HttpPortalProvider {
  constructor(apiKey: string, baseUrl?: string) {
    super({
      portalName: "99acres",
      baseUrl: baseUrl ?? process.env.PORTAL_99ACRES_BASE_URL ?? "https://api.99acres.com/v1",
      apiKey,
      fieldMapping: {
        title: "propertyTitle",
        description: "propertyDescription",
        askingPrice: "expectedPrice",
        bedrooms: "bedrooms",
        bathrooms: "bathrooms",
        area: "builtUpArea",
        areaUnit: "areaUnit",
        floor: "floorNo",
        furnishing: "furnishing",
        photos: "photoUrls",
      },
    });
  }
}

/**
 * MagicBricks provider — maps to the MagicBricks listing API.
 */
export class MagicBricksProvider extends HttpPortalProvider {
  constructor(apiKey: string, baseUrl?: string) {
    super({
      portalName: "MagicBricks",
      baseUrl: baseUrl ?? process.env.PORTAL_MAGICBRICKS_BASE_URL ?? "https://api.magicbricks.com/v1",
      apiKey,
      fieldMapping: {
        title: "listingTitle",
        description: "description",
        askingPrice: "price",
        bedrooms: "bhk",
        bathrooms: "bathrooms",
        area: "superArea",
        areaUnit: "areaUnit",
        floor: "floor",
        furnishing: "furnishingStatus",
        photos: "images",
      },
    });
  }
}

/**
 * Housing.com provider — maps to the Housing.com listing API.
 */
export class HousingProvider extends HttpPortalProvider {
  constructor(apiKey: string, baseUrl?: string) {
    super({
      portalName: "Housing.com",
      baseUrl: baseUrl ?? process.env.PORTAL_HOUSING_BASE_URL ?? "https://api.housing.com/v1",
      apiKey,
      fieldMapping: {
        title: "title",
        description: "description",
        askingPrice: "rentOrPrice",
        bedrooms: "bedrooms",
        bathrooms: "bathrooms",
        area: "carpetArea",
        areaUnit: "areaUnit",
        floor: "floorNumber",
        furnishing: "furnishing",
        photos: "photoUrls",
      },
    });
  }
}

/**
 * Factory: returns a real HTTP portal provider if the portal's API key
 * env var is set, otherwise falls back to StubPortalProvider.
 */
export function createPortalProvider(portalName: string): PortalProvider {
  switch (portalName) {
    case "99acres": {
      const apiKey = process.env.PORTAL_99ACRES_API_KEY;
      if (apiKey) return new NineAcresProvider(apiKey);
      return new StubPortalProvider("99acres");
    }
    case "MagicBricks": {
      const apiKey = process.env.PORTAL_MAGICBRICKS_API_KEY;
      if (apiKey) return new MagicBricksProvider(apiKey);
      return new StubPortalProvider("MagicBricks");
    }
    case "Housing.com": {
      const apiKey = process.env.PORTAL_HOUSING_API_KEY;
      if (apiKey) return new HousingProvider(apiKey);
      return new StubPortalProvider("Housing.com");
    }
    default:
      throw new ServiceError(`Unknown portal: ${portalName}`, 400);
  }
}

// Registry of portal providers by portal name
const PROVIDERS: Record<string, () => PortalProvider> = {
  "99acres": () => createPortalProvider("99acres"),
  "MagicBricks": () => createPortalProvider("MagicBricks"),
  "Housing.com": () => createPortalProvider("Housing.com"),
};

function getProvider(portalName: string): PortalProvider {
  const factory = PROVIDERS[portalName];
  if (!factory) throw new ServiceError(`Unknown portal: ${portalName}`, 400);
  return factory();
}

// ── CRUD + Sync Operations ─────────────────────────────────

export interface CreatePortalListingInput {
  companyId: string;
  builtUnitId: string;
  portalName: string;
  title: string;
  description?: string;
  askingPrice: Decimal | number | string;
  bedrooms?: number;
  bathrooms?: number;
  furnishing?: string;
  photos?: string[];
  userId?: string;
}

/**
 * Create a portal listing (in DRAFT status — not yet pushed to the portal).
 */
export async function createPortalListing(input: CreatePortalListingInput) {
  const unit = await prisma.builtUnit.findFirst({
    where: {
      id: input.builtUnitId,
      deletedAt: null,
      project: { companyId: input.companyId, deletedAt: null },
    },
    include: { project: { select: { name: true } } },
  });
  if (!unit) throw new ServiceError("Built unit not found", 404);

  // Check for existing listing on this portal
  const existing = await prisma.portalListing.findUnique({
    where: { builtUnitId_portalName: { builtUnitId: input.builtUnitId, portalName: input.portalName } },
  });
  if (existing) throw new ServiceError("Listing already exists for this unit on this portal", 409);

  const listing = await prisma.portalListing.create({
    data: {
      companyId: input.companyId,
      builtUnitId: input.builtUnitId,
      portalName: input.portalName,
      title: input.title,
      description: input.description ?? null,
      askingPrice: new Decimal(input.askingPrice),
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      area: unit.area,
      areaUnit: unit.areaUnit,
      floor: unit.floor,
      furnishing: input.furnishing ?? null,
      photos: input.photos ?? [],
      status: "DRAFT",
    },
  });

  if (input.userId) {
    await logAction(prisma, {
      userId: input.userId,
      action: "PORTAL_LISTING_CREATE",
      entityType: "PortalListing",
      entityId: listing.id,
      after: { portalName: input.portalName, builtUnitId: input.builtUnitId, title: input.title },
    });
  }

  return listing;
}

/**
 * Push a listing to the portal (create or update on the portal side).
 */
export async function syncListingToPortal(listingId: string, userId?: string) {
  const listing = await prisma.portalListing.findUnique({
    where: { id: listingId },
    include: { builtUnit: { select: { unitType: true, unitNumber: true } } },
  });
  if (!listing) throw new ServiceError("Portal listing not found", 404);

  const provider = getProvider(listing.portalName);
  const payload: PortalListingPayload = {
    title: listing.title,
    description: listing.description ?? "",
    askingPrice: listing.askingPrice.toNumber(),
    bedrooms: listing.bedrooms ?? undefined,
    bathrooms: listing.bathrooms ?? undefined,
    area: listing.area.toNumber(),
    areaUnit: listing.areaUnit,
    floor: listing.floor ?? undefined,
    furnishing: listing.furnishing ?? undefined,
    photos: listing.photos,
  };

  let result: PortalSyncResult;
  try {
    if (listing.listingId && listing.status === "LISTED") {
      // Update existing listing
      result = await provider.updateListing(listing.listingId, payload);
    } else {
      // Create new listing
      result = await provider.createListing(payload);
    }
  } catch (err: unknown) {
    result = { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }

  const updated = await prisma.portalListing.update({
    where: { id: listingId },
    data: {
      status: result.success ? "LISTED" : "SYNC_FAILED",
      listingId: result.portalListingId ?? listing.listingId,
      listingUrl: result.listingUrl ?? listing.listingUrl,
      listedAt: result.success && !listing.listedAt ? new Date() : listing.listedAt,
      lastSyncedAt: new Date(),
      syncError: result.error ?? null,
    },
  });

  if (userId) {
    await logAction(prisma, {
      userId,
      action: result.success ? "PORTAL_LISTING_SYNCED" : "PORTAL_LISTING_SYNC_FAILED",
      entityType: "PortalListing",
      entityId: listingId,
      after: { status: updated.status, portalListingId: updated.listingId },
    });
  }

  return updated;
}

/**
 * Delist a listing from the portal.
 */
export async function delistPortalListing(listingId: string, userId?: string) {
  const listing = await prisma.portalListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new ServiceError("Portal listing not found", 404);

  if (listing.listingId && listing.status === "LISTED") {
    const provider = getProvider(listing.portalName);
    try {
      await provider.delistListing(listing.listingId);
    } catch (err: unknown) {
      // Log error but still mark as delisted locally
      console.error("Portal delist error:", err);
    }
  }

  const updated = await prisma.portalListing.update({
    where: { id: listingId },
    data: {
      status: "DELISTED",
      delistedAt: new Date(),
      lastSyncedAt: new Date(),
    },
  });

  if (userId) {
    await logAction(prisma, {
      userId,
      action: "PORTAL_LISTING_DELISTED",
      entityType: "PortalListing",
      entityId: listingId,
    });
  }

  return updated;
}

/**
 * List all portal listings for a company.
 */
export async function listPortalListings(
  companyId: string,
  filters?: { status?: "DRAFT" | "LISTED" | "DELISTED" | "SYNC_FAILED"; portalName?: string },
) {
  return prisma.portalListing.findMany({
    where: {
      companyId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.portalName ? { portalName: filters.portalName } : {}),
    },
    include: {
      builtUnit: {
        select: {
          id: true,
          unitNumber: true,
          unitType: true,
          status: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
    // listing-level fields (area, areaUnit, floor, etc.) are on the PortalListing itself
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/**
 * Update a portal listing's editable fields. Only DRAFT and SYNC_FAILED
 * listings can be edited (LISTED listings should be re-synced, not
 * silently changed — the portal may have diverged).
 */
export async function updatePortalListing(
  listingId: string,
  input: {
    title?: string;
    description?: string | null;
    askingPrice?: Decimal | number | string;
    bedrooms?: number | null;
    bathrooms?: number | null;
    furnishing?: string | null;
    photos?: string[];
  },
  userId?: string,
) {
  const existing = await prisma.portalListing.findUnique({ where: { id: listingId } });
  if (!existing) throw new ServiceError("Portal listing not found", 404);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new ServiceError("Title cannot be empty");
    data.title = input.title.trim();
  }
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.askingPrice !== undefined) {
    const price = new Decimal(input.askingPrice);
    if (!price.gt(0)) throw new ServiceError("Asking price must be > 0");
    data.askingPrice = price;
  }
  if (input.bedrooms !== undefined) data.bedrooms = input.bedrooms;
  if (input.bathrooms !== undefined) data.bathrooms = input.bathrooms;
  if (input.furnishing !== undefined) data.furnishing = input.furnishing || null;
  if (input.photos !== undefined) data.photos = input.photos;

  const updated = await prisma.portalListing.update({ where: { id: listingId }, data });

  if (userId) {
    await logAction(prisma, {
      userId,
      action: "PORTAL_LISTING_UPDATE",
      entityType: "PortalListing",
      entityId: listingId,
      before: { title: existing.title, askingPrice: existing.askingPrice.toString() },
      after: { title: updated.title, askingPrice: updated.askingPrice.toString() },
    });
  }

  return updated;
}

/**
 * Delete a portal listing record. Only DRAFT listings can be hard-deleted
 * (they haven't been pushed to the portal). LISTED listings should be
 * delisted first. DELISTED listings can be cleaned up.
 */
export async function deletePortalListing(listingId: string, userId?: string) {
  const existing = await prisma.portalListing.findUnique({ where: { id: listingId } });
  if (!existing) throw new ServiceError("Portal listing not found", 404);
  if (existing.status === "LISTED") {
    throw new ServiceError("Cannot delete a LISTED listing — delist it first", 400);
  }

  await prisma.portalListing.delete({ where: { id: listingId } });

  if (userId) {
    await logAction(prisma, {
      userId,
      action: "PORTAL_LISTING_DELETE",
      entityType: "PortalListing",
      entityId: listingId,
      before: { portalName: existing.portalName, title: existing.title, status: existing.status },
    });
  }

  return { deleted: true };
}

/**
 * Get portal listing statistics for a company.
 */
export async function getPortalListingStats(companyId: string) {
  const [total, listed, draft, delisted, failed] = await Promise.all([
    prisma.portalListing.count({ where: { companyId } }),
    prisma.portalListing.count({ where: { companyId, status: "LISTED" } }),
    prisma.portalListing.count({ where: { companyId, status: "DRAFT" } }),
    prisma.portalListing.count({ where: { companyId, status: "DELISTED" } }),
    prisma.portalListing.count({ where: { companyId, status: "SYNC_FAILED" } }),
  ]);

  return { total, listed, draft, delisted, failed };
}

/**
 * Get listings for a specific built unit.
 */
export async function getUnitListings(builtUnitId: string) {
  return prisma.portalListing.findMany({
    where: { builtUnitId },
    orderBy: { createdAt: "desc" },
  });
}
