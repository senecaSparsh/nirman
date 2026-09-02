"use client";

import { useCallback, useState } from "react";

/**
 * useFabModal — shared state for a FAB that toggles a MobileFabModal.
 *
 * Returns:
 *  · `isOpen`   — pass to <MobileFab isOpen={…} />
 *  · `originRect` — pass to <MobileFabModal originRect={…} />
 *  · `open(e)`   — pass to <MobileFab onClick={(e) => open(e)} />
 *  · `close()`   — pass to <MobileFabModal onClose={…} />
 *  · `toggle(e)` — pass to <MobileFab onClick={(e) => toggle(e)} />
 *                 (opens on first click, closes on second — the FAB
 *                 morphs + → × and back)
 *
 * Usage:
 *   const fab = useFabModal();
 *   <MobileFab onClick={fab.toggle} label="New thing" isOpen={fab.isOpen} />
 *   <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="New Thing">
 *     <MyForm onClose={fab.close} />
 *   </MobileFabModal>
 */
export function useFabModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  const open = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    if (e?.currentTarget instanceof HTMLElement) {
      setOriginRect(e.currentTarget.getBoundingClientRect());
    }
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setOriginRect(null);
  }, []);

  const toggle = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    if (isOpen) {
      close();
    } else {
      open(e);
    }
  }, [isOpen, open, close]);

  return { isOpen, originRect, open, close, toggle };
}
