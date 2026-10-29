import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@nirman/db";
import { jsonBody, apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * POST /api/sms/devices — self-registration for the Nirman mobile app.
 * Any signed-in company member can register THIS device once — the app
 * calls it silently on first launch, stores the returned key, and uses
 * it for /api/sms/intake (incoming bank SMS) and /api/sms/outbox
 * (sending queued SMS on the device SIM). No admin step, nothing to
 * paste — install → login → done.
 *
 * Body: { label? } — defaults to a friendly device name.
 * Returns the raw key ONCE; it is never retrievable again.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const body = await jsonBody(req);
  const label =
    (body instanceof Response ? undefined : body.label?.trim()) || "Nirman app phone";

  const token = randomBytes(24).toString("hex");
  await prisma.smsIngestToken.create({
    data: { companyId: company.id, token, label, createdById: user.id },
  });
  return json({ key: token, label }, { status: 201 });
});
