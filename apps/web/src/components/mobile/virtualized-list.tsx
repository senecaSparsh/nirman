"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * VirtualizedList — renders only the visible items in a scrollable
 * container, using @tanstack/react-virtual. Essential for lists with
 * 500+ items to avoid rendering all DOM nodes at once.
 *
 * Pass a `renderItem` function that returns the row content for a
 * given item. The wrapper handles the scroll container, positioning,
 * and only mounts visible rows (plus overscan buffer).
 *
 * Usage:
 *   <VirtualizedList
 *     items={materials}
 *     estimateSize={72}
 *     renderItem={(item) => <MobileRow ... />}
 *   />
 */
export function VirtualizedList<T>({
  items,
  estimateSize,
  renderItem,
  overscan = 8,
  className = "",
}: {
  items: T[];
  /** Estimated height of each row in pixels */
  estimateSize: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Number of items to render above/below the visible area */
  overscan?: number;
  /** Additional className for the scroll container */
  className?: string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (items.length === 0) return null;

  return (
    <div
      ref={parentRef}
      className={`overflow-y-auto ${className}`}
      style={{ contain: "strict" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index]!, virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
