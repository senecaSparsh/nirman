"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, PackageX, TrendingDown, ArrowRight, ClipboardCheck, CheckCircle2 } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   ATTENTION BANNER CAROUSEL

   A swipeable banner carousel that replaces the static stock-health card.
   Each slide is a low-stock / out-of-stock material with a gradient
   background, status icon, and a CTA to view details.

   Adapted from nirman-os's BannerCarousel — same auto-scroll + swipe
   mechanics, but shows inventory alerts instead of promotional banners.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AttentionBanner {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Severity: "out" = red, "low" = amber, "summary" = blue, "clear" = green */
  severity: "out" | "low" | "summary" | "clear";
  /** Stock quantity text */
  qtyText: string;
  /** Category name */
  category: string;
}

const GRADIENTS: Record<AttentionBanner["severity"], string> = {
  out: "linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)",
  low: "linear-gradient(135deg, #b45309 0%, #d97706 100%)",
  summary: "linear-gradient(135deg, #1a3a5c 0%, #2d5a8c 100%)",
  clear: "linear-gradient(135deg, #15803d 0%, #22c55e 100%)",
};

const ACCENT_COLORS: Record<AttentionBanner["severity"], string> = {
  out: "#fca5a5",
  low: "#fcd34d",
  summary: "#93c5fd",
  clear: "#bbf7d0",
};

export function AttentionBannerCarousel({
  banners,
  approvalsCount = 0,
  approvalsHref = "/m/pulse/approvals",
}: {
  banners: AttentionBanner[];
  approvalsCount?: number;
  approvalsHref?: string;
}) {
  const totalAttention = banners.length;
  const [current, setCurrent] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);
  const resumeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const goNext = React.useCallback(() => {
    setCurrent((c) => (c + 1) % banners.length);
  }, [banners.length]);

  const goPrev = React.useCallback(() => {
    setCurrent((c) => (c - 1 + banners.length) % banners.length);
  }, [banners.length]);

  // Auto-scroll every 4s, pause on touch
  React.useEffect(() => {
    if (paused || banners.length <= 1) return;
    const timer = setInterval(goNext, 4000);
    return () => clearInterval(timer);
  }, [paused, goNext, banners.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStart.current.x;
    touchStart.current = null;

    if (Math.abs(dx) > 40) {
      if (dx < 0) goNext();
      else goPrev();
    }

    resumeTimer.current = setTimeout(() => setPaused(false), 2000);
  };

  if (banners.length === 0) return null;

  return (
    <div
      className="relative overflow-hidden rounded-[0.625rem] mb-3"
      style={{ background: GRADIENTS[banners[0]?.severity ?? "summary"], touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Approvals badge — top left, persistent across all slides */}
      {approvalsCount > 0 ? (
        <Link
          href={approvalsHref}
          className="absolute top-1.5 left-1.5 z-30 flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.5rem] font-bold press"
          style={{
            backgroundColor: "rgba(255,255,255,0.25)",
            color: "#fff",
            backdropFilter: "blur(4px)",
          }}
        >
          <ClipboardCheck className="size-2.5" />
          {approvalsCount} approval{approvalsCount !== 1 ? "s" : ""}
        </Link>
      ) : null}

      {/* Total attention count — top right, persistent */}
      {totalAttention > 1 ? (
        <div
          className="absolute top-1.5 right-1.5 z-30 flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.5625rem] font-bold pointer-events-none"
          style={{
            backgroundColor: "rgba(255,255,255,0.25)",
            color: "#fff",
            backdropFilter: "blur(4px)",
          }}
        >
          <AlertTriangle className="size-3" />
          {current + 1}/{totalAttention}
        </div>
      ) : null}

      {/* Slides */}
      <div
        className="flex transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {banners.map((banner) => {
          const Icon =
            banner.severity === "out"
              ? PackageX
              : banner.severity === "low"
                ? TrendingDown
                : banner.severity === "clear"
                  ? CheckCircle2
                  : AlertTriangle;
          return (
            <Link
              key={banner.id}
              href={banner.href}
              className="block shrink-0 w-full"
              style={{ background: GRADIENTS[banner.severity] }}
            >
              <div className="px-4 py-5 flex items-center gap-3 min-h-[8rem]">
                {/* Icon */}
                <div
                  className="grid place-items-center w-14 h-14 rounded-[0.625rem] shrink-0"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                >
                  <Icon className="size-7" style={{ color: "#fff" }} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[0.5625rem] font-semibold uppercase tracking-wide block mb-1"
                    style={{ color: "#fff", opacity: 0.7 }}
                  >
                    {banner.category}
                  </span>
                  <p
                    className="font-bold text-[1rem] leading-tight truncate"
                    style={{ color: "#fff" }}
                  >
                    {banner.title}
                  </p>
                  <p
                    className="text-[0.75rem] mt-1 truncate"
                    style={{ color: "#fff", opacity: 0.8 }}
                  >
                    {banner.subtitle}
                  </p>
                </div>

                {/* CTA pill */}
                <div
                  className="shrink-0 rounded-full px-3 py-1.5 text-[0.75rem] font-bold flex items-center gap-1"
                  style={{
                    backgroundColor: ACCENT_COLORS[banner.severity],
                    color: "#1a1a1a",
                  }}
                >
                  {banner.qtyText}
                  <ArrowRight className="size-3" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Pagination dots */}
      {banners.length > 1 ? (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === current ? "1.25rem" : "0.375rem",
                backgroundColor: i === current
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(255,255,255,0.4)",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
