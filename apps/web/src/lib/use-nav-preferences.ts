"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   NAV PREFERENCES — pinned pages + recent pages + frecency scoring

   Lightweight personalization for the mobile NavSheet. Follows the
   same localStorage pattern as nirman.theme, nirman.nav.panel,
   nirman-currency-mode, nirman_field_mode.

   Three mechanisms:
   1. **Pinned pages** (manual) — user taps a pin icon on any NavSheet
      row to add it to "Quick Access" at the top. Persisted to
      localStorage key "nirman.nav.pinned".
   2. **Recent pages** (automatic) — tracks the last 12 unique /m/*
      pages the user navigated to, with visit counts. Persisted to
      localStorage key "nirman.nav.recent" as a map of href → {visits, ts}.
   3. **Frecency scoring** — combines visit frequency + recency to sort
      the Recent section. Pages you visit often float to the top;
      one-off visits sink. Formula: visits × recencyDecay, where
      recencyDecay = 1 / (1 + ageInDays). This is the same algorithm
      Notion/Linear use for "recently visited" sorting.

   All per-device preferences (localStorage), not per-user (DB).
   ═══════════════════════════════════════════════════════════════════════════ */

const PINNED_KEY = "nirman.nav.pinned";
const RECENT_KEY = "nirman.nav.recent";
const HIDDEN_KEY = "nirman.nav.hidden";
const MAX_RECENT = 12;

// ── Types ──

interface RecentEntry {
  /** Visit count — increments on each visit. */
  visits: number;
  /** Last visit timestamp (ms since epoch). */
  ts: number;
}

type RecentMap = Record<string, RecentEntry>;

// ── Storage helpers ──

function readArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, value: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — preference won't persist */
  }
}

function readRecentMap(): RecentMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Handle legacy format (array of strings) → migrate to map
    if (Array.isArray(parsed)) {
      const map: RecentMap = {};
      const now = Date.now();
      for (const href of parsed) {
        if (typeof href === "string") map[href] = { visits: 1, ts: now };
      }
      return map;
    }
    if (typeof parsed === "object" && parsed !== null) return parsed as RecentMap;
    return {};
  } catch {
    return {};
  }
}

function writeRecentMap(map: RecentMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(map));
  } catch {
    /* private mode — preference won't persist */
  }
}

// ── Frecency scoring ──

/**
 * Frecency score = visits × recencyDecay.
 * recencyDecay = 1 / (1 + ageInDays).
 *
 * - A page visited 10 times today: 10 × 1.0 = 10.0
 * - A page visited 10 times a week ago: 10 × 0.125 = 1.25
 * - A page visited once today: 1 × 1.0 = 1.0
 * - A page visited once a month ago: 1 × 0.032 = 0.032
 *
 * This naturally surfaces frequently-visited recent pages while
 * letting one-off old visits sink.
 */
function frecencyScore(entry: RecentEntry): number {
  const ageInDays = (Date.now() - entry.ts) / (1000 * 60 * 60 * 24);
  const recencyDecay = 1 / (1 + ageInDays);
  return entry.visits * recencyDecay;
}

// ── Hooks ──

/**
 * Manages pinned pages (user-curated Quick Access).
 * Returns the list of pinned hrefs + toggle function.
 */
export function usePinnedPages() {
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    setPinned(readArray(PINNED_KEY));
  }, []);

  const togglePin = useCallback((href: string) => {
    setPinned((prev) => {
      const next = prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href];
      writeArray(PINNED_KEY, next);
      return next;
    });
  }, []);

  const isPinned = useCallback((href: string) => pinned.includes(href), [pinned]);

  return { pinned, togglePin, isPinned };
}

/**
 * Manages hidden pages (user-curated hide list).
 * Hidden pages are filtered out of the NavSheet accordion.
 * Recoverable via a "Show hidden" toggle.
 */
export function useHiddenPages() {
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    setHidden(readArray(HIDDEN_KEY));
  }, []);

  const toggleHidden = useCallback((href: string) => {
    setHidden((prev) => {
      const next = prev.includes(href)
        ? prev.filter((h) => h !== href)
        : [...prev, href];
      writeArray(HIDDEN_KEY, next);
      return next;
    });
  }, []);

  const isHidden = useCallback((href: string) => hidden.includes(href), [hidden]);

  return { hidden, toggleHidden, isHidden };
}

/**
 * Tracks recently visited /m/* pages with visit counts + frecency scoring.
 * Call trackVisit(pathname) on every route change.
 *
 * Returns:
 * - recent: hrefs sorted by frecency score (most relevant first)
 * - trackVisit: call on route change to record a visit
 * - visitCounts: map of href → visit count (for display badges)
 */
export function useRecentPages() {
  const [recentMap, setRecentMap] = useState<RecentMap>({});

  useEffect(() => {
    setRecentMap(readRecentMap());
  }, []);

  const trackVisit = useCallback((pathname: string) => {
    if (!pathname.startsWith("/m/") || pathname === "/m/") return;
    setRecentMap((prev) => {
      const existing = prev[pathname];
      const entry: RecentEntry = {
        visits: (existing?.visits ?? 0) + 1,
        ts: Date.now(),
      };
      const next = { ...prev, [pathname]: entry };
      // Cap at MAX_RECENT — evict the lowest-frecency entry
      const entries = Object.entries(next);
      if (entries.length > MAX_RECENT) {
        entries.sort((a, b) => frecencyScore(b[1]) - frecencyScore(a[1]));
        const trimmed: RecentMap = {};
        for (const [href, e] of entries.slice(0, MAX_RECENT)) {
          trimmed[href] = e;
        }
        writeRecentMap(trimmed);
        return trimmed;
      }
      writeRecentMap(next);
      return next;
    });
  }, []);

  // Sort by frecency score — most relevant first
  const recent = useMemo(() => {
    return Object.entries(recentMap)
      .sort((a, b) => frecencyScore(b[1]) - frecencyScore(a[1]))
      .map(([href]) => href);
  }, [recentMap]);

  // Visit counts for display (e.g. "3×" badge)
  const visitCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [href, entry] of Object.entries(recentMap)) {
      counts[href] = entry.visits;
    }
    return counts;
  }, [recentMap]);

  return { recent, trackVisit, visitCounts };
}
