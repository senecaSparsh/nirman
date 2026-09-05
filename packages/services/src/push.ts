import { prisma } from "@nirman/db";
import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

/**
 * Web Push notification sender.
 *
 * Sends push notifications to all active push subscriptions for a given user.
 * Uses the `web-push` npm package which handles VAPID authentication and
 * RFC 8291 payload encryption.
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY  — VAPID public key (base64url)
 *   VAPID_PRIVATE_KEY — VAPID private key (base64url)
 *   VAPID_SUBJECT     — "mailto:" or HTTPS URL for VAPID claims
 *
 * If VAPID keys are not configured, push sending is a no-op (returns 0).
 * The InAppNotification is the primary delivery channel; push is a bonus.
 */

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:noreply@nirman.app";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  href?: string;
  tag?: string;
  requireInteraction?: boolean;
}

/**
 * Send a push notification to all active subscriptions for a user.
 * Returns the number of successfully sent notifications.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureVapidConfigured()) {
    // VAPID not configured — log and skip (InAppNotification is the primary channel)
    return 0;
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { userId, isActive: true },
  });

  if (subs.length === 0) return 0;

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon,
    href: payload.href,
    tag: payload.tag,
    requireInteraction: payload.requireInteraction ?? false,
  });

  let sent = 0;
  for (const sub of subs) {
    const pushSub: WebPushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dhKey ?? "",
        auth: sub.authKey ?? "",
      },
    };

    try {
      await webpush.sendNotification(pushSub, message, {
        TTL: 86400, // 24 hours
      });
      sent++;
    } catch (err) {
      // 410 Gone / 404 Not Found → subscription is no longer valid
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        });
      }
      // Other errors (5xx, network) — don't deactivate, will retry next time
    }
  }

  return sent;
}

/**
 * Send a push notification to all users in a company who have a specific permission.
 * Useful for broadcasting approval requests to all approvers.
 */
export async function sendPushToApprovers(
  companyId: string,
  _permission: string,
  payload: PushPayload,
): Promise<number> {
  if (!ensureVapidConfigured()) {
    return 0;
  }

  // Find all active push subscriptions in the company
  const subs = await prisma.pushSubscription.findMany({
    where: { companyId, isActive: true },
  });

  if (subs.length === 0) return 0;

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon,
    href: payload.href,
    tag: payload.tag,
    requireInteraction: payload.requireInteraction ?? false,
  });

  let sent = 0;
  for (const sub of subs) {
    const pushSub: WebPushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dhKey ?? "",
        auth: sub.authKey ?? "",
      },
    };

    try {
      await webpush.sendNotification(pushSub, message, {
        TTL: 86400,
      });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { isActive: false },
        });
      }
    }
  }

  return sent;
}

/**
 * Check if VAPID is configured (for the /api/notifications/vapid-public-key endpoint).
 */
export function isPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Get the VAPID public key for client-side subscription.
 * Returns null if not configured.
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
