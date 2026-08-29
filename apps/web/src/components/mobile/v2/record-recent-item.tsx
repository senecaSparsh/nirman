"use client";

import { useRecordRecent } from "@/lib/use-record-recent";

/**
 * RecordRecentItem — invisible client component that records a visit
 * to an entity's detail page in the user's recent items list.
 *
 * Place this at the top of any server-rendered detail page:
 * <RecordRecentItem type="po" id={po.id} label={po.poNumber} sublabel={po.supplier?.name} href={`/m/procurement/${po.id}`} />
 */
export function RecordRecentItem({
  type,
  id,
  label,
  sublabel,
  href,
}: {
  type: string;
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}) {
  useRecordRecent(type, { id, label, sublabel, href });
  return null;
}
