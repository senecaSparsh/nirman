"use client";

import { useEffect } from "react";
import { recordRecentItem } from "@/lib/use-recent-items";

/**
 * useRecordRecent — call on a detail page to record the entity
 * in the user's recent items list.
 *
 * @example
 * useRecordRecent("po", { id: po.id, label: po.poNumber, sublabel: po.supplier?.name, href: `/m/procurement/${po.id}` });
 */
export function useRecordRecent(
  type: string,
  item: { id: string; label: string; sublabel?: string; href: string } | null,
) {
  useEffect(() => {
    if (!item) return;
    recordRecentItem({
      type,
      id: item.id,
      label: item.label,
      sublabel: item.sublabel ?? "",
      href: item.href,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, item?.id]);
}
