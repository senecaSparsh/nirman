"use client";

import React, { useCallback, useEffect, useRef, useState, useId } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   GlassSurface — reusable frosted-glass background wrapper

   Wraps any element and applies a translucent glass background effect
   (backdrop-blur + saturation + frost tint + edge-highlight box-shadow)
   WITHOUT altering the wrapped content's layout, padding, flex, borders,
   or dimensions. The consumer keeps full control of structure —
   GlassSurface only touches background, backdrop-filter, and box-shadow.

   **Usage:**
   <GlassSurface dark className="fixed bottom-0 inset-x-0 z-30" style={{ borderTop: "1px solid rgba(255,255,255,.25)" }}>
     <nav className="flex ...">...</nav>
   </GlassSurface>

   **What it sets (background-only):**
   - background: frosted tint (white @ backgroundOpacity over dark, or brighter over light)
   - backdropFilter: blur + saturate (or SVG chromatic displacement on Chrome)
   - WebkitBackdropFilter: Safari fallback
   - boxShadow: inset edge highlights (top + bottom hairlines)

   **What it does NOT touch:**
   - width, height, display, flex, padding, margin, overflow
   - border, borderRadius (consumer controls per-surface borders)
   - position, top/left/right/bottom, z-index (consumer controls via className)

   **SVG displacement (optional):** pass `distortion` to enable chromatic
   aberration edge displacement (Chrome only — Safari/Firefox automatically
   fall back to plain blur). The SVG filter definition is rendered as a
   hidden, absolutely-positioned child that doesn't affect layout.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface GlassDistortion {
  /** Displacement scale (negative = inward). Default: -180. */
  scale?: number;
  /** Gaussian blur on the displaced output. Default: 0. */
  displace?: number;
  /** Per-channel offset additions. Defaults: R=0, G=10, B=20. */
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
}

export interface GlassSurfaceProps {
  children: React.ReactNode;
  /** Force dark/light theme. Default: auto-detect via prefers-color-scheme. */
  dark?: boolean;
  /** Frost tint opacity (0–1). Dark: white overlay; Light: brighter white. Default: 0.1. */
  backgroundOpacity?: number;
  /** Backdrop blur in px (used when SVG displacement is not active). Default: 12. */
  blur?: number;
  /** Backdrop saturation multiplier. Default: 1.8. */
  saturation?: number;
  /** Enable SVG chromatic displacement (Chrome only). Omit for plain blur. */
  distortion?: GlassDistortion;
  /** Border radius in px — used only for the SVG displacement map shape. Default: 0. */
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function GlassSurface({
  children,
  dark,
  backgroundOpacity = 0.1,
  blur = 12,
  saturation = 1.8,
  distortion,
  borderRadius = 0,
  className = "",
  style = {},
}: GlassSurfaceProps) {
  const uniqueId = useId().replace(/:/g, "-");
  const filterId = `glass-filter-${uniqueId}`;
  const redGradId = `glass-red-${uniqueId}`;
  const blueGradId = `glass-blue-${uniqueId}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const redChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const greenChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const blueChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const gaussianBlurRef = useRef<SVGFEGaussianBlurElement>(null);

  const [isDark, setIsDark] = useState(dark ?? false);
  // Default true to avoid SSR flash — downgraded if feature detection says no.
  const [svgSupported, setSvgSupported] = useState(false);
  const [backdropSupported, setBackdropSupported] = useState(true);

  // ── Dark mode detection ──
  useEffect(() => {
    if (dark !== undefined) {
      setIsDark(dark);
      return;
    }
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [dark]);

  // ── Feature detection: backdrop-filter + SVG url() filter ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const canBackdrop =
      typeof CSS !== "undefined" && CSS.supports("backdrop-filter", "blur(10px)");
    setBackdropSupported(canBackdrop);

    if (!canBackdrop || !distortion) {
      setSvgSupported(false);
      return;
    }
    // SVG displacement in backdrop-filter: Chrome/Edge only.
    // Safari doesn't support url() references in backdrop-filter.
    // Firefox doesn't support backdrop-filter url() either.
    const ua = navigator.userAgent;
    const isWebkit = /Safari/.test(ua) && !/Chrome/.test(ua) && !/Edg/.test(ua);
    const isFirefox = /Firefox/.test(ua);
    if (isWebkit || isFirefox) {
      setSvgSupported(false);
      return;
    }
    const test = document.createElement("div");
    test.style.backdropFilter = `url(#${filterId})`;
    setSvgSupported(test.style.backdropFilter !== "");
  }, [filterId, distortion]);

  // ── SVG displacement map generation ──
  const generateDisplacementMap = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const w = Math.max(rect?.width || 400, 1);
    const h = Math.max(rect?.height || 200, 1);
    const edgeSize = Math.min(w, h) * 0.035;

    const svgContent = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient><linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient></defs><rect x="0" y="0" width="${w}" height="${h}" fill="black"/><rect x="0" y="0" width="${w}" height="${h}" rx="${borderRadius}" fill="url(#${redGradId})"/><rect x="0" y="0" width="${w}" height="${h}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode:difference"/><rect x="${edgeSize}" y="${edgeSize}" width="${w - edgeSize * 2}" height="${h - edgeSize * 2}" rx="${borderRadius}" fill="hsl(0 0% 50% / 0.93)" style="filter:blur(11px)"/></svg>`;

    return `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
  };

  const updateDisplacementMap = useCallback(() => {
    feImageRef.current?.setAttribute("href", generateDisplacementMap());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borderRadius, redGradId, blueGradId]);

  // ── Update displacement params when distortion config changes ──
  useEffect(() => {
    if (!svgSupported || !distortion) return;
    updateDisplacementMap();
    const {
      scale = -180,
      displace = 0,
      redOffset = 0,
      greenOffset = 10,
      blueOffset = 20,
    } = distortion;
    [
      { ref: redChannelRef, offset: redOffset },
      { ref: greenChannelRef, offset: greenOffset },
      { ref: blueChannelRef, offset: blueOffset },
    ].forEach(({ ref, offset }) => {
      ref.current?.setAttribute("scale", (scale + offset).toString());
      ref.current?.setAttribute("xChannelSelector", "R");
      ref.current?.setAttribute("yChannelSelector", "G");
    });
    gaussianBlurRef.current?.setAttribute("stdDeviation", displace.toString());
  }, [svgSupported, distortion, updateDisplacementMap]);

  // ── Resize observer — regenerate displacement map on size change ──
  useEffect(() => {
    if (!containerRef.current || !svgSupported) return;
    const ro = new ResizeObserver(() => setTimeout(updateDisplacementMap, 0));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [svgSupported, updateDisplacementMap]);

  // ── Compute glass styles (background-only properties) ──
  const glassStyle: React.CSSProperties = { ...style };

  if (backdropSupported) {
    glassStyle.background = isDark
      ? `rgba(255, 255, 255, ${backgroundOpacity})`
      : `rgba(255, 255, 255, ${backgroundOpacity * 2.5})`;
    if (svgSupported) {
      glassStyle.backdropFilter = `url(#${filterId}) saturate(${saturation})`;
    } else {
      glassStyle.backdropFilter = `blur(${blur}px) saturate(${saturation})`;
    }
    glassStyle.WebkitBackdropFilter = `blur(${blur}px) saturate(${saturation})`;
    glassStyle.boxShadow = isDark
      ? `inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(255,255,255,0.1)`
      : `inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(255,255,255,0.2)`;
  } else {
    // No backdrop-filter support — opaque fallback
    glassStyle.background = isDark ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.6)";
    glassStyle.boxShadow = isDark
      ? `inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(255,255,255,0.08)`
      : `inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(255,255,255,0.3)`;
  }

  return (
    <div ref={containerRef} className={`relative ${className}`} style={glassStyle}>
      {/* SVG filter definition — hidden, doesn't affect layout or painting.
          Only rendered when SVG displacement is active (Chrome + distortion prop). */}
      {svgSupported && distortion && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          style={{ zIndex: -1 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter
              id={filterId}
              colorInterpolationFilters="sRGB"
              x="0%"
              y="0%"
              width="100%"
              height="100%"
            >
              <feImage
                ref={feImageRef}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
              />
              <feDisplacementMap
                ref={redChannelRef}
                in="SourceGraphic"
                in2="map"
                result="dispRed"
              />
              <feColorMatrix
                in="dispRed"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="red"
              />
              <feDisplacementMap
                ref={greenChannelRef}
                in="SourceGraphic"
                in2="map"
                result="dispGreen"
              />
              <feColorMatrix
                in="dispGreen"
                type="matrix"
                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="green"
              />
              <feDisplacementMap
                ref={blueChannelRef}
                in="SourceGraphic"
                in2="map"
                result="dispBlue"
              />
              <feColorMatrix
                in="dispBlue"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="blue"
              />
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="output" />
              <feGaussianBlur ref={gaussianBlurRef} in="output" stdDeviation="0.7" />
            </filter>
          </defs>
        </svg>
      )}
      {/* Children render directly — no inner wrapper, no forced layout.
          The consumer's children flow exactly as they would in a plain div. */}
      {children}
    </div>
  );
}

export default GlassSurface;
