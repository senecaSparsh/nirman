"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { setGlobalCurrencyMode, type CurrencyMode } from "@/lib/utils";

type CurrencyContextValue = {
  mode: CurrencyMode;
  toggle: () => void;
  setMode: (mode: CurrencyMode) => void;
};

const CurrencyContext = createContext<CurrencyContextValue>({
  mode: "compact",
  toggle: () => {},
  setMode: () => {},
});

export const CURRENCY_COOKIE = "nirman-currency-mode";
const STORAGE_KEY = "nirman-currency-mode";

function getInitialMode(): CurrencyMode {
  if (typeof window === "undefined") return "compact";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "compact" || stored === "detailed") return stored;
  // Default: compact everywhere — KPIs, stats, and badges read better
  // without the visual noise of paise. Toggle to detailed for GL/invoices.
  return "compact";
}

/** Persist the mode to both localStorage (client) and a cookie (server-readable). */
function persistMode(mode: CurrencyMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable in some contexts
  }
  try {
    document.cookie = `${CURRENCY_COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    // cookie may be unavailable in some contexts
  }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<CurrencyMode>("compact");

  useEffect(() => {
    const initial = getInitialMode();
    setModeState(initial);
    setGlobalCurrencyMode(initial);
    // Sync cookie on mount so server renders match the client preference.
    persistMode(initial);
  }, []);

  const setMode = useCallback((m: CurrencyMode) => {
    setModeState(m);
    setGlobalCurrencyMode(m);
    persistMode(m);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "compact" ? "detailed" : "compact";
      setGlobalCurrencyMode(next);
      persistMode(next);
      return next;
    });
  }, []);

  return (
    <CurrencyContext.Provider value={{ mode, toggle, setMode }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrencyMode() {
  return useContext(CurrencyContext);
}
