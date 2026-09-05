/**
 * ═══════════════════════════════════════════════════════════════════
 * TEST DATA — real IDs from the dev DB, for flow tests.
 * ═══════════════════════════════════════════════════════════════════
 *
 * These are fetched from the dev DB at module load. If the DB is
 * re-seeded, restart the test process to pick up new IDs.
 */
import { request } from "@playwright/test";

const BASE = "http://localhost:3100";

async function fetchFirst(endpoint: string) {
  const ctx = await request.newContext({ baseURL: BASE });
  try {
    const r = await ctx.get(endpoint);
    if (!r.ok()) return null;
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  } catch {
    return null;
  } finally {
    await ctx.dispose();
  }
}

async function fetchAll(endpoint: string): Promise<any[]> {
  const ctx = await request.newContext({ baseURL: BASE });
  try {
    const r = await ctx.get(endpoint);
    if (!r.ok()) return [];
    const data = await r.json();
    // Some endpoints return { rows, hasMore, count } (paginated),
    // others return a flat array. Normalize to a flat array.
    if (Array.isArray(data)) return data;
    if (data?.rows && Array.isArray(data.rows)) return data.rows;
    if (data?.items && Array.isArray(data.items)) return data.items;
    return [];
  } catch {
    return [];
  } finally {
    await ctx.dispose();
  }
}

// Lazily-loaded shared test data.
let _cache: Record<string, any> | null = null;

export async function testData() {
  if (_cache) return _cache;
  const [projects, suppliers, materials, stockLocations, customers] = await Promise.all([
    fetchAll("/api/projects"),
    fetchAll("/api/suppliers"),
    fetchAll("/api/materials"),
    fetchAll("/api/stock-locations"),
    fetchAll("/api/customers"),
  ]);

  const companyWarehouse = stockLocations.find((l: any) => l.type === "COMPANY_WAREHOUSE");
  const projectSite = stockLocations.find((l: any) => l.type === "PROJECT_SITE");

  _cache = {
    project: projects[0],
    projects,
    supplier: suppliers[0],
    suppliers,
    material: materials[0],
    materials,
    stockLocation: companyWarehouse ?? stockLocations[0],
    projectStockLocation: projectSite ?? stockLocations[0],
    stockLocations,
    customer: customers[0],
    customers,
  };
  return _cache;
}

/** Prefix for test-created records, so they can be identified/cleaned. */
export const TEST_PREFIX = "E2E-TEST";
