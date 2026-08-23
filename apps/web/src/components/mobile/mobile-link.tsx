"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, type ComponentProps } from "react";

/**
 * MobileLink — a Next.js <Link> that prefetches on touchstart.
 *
 * On mobile, viewport-based prefetch (Next.js default) is wasteful —
 * the user can only tap one link at a time. Instead, we prefetch the
 * route the moment the finger touches the link, so by the time the
 * tap completes (~100ms later), the page is already loaded and
 * navigation feels instant.
 *
 * Drop-in replacement for <Link> on mobile list pages:
 *   <MobileLink href={`/m/procurement/${po.id}`}>…</MobileLink>
 *
 * Accepts all the same props as <Link>.
 */
type MobileLinkProps = ComponentProps<typeof Link>;

export function MobileLink({ href, onTouchStart, ...rest }: MobileLinkProps) {
  const router = useRouter();

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLAnchorElement>) => {
      const hrefStr = typeof href === "string" ? href : href.toString();
      router.prefetch(hrefStr);
      onTouchStart?.(e);
    },
    [href, router, onTouchStart],
  );

  return <Link href={href} onTouchStart={handleTouchStart} {...rest} />;
}
