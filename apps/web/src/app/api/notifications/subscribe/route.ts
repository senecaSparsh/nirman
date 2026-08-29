import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * POST /api/notifications/subscribe
 * Body: { endpoint, keys?: { p256dh, auth } }
 *
 * Stores or updates a web push subscription for the current user.
 * Called by the client after the user grants notification permission
 * and the service worker creates a push subscription.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const body = await req.json();

  const { endpoint, keys } = body;

  if (!endpoint || typeof endpoint !== "string") {
    return json({ error: "endpoint is required" }, { status: 400 });
  }

  // Upsert: if a subscription with this endpoint already exists, update it
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });

  if (existing) {
    const updated = await prisma.pushSubscription.update({
      where: { endpoint },
      data: {
        userId: user.id,
        companyId: company.id,
        p256dhKey: keys?.p256dh ?? null,
        authKey: keys?.auth ?? null,
        isActive: true,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    });
    return json({ id: updated.id, endpoint: updated.endpoint });
  }

  const created = await prisma.pushSubscription.create({
    data: {
      userId: user.id,
      companyId: company.id,
      endpoint,
      p256dhKey: keys?.p256dh ?? null,
      authKey: keys?.auth ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    },
  });

  return json({ id: created.id, endpoint: created.endpoint }, { status: 201 });
});

/**
 * DELETE /api/notifications/subscribe
 * Body: { endpoint }
 *
 * Deactivates (soft-deletes) a push subscription when the user
 * unsubscribes from notifications.
 */
export const DELETE = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return json({ error: "endpoint is required" }, { status: 400 });
  }

  // Only allow the user to delete their own subscription
  const sub = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });

  if (!sub || sub.userId !== user.id) {
    return json({ error: "Subscription not found" }, { status: 404 });
  }

  await prisma.pushSubscription.update({
    where: { endpoint },
    data: { isActive: false },
  });

  return json({ deleted: true });
});
