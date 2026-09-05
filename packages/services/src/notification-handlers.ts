/**
 * Notification Handlers — process pending notification log entries
 * and dispatch them via the appropriate channel (WhatsApp, email, in-app).
 *
 * This module is called by a background job (cron or queue processor)
 * to flush PENDING notifications, applying smart batching and quiet
 * hours rules.
 */

import { prisma } from "@nirman/db";
import { sendNotification, renderTemplate, createInAppNotification } from "./notifications";
import { EVENT_URGENCY, NotificationEventType } from "./notification-event-bus";

/**
 * Process all PENDING notifications — flush them to their respective
 * channels. Called by a background job.
 */
export async function processPendingNotifications(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const pending = await prisma.notificationLog.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  // Batch fetch all needed templates (avoids N+1 — one query instead of N×channels)
  const templateKeys = new Set<string>();
  for (const log of pending) {
    const metadata = JSON.parse((log.metadata as string) || "{}") as Record<string, unknown>;
    const channels: string[] = (metadata.channels as string[]) ?? ["IN_APP"];
    for (const channel of channels) {
      if (channel !== "IN_APP" && log.companyId) {
        templateKeys.add(`${log.companyId}|${log.eventType}|${channel}`);
      }
    }
  }

  const templates = templateKeys.size > 0
    ? await prisma.notificationTemplate.findMany({
        where: {
          isActive: true,
          OR: Array.from(templateKeys).map((key) => {
            const [companyId, eventType, channel] = key.split("|");
            return { companyId: companyId!, eventType: eventType!, channel: channel! };
          }),
        },
      })
    : [];

  const templateMap = new Map(
    templates.map((t) => [`${t.companyId}|${t.eventType}|${t.channel}`, t]),
  );

  let sent = 0;
  let failed = 0;

  // Batch-fetch user contact info for all pending notifications (avoids N+1)
  // The `recipient` field in NotificationLog stores a userId (set by the event bus),
  // but sendNotification expects a phone (WhatsApp) or email (EMAIL) string.
  const userIds = [...new Set(pending.map((l) => l.recipient))];
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, phone: true, email: true, name: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  for (const log of pending) {
    try {
      const metadata = JSON.parse((log.metadata as string) || "{}") as Record<string, unknown>;
      const channels: string[] = (metadata.channels as string[]) ?? ["IN_APP"];
      const urgency = (metadata.urgency as string) ?? "DAILY";

      // Skip if still within quiet hours and not IMMEDIATE
      if (urgency !== "IMMEDIATE" && isWithinQuietHours()) {
        continue;
      }

      // Resolve userId → contact info for WhatsApp/EMAIL channels
      const user = userMap.get(log.recipient);
      if (!user && channels.some((c) => c !== "IN_APP")) {
        // Cannot resolve recipient — mark as failed to avoid reprocessing
        await prisma.notificationLog.update({
          where: { id: log.id },
          data: { status: "FAILED", error: "Could not resolve user contact info" },
        }).catch(() => {});
        failed++;
        continue;
      }

      // Send via each enabled channel
      for (const channel of channels) {
        if (channel === "IN_APP") {
          // Create an InAppNotification record so the notification bell
          // dropdown can surface it via /api/notifications/in-app
          await createInAppNotification({
            companyId: log.companyId,
            userId: log.recipient,
            eventType: log.eventType,
            title: (metadata.title as string) ?? log.eventType.replace(/_/g, " ").toLowerCase(),
            message: log.message,
            link: (metadata.link as string) ?? undefined,
            metadata: metadata as Record<string, unknown>,
          }).catch(() => {});
          continue;
        }

        // Resolve the correct contact for the channel
        const contact = channel === "WHATSAPP" ? user?.phone : user?.email;
        if (!contact) continue; // User has no contact info for this channel

        // Look up template from the pre-fetched map (no per-iteration query)
        const template = log.companyId
          ? templateMap.get(`${log.companyId}|${log.eventType}|${channel}`)
          : undefined;

        if (template) {
          const message = renderTemplate(template.template, metadata as Record<string, string>);
          await sendNotification({
            recipient: contact,
            recipientName: user?.name,
            channel: channel as "WHATSAPP" | "EMAIL",
            message,
            companyId: log.companyId,
            eventType: log.eventType,
            userId: log.recipient,
          });
        } else {
          // No template — send the pre-rendered message from the event bus
          await sendNotification({
            recipient: contact,
            recipientName: user?.name,
            channel: channel as "WHATSAPP" | "EMAIL",
            message: log.message,
            companyId: log.companyId,
            eventType: log.eventType,
            userId: log.recipient,
          });
        }
      }

      // Mark as sent
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error(`[notification-handlers] Failed to send notification ${log.id}:`, err);
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "FAILED", error: String(err) },
      }).catch(() => {});
      failed++;
    }
  }

  return { processed: pending.length, sent, failed };
}

/**
 * Compute the IST hour (0-23.999...) from a UTC date.
 * Pure function — no DB access, no `new Date()` side effect.
 *
 * IST = UTC + 5:30. The result is wrapped to [0, 24).
 */
export function getIstHour(date: Date): number {
  return (date.getUTCHours() + 5 + 30 / 60) % 24;
}

/**
 * Check if an IST hour falls within quiet hours (10 PM - 7 AM IST).
 * Pure function — no DB access.
 */
export function isQuietHour(istHour: number): boolean {
  return istHour >= 22 || istHour < 7;
}

/** Check if current time is within quiet hours (10 PM - 7 AM IST) */
function isWithinQuietHours(): boolean {
  return isQuietHour(getIstHour(new Date()));
}

/**
 * Get notification statistics for a company dashboard.
 */
export async function getEventNotificationStats(companyId: string): Promise<{
  pending: number;
  sent: number;
  failed: number;
  byEventType: Record<string, number>;
}> {
  const [pending, sent, failed, byType] = await Promise.all([
    prisma.notificationLog.count({ where: { companyId, status: "PENDING" } }),
    prisma.notificationLog.count({ where: { companyId, status: "SENT" } }),
    prisma.notificationLog.count({ where: { companyId, status: "FAILED" } }),
    prisma.notificationLog.groupBy({
      by: ["eventType"],
      where: { companyId },
      _count: true,
    }),
  ]);

  const byEventType: Record<string, number> = {};
  for (const entry of byType) {
    byEventType[entry.eventType] = entry._count;
  }

  return { pending, sent, failed, byEventType };
}
