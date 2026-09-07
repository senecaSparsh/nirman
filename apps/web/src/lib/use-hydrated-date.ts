"use client";

import { useEffect, useState } from "react";

/**
 * Returns a `Date` object that is only set after mount (client-side).
 * Returns `null` during SSR and the first client render, preventing
 * hydration mismatches from `new Date()` calls in render output
 * (greetings, date labels, relative timestamps, etc.).
 *
 * For a "YYYY-MM-DD" string suitable for `<input type="date">`,
 * use `useTodayDate()` from `use-today-date.ts` instead.
 */
export function useHydratedDate(): Date | null {
  const [date, setDate] = useState<Date | null>(null);
  useEffect(() => {
    setDate(new Date());
  }, []);
  return date;
}
