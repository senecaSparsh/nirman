"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageMinus } from "lucide-react";
import { toast } from "sonner";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { SelectorModal } from "@/components/mobile/v2/form-primitives";
import { TypeCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";

interface LocationItem {
  id: string;
  name: string;
  type: string;
  items: { materialId: string; materialName: string; unit: string | null; qty: number }[];
}

const DAMAGE_REASONS = [
  { key: "damaged", label: "Damaged", hint: "broken/cracked" },
  { key: "spoiled", label: "Spoiled", hint: "rain/moisture/expired" },
  { key: "lost", label: "Lost", hint: "missing/stolen" },
  { key: "other", label: "Other", hint: "describe below" },
];

/**
 * Record wastage/damage for material physically on a site — removes it from
 * stock (ADJUSTMENT_OUT) with the reason captured for the books + reconciliation.
 * Feeds the same stock-movement ledger as every other adjustment.
 */
export function MobileWastageSheet({
  open,
  onClose,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  locations: LocationItem[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("damaged");
  const [detail, setDetail] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const [matOpen, setMatOpen] = useState(false);

  const location = useMemo(() => locations.find((l) => l.id === locationId), [locations, locationId]);
  const materials = useMemo(() => location?.items.filter((i) => i.qty > 0) ?? [], [location]);
  const material = useMemo(() => materials.find((i) => i.materialId === materialId), [materials, materialId]);
  const qtyNum = Number(qty);
  const qtyOk = qtyNum > 0 && (!material || qtyNum <= material.qty);

  function reset() {
    setLocationId(""); setMaterialId(""); setQty(""); setReason("damaged"); setDetail("");
  }

  async function submit() {
    if (!locationId || !materialId) { toast.error("Pick the location and material"); return; }
    if (!qtyOk) { toast.error(material ? `Only ${material.qty} ${material.unit ?? ""} available` : "Enter a quantity"); return; }
    const reasonText = detail.trim()
      ? `${reason}: ${detail.trim()}`
      : reason;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/materials/${materialId}/adjust-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          direction: "OUT",
          qty: qtyNum,
          reason: `Wastage — ${reasonText}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to record wastage");
      toast.success(`${material?.materialName ?? "Material"} — ${qtyNum} ${material?.unit ?? ""} recorded as wastage`);
      reset();
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record wastage");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MobileFabModal open={open} onClose={onClose} title="Record wastage">
      <div className="flex flex-col gap-4 px-1 pb-4">
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Material that&apos;s damaged, spoiled, or lost on site — removed from stock and logged so the books stay honest.
        </p>

        <div>
          <p className="text-m-label font-bold mb-1.5" style={{ color: "var(--color-ink-700)" }}>Location <span style={{ color: "var(--color-stop)" }}>*</span></p>
          <button
            type="button"
            onClick={() => setLocOpen(true)}
            className="w-full h-10 rounded-[0.5rem] border px-3 text-left text-m-body font-bold press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: location ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
          >
            {location ? location.name : "Pick the site store"}
          </button>
        </div>

        {location ? (
          <div>
            <p className="text-m-label font-bold mb-1.5" style={{ color: "var(--color-ink-700)" }}>Material <span style={{ color: "var(--color-stop)" }}>*</span></p>
            <button
              type="button"
              onClick={() => setMatOpen(true)}
              className="w-full h-10 rounded-[0.5rem] border px-3 text-left text-m-body font-bold press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: material ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
            >
              {material ? `${material.materialName} · ${material.qty} ${material.unit ?? ""}` : "Pick the material"}
            </button>
          </div>
        ) : null}

        {material ? (
          <>
            <UnderlineInput
              label={`Quantity (max ${material.qty} ${material.unit ?? ""})`}
              value={qty}
              onChange={setQty}
              inputMode="decimal"
              placeholder="0"
            />
            <div>
              <p className="text-m-label font-bold mb-1.5" style={{ color: "var(--color-ink-700)" }}>What happened?</p>
              <div className="grid grid-cols-4 gap-1">
                {DAMAGE_REASONS.map((r) => (
                  <TypeCard
                    key={r.key}
                    active={reason === r.key}
                    onClick={() => setReason(r.key)}
                    label={r.label}
                    sublabel={r.hint}
                  />
                ))}
              </div>
            </div>
            <UnderlineInput
              label="Details (optional)"
              value={detail}
              onChange={setDetail}
              placeholder="e.g. cement bags hardened in rain"
            />
          </>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !locationId || !materialId || !qtyOk}
          className="flex items-center justify-center gap-1.5 h-11 rounded-[0.625rem] font-bold text-m-section press disabled:opacity-50 mt-1"
          style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <PackageMinus className="size-4" />}
          {submitting ? "Recording…" : "Record wastage"}
        </button>
      </div>

      {locOpen ? (
        <SelectorModal
          title="Pick location"
          items={locations.map((l) => ({ id: l.id, label: l.name }))}
          selectedId={locationId}
          onSelect={(v) => { setLocationId(v); setMaterialId(""); setLocOpen(false); }}
          onClose={() => setLocOpen(false)}
        />
      ) : null}
      {matOpen ? (
        <SelectorModal
          title="Pick material"
          items={materials.map((i) => ({ id: i.materialId, label: i.materialName, sub: `${i.qty} ${i.unit ?? ""}` }))}
          selectedId={materialId}
          onSelect={(v) => { setMaterialId(v); setMatOpen(false); }}
          onClose={() => setMatOpen(false)}
        />
      ) : null}
    </MobileFabModal>
  );
}
