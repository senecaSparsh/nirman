/**
 * Unit tests for the pure factory function `createPortalProvider()` in portal-listing.ts.
 *
 * Returns a real HTTP portal provider if the API key env var is set,
 * otherwise falls back to ManualPortalProvider. Throws ServiceError
 * for unknown portal names.
 *
 * No DB — but reads env vars, so we set/restore them in tests.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createPortalProvider, ManualPortalProvider, StubPortalProvider } from "./portal-listing";

describe("createPortalProvider", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    process.env = { ...origEnv };
  });

  it("returns ManualPortalProvider for 99acres when no API key set", () => {
    delete process.env.PORTAL_99ACRES_API_KEY;
    const provider = createPortalProvider("99acres");
    expect(provider).toBeInstanceOf(ManualPortalProvider);
  });

  it("returns ManualPortalProvider for MagicBricks when no API key set", () => {
    delete process.env.PORTAL_MAGICBRICKS_API_KEY;
    const provider = createPortalProvider("MagicBricks");
    expect(provider).toBeInstanceOf(ManualPortalProvider);
  });

  it("returns ManualPortalProvider for Housing.com when no API key set", () => {
    delete process.env.PORTAL_HOUSING_API_KEY;
    const provider = createPortalProvider("Housing.com");
    expect(provider).toBeInstanceOf(ManualPortalProvider);
  });

  it("throws ServiceError for unknown portal name", () => {
    expect(() => createPortalProvider("UnknownPortal")).toThrow();
    expect(() => createPortalProvider("UnknownPortal")).toThrow(/Unknown portal/);
  });

  it("throws for empty string portal name", () => {
    expect(() => createPortalProvider("")).toThrow();
  });
});

describe("ManualPortalProvider", () => {
  const payload = {
    title: "2 BHK in Whitefield",
    description: "Corner unit",
    askingPrice: 1850000,
    bedrooms: 2,
    bathrooms: 2,
    area: 108.5,
    areaUnit: "SQFT",
    floor: 4,
    furnishing: "Semi-Furnished",
    photos: [],
  };

  it("can be instantiated with a portal name", () => {
    const provider = new ManualPortalProvider("99acres");
    expect(provider).toBeDefined();
  });

  it("createListing reports manual — never a fabricated live listing", async () => {
    const provider = new ManualPortalProvider("99acres");
    const result = await provider.createListing(payload);
    expect(result.success).toBe(true);
    expect(result.manual).toBe(true);
    // No fabricated portal listing id — nothing was posted.
    expect(result.portalListingId).toBeUndefined();
    // The URL is the portal's pre-filled posting form, not a live listing.
    expect(result.listingUrl).toContain("99acres.com/post-property");
    expect(result.listingUrl).toContain("price=1850000");
  });

  it("manual delist is honest — reports it cannot auto-delist", async () => {
    const provider = new ManualPortalProvider("MagicBricks");
    const result = await provider.delistListing("SOME-ID");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/manually/i);
  });
});

describe("StubPortalProvider", () => {
  it("can be instantiated", () => {
    const provider = new StubPortalProvider();
    expect(provider).toBeDefined();
  });
});
