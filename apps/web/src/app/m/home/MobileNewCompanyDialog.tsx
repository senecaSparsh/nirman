"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { X, Loader2, Building2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

interface FormState {
  name: string;
  businessType: string;
  gstin: string;
  pan: string;
  currency: string;
  address: string;
  parentCompanyId: string;
}

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

const BUSINESS_TYPES = [
  "Construction & Real Estate",
  "Real Estate Developer",
  "Construction Contractor",
  "Building Materials",
  "Interior Design",
  "Architecture",
  "Engineering",
  "Other",
];

/**
 * MobileNewCompanyDialog — bottom-sheet form for creating a new company
 * from the mobile home page. Calls POST /api/companies.
 *
 * On success: switches to the new company and refreshes the page so the
 * orbit and company strip update immediately.
 */
export function MobileNewCompanyDialog({
  open,
  onClose,
  onCreated,
  parentOptions = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (company: { id: string; name: string }) => void;
  parentOptions?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    businessType: "",
    gstin: "",
    pan: "",
    currency: "INR",
    address: "",
    parentCompanyId: "",
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          businessType: form.businessType.trim() || null,
          gstin: form.gstin.trim() || null,
          pan: form.pan.trim() || null,
          currency: form.currency,
          address: form.address.trim() || null,
          parentCompanyId: form.parentCompanyId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create company");
      haptic([10, 40, 80]);
      toast.success(`${data.name} created`);

      // Switch to the new company so the user lands inside it
      await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: data.id }),
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent("nirman-company-switched"));

      if (onCreated) {
        onCreated({ id: data.id, name: data.name });
      }
      onClose();
      if (!onCreated) {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const inputClass =
    "w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-m-caption font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(18, 17, 13, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[1rem] border-t p-4 pb-safe max-h-[90vh] overflow-y-auto"
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
              <Building2
                className="size-3.5"
                style={{ color: "var(--color-ink-600)" }}
              />
            </span>
            <p
              className="text-m-section font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              New Company
            </p>
          </div>
          <button
            onClick={onClose}
            className="touch grid place-items-center rounded-[0.375rem] text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Company Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Nirman Realty Pvt Ltd"
              autoFocus
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Parent company (optional — for creating a child/subsidiary) */}
          {parentOptions.length > 0 ? (
            <div>
              <label className={labelClass} style={labelStyle}>
                Parent Company
              </label>
              <div className="relative">
                <GitBranch
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none"
                  style={{ color: "var(--color-ink-500)" }}
                />
                <select
                  value={form.parentCompanyId}
                  onChange={(e) => set("parentCompanyId", e.target.value)}
                  className={`${inputClass} pl-8`}
                  style={inputStyle}
                >
                  <option value="">None (independent)</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <p
                className="text-m-caption mt-1"
                style={{ color: "var(--color-ink-500)" }}
              >
                Select a parent to create a subsidiary / branch.
              </p>
            </div>
          ) : null}

          {/* Business type + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                Business Type
              </label>
              <select
                value={form.businessType}
                onChange={(e) => set("businessType", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                <option value="">Select…</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Currency
              </label>
              <select
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
                className={inputClass}
                style={inputStyle}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* GSTIN + PAN */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} style={labelStyle}>
                GSTIN
              </label>
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                PAN
              </label>
              <input
                type="text"
                value={form.pan}
                onChange={(e) => set("pan", e.target.value.toUpperCase())}
                placeholder="AAAAA0000A"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Address
            </label>
            <textarea
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Registered office address"
              rows={2}
              className={`${inputClass} py-2 resize-none`}
              style={inputStyle}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-m-section font-bold text-m-body press transition-transform active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
            }}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Creating…</span>
              </>
            ) : (
              <>
                <Building2 className="size-4" />
                <span>Create Company</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
