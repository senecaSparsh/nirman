"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useSnooze — lets users temporarily hide attention/approval items.
 *
 * Snoozed items are stored in localStorage with an expiry timestamp.
 * Items auto-un-snooze when the duration expires.
 *
 * Options: 4 hours, 24 hours, until Monday (next Monday 9 AM).
 */

const STORAGE_KEY = "nirman:snoozed-items";

export interface SnoozedItem {
  id: string;
  until: number; // epoch ms
  label: string; // for display in the "Snoozed" tab
  durationLabel: string; // "4h", "24h", "until Monday"
}

export type SnoozeDuration = "4h" | "24h" | "monday";

function readStore(): SnoozedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Auto-expire: filter out items whose `until` has passed
    const now = Date.now();
    const valid = parsed.filter((i: SnoozedItem) => i.until > now);
    if (valid.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

function writeStore(items: SnoozedItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("nirman:snooze-updated"));
  } catch {
    // ignore
  }
}

function computeUntil(duration: SnoozeDuration): number {
  const now = Date.now();
  if (duration === "4h") return now + 4 * 60 * 60 * 1000;
  if (duration === "24h") return now + 24 * 60 * 60 * 1000;
  // until Monday 9 AM
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + daysUntilMonday);
  monday.setHours(9, 0, 0, 0);
  return monday.getTime();
}

function durationLabel(duration: SnoozeDuration): string {
  if (duration === "4h") return "4 hours";
  if (duration === "24h") return "24 hours";
  return "until Monday";
}

/**
 * Snoozes an item for the given duration.
 */
export function snoozeItem(id: string, duration: SnoozeDuration, label: string) {
  const items = readStore();
  const filtered = items.filter((i) => i.id !== id);
  filtered.push({
    id,
    until: computeUntil(duration),
    label,
    durationLabel: durationLabel(duration),
  });
  writeStore(filtered);
}

/**
 * Removes an item from the snooze list (un-snooze).
 */
export function unsnoozeItem(id: string) {
  const items = readStore();
  writeStore(items.filter((i) => i.id !== id));
}

/**
 * Clears all snoozed items.
 */
export function clearAllSnoozed() {
  writeStore([]);
}

/**
 * Returns true if the given item ID is currently snoozed.
 */
export function isSnoozed(id: string): boolean {
  return readStore().some((i) => i.id === id);
}

/**
 * Hook that returns the current snoozed items list, reactive to changes.
 */
export function useSnooze() {
  const [items, setItems] = useState<SnoozedItem[]>([]);

  useEffect(() => {
    setItems(readStore());
    function onUpdate() {
      setItems(readStore());
    }
    window.addEventListener("nirman:snooze-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    // Check for expired items every minute
    const interval = setInterval(() => {
      setItems(readStore());
    }, 60000);
    return () => {
      window.removeEventListener("nirman:snooze-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
      clearInterval(interval);
    };
  }, []);

  const snooze = useCallback((id: string, duration: SnoozeDuration, label: string) => {
    snoozeItem(id, duration, label);
  }, []);

  const unsnooze = useCallback((id: string) => {
    unsnoozeItem(id);
  }, []);

  const clearAll = useCallback(() => {
    clearAllSnoozed();
  }, []);

  const checkSnoozed = useCallback((id: string) => {
    return items.some((i) => i.id === id);
  }, [items]);

  return { items, snooze, unsnooze, clearAll, isSnoozed: checkSnoozed };
}
