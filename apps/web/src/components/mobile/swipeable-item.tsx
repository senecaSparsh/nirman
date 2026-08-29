"use client";

import { type ReactNode } from "react";
import { useSwipeAction, type SwipeAction } from "@/lib/use-swipe";

/**
 * SwipeableListItem — a list row that reveals action buttons when
 * swiped left. The content slides to reveal colored action buttons
 * pinned to the right edge.
 *
 * Usage:
 *   <SwipeableListItem
 *     actions={[
 *       { label: "Approve", color: "#16a34a", onPress: () => doApprove() },
 *       { label: "Reject", color: "#ef4444", onPress: () => doReject() },
 *     ]}
 *   >
 *     <div className="…your item content…">…</div>
 *   </SwipeableListItem>
 *
 * The component handles:
 *   - Touch tracking (horizontal vs vertical discrimination)
 *   - Snapping open/closed with haptic feedback
 *   - Rendering the action buttons behind the content
 *   - Closing when an action is tapped or when the item is tapped while open
 */
export function SwipeableListItem({
  actions,
  children,
  className = "",
}: {
  actions: SwipeAction[];
  children: ReactNode;
  className?: string;
}) {
  const { offset, open, actionWidth, bind, close } = useSwipeAction({ actions });

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Action buttons — positioned behind the content, right-aligned */}
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={() => {
              action.onPress();
              close();
            }}
            className="flex items-center justify-center text-m-body font-bold text-center px-1 leading-tight"
            style={{
              width: `${actionWidth}px`,
              backgroundColor: action.color,
              color: action.textColor ?? "#fff",
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Sliding content */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 || offset === -actionWidth * actions.length
            ? "transform 0.2s ease-out"
            : "none",
          backgroundColor: "var(--color-paper)",
        }}
        onTouchStart={(e) => {
          // If already open, tapping the content closes it
          if (open) {
            close();
          }
          bind.onTouchStart(e);
        }}
        onTouchMove={bind.onTouchMove}
        onTouchEnd={bind.onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
