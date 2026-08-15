"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

type AssetType = "LAND" | "BUILT_UNIT";

interface AssetOption {
  id: string;
  label: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface FormState {
  assetType: AssetType;
  assetId: string;
  customerId: string;
  projectId: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  securityDeposit: string;
  rentAgreementNo: string;
  notes: string;
}

/**
 * MobileNewTenancyDialog — bottom-sheet form for creating a rental/lease
 * tenancy from the mobile surface. Mirrors the desktop rentals-view's
 * API contract (POST /api/tenancies).
 */
export function MobileNewTenancyDialog({
  open,
  onClose,
  units,
  parcels,
  projects,
  customers,
}: {
  open: boolean;
  onClose: () => void;
  units: AssetOption[];
  parcels: AssetOption[];
  projects: ProjectOption[];
  customers: CustomerOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    assetType: "BUILT_UNIT",
    assetId: "",
    customerId: "",
    projectId: "",
    tenantName: "",
    tenantPhone: "",
    tenantEmail: "",
    startDate: "",
    endDate: "",
    monthlyRent: "",
    securityDeposit: "",
    rentAgreementNo: "",
    notes: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const assets = form.assetType === "LAND" ? parcels : units;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assetId) {
      toast.error("Please select an asset to rent out");
      return;
    }
    if (!form.tenantName.trim()) {
      toast.error("Tenant name is required");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      toast.error("End date must be after start date");
      return;
    }
    if (!form.monthlyRent || Number(form.monthlyRent) <= 0) {
      toast.error("Monthly rent must be greater than 0");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/tenancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType: form.assetType,
          landParcelId: form.assetType === "LAND" ? form.assetId : null,
          builtUnitId: form.assetType === "BUILT_UNIT" ? form.assetId : null,
          customerId: form.customerId || null,
          projectId: form.projectId || null,
          tenantName: form.tenantName.trim(),
          tenantPhone: form.tenantPhone.trim() || null,
          tenantEmail: form.tenantEmail.trim() || null,
          startDate: form.startDate,
          endDate: form.endDate,
          monthlyRent: Number(form.monthlyRent),
          securityDeposit: form.securityDeposit === "" ? 0 : Number(form.securityDeposit),
          rentAgreementNo: form.rentAgreementNo.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create tenancy");
      haptic([10, 40, 80]);
      toast.success("Tenancy created");
      onClose();
      router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <KeyRound className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              New Tenancy
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center size-7 rounded-[0.375rem] press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Asset Type Toggle */}
          <div>
            <label className={labelClass} style={labelStyle}>Asset Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { set("assetType", "BUILT_UNIT"); set("assetId", ""); haptic(10); }}
                className="flex-1 h-10 rounded-[0.5rem] border-2 text-[0.75rem] font-bold press"
                style={{
                  borderColor: form.assetType === "BUILT_UNIT" ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: form.assetType === "BUILT_UNIT" ? "var(--color-ink-950)" : "var(--color-paper)",
                  color: form.assetType === "BUILT_UNIT" ? "#fff" : "var(--color-ink-500)",
                }}
              >
                Built Unit
              </button>
              <button
                type="button"
                onClick={() => { set("assetType", "LAND"); set("assetId", ""); haptic(10); }}
                className="flex-1 h-10 rounded-[0.5rem] border-2 text-[0.75rem] font-bold press"
                style={{
                  borderColor: form.assetType === "LAND" ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: form.assetType === "LAND" ? "var(--color-ink-950)" : "var(--color-paper)",
                  color: form.assetType === "LAND" ? "#fff" : "var(--color-ink-500)",
                }}
              >
                Land Parcel
              </button>
            </div>
          </div>

          {/* Asset Selector */}
          <div>
            <label className={labelClass} style={labelStyle}>
              {form.assetType === "LAND" ? "Land Parcel" : "Built Unit"} <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <select
              value={form.assetId}
              onChange={(e) => set("assetId", e.target.value)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">— Select {form.assetType === "LAND" ? "parcel" : "unit"} —</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
            {assets.length === 0 && (
              <p className="text-[0.4375rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
                No {form.assetType === "LAND" ? "land parcels" : "built units"} available.{" "}
                <Link href={form.assetType === "LAND" ? "/m/land" : "/m/units"} className="underline font-semibold">
                  Create one first
                </Link>
                .
              </p>
            )}
          </div>

          {/* Tenant Name */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Tenant Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.tenantName}
              onChange={(e) => set("tenantName", e.target.value)}
              placeholder="e.g. Sharma Enterprises"
              autoFocus
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Tenant Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>Tenant Phone</label>
              <input
                type="tel"
                value={form.tenantPhone}
                onChange={(e) => set("tenantPhone", e.target.value)}
                placeholder="98765 43210"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Tenant Email</label>
              <input
                type="email"
                value={form.tenantEmail}
                onChange={(e) => set("tenantEmail", e.target.value)}
                placeholder="tenant@email.com"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Customer (optional) */}
          {customers.length > 0 && (
            <div>
              <label className={labelClass} style={labelStyle}>Link to Customer (optional)</label>
              <select
                value={form.customerId}
                onChange={(e) => set("customerId", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">— None —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                Start Date <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                End Date <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Rent + Deposit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                Monthly Rent (₹) <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.monthlyRent}
                onChange={(e) => set("monthlyRent", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>Security Deposit (₹)</label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.securityDeposit}
                onChange={(e) => set("securityDeposit", e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Agreement No */}
          <div>
            <label className={labelClass} style={labelStyle}>Agreement Reference No.</label>
            <input
              type="text"
              value={form.rentAgreementNo}
              onChange={(e) => set("rentAgreementNo", e.target.value)}
              placeholder="e.g. LEASE-2024-001"
              enterKeyHint="done"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press disabled:opacity-50"
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
              className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "#fff",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Creating…" : "Create Tenancy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
