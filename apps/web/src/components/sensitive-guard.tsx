"use client";

import { useEffect, useMemo, useState, type ClipboardEvent, type ReactNode } from "react";
import { useSession } from "@/lib/auth-client";

/**
 * SensitiveGuard — leak-deterrence wrapper for confidential pages
 * (employee PII, payroll, finance, reports).
 *
 * Two deterrents:
 *  1. Watermark — the signed-in user's name + today's date, tiled
 *     diagonally across the whole viewport at low opacity. Doesn't block
 *     screenshots; makes any leaked capture attributable to an account
 *     and a day. Hidden when printing so documents stay clean.
 *  2. Casual-copy block — right-click context menu, copy/cut, and drag
 *     are suppressed inside the guarded region. Editable fields
 *     (input/textarea/contenteditable) keep normal copy/paste so forms
 *     still work; paste is never blocked (it can't leak data out).
 *
 * NOTE: client-side deterrence stops casual copying only — anything
 * rendered in a browser is technically extractable. The real protection
 * stays server-side (auth-gated APIs + employee-visibility redaction);
 * this layer adds attribution + casual-copy friction.
 */

/** True when the event target is an editable field — keep copy/paste working there. */
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest("input, textarea, [contenteditable='true'], [contenteditable='']")
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Tiled diagonal watermark as a data-URI background — covers any viewport with zero extra DOM. */
function watermarkImage(text: string, fill: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">` +
    `<text x="160" y="120" text-anchor="middle" transform="rotate(-24 160 120)" ` +
    `font-family="system-ui, -apple-system, sans-serif" font-size="13" ` +
    `fill="${fill}" fill-opacity="0.10">${escapeXml(text)}</text></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export function SensitiveGuard({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  // Render the watermark only after mount — the date label is computed
  // client-side and must not participate in SSR hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const user = session?.user as { name?: string | null; email?: string | null } | undefined;
  const label = `${user?.name || user?.email || "Confidential"} · ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;

  // Two variants: dark text for the light theme, light text for dark mode.
  const lightImg = useMemo(() => watermarkImage(label, "#3d3930"), [label]);
  const darkImg = useMemo(() => watermarkImage(label, "#e8e3d8"), [label]);

  const blockUnlessEditable = (e: ClipboardEvent<HTMLElement>) => {
    if (!isEditableTarget(e.target)) e.preventDefault();
  };

  return (
    <div
      data-sensitive-guard
      className="select-none"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={blockUnlessEditable}
      onCut={blockUnlessEditable}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
      {mounted && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[90] print:hidden dark:hidden"
            style={{ backgroundImage: lightImg, backgroundRepeat: "repeat" }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[90] hidden print:hidden dark:block"
            style={{ backgroundImage: darkImg, backgroundRepeat: "repeat" }}
          />
        </>
      )}
    </div>
  );
}
