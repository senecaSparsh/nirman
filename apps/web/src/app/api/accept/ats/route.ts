import { NextRequest } from "next/server";
import { z } from "zod";
import { acceptAts, ServiceError } from "@nirman/services";
import { apiHandler, json } from "@/lib/server";

/**
 * POST /api/accept/ats — PUBLIC endpoint for a buyer to accept the Agreement
 * to Sell via the shareable link. The token IS the auth (no session). Body:
 * { token, signerName, signerPhone? }. 30-day TTL enforced in the service;
 * re-issuing the link rotates the token and invalidates older links.
 */
const schema = z.object({
  token: z.string().min(1),
  signerName: z.string().min(1, "Please enter your name").max(80),
  signerPhone: z.string().max(30).optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const result = await acceptAts(parsed.data);
    return json({ ok: true, ...result });
  } catch (err: unknown) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
}, { skipSession: true, rateLimit: "auth" });
