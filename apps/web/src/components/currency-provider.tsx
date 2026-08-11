"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type CurrencyMode = "compact" | "detailed";

type CurrencyContextValue = {
  mode: CurrencyMode;
  toggle: () => void;
  setMode: (mode: CurrencyMode) => void;
};

const CurrencyContext = createContext<CurrencyContextValue>({
  mode: "detailed",
  toggle: () => {},
  setMode: () => {},
});

const STORAGE_KEY = "nirman-currency-mode";

function getInitialMode(): CurrencyMode {
  if (typeof window === "undefined") return "detailed";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "compact" || stored === "detailed") return stored;
  // Default: compact on mobile (screen width < 768px), detailed on desktop
  return window.innerWidth < 768 ? "compact" : "detailed";
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<CurrencyMode>("detailed");

  useEffect(() => {
    setModeState(getInitialMode());
  }, []);

  const setMode = useCallback((m: CurrencyMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "compact" ? "detailed" : "compact";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
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
