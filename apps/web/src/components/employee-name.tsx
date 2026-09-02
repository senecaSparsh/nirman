"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * EMPLOYEE NAME — a person's name that links to their profile on
 * double-click (and single-click when `asLink` is set).
 *
 * Renders a `<span>` (not an `<a>`) by default so it blends into
 * tables and rows without stealing single-clicks from row actions.
 * The global `EmployeeNavListener` picks up the `data-emp-id`
 * attribute on double-click and navigates to the profile page.
 *
 * Visual hint: a subtle dotted underline on hover + `cursor-pointer`
 * so users discover the behaviour without a manual.
 *
 * Set `asLink` to render a real `<a>` (single-click navigation) for
 * places where the name is the primary navigation target (e.g. the
 * employee list row).
 */
export function EmployeeName({
  id,
  name,
  className,
  asLink = false,
  title = "Double-click to view profile",
}: {
  id: string;
  name: string;
  className?: string;
  /** Render as a real anchor (single-click nav) instead of a span. */
  asLink?: boolean;
  /** Tooltip text. Override or pass `null` to suppress. */
  title?: string | null;
}) {
  const router = useRouter();
  const isMobile = typeof window !== "undefined" && window.location.pathname.startsWith("/m");
  const href = isMobile ? `/m/hr/employees/${id}` : `/hr/employees/${id}`;

  const baseClass = cn(
    "cursor-pointer transition-[text-decoration] duration-100",
    "hover:underline hover:decoration-dotted hover:underline-offset-2",
    className,
  );

  if (asLink) {
    return (
      <a
        href={href}
        data-emp-id={id}
        className={baseClass}
        title={title ?? undefined}
        onClick={(e) => {
          // Let the anchor do its thing for normal clicks, but use
          // router.push for left-clicks so we get client-side nav.
          if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            router.push(href);
          }
        }}
      >
        {name}
      </a>
    );
  }

  return (
    <span
      data-emp-id={id}
      className={baseClass}
      title={title ?? undefined}
      onDoubleClick={(e) => {
        e.stopPropagation();
        router.push(href);
      }}
    >
      {name}
    </span>
  );
}
