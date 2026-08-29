"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useSmartDefaults — remembers last-used values per form type and pre-fills
 * them on the next visit. Values are stored in localStorage, keyed by
 * formType + field name.
 *
 * Usage:
 *   const { getDefault, recordDefaults, hasDefaults } = useSmartDefaults("po");
 *   // On mount: pre-fill form from getDefault()
 *   // On submit: recordDefaults({ supplierId, projectId, scope })
 */

const STORAGE_PREFIX = "nirman:defaults:";

type DefaultMap = Record<string, string>;

function readDefaults(formType: string): DefaultMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + formType);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) || typeof parsed !== "object" ? {} : parsed;
  } catch {
    return {};
  }
}

function writeDefaults(formType: string, values: DefaultMap) {
  if (typeof window === "undefined") return;
  try {
    // Merge with existing so partial updates don't wipe other fields
    const existing = readDefaults(formType);
    const merged = { ...existing, ...values };
    localStorage.setItem(STORAGE_PREFIX + formType, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent("nirman:defaults-updated"));
  } catch {
    // ignore
  }
}

export function useSmartDefaults(formType: string) {
  const [defaults, setDefaults] = useState<DefaultMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setDefaults(readDefaults(formType));
    setLoaded(true);
    function onUpdate() {
      setDefaults(readDefaults(formType));
    }
    window.addEventListener("nirman:defaults-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("nirman:defaults-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [formType]);

  const getDefault = useCallback(
    (field: string): string | undefined => {
      const v = defaults[field];
      return v && v.length > 0 ? v : undefined;
    },
    [defaults],
  );

  const recordDefaults = useCallback(
    (values: Record<string, string | undefined>) => {
      // Only store non-empty, defined values
      const clean: DefaultMap = {};
      for (const [k, v] of Object.entries(values)) {
        if (v !== undefined && v !== null && String(v).length > 0) {
          clean[k] = String(v);
        }
      }
      if (Object.keys(clean).length > 0) {
        writeDefaults(formType, clean);
      }
    },
    [formType],
  );

  const clearDefaults = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_PREFIX + formType);
    window.dispatchEvent(new CustomEvent("nirman:defaults-updated"));
  }, [formType]);

  const hasDefaults = loaded && Object.keys(defaults).length > 0;

  return { getDefault, recordDefaults, clearDefaults, hasDefaults, defaults, loaded };
}
