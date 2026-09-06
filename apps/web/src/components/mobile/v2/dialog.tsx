"use client";

import { type ReactNode } from "react";
import { MobileFabModal } from "./fab-modal";

/**
 * MobileDialog — the standard inline dialog wrapper for mobile forms.
 *
 * Uses MobileFabModal's spring-in animation (scale + blur backdrop) but
 * without requiring a FAB origin — defaults to a center-bottom origin.
 * Replaces the legacy `fixed inset-0 z-50 flex items-end justify-center`
 * + `rounded-t-[1rem] border-t` bottom-sheet pattern used across 59 files.
 *
 * Usage:
 *   <MobileDialog open={show} onClose={close} title="New Supplier">
 *     <form>...</form>
 *   </MobileDialog>
 */
export function MobileDialog({
  open,
  onClose,
  title,
  children,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** When true, disables backdrop blur — use for dialogs opened inside
   *  other dialogs to avoid double-blur. */
  nested?: boolean;
}) {
  return (
    <MobileFabModal open={open} onClose={onClose} title={title} nested={nested}>
      {children}
    </MobileFabModal>
  );
}
