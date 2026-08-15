"use client";

import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * ThemeToggleRow — a settings-style row that toggles dark mode.
 *
 * Same behaviour as the desktop ThemeToggle and the /m/me page toggle:
 * flips the `dark` class on `documentElement` and persists to
 * localStorage under `nirman.theme`. Styled to sit naturally in the
 * mobile settings page's "App" section next to InstallAppRow.
 */
export function ThemeToggleRow() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem("nirman.theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press text-left"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <span
        className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        {dark ? (
          <Sun className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
        ) : (
          <Moon className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.6875rem] font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          {dark ? "Dark mode" : "Light mode"}
        </p>
        <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          Tap to switch theme
        </p>
      </div>
      <span
        className="shrink-0 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-1 rounded-[0.375rem]"
        style={{
          backgroundColor: dark ? "var(--color-ink-950)" : "var(--color-concrete)",
          color: dark ? "#fff" : "var(--color-ink-500)",
        }}
      >
        {dark ? "On" : "Off"}
      </span>
    </button>
  );
}
