"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { SectionCard, UnderlineInput, EnumSelect } from "@/components/mobile/v2/form-primitives";

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
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const gstinVal = form.gstin.trim().toUpperCase();
    const panVal = form.pan.trim().toUpperCase();
    if (gstinVal && !gstinRegex.test(gstinVal)) {
      toast.error("Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)");
      return;
    }
    if (panVal && !panRegex.test(panVal)) {
      toast.error("Invalid PAN format (e.g., AAAAA0000A)");
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
          gstin: gstinVal || null,
          pan: panVal || null,
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

  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Details */}
      <SectionCard title="Details">
        <UnderlineInput
          label="Company Name"
          value={form.name}
          onChange={(v) => set("name", v)}
          placeholder="e.g. Nirman Realty Pvt Ltd"
          required
          autoFocus
          enterKeyHint="next"
        />

        {/* Parent company (optional — for creating a child/subsidiary) */}
        {parentOptions.length > 0 ? (
          <div>
            <MobileSelectWithCreate
              label="Parent Company"
              value={form.parentCompanyId}
              onChange={(v) => set("parentCompanyId", v)}
              options={parentOptions.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="None (independent)"
            />
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
          <EnumSelect
            label="Business Type"
            value={form.businessType}
            onChange={(v) => set("businessType", v)}
            placeholder="Select…"
            options={BUSINESS_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <EnumSelect
            label="Currency"
            value={form.currency}
            onChange={(v) => set("currency", v)}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
      </SectionCard>

      {/* Tax & Address */}
      <SectionCard title="Tax & Address">
        {/* GSTIN + PAN — toUpperCase, stay inline */}
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
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
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
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
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
      </SectionCard>

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
