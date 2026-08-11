"use client";

import { useEffect, useState, useCallback } from "react";

const FIELD_MODE_KEY = "nirman_field_mode";

/**
 * Field Mode — opt-in accessibility enhancement for outdoor field use.
 * When enabled, adds a `field-mode` class to <html> which triggers
 * CSS overrides for larger text sizes and higher contrast.
 *
 * Preference persists in localStorage. CSS-only — no component
 * refactoring required.
 */
export function useFieldMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(FIELD_MODE_KEY) === "true";
    setEnabled(saved);
    if (saved) {
      document.documentElement.classList.add("field-mode");
    }
  }, []);

  const toggle = useCallback((value?: boolean) => {
    setEnabled((prev) => {
      const next = value ?? !prev;
      localStorage.setItem(FIELD_MODE_KEY, String(next));
      if (next) {
        document.documentElement.classList.add("field-mode");
      } else {
        document.documentElement.classList.remove("field-mode");
      }
      return next;
    });
  }, []);

  return { enabled, toggle };
}
