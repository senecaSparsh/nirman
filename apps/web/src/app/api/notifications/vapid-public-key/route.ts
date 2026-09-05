import { apiHandler, json } from "@/lib/server";
import { getVapidPublicKey } from "@nirman/services";

/**
 * GET /api/notifications/vapid-public-key
 * Returns the VAPID public key for client-side push subscription.
 * Returns 404 if push notifications are not configured (no VAPID keys).
 */
export const GET = apiHandler(async () => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return json({ error: "Push notifications not configured", configured: false }, { status: 404 });
  }
  return json({ publicKey, configured: true });
});
