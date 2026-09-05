"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, XCircle, Loader2, AlertTriangle, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { ActionBar } from "@/components/mobile/v2/primitives";

interface ListingData {
  title: string;
  description: string | null;
  askingPrice: number;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string | null;
}

/**
 * Sticky bottom action bar for portal listing sync/delist/edit/delete actions.
 * Sync pushes the listing to the portal; Delist removes it.
 * Edit opens a form sheet (only when NOT LISTED).
 * Delete removes the listing record (only DRAFT, SYNC_FAILED, or DELISTED).
 */
export function MobilePortalListingActions({
  listingId,
  status,
  title,
  description,
  askingPrice,
  bedrooms,
  bathrooms,
  furnishing,
}: {
  listingId: string;
  status: string;
} & ListingData) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showDelistConfirm, setShowDelistConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState(title);
  const [editDesc, setEditDesc] = useState(description ?? "");
  const [editPrice, setEditPrice] = useState(String(askingPrice));
  const [editBeds, setEditBeds] = useState(bedrooms != null ? String(bedrooms) : "");
  const [editBaths, setEditBaths] = useState(bathrooms != null ? String(bathrooms) : "");
  const [editFurnishing, setEditFurnishing] = useState(furnishing ?? "");

  const canEdit = status !== "LISTED";
  const canDelete = status === "DRAFT" || status === "SYNC_FAILED" || status === "DELISTED";

  // Hide all actions for delisted listings that can't be re-synced
  if (status === "DELISTED" && !canDelete) return null;

  async function act(action: "sync" | "delist", label: string) {
    haptic(10);
    setBusy(action);
    try {
      const res = await fetch(`/api/portal-listings/${listingId}?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);
      toast.success(label);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    setBusy("edit");
    try {
      const body: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        askingPrice: Number(editPrice) || 0,
      };
      if (editBeds !== "") body.bedrooms = Number(editBeds);
      else body.bedrooms = null;
      if (editBaths !== "") body.bathrooms = Number(editBaths);
      else body.bathrooms = null;
      if (editFurnishing.trim()) body.furnishing = editFurnishing.trim();
      else body.furnishing = null;

      const res = await fetch(`/api/portal-listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Listing updated");
      setShowEdit(false);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy("delete");
    try {
      const res = await fetch(`/api/portal-listings/${listingId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Listing deleted");
      setShowDelete(false);
      router.push("/m/portal-listings");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const inputClass = "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <>
      {/* Edit / Delete buttons (above the sticky bar) */}
      <div className="flex gap-2 mt-4 mb-2">
        {canEdit ? (
          <button
            onClick={() => setShowEdit(true)}
            disabled={busy !== null}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <Pencil className="size-3" />
            Edit
          </button>
        ) : null}
        {canDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            disabled={busy !== null}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press disabled:opacity-50"
            style={{ borderColor: "color-mix(in srgb, var(--color-stop) 30%, var(--color-line))", color: "var(--color-stop)" }}
          >
            <Trash2 className="size-3" />
            Delete
          </button>
        ) : null}
      </div>

      <ActionBar>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDelistConfirm(true)}
            disabled={busy !== null || status !== "LISTED"}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] border-2 font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{
              borderColor: "var(--color-stop)",
              color: "var(--color-stop)",
              backgroundColor: "transparent",
            }}
          >
            {busy === "delist" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            Delist
          </button>
          <button
            onClick={() => void act("sync", "Synced to portal")}
            disabled={busy !== null}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-[0.625rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {busy === "sync" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Sync
          </button>
        </div>
      </ActionBar>

      {/* Delist confirmation modal */}
      {showDelistConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center " style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }} onClick={() => setShowDelistConfirm(false)}>
          <div
            className="w-full max-w-md mx-4 rounded-[0.75rem] border p-5 shadow-xl"
            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="grid place-items-center size-10 rounded-full shrink-0"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)" }}
              >
                <AlertTriangle className="size-5" style={{ color: "var(--color-stop)" }} />
              </div>
              <div>
                <h3 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                  Delist this property?
                </h3>
                <p className="text-m-body mt-1" style={{ color: "var(--color-ink-500)" }}>
                  The listing will be removed from the portal. You can sync it again later.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowDelistConfirm(false)}
                disabled={busy !== null}
                className="flex-1 h-10 rounded-[0.5rem] border font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDelistConfirm(false);
                  void act("delist", "Delisted from portal");
                }}
                disabled={busy !== null}
                className="flex-1 h-10 rounded-[0.5rem] font-bold text-m-section text-m-body press active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
              >
                {busy === "delist" ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Delist"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit sheet */}
      {showEdit ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => setShowEdit(false)}
        >
          <div
            className="w-full rounded-t-[1rem] mx-auto max-w-md max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>Edit Listing</p>
              <button onClick={() => setShowEdit(false)} className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4 flex flex-col gap-3">
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Listing Details
                </p>
                <div>
                  <label className={labelClass} style={labelStyle}>Title *</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Description</label>
                  <textarea rows={2} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Asking Price (₹) *</label>
                  <input type="number" min="0" inputMode="numeric" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Property Specs
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className={labelClass} style={labelStyle}>Bedrooms</label>
                    <input type="number" min="0" max="10" inputMode="numeric" value={editBeds} onChange={(e) => setEditBeds(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="pl-2">
                    <label className={labelClass} style={labelStyle}>Bathrooms</label>
                    <input type="number" min="0" max="10" inputMode="numeric" value={editBaths} onChange={(e) => setEditBaths(e.target.value)} placeholder="—" className={inputClass} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Furnishing</label>
                  <input value={editFurnishing} onChange={(e) => setEditFurnishing(e.target.value)} placeholder="e.g. Semi-furnished" className={inputClass} style={inputStyle} />
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button onClick={() => setShowEdit(false)} disabled={busy !== null} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button onClick={saveEdit} disabled={busy !== null || !editTitle.trim()} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: busy !== null || !editTitle.trim() ? 0.5 : 1 }}>
                  {busy === "edit" ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation */}
      {showDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => setShowDelete(false)}
        >
          <div
            className="w-full rounded-t-[1rem] mx-auto max-w-md"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>Delete Listing?</p>
              <button onClick={() => setShowDelete(false)} className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>
            <div className="px-3 pb-4">
              <p className="text-m-label mb-3" style={{ color: "var(--color-ink-500)" }}>
                This will permanently delete this portal listing record. This cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={() => setShowDelete(false)} disabled={busy !== null} className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}>Cancel</button>
                <button onClick={handleDelete} disabled={busy !== null} className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1" style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}>
                  {busy === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
