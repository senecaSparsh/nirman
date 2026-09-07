import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { apiHandler, getCurrentUser, getCompany, json } from "@/lib/server";

/**
 * GET /api/me/quick-actions
 *
 * Returns the current user's saved quick-action layouts for every
 * module+tab, keyed by the same string the client uses:
 *   "quick-actions:<module>:<tab>"  →  string[] of action keys (ordered)
 *
 * Only keys for the user's active company are returned. Missing keys
 * mean "use the persona default" — the client never has to special-case
 * a null response.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return json({ layouts: {} }, { status: 200 });
  let company;
  try {
    company = await getCompany();
  } catch {
    return json({ layouts: {} }, { status: 200 });
  }

  const rows = await prisma.userPreference.findMany({
    where: { userId: user.id, companyId: company.id, key: { startsWith: "quick-actions:" } },
    select: { key: true, value: true },
  });

  const layouts: Record<string, string[]> = {};
  for (const r of rows) {
    // value is Prisma.JsonValue — validate it's string[] before exposing.
    if (Array.isArray(r.value) && r.value.every((v) => typeof v === "string")) {
      layouts[r.key] = r.value as string[];
    }
  }
  return json({ layouts });
});

/* ── PUT ───────────────────────────────────────────────────────────
   Save one quick-action layout. Body:
     { module: "inventory", tab: "raw-material", order: ["indents", ...] }
   Stored under key "quick-actions:<module>:<tab>".
   Upserted per (userId, companyId, key). */

const PutBody = z.object({
  module: z.enum(["inventory", "hr", "accounts", "site"]),
  tab: z.string().min(1).max(40),
  order: z.array(z.string()).min(0).max(24),
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  // getCompany() throws if the company cookie is missing (e.g. expired
  // between auth and this call). Catch and return a clear error instead
  // of letting it surface as a 500.
  let company;
  try {
    company = await getCompany();
  } catch {
    return json({ error: "No active company" }, { status: 400 });
  }

  const body = PutBody.safeParse(await req.json());
  if (!body.success) {
    return json({ error: "Invalid body", issues: body.error.issues }, { status: 400 });
  }
  const { module, tab, order } = body.data;
  const key = `quick-actions:${module}:${tab}`;

  await prisma.userPreference.upsert({
    where: { userId_companyId_key: { userId: user.id, companyId: company.id, key } },
    create: { userId: user.id, companyId: company.id, key, value: order },
    update: { value: order },
  });

  return json({ ok: true, key, order });
});
