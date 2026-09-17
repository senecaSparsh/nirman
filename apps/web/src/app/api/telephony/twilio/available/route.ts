import { NextRequest } from "next/server";
import { apiHandler, getActingRole, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { searchAvailableNumbers, isTwilioConfigured, type TwilioNumberKind } from "@/lib/twilio-service";

/**
 * GET /api/telephony/twilio/available — search Twilio's number inventory.
 *
 * OWNER-only (matches sync-numbers / purchase). Lets a company browse
 * numbers they can provision "from Nirman" on the platform's Twilio
 * account. Searching is free; only purchase bills the account.
 *
 * Query params:
 *   country  — ISO country code (default "IN")
 *   kind     — local | mobile | tollFree (default "local")
 *   areaCode — optional area-code filter
 *   contains — optional digit-pattern filter
 *   limit    — 1..30 (default 12)
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.TELEPHONY_MANAGE);
  if ((await getActingRole()) !== "OWNER") {
    return json({ error: "Only the owner can provision Twilio numbers" }, { status: 403 });
  }
  if (!isTwilioConfigured()) {
    return json({ error: "Twilio is not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const country = url.searchParams.get("country") ?? "IN";
  const kind = (url.searchParams.get("kind") ?? "local") as TwilioNumberKind;
  if (!["local", "mobile", "tollFree"].includes(kind)) {
    return json({ error: "kind must be local | mobile | tollFree" }, { status: 400 });
  }
  const areaCode = url.searchParams.get("areaCode") ?? undefined;
  const contains = url.searchParams.get("contains") ?? undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "12", 10) || 12;

  try {
    const numbers = await searchAvailableNumbers({ country, kind, areaCode, contains, limit });
    return json({ numbers, country, kind });
  } catch (err: unknown) {
    // Twilio 404 = country/kind has no inventory (e.g. IN tollFree on trial)
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      return json({ numbers: [], country, kind, message: "No numbers available for this country/type" });
    }
    throw err;
  }
});
