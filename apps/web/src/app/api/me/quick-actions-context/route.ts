import { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler, json } from "@/lib/server";
import { loadQuickActionContext } from "@/lib/quick-action-server";

/**
 * GET /api/me/quick-actions-context?module=inventory
 *
 * Returns the quick-action context for the given module:
 *   { persona, savedLayouts, extraActions }
 *
 * Used by client-side dashboards that need quick actions but don't
 * have server-side access to loadQuickActionContext (e.g., the
 * PersonaHomeDashboard on /m/home for non-executive personas).
 */
const QuerySchema = z.object({
  module: z.enum(["inventory", "hr", "accounts", "site", "sales"]).default("inventory"),
});

export const GET = apiHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    module: searchParams.get("module") ?? undefined,
  });
  if (!parsed.success) {
    return json({ error: "Invalid module" }, { status: 400 });
  }

  const ctx = await loadQuickActionContext(parsed.data.module);
  return json(ctx);
});
