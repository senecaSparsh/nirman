"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, ArrowLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { formatCurrency } from "@/lib/utils";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create listing");
      haptic([10, 40, 80]);
      toast.success("Listing created — sync it from the listings page");
      router.push("/m/portal-listings");
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  if (units.length === 0) {
    return (
      <div>
        <MobileBackButton fallback="/m/portal-listings" />
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-16 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Globe className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            No available units
          </p>
          <p className="text-[0.6875rem] mt-1 mb-4" style={{ color: "var(--color-ink-500)" }}>
            Units with status "Available" can be listed on portals
          </p>
          <Link
            href="/m/units"
            className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed px-6 py-2.5 text-[0.6875rem] font-bold press"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3.5" />
            Go to Built Units
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <MobileBackButton fallback="/m/portal-listings" />

      <div className="flex items-center gap-2 mb-4">
        <span className="grid place-items-center size-8 rounded-[0.5rem]" style={{ backgroundColor: "var(--color-concrete)" }}>
          <Globe className="size-4" style={{ color: "var(--color-ink-600)" }} />
        </span>
        <div>
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>New Portal Listing</p>
          <p className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>List a unit on a property portal</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Unit selector */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Unit to List <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <select value={form.builtUnitId} onChange={(e) => onUnitChange(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">— Select available unit —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.unitNumber} · {u.unitType} · {u.projectName} · {u.area} {u.areaUnit}
                {u.askingPrice ? ` · ${formatCurrency(u.askingPrice)}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Portal selector */}
        <div>
          <label className={labelClass} style={labelStyle}>Portal</label>
          <div className="flex gap-2">
            {PORTAL_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { set("portalName", p); haptic(10); }}
                className="flex-1 h-10 rounded-[0.5rem] border-2 text-[0.5625rem] font-bold press"
                style={{
                  borderColor: form.portalName === p ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: form.portalName === p ? "var(--color-ink-950)" : "var(--color-paper)",
                  color: form.portalName === p ? "#fff" : "var(--color-ink-500)",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Listing Title <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. 2BHK Apartment in Skyline Residency"
            autoFocus
            enterKeyHint="next"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {/* Description */}
        <div>
          <label className={labelClass} style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            placeholder="Describe the property…"
            className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none"
            style={inputStyle}
          />
        </div>

        {/* Asking Price */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Asking Price (₹) <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="number"
            min={1}
            step="any"
            value={form.askingPrice}
            onChange={(e) => set("askingPrice", e.target.value)}
            placeholder="0"
            inputMode="numeric"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {/* Bedrooms + Bathrooms */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>Bedrooms</label>
            <input
              type="number"
              min={0}
              max={10}
              value={form.bedrooms}
              onChange={(e) => set("bedrooms", e.target.value)}
              placeholder="e.g. 2"
              inputMode="numeric"
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Bathrooms</label>
            <input
              type="number"
              min={0}
              max={10}
              value={form.bathrooms}
              onChange={(e) => set("bathrooms", e.target.value)}
              placeholder="e.g. 2"
              inputMode="numeric"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Furnishing */}
        <div>
          <label className={labelClass} style={labelStyle}>Furnishing</label>
          <input
            type="text"
            value={form.furnishing}
            onChange={(e) => set("furnishing", e.target.value)}
            placeholder="e.g. Semi-furnished, Unfurnished"
            enterKeyHint="done"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.push("/m/portal-listings")}
            disabled={saving}
            className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)", backgroundColor: "transparent" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Creating…" : "Create Listing"}
          </button>
        </div>
      </form>
    </div>
  );
}
