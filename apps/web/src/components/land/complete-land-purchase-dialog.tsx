"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PhotoUploader } from "@/components/ui/photo-uploader";

/**
 * CompleteLandPurchaseDialog — mark a BOOKED land purchase as COMPLETED.
 *
 * Requires the registry document to be uploaded (either pre-uploaded or
 * provided here). Optionally captures the registry number.
 */
export function CompleteLandPurchaseDialog({
  open,
  onOpenChange,
  landPurchaseId,
  existingRegistryDocUrl,
  existingRegistryNo,
  balanceDue,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  landPurchaseId: string;
  existingRegistryDocUrl?: string | null;
  existingRegistryNo?: string | null;
  balanceDue?: number;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [registryNo, setRegistryNo] = useState(existingRegistryNo ?? "");
  const [registryDocUrl, setRegistryDocUrl] = useState("");
  const [partialRegistry, setPartialRegistry] = useState(false);

  const hasExistingDoc = Boolean(existingRegistryDocUrl);
  const hasBalance = (balanceDue ?? 0) > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!registryDocUrl && !hasExistingDoc) {
      toast.error("Registry document upload is required to complete the purchase");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/land-purchases/${landPurchaseId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registryDocumentUrl: registryDocUrl || undefined,
          registryNo: registryNo.trim() || undefined,
          partialRegistryAllowed: partialRegistry || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to complete land purchase");
      toast.success("Land purchase completed", {
        description: "Parcels marked as AVAILABLE. Ownership certificate auto-created.",
      });
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Complete Land Purchase"
      description="Mark this land purchase as completed. The registry document is required."
      className="max-w-md"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-caption text-warning">
          Completing the purchase will mark all parcels as AVAILABLE and auto-create an ownership certificate (if a registry number is provided).
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="clp-registry-no">Registry No.</Label>
          <Input
            id="clp-registry-no"
            value={registryNo}
            onChange={(e) => setRegistryNo(e.target.value)}
            placeholder="e.g. SR-1234/2025"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Registry Document *</Label>
          {hasExistingDoc && !registryDocUrl && (
            <p className="text-caption text-muted-foreground">
              A registry document is already uploaded. You can re-upload to replace it.
            </p>
          )}
          <PhotoUploader
            photos={registryDocUrl ? [{ url: registryDocUrl }] : (hasExistingDoc && existingRegistryDocUrl ? [{ url: existingRegistryDocUrl }] : [])}
            onChange={(photos) => setRegistryDocUrl(photos[0]?.url ?? "")}
            maxPhotos={1}
            label="Upload Registry Document (PDF/Image)"
          />
        </div>

        {hasBalance && (
          <label className="flex items-center gap-2 rounded-md border border-border p-3">
            <input
              type="checkbox"
              checked={partialRegistry}
              onChange={(e) => setPartialRegistry(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-muted-foreground">
              Allow partial registry — complete with balance of ₹{balanceDue?.toLocaleString("en-IN")} due
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Completing…" : "Complete Purchase"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
