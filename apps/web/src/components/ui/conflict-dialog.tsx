"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConflictDialogProps {
  open: boolean;
  message: string;
  onReload: () => void;
  onCancel: () => void;
}

/**
 * ConflictDialog — shown when a concurrent edit is detected (HTTP 409).
 * Gives the user two options:
 *   1. "Reload latest" — discard local changes and load the latest version
 *   2. "Keep my changes" — let the user review their changes against the server
 */
export function ConflictDialog({ open, message, onReload, onCancel }: ConflictDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onCancel(); }}
      title="Concurrent Edit Detected"
      description={
        <span className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>{message} Another user has modified this record since you started editing. Your changes were not saved.</span>
        </span>
      }
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Keep my changes</Button>
          <Button size="sm" onClick={onReload}>Reload latest</Button>
        </div>
      }
    >
      <p className="text-body text-muted-foreground">
        Reloading will discard your unsaved changes and load the latest version from the server.
        You can then re-apply your changes on top of the updated record.
      </p>
    </Dialog>
  );
}
