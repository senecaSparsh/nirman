"use client";

import { useState, useCallback } from "react";
import { Loader2, ChevronDown } from "lucide-react";

/**
 * MobileLoadMore — "Load More" button for paginated lists.
 *
 * Shows a button at the bottom of a list that fetches the next batch
 * of items from the given URL. The URL should accept `?cursor=xxx`
 * and return `{ items: T[], nextCursor: string | null }`.
 *
 * Usage:
 *   const { items, loading, hasMore, loadMore } = usePaginatedList(
 *     initialItems,
 *     "/api/mobile/list/procurement",
 *     initialCursor,
 *   );
 *   ...
 *   <MobileLoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
 */

export function MobileLoadMore({
  onClick,
  loading,
  hasMore,
  count,
  total,
}: {
  onClick: () => void;
  loading: boolean;
  hasMore: boolean;
  count?: number;
  total?: number;
}) {
  if (!hasMore && count !== undefined) {
    return (
      <div
        className="text-center py-4 text-[0.625rem] font-semibold"
        style={{ color: "var(--color-ink-400)" }}
      >
        {count} item{count !== 1 ? "s" : ""} loaded
        {total !== undefined && total > count ? ` · ${total - count} older (use search)` : ""}
      </div>
    );
  }

  if (!hasMore) return null;

  return (
    <div className="py-4">
      <button
        onClick={onClick}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] border-2 border-dashed py-3 text-[0.75rem] font-bold press disabled:opacity-50"
        style={{
          borderColor: "var(--color-line)",
          color: "var(--color-ink-700)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </>
        ) : (
          <>
            <ChevronDown className="size-4" />
            Load More
          </>
        )}
      </button>
    </div>
  );
}

/**
 * usePaginatedList — hook for cursor-based pagination of list pages.
 *
 * Manages the items array, loading state, and cursor for the next batch.
 * On `loadMore()`, fetches from `url?cursor=xxx` and appends the results.
 *
 * @param initialItems - items from the server render
 * @param url - API endpoint that returns { items, nextCursor }
 * @param initialCursor - cursor for the next batch (null if no more)
 */
export function usePaginatedList<T>(
  initialItems: T[],
  url: string,
  initialCursor: string | null,
) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialCursor !== null);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${url}?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error("Failed to load more");
      const data = await res.json();
      if (Array.isArray(data.items)) {
        setItems((prev) => [...prev, ...data.items]);
      }
      setCursor(data.nextCursor ?? null);
      setHasMore(data.nextCursor != null);
    } catch {
      // Silently fail — the user can retry
      setHasMore(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, url]);

  return { items, loading, hasMore, loadMore, setItems };
}
