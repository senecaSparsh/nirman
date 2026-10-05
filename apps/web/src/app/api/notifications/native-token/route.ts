import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

const NATIVE_PLATFORMS = new Set(["ios", "android"]);

/**
 * POST /api/notifications/native-token
 * Body: { token, platform: "ios" | "android" }
 *
 * Stores an APNs/FCM device token from the Capacitor app as a
 * PushSubscription row. The token rides in `endpoint` under the
 * "capacitor://<platform>/" scheme so the same table (and the same
 * unsubscribe flow) serves web push + native push — the sender in
 * packages/services/src/push.ts routes on that prefix.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const body = await req.json();

  const { token, platform } = body;
  if (typeof token !== "string" || token.length < 8 || token.length > 4096) {
    return json({ error: "token is required" }, { status: 400 });
  }
  if (!NATIVE_PLATFORMS.has(platform)) {
    return json({ error: "platform must be ios or android" }, { status: 400 });
  }

  const endpoint = `capacitor://${platform}/${token}`;

  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });

  if (existing) {
    const updated = await prisma.pushSubscription.update({
      where: { endpoint },
      data: {
        userId: user.id,
        companyId: company.id,
        isActive: true,
        userAgent: `nirman-app/${platform}`,
      },
    });
    return json({ id: updated.id });
  }

  const created = await prisma.pushSubscription.create({
    data: {
      userId: user.id,
      companyId: company.id,
      endpoint,
      userAgent: `nirman-app/${platform}`,
    },
  });

  return json({ id: created.id }, { status: 201 });
});

/**
 * DELETE /api/notifications/native-token
 * Body: { token, platform }
 *
 * Deactivates a native push token (e.g. user toggles notifications off
 * inside the app settings).
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const { token, platform } = body;

  if (typeof token !== "string" || !NATIVE_PLATFORMS.has(platform)) {
    return json({ error: "token and platform are required" }, { status: 400 });
  }

  const endpoint = `capacitor://${platform}/${token}`;
  const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });

  if (!sub || sub.userId !== user.id) {
    return json({ error: "Subscription not found" }, { status: 404 });
  }

  await prisma.pushSubscription.update({
    where: { endpoint },
    data: { isActive: false },
  });

  return json({ deleted: true });
});
