"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` only after the component has mounted on the client.
 * During SSR and the first client render, returns `false`.
 *
 * Use this to guard client-only rendering (e.g. `window.location`,
 * `navigator.userAgent`, or any browser API that produces different
 * output than the server) and prevent React hydration mismatches.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
