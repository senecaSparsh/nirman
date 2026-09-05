"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Loader2, Building2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";

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
 * MobileNewCompanyForm — form content for creating a new company.
 *
 * Used inside <MobileFabModal> (spring-from-FAB animation) on the
 * home page, or wrapped by <MobileNewCompanyDialog> (legacy
 * bottom-sheet backdrop) for inline creation from other pages.
 * Mirrors MobileNewLeaveForm / MobileNewMaterialForm.
 *
 * No header or Cancel button here — the wrapper supplies the title
 * and the close affordance (FAB morphs +→× in MobileFabModal, X
 * button in the legacy bottom-sheet).
 *
 * On success: switches to the new company and refreshes the page so the
 * orbit and company strip update immediately.
 */
export function MobileNewCompanyForm({
  onClose,
  onCreated,
  parentOptions = [],
}: {
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

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  const sectionClass = "rounded-[0.625rem] border p-3 flex flex-col gap-3";
  const sectionStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
  };
  const sectionTitleClass = "text-m-section font-extrabold tracking-tight";
  const sectionTitleStyle = { color: "var(--color-ink-950)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Details
        </p>

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
                className="absolute left-1 top-1/2 -translate-y-1/2 size-3 pointer-events-none"
                style={{ color: "var(--color-ink-500)" }}
              />
              <select
                value={form.parentCompanyId}
                onChange={(e) => set("parentCompanyId", e.target.value)}
                className={`${inputClass} pl-5`}
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
      </div>

      {/* Tax & Address */}
      <div className={sectionClass} style={sectionStyle}>
        <p className={sectionTitleClass} style={sectionTitleStyle}>
          Tax & Address
        </p>

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
            className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
            style={inputStyle}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
        style={{
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
        }}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Building2 className="size-4" />
        )}
        {saving ? "Creating…" : "Create Company"}
      </button>
    </form>
  );
}

/**
 * MobileNewCompanyDialog — legacy bottom-sheet backdrop wrapper.
 *
 * Kept for backward compatibility / inline creation from other pages.
 * Prefer wrapping <MobileNewCompanyForm> in <MobileFabModal> instead —
 * that gives the spring-from-FAB animation matching the materials and
 * leaves pages.
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
  return (
    <MobileDialog open={open} onClose={onClose} title="New Company">
      <MobileNewCompanyForm
        onClose={onClose}
        onCreated={onCreated}
        parentOptions={parentOptions}
      />
    </MobileDialog>
  );
}
