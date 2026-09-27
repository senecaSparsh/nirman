"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A notification row that marks itself read when tapped. The full-page list is
 * server-rendered, so this client wrapper fires the PATCH before navigating —
 * otherwise tapping an unread notification left the badge stale until a manual
 * "mark all".
 */
export function NotificationRow({ id, href, children }: { id: string; href: string | null; children: ReactNode }) {
  const router = useRouter();
  const markRead = () => {
    // fire-and-forget — navigation shouldn't block on the read receipt
    fetch("/api/notifications/in-app", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  if (href) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          markRead();
          router.push(href);
        }}
        className="block rounded-[0.625rem] border p-3 press"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {children}
      </a>
    );
  }
  return (
    <div
      onClick={markRead}
      className="block rounded-[0.625rem] border p-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {children}
    </div>
  );
}
