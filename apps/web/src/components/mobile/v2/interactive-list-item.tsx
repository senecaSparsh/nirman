"use client";

import { type ReactNode, useState } from "react";
import { SwipeableListItem } from "@/components/mobile/swipeable-item";
import { MobileContextMenu, type ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import { useLongPress } from "@/lib/use-long-press";
import type { SwipeAction } from "@/lib/use-swipe";

/**
 * InteractiveListItem — combines swipe-to-act + long-press context menu
 * into a single wrapper. Drop it around any list item card.
 *
 * Usage:
 *   <InteractiveListItem
 *     swipeActions={[{ label: "Approve", color: "var(--color-go)", onPress: handleApprove }]}
 *     contextActions={[{ label: "View", icon: Eye, onPress: () => router.push(...) }]}
 *     menuTitle="PO-0011"
 *     menuSubtitle="Supplier Name"
 *   >
 *     <Link href="/m/...">card content</Link>
 *   </InteractiveListItem>
 */
export function InteractiveListItem({
  swipeActions = [],
  contextActions = [],
  menuTitle,
  menuSubtitle,
  children,
  className = "",
}: {
  swipeActions?: SwipeAction[];
  contextActions?: ContextAction[];
  menuTitle: string;
  menuSubtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { bind: longPressBind } = useLongPress(() => setMenuOpen(true));

  // If no context actions, skip the menu entirely
  const showMenu = contextActions.length > 0;

  const content = showMenu ? <div {...longPressBind}>{children}</div> : children;

  if (swipeActions.length > 0) {
    return (
      <>
        <SwipeableListItem actions={swipeActions} className={className}>
          {content}
        </SwipeableListItem>
        {showMenu ? (
          <MobileContextMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            title={menuTitle}
            subtitle={menuSubtitle}
            actions={contextActions}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      {content}
      {showMenu ? (
        <MobileContextMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={menuTitle}
          subtitle={menuSubtitle}
          actions={contextActions}
        />
      ) : null}
    </>
  );
}
