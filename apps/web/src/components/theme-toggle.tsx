"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "nirman.theme";

/**
 * THEME TOGGLE
 *
 * The theme lives on `documentElement.classList` and in localStorage,
 * applied by the boot script in the document head before first paint.
 * This control only *flips* it — it deliberately does not own the
 * initial value, because owning it in React state means reading
 * localStorage in an effect, which means a flash of the wrong theme on
 * every reload.
 *
 * Site supervisors work outdoors in glare (light) and site offices are
 * often lit by a single bulb (dark). This isn't a vanity feature.
 */
export function ThemeToggle({ className, tone = "chrome" }: { className?: string; tone?: "chrome" | "surface" }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* private mode — the preference just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md transition-colors",
        tone === "chrome"
          ? "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {/* Until mounted we render the light-mode icon rather than nothing,
          so the toolbar doesn't reflow when hydration lands. */}
      {mounted && dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
