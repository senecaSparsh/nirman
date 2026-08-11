"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * useRecentlyViewed — track the last 10 items a user opened.
 *
 * Business Owner: "My team navigates to the same 5-10 items constantly.
 * This is daily friction, not backlog."
 *
 * The hook pushes `{type, id, label, href, ts}` into a localStorage ring
 * buffer (max 10). It's called on every detail page/dialog open. The
 * command palette surfaces the list as a "Recently Viewed" section when
 * the palette is opened with no query.
 *
 * Storage key: `nirman.recent` (shared across all pages — a single
 * recent-items list, not per-entity-type, because the user's mental model
 * is "the things I was just looking at", regardless of type).
 *
 * Ring buffer semantics:
 *  · If the same `{type, id}` is pushed again, it moves to the front
 *    (deduplicated, not duplicated).
 *  · New items are prepended; the list is capped at `maxItems` (10).
 *  · All operations are silent on failure (private mode, quota exceeded).
 * ═══════════════════════════════════════════════════════════════════
 */

export interface RecentItem {
  type: string;
  id: string;
  label: string;
  href: string;
  ts: number;
}

const STORAGE_KEY = "nirman.recent";
const MAX_ITEMS = 10;

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentItem[];
  } catch {
    return [];
  }
}

function saveRecent(items: RecentItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* private mode — won't persist */
  }
}

/**
 * Push an item into the recently-viewed ring buffer.
 * Call this from a detail page or dialog when it opens.
 */
export function pushRecent(item: Omit<RecentItem, "ts">) {
  if (typeof window === "undefined") return;
  const items = loadRecent();
  // Deduplicate: remove any existing entry with the same {type, id}
  const filtered = items.filter((i) => !(i.type === item.type && i.id === item.id));
  // Prepend the new item with a fresh timestamp
  const next = [{ ...item, ts: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
  saveRecent(next);
  // Notify listeners (other components like the command palette)
  window.dispatchEvent(new CustomEvent("nirman:recent-updated"));
}

/**
 * Read the current recently-viewed list.
 * Reactively updates when another component pushes a new item.
 */
export function useRecentlyViewed(): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    setItems(loadRecent());
    function handler() {
      setItems(loadRecent());
    }
    window.addEventListener("nirman:recent-updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("nirman:recent-updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return items;
}

/**
 * Clear the recently-viewed list (e.g. from a "clear history" button).
 */
export function clearRecent() {
  if (typeof window === "undefined") return;
  saveRecent([]);
  window.dispatchEvent(new CustomEvent("nirman:recent-updated"));
}

/**
 * Convenience: push a recent item from a component.
 * Returns a stable callback so it can be used in useEffect deps.
 *
 *     const trackView = useTrackRecent();
 *     useEffect(() => {
 *       if (open && entity) trackView({ type: "sale", id: entity.id, label: entity.saleNumber, href: `/sales/${entity.id}` });
 *     }, [open, entity, trackView]);
 */
export function useTrackRecent() {
  return useCallback((item: Omit<RecentItem, "ts">) => {
    pushRecent(item);
  }, []);
}
