import { prisma } from "@nirman/db";
import { requireUser } from "@/lib/server";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { resolveLinkForSurface } from "@/lib/surface-map";
import { formatRelativeTime } from "@/lib/utils";
import { MobileNotificationsMarkAll } from "./MobileNotificationsMarkAll";
import { Bell } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Notifications · Nirman" };

/**
 * /m/notifications — full notification history. The bell drawer shows the
 * latest 50; this page gives the complete list + deep links, and is the
 * landing target for /m/notifications deep links (e.g. push taps).
 */
export default function MobileNotificationsPage() {
  return (
    <MobileListPage what="notifications" skeletonRows={8}>
      {async () => {
        const user = await requireUser();
        const notifications = await prisma.inAppNotification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            title: true,
            message: true,
            link: true,
            isRead: true,
            createdAt: true,
          },
        });
        const unreadCount = notifications.filter((n) => !n.isRead).length;

        return (
          <div className="min-h-screen pb-20" style={{ backgroundColor: "var(--color-paper)" }}>
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <div>
                <p className="text-m-label font-bold uppercase tracking-wider" style={{ color: "var(--color-ink-400)" }}>
                  Notifications
                </p>
                <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                  {notifications.length} total{unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
                </p>
              </div>
              {unreadCount > 0 && <MobileNotificationsMarkAll />}
            </div>

            {notifications.length === 0 ? (
              <MobileEmptyState
                icon={Bell}
                title="No notifications yet"
                hint="Approvals, task assignments, and alerts will land here"
              />
            ) : (
              <div className="px-4 space-y-2">
                {notifications.map((n) => {
                  const href = resolveLinkForSurface(n.link);
                  const body = (
                    <>
                      <div className="flex items-start gap-2.5">
                        {!n.isRead && (
                          <span className="mt-1.5 size-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--color-brand)" }} />
                        )}
                        <div className={`min-w-0 flex-1 ${n.isRead ? "pl-4" : ""}`}>
                          <p className={`text-m-body leading-snug ${n.isRead ? "font-medium" : "font-bold"}`} style={{ color: "var(--color-ink-950)" }}>
                            {n.title}
                          </p>
                          {n.message && (
                            <p className="text-m-caption mt-0.5 line-clamp-2" style={{ color: "var(--color-ink-500)" }}>
                              {n.message}
                            </p>
                          )}
                          <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-400)" }}>
                            {formatRelativeTime(new Date(n.createdAt))}
                          </p>
                        </div>
                      </div>
                    </>
                  );
                  const cls = "block rounded-[0.625rem] border p-3";
                  return href ? (
                    <Link key={n.id} href={href} className={`${cls} press`} style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                      {body}
                    </Link>
                  ) : (
                    <div key={n.id} className={cls} style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                      {body}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
