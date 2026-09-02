"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * EMPLOYEE NAV LISTENER — global double-click-to-profile.
 *
 * Listens for `dblclick` events anywhere in the document. When the
 * clicked element (or its closest ancestor) carries a `data-emp-id`
 * attribute, the user is navigated to that employee's profile page.
 *
 * On desktop the profile lives at `/hr/employees/{id}`; on the mobile
 * surface (`/m/...`) it lives at `/m/hr/employees/{id}`. The listener
 * picks the right one based on the current pathname so the user stays
 * on their surface.
 *
 * This is a singleton — mount it once in the root layout. It has no
 * visible output.
 */
export function EmployeeNavListener() {
  const router = useRouter();

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target || !(target instanceof Element)) return;
      const el = target.closest("[data-emp-id]") as HTMLElement | null;
      if (!el) return;
      const id = el.getAttribute("data-emp-id");
      if (!id) return;
      e.preventDefault();
      const isMobile = window.location.pathname.startsWith("/m");
      router.push(isMobile ? `/m/hr/employees/${id}` : `/hr/employees/${id}`);
    }
    document.addEventListener("dblclick", handler);
    return () => document.removeEventListener("dblclick", handler);
  }, [router]);

  return null;
}
