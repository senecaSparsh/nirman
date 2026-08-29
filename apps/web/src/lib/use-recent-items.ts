"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useRecentItems — tracks recently viewed entities in localStorage.
 *
 * Used by the global search overlay (shows recent when query is empty)
 * and the home page "Jump Back In" carousel.
 */

export interface RecentItem {
  type: string;
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  ts: number;
}

const STORAGE_KEY = "nirman:recent-items";
const MAX_ITEMS = 20;

function readStore(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeStore(items: RecentItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // localStorage might be full or unavailable — silently ignore
  }
}

/**
 * Records a recently viewed item. Dedupes by `type:id`, moves to front,
 * caps at MAX_ITEMS. Safe to call on every detail page mount.
 */
export function recordRecentItem(item: Omit<RecentItem, "ts">) {
  if (typeof window === "undefined") return;
  const items = readStore();
  const key = `${item.type}:${item.id}`;
  const filtered = items.filter((i) => `${i.type}:${i.id}` !== key);
  const updated = [{ ...item, ts: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
  writeStore(updated);
  // Notify listeners
  window.dispatchEvent(new CustomEvent("nirman:recent-updated"));
}

/**
 * Clears all recent items.
 */
export function clearRecentItems() {
  if (typeof window === "undefined") return;
  writeStore([]);
  window.dispatchEvent(new CustomEvent("nirman:recent-updated"));
}

/**
 * Hook that returns the current recent items list, reactive to changes.
 */
export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    setItems(readStore());
    function onUpdate() {
      setItems(readStore());
    }
    window.addEventListener("nirman:recent-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("nirman:recent-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const clear = useCallback(() => {
    clearRecentItems();
  }, []);

  return { items, clear };
}
