"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, CheckCircle2, ChevronRight } from "lucide-react";

/**
 * InstallPrompt — installability detection + UI.
 *
 * Exports:
 *   - useInstallPrompt() — hook that captures `beforeinstallprompt`,
 *     detects iOS Safari, and exposes `canInstall`, `promptInstall()`,
 *     `isIos`, `isStandalone`.
 *   - InstallAppRow — a settings-style row that shows "Install app"
 *     when installable, or "Add to Home Screen" instructions for iOS.
 *     Renders nothing if the app is already installed or not eligible.
 *
 * Dismissal is persisted to localStorage (30 days) so the row doesn't
 * reappear immediately after being dismissed.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "nirman.install-dismissed";
const DISMISS_DAYS = 30;

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already running as installed PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsStandalone(true);
      return;
    }
    // Only relevant on touch devices
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    // Respect prior dismissal
    try {
      const d = localStorage.getItem(DISMISS_KEY);
      if (d) {
        const age = Date.now() - parseInt(d, 10);
        if (age < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
          setDismissed(true);
          return;
        }
      }
    } catch {
      // localStorage blocked — proceed
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari detection (no beforeinstallprompt event)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
    if (ios && safari) setIsIos(true);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setCanInstall(false);
      setDeferredPrompt(null);
    } else {
      dismiss();
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  return { canInstall, isIos, isStandalone, dismissed, promptInstall, dismiss };
}

/**
 * InstallAppRow — a settings-style row.
 *
 * Shows one of three states:
 *   1. "Install app" button row — when `beforeinstallprompt` fired (Chrome/Android)
 *   2. "Add to Home Screen" info row — on iOS Safari (tappable, shows instructions)
 *   3. Nothing — if already installed, not eligible, or dismissed
 *
 * Designed to sit naturally in the Settings page alongside other rows.
 */
export function InstallAppRow() {
  const { canInstall, isIos, isStandalone, dismissed, promptInstall, dismiss } = useInstallPrompt();
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  if (isStandalone) {
    // Already installed — show a subtle "installed" indicator
    return (
      <div
        className="flex items-center gap-2.5 rounded-[0.625rem] border p-2.5"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <span
          className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
          style={{ backgroundColor: "var(--color-go-wash)" }}
        >
          <CheckCircle2 className="size-3.5" style={{ color: "var(--color-go)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>
            App installed
          </p>
          <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            Running in standalone mode
          </p>
        </div>
      </div>
    );
  }

  // Not eligible (not touch, not iOS, no beforeinstallprompt) and not dismissed
  if (!canInstall && !isIos) return null;
  if (dismissed) return null;

  // ── iOS: show instructions sheet ──
  if (isIos && !canInstall) {
    if (showIosInstructions) {
      return (
        <div
          className="rounded-[0.625rem] border p-3"
          style={{
            borderColor: "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
            backgroundColor: "color-mix(in srgb, var(--color-signal) 5%, var(--color-paper))",
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              Add to Home Screen
            </p>
            <button
              onClick={() => setShowIosInstructions(false)}
              className="text-[0.5625rem] font-semibold press shrink-0"
              style={{ color: "var(--color-ink-500)" }}
            >
              Close
            </button>
          </div>
          <ol className="flex flex-col gap-1.5 text-[0.625rem]" style={{ color: "var(--color-ink-700)" }}>
            <li className="flex gap-1.5">
              <span className="font-bold shrink-0" style={{ color: "var(--color-signal-dark)" }}>1.</span>
              <span>Tap the <span className="font-semibold">Share</span> icon in Safari&apos;s toolbar</span>
            </li>
            <li className="flex gap-1.5">
              <span className="font-bold shrink-0" style={{ color: "var(--color-signal-dark)" }}>2.</span>
              <span>Scroll down and tap <span className="font-semibold">Add to Home Screen</span></span>
            </li>
            <li className="flex gap-1.5">
              <span className="font-bold shrink-0" style={{ color: "var(--color-signal-dark)" }}>3.</span>
              <span>Tap <span className="font-semibold">Add</span> &mdash; the app gets its own icon</span>
            </li>
          </ol>
          <button
            onClick={dismiss}
            className="mt-2 text-[0.5rem] font-semibold press"
            style={{ color: "var(--color-ink-500)" }}
          >
            Don&apos;t show again
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => setShowIosInstructions(true)}
        className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press text-left"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <span
          className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
          style={{ backgroundColor: "var(--color-signal-wash)" }}
        >
          <Smartphone className="size-3.5" style={{ color: "var(--color-signal-dark)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>
            Add to Home Screen
          </p>
          <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            Install for offline field access
          </p>
        </div>
        <ChevronRight className="size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
      </button>
    );
  }

  // ── Chrome/Android: install button row ──
  return (
    <button
      onClick={promptInstall}
      className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press text-left"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <span
        className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
        style={{ backgroundColor: "var(--color-signal-wash)" }}
      >
        <Download className="size-3.5" style={{ color: "var(--color-signal-dark)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.6875rem] font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          Install app
        </p>
        <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          Add to home screen for offline access
        </p>
      </div>
      <span
        className="shrink-0 rounded-[0.375rem] px-2 py-1 text-[0.5rem] font-bold uppercase tracking-wide"
        style={{ backgroundColor: "var(--color-signal)", color: "var(--color-ink-950)" }}
      >
        Install
      </span>
    </button>
  );
}
