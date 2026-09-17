import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import { apiHandler, getCurrentUser, getCompany, json } from "@/lib/server";

/**
 * GET /api/me/tour
 *
 * Returns the current user's product-tour state for the active company:
 *   { state: { status: "done" | "skipped", at: string, steps: number } | null }
 *
 * `null` means the tour has never been offered — the client shows the
 * welcome sheet. Stored in UserPreference under key "tour:v1" so the
 * "already seen it" answer follows the account to any device (same
 * pattern as /api/me/quick-actions). The v1 in the key is the escape
 * hatch: a substantially restructured tour ships as tour:v2 and
 * everyone gets re-offered it once.
 */
const TOUR_KEY = "tour:v1";

interface TourState {
  status: "done" | "skipped";
  at: string;
  steps: number;
}

export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return json({ state: null }, { status: 200 });
  let company;
  try {
    company = await getCompany();
  } catch {
    return json({ state: null }, { status: 200 });
  }

  const row = await prisma.userPreference.findUnique({
    where: {
      userId_companyId_key: { userId: user.id, companyId: company.id, key: TOUR_KEY },
    },
    select: { value: true },
  });

  // Validate before exposing — value is Prisma.JsonValue.
  const v = row?.value;
  const state: TourState | null =
    v && typeof v === "object" && !Array.isArray(v) &&
    ((v as Record<string, unknown>).status === "done" ||
      (v as Record<string, unknown>).status === "skipped")
      ? (v as unknown as TourState)
      : null;

  return json({ state });
});

/* ── PUT ───────────────────────────────────────────────────────────
   Record a tour outcome. Body: { status: "done" | "skipped",
   steps?: number } — steps = how many spotlight steps were shown. */

const PutBody = z.object({
  status: z.enum(["done", "skipped"]),
  steps: z.number().int().min(0).max(50).optional(),
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
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

  // Inferred literal object — NOT `TourState`. Interfaces lack the implicit
  // index signature Prisma's InputJsonValue requires; the inferred shape
  // carries one and stays assignable. (Same reason quick-actions writes a
  // plain array.) TourState remains the read-side contract in GET.
  const value = {
    status: body.data.status,
    at: new Date().toISOString(),
    steps: body.data.steps ?? 0,
  };

  await prisma.userPreference.upsert({
    where: {
      userId_companyId_key: { userId: user.id, companyId: company.id, key: TOUR_KEY },
    },
    create: { userId: user.id, companyId: company.id, key: TOUR_KEY, value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });

  return json({ ok: true, state: value });
});
