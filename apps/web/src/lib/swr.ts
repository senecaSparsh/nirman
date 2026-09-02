"use client";
import { SWRConfig } from "swr";

export const swrFetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((r) => {
    if (!r.ok) {
      return r.json().then((body) => {
        throw new Error(body?.error ?? body?.message ?? `HTTP ${r.status}`);
      }).catch(() => { throw new Error(`HTTP ${r.status}`); });
    }
    return r.json();
  });

export const swrConfig = {
  fetcher: swrFetcher,
  revalidateOnFocus: false,
  dedupingInterval: 2000,
  errorRetryCount: 2,
};

export { SWRConfig };
