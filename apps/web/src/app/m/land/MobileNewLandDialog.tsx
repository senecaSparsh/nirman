"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";

type AreaUnit =
  | "SQFT"
  | "SQM"
  | "SQYD"
  | "ACRE"
  | "BIGHA"
  | "KATHA"
  | "HECTARE";

const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  SQFT: "sq.ft",
  SQM: "sq.m",
  SQYD: "sq.yd",
  ACRE: "acre",
  BIGHA: "bigha",
  KATHA: "katha",
  HECTARE: "hectare",
};

interface ProjectOption {
  id: string;
  name: string;
}

interface FormState {
  projectId: string;
  sellerName: string;
  sellerContact: string;
  purchaseDate: string;
  totalArea: string;
  areaUnit: AreaUnit;
  totalCost: string;
  registryNo: string;
  location: string;
  initialParcelNumber: string;
}

/**
 * MobileNewLandDialog — bottom-sheet form for recording a land purchase
 * from the mobile surface. Mirrors the desktop land-purchase-form-dialog's
 * API contract (POST /api/land-purchases).
 */
export function MobileNewLandDialog({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    projectId: "",
    sellerName: "",
    sellerContact: "",
    purchaseDate: "",
    totalArea: "",
    areaUnit: "SQFT",
    totalCost: "",
    registryNo: "",
    location: "",
    initialParcelNumber: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sellerName.trim()) {
      toast.error("Seller name is required");
      return;
    }
    if (!form.totalArea || Number(form.totalArea) <= 0) {
      toast.error("Total area must be greater than 0");
      return;
    }
    if (!form.totalCost || Number(form.totalCost) <= 0) {
      toast.error("Total cost must be greater than 0");
      return;
    }
    if (!form.initialParcelNumber.trim()) {
      toast.error("Parcel number is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/land-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId || null,
          sellerName: form.sellerName.trim(),
          sellerContact: form.sellerContact.trim() || null,
          purchaseDate: form.purchaseDate || null,
          totalArea: Number(form.totalArea),
          areaUnit: form.areaUnit,
          totalCost: Number(form.totalCost),
          registryNo: form.registryNo.trim() || null,
          location: form.location.trim() || null,
          initialParcelNumber: form.initialParcelNumber.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Failed to create land purchase");
      haptic([10, 40, 80]);
      toast.success("Land purchase recorded");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <MobileDialog open={open} onClose={onClose} title="New Land Purchase">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Seller & Project */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Seller &amp; Project
            </p>
            {/* Seller Name */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Seller Name <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.sellerName}
                onChange={(e) => set("sellerName", e.target.value)}
                placeholder="e.g. Ramesh Properties"
                autoFocus
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Seller Contact */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Seller Contact
              </label>
              <input
                type="tel"
                value={form.sellerContact}
                onChange={(e) => set("sellerContact", e.target.value)}
                placeholder="98765 43210"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Project (optional) */}
            <MobileSelectWithCreate
              label="Project (optional)"
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              placeholder="— None —"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              inputClass={inputClass}
              inputStyle={inputStyle}
              renderDialog={({ open, onClose, onCreated }) => (
                <MobileNewProjectDialog
                  open={open}
                  onClose={onClose}
                  onCreated={(p) => onCreated(p.id, p.name)}
                />
              )}
            />
          </div>

          {/* Land Details */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Land Details
            </p>
            {/* Location */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Location
              </label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Village, tehsil, district, state"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Purchase Date */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Purchase Date
              </label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => set("purchaseDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Area + Unit */}
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <label className={labelClass} style={labelStyle}>
                  Total Area <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.totalArea}
                  onChange={(e) => set("totalArea", e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="pl-2">
                <label className={labelClass} style={labelStyle}>
                  Unit
                </label>
                <select
                  value={form.areaUnit}
                  onChange={(e) => set("areaUnit", e.target.value as AreaUnit)}
                  className={inputClass}
                  style={inputStyle}
                >
                  {(Object.keys(AREA_UNIT_LABELS) as AreaUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {AREA_UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Total Cost */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Total Cost (₹){" "}
                <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.totalCost}
                onChange={(e) => set("totalCost", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Registry No */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Registry / Sale Deed No.
              </label>
              <input
                type="text"
                value={form.registryNo}
                onChange={(e) => set("registryNo", e.target.value)}
                placeholder="e.g. REG-2024-0123"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Initial Parcel Number */}
            <div>
              <label className={labelClass} style={labelStyle}>
                Parcel Number{" "}
                <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.initialParcelNumber}
                onChange={(e) => set("initialParcelNumber", e.target.value)}
                placeholder="e.g. P-001"
                enterKeyHint="done"
                className={inputClass}
                style={inputStyle}
              />
              <p
                className="text-m-caption mt-1"
                style={{ color: "var(--color-ink-500)" }}
              >
                The default parcel created for this purchase. You can partition it
                later.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press disabled:opacity-50"
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
              className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Creating…" : "Record Purchase"}
            </button>
          </div>
        </form>
    </MobileDialog>
  );
}
