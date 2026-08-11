import { NextRequest } from "next/server";
import {
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@nirman/services";
import { apiHandler, json, requireUser } from "@/lib/server";

// GET /api/notifications/in-app — list notifications + unread count for the current user
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const [notifications, unreadCount] = await Promise.all([
    getUserNotifications(user.id, 50),
    getUnreadCount(user.id),
  ]);
  return json({
    notifications: notifications.map((n) => ({
      id: n.id,
      eventType: n.eventType,
      title: n.title,
      message: n.message,
      link: n.link,
      isRead: n.isRead,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
});

// PATCH /api/notifications/in-app — mark as read (single or all)
export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();

  if (body.markAll === true) {
    await markAllNotificationsRead(user.id);
    return json({ ok: true });
  }

  if (body.id) {
    await markNotificationRead(body.id);
    return json({ ok: true });
  }

  return json({ error: "Provide { id } or { markAll: true }" }, { status: 400 });
});
