"use client";

import { useEffect, useState } from "react";

/**
 * Returns today's date as a "YYYY-MM-DD" string, but only after
 * the component has mounted (client-side). Returns an empty string
 * during SSR and the first client render, which prevents hydration
 * mismatches caused by server/client timezone differences.
 *
 * Usage:
 *   const today = useTodayDate();
 *   const [date, setDate] = useState(today);
 *   // After mount, date will be "" then today's date.
 *   // For a controlled input, use: value={date} onChange={setDate}
 *
 * Or for a stateful date initialized to today:
 *   const [date, setDate] = useTodayDateState();
 */
export function useTodayDate(): string {
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate(new Date().toISOString().slice(0, 10));
  }, []);
  return date;
}

/**
 * Stateful date that initializes to today after mount.
 * Returns [value, setValue] like useState.
 */
export function useTodayDateState(): [string, (v: string) => void] {
  const [date, setDate] = useState("");
  useEffect(() => {
    if (!date) {
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [date]);
  return [date, setDate];
}
