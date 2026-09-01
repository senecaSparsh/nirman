"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Local-First Mode — when enabled, the app caches API responses in
 * localStorage so the user can view their data even when offline or
 * on a slow connection. This is a user preference toggle, not a
 * replacement for the server.
 *
 * What gets cached:
 *   - List API responses (GET /api/*) — stored with a TTL
 *   - Form drafts (already handled by use-drafts.ts via IndexedDB)
 *
 * What does NOT get cached:
 *   - Mutations (POST/PATCH/DELETE) — these go through the offline queue
 *   - Auth/session data — handled by Better-Auth cookies
 *   - File uploads — too large for localStorage
 *
 * The cache is best-effort: if localStorage is full or unavailable,
 * the app falls back to network-only mode silently.
 */

const STORAGE_PREFIX = "nirman-cache:";
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 50; // prevent localStorage overflow
const MAX_ENTRY_SIZE = 500_000; // 500KB per entry

export function isLocalFirstMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("nirman-storage-mode") === "local";
}

export function setLocalFirstMode(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) {
    localStorage.setItem("nirman-storage-mode", "local");
  } else {
    localStorage.removeItem("nirman-storage-mode");
    clearLocalCache();
  }
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

function getCacheKey(url: string): string {
  return `${STORAGE_PREFIX}${url}`;
}

function getCachedData(url: string): { data: unknown; isStale: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getCacheKey(url));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;
    return {
      data: entry.data,
      isStale: age > entry.ttl,
    };
  } catch {
    return null;
  }
}

function setCachedData(url: string, data: unknown, ttl: number = DEFAULT_TTL_MS) {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry = { data, timestamp: Date.now(), ttl };
    const serialized = JSON.stringify(entry);
    if (serialized.length > MAX_ENTRY_SIZE) return; // skip large entries
    // Evict oldest entries if we're at capacity
    evictIfNeeded();
    localStorage.setItem(getCacheKey(url), serialized);
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

function evictIfNeeded() {
  if (typeof window === "undefined") return;
  const cacheKeys = Object.keys(localStorage)
    .filter((k) => k.startsWith(STORAGE_PREFIX))
    .map((k) => ({
      key: k,
      timestamp: (() => {
        try {
          return JSON.parse(localStorage.getItem(k) ?? "{}").timestamp ?? 0;
        } catch {
          return 0;
        }
      })(),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  while (cacheKeys.length >= MAX_ENTRIES) {
    const oldest = cacheKeys.shift();
    if (oldest) localStorage.removeItem(oldest.key);
  }
}

export function clearLocalCache() {
  if (typeof window === "undefined") return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(STORAGE_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

/**
 * fetchWithCache — wraps fetch with local-first caching.
 * When local-first mode is on:
 *   1. Return cached data immediately (if available)
 *   2. Revalidate in the background
 *   3. Update cache with fresh data
 *
 * When local-first mode is off, this is just a regular fetch.
 */
export async function fetchWithCache(
  url: string,
  options?: RequestInit,
): Promise<{ data: unknown; fromCache: boolean; isStale: boolean }> {
  const localFirst = isLocalFirstMode();

  if (localFirst) {
    const cached = getCachedData(url);
    if (cached) {
      // Revalidate in background (fire-and-forget)
      fetch(url, { ...options, credentials: "include" })
        .then((r) => r.json())
        .then((data) => setCachedData(url, data))
        .catch(() => {/* ignore background revalidation errors */});
      return { data: cached.data, fromCache: true, isStale: cached.isStale };
    }
  }

  // Network fetch
  const res = await fetch(url, { ...options, credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

  if (localFirst) {
    setCachedData(url, data);
  }

  return { data, fromCache: false, isStale: false };
}

/**
 * useLocalFirstMode — React hook to read/toggle the local-first setting.
 */
export function useLocalFirstMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isLocalFirstMode());
  }, []);

  const toggle = useCallback((on: boolean) => {
    setLocalFirstMode(on);
    setEnabled(on);
  }, []);

  return { enabled, toggle };
}
