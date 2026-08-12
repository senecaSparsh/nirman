"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/mobile/v2/bottom-sheet";

interface LandData {
  id: string;
  sellerName: string;
  sellerContact: string | null;
  purchaseDate: string;
  totalArea: number;
  areaUnit: string;
  totalCost: number;
  registryNo: string | null;
  location: string | null;
  documentUrl: string | null;
}

const AREA_UNITS = ["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"] as const;

const AREA_UNIT_LABELS: Record<string, string> = {
  SQFT: "sqft", SQM: "sqm", SQYD: "sqyd", ACRE: "acre",
  BIGHA: "bigha", KATHA: "katha", HECTARE: "ha",
};

export function MobileLandEditForm({
  land,
  onClose,
}: {
  land: LandData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sellerName, setSellerName] = useState(land.sellerName);
  const [sellerContact, setSellerContact] = useState(land.sellerContact ?? "");
  const [purchaseDate, setPurchaseDate] = useState(land.purchaseDate ? land.purchaseDate.split("T")[0] : "");
  const [totalArea, setTotalArea] = useState(String(land.totalArea));
  const [areaUnit, setAreaUnit] = useState(land.areaUnit);
  const [totalCost, setTotalCost] = useState(String(land.totalCost));
  const [registryNo, setRegistryNo] = useState(land.registryNo ?? "");
  const [location, setLocation] = useState(land.location ?? "");
  const [documentUrl, setDocumentUrl] = useState(land.documentUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!sellerName.trim()) {
      toast.error("Seller name is required");
      return;
    }
    if (!totalArea || Number(totalArea) <= 0) {
      toast.error("Total area must be > 0");
      return;
    }
    if (!totalCost || Number(totalCost) <= 0) {
      toast.error("Total cost must be > 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/land-purchases/${land.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerName: sellerName.trim(),
          sellerContact: sellerContact.trim() || null,
          purchaseDate: purchaseDate || null,
          totalArea: Number(totalArea),
          areaUnit,
          totalCost: Number(totalCost),
          registryNo: registryNo.trim() || null,
          location: location.trim() || null,
          documentUrl: documentUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update land purchase");
      }
      toast.success("Land purchase updated");
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none";

  return (
    <BottomSheet title="Edit Land Purchase" onClose={onClose}>
      <div className="space-y-3">
        {/* Seller Name */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Seller Name <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="text"
            value={sellerName}
            onChange={(e) => setSellerName(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            placeholder="Seller name"
          />
        </div>

        {/* Seller Contact */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Seller Contact
          </label>
          <input
            type="tel"
            value={sellerContact}
            onChange={(e) => setSellerContact(e.target.value)}
            className={`${inputClass} font-mono`}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            placeholder="9876543210"
          />
        </div>

        {/* Purchase Date */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Purchase Date
          </label>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </div>

        {/* Area + Unit */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Total Area <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="number"
              step="any"
              value={totalArea}
              onChange={(e) => setTotalArea(e.target.value)}
              className={`${inputClass} font-mono`}
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Unit
            </label>
            <select
              value={areaUnit}
              onChange={(e) => setAreaUnit(e.target.value)}
              className={inputClass}
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              {AREA_UNITS.map((u) => (
                <option key={u} value={u}>{AREA_UNIT_LABELS[u]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Total Cost */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Total Cost <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="number"
            step="any"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            className={`${inputClass} font-mono`}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            placeholder="0"
          />
        </div>

        {/* Registry No */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Registry No
          </label>
          <input
            type="text"
            value={registryNo}
            onChange={(e) => setRegistryNo(e.target.value)}
            className={`${inputClass} font-mono`}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            placeholder="Registry document number"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            placeholder="Village, district, state"
          />
        </div>

        {/* Document URL */}
        <div>
          <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
            Document URL (optional)
          </label>
          <input
            type="text"
            value={documentUrl}
            onChange={(e) => setDocumentUrl(e.target.value)}
            className={inputClass}
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            placeholder="https://..."
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-[0.8125rem] font-bold press transition-transform active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="size-4" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>
    </BottomSheet>
  );
}
