"use client";

import { useState } from "react";
import { FileText, RotateCcw, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

/**
 * DraftBanner — shows when a saved draft exists for the current form.
 * Offers "Restore" (load draft data) or "Discard" (delete draft).
 *
 * Usage:
 *   {hasDraft && (
 *     <DraftBanner
 *       formName="Attendance"
 *       updatedAt={draftUpdatedAt}
 *       onRestore={() => { setFormData(draft); }}
 *       onDiscard={() => clearDraft()}
 *     />
 *   )}
 */
export function DraftBanner({
  formName,
  updatedAt,
  onRestore,
  onDiscard,
}: {
  formName: string;
  updatedAt: string | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const relativeTime = updatedAt ? formatRelativeTime(new Date(updatedAt)) : "earlier";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
      <FileText className="h-4 w-4 shrink-0 text-brand" />
      <div className="flex-1 min-w-0">
        <div className="text-body font-medium text-foreground">
          Unsaved {formName} draft
        </div>
        <div className="text-caption text-muted-foreground">
          Saved {relativeTime} — restore or discard?
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => {
            onRestore();
            setDismissed(true);
          }}
          className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-caption font-medium text-white active:scale-95 transition-transform"
        >
          <RotateCcw className="h-3 w-3" />
          Restore
        </button>
        <button
          onClick={() => {
            onDiscard();
            setDismissed(true);
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
