"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {Globe, Loader2, Plus, CheckCircle2, Eye} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { formatCurrencyCompact } from "@/lib/utils";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { MobileEmptyState, MobileCta } from "@/components/mobile/v2/primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { SectionCard, UnderlineInput, EnumSelect } from "@/components/mobile/v2/form-primitives";

interface UnitOption {
  id: string;
  unitNumber: string;
  unitType: string;
  projectName: string;
  area: number;
  areaUnit: string;
  askingPrice: number | null;
}

const PORTAL_OPTIONS = ["99acres", "MagicBricks", "Housing.com"];

interface FormState {
  builtUnitId: string;
  portalName: string;
  title: string;
  description: string;
  askingPrice: string;
  bedrooms: string;
  bathrooms: string;
  furnishing: string;
}

export function MobileNewPortalListingClient({ units }: { units: UnitOption[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm] = useState<FormState>({
    builtUnitId: "",
    portalName: "99acres",
    title: "",
    description: "",
    askingPrice: "",
    bedrooms: "",
    bathrooms: "",
    furnishing: "",
  });
  const [photos, setPhotos] = useState<{ url: string; fileName?: string }[]>([]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // When a unit is selected, auto-fill title and asking price
  function onUnitChange(unitId: string) {
    const unit = units.find((u) => u.id === unitId);
    set("builtUnitId", unitId);
    if (unit && !form.title) {
      set("title", `${unit.unitNumber} · ${unit.unitType} · ${unit.projectName}`);
    }
    if (unit && unit.askingPrice && !form.askingPrice) {
      set("askingPrice", String(unit.askingPrice));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.builtUnitId) { toast.error("Please select a unit to list"); return; }
    if (!form.title.trim()) { toast.error("Listing title is required"); return; }
    if (!form.askingPrice || Number(form.askingPrice) <= 0) { toast.error("Asking price must be greater than 0"); return; }

    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/portal-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          builtUnitId: form.builtUnitId,
          portalName: form.portalName,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          askingPrice: Number(form.askingPrice),
          bedrooms: form.bedrooms === "" ? undefined : Number(form.bedrooms),
          bathrooms: form.bathrooms === "" ? undefined : Number(form.bathrooms),
          furnishing: form.furnishing.trim() || undefined,
          photos: photos.length > 0 ? photos.map((p) => p.url) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create listing");
      haptic([10, 40, 80]);
      setSuccess({ id: data.id, title: form.title.trim() });
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (units.length === 0) {
    return (
      <MobileEmptyState
        icon={Globe}
        title="No available units"
        description="Units with status &quot;Available&quot; can be listed on portals"
        action={
          <MobileCta href="/m/real-estate?tab=units" icon={Plus} variant="primary">
            Go to Built Units
          </MobileCta>
        }
      />
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="grid place-items-center size-14 rounded-full mb-3" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}>
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>Listing Created</p>
        <p className="text-m-caption font-mono mb-1" style={{ color: "var(--color-ink-700)" }}>{success.title}</p>
        <p className="text-m-caption mb-4" style={{ color: "var(--color-ink-500)" }}>Sync it to the portal from the listings page.</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => { router.push("/m/portal-listings"); router.refresh(); }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press active:scale-95" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
            <Eye className="size-4 inline mr-1" /> View Listings
          </button>
          <button onClick={() => { setSuccess(null); setForm({ builtUnitId: "", portalName: "99acres", title: "", description: "", askingPrice: "", bedrooms: "", bathrooms: "", furnishing: "" }); setPhotos([]); router.refresh(); }} className="rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold border-2 press active:scale-95" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}>
            <Plus className="size-4 inline mr-1" /> Create Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>

      <div className="flex items-center gap-2 mb-4">
        <span className="grid place-items-center size-8 rounded-[0.5rem]" style={{ backgroundColor: "var(--color-concrete)" }}>
          <Globe className="size-4" style={{ color: "var(--color-ink-600)" }} />
        </span>
        <div>
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>New Portal Listing</p>
          <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>List a unit on a property portal</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Unit & Portal */}
        <SectionCard title="Unit & Portal">
          <MobileSelectWithCreate
            label="Unit to List"
            required
            value={form.builtUnitId}
            onChange={onUnitChange}
            placeholder="— Select available unit —"
            options={units.map((u) => ({
              value: u.id,
              label: `${u.unitNumber} · ${u.unitType} · ${u.projectName} · ${u.area} ${u.areaUnit}`,
              sub: u.askingPrice ? formatCurrencyCompact(u.askingPrice) : undefined,
            }))}
          />

          <EnumSelect
            label="Portal"
            required
            value={form.portalName}
            onChange={(v) => set("portalName", v)}
            options={PORTAL_OPTIONS.map((p) => ({ value: p, label: p }))}
            placeholder="Select portal"
          />
        </SectionCard>

        {/* Listing Details */}
        <SectionCard title="Listing Details">
          <UnderlineInput
            label="Listing Title"
            required
            value={form.title}
            onChange={(v) => set("title", v)}
            placeholder="e.g. 2BHK Apartment in Skyline Residency"
            autoFocus
            enterKeyHint="next"
          />

          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Describe the property…"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>

          <UnderlineInput
            label="Asking Price (₹)"
            required
            type="number"
            min={1}
            step="any"
            value={form.askingPrice}
            onChange={(v) => set("askingPrice", v)}
            placeholder="0"
            inputMode="numeric"
          />
        </SectionCard>

        {/* Property Specs */}
        <SectionCard title="Property Specs">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Bedrooms"
              type="number"
              min={0}
              max={10}
              value={form.bedrooms}
              onChange={(v) => set("bedrooms", v)}
              placeholder="e.g. 2"
              inputMode="numeric"
            />
            <div className="pl-2">
              <UnderlineInput
                label="Bathrooms"
                type="number"
                min={0}
                max={10}
                value={form.bathrooms}
                onChange={(v) => set("bathrooms", v)}
                placeholder="e.g. 2"
                inputMode="numeric"
              />
            </div>
          </div>

          <UnderlineInput
            label="Furnishing"
            value={form.furnishing}
            onChange={(v) => set("furnishing", v)}
            placeholder="e.g. Semi-furnished, Unfurnished"
            enterKeyHint="done"
          />
        </SectionCard>

        {/* Photos */}
        <SectionCard title="Photos">
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Photos
            </label>
            <PhotoUploader photos={photos} onChange={setPhotos} maxPhotos={10} />
          </div>
        </SectionCard>

        {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
        <div
          className="sticky bottom-0 left-0 right-0 z-20 border-t"
          style={{
            backgroundColor: "var(--color-paper)",
            borderColor: "var(--color-line)",
          }}
        >
          <div className="px-3.5 py-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/m/portal-listings")}
              disabled={saving}
              className="rounded-[0.5rem] py-2.5 px-4 text-m-section font-bold text-m-body press disabled:opacity-50 border"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-500)",
                backgroundColor: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Creating…" : "Create Listing"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
