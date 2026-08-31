import { NextRequest } from "next/server";
import { createHsnSacProviderFromConfig, searchHsnSac } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * GET /api/hsn-sac/search?q=<query>
 * Search for HSN (goods) and SAC (services) codes by keyword.
 * Uses the configured HSN/SAC provider (CBIC free or FastGST).
 * Any authenticated user can search — this is a lookup, not a mutation.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "";
  if (!query.trim()) return json({ results: [] });

  const provider = await createHsnSacProviderFromConfig(company.id);
  const results = await searchHsnSac(provider, query);
  return json({ results });
});
