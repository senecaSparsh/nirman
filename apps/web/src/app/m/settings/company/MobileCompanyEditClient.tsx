"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {Loader2, Save, CheckCircle2} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

interface CompanyData {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  businessType: string | null;
}

export function MobileCompanyEditClient({
  company,
  canManage,
}: {
  company: CompanyData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: company.name,
    gstin: company.gstin ?? "",
    pan: company.pan ?? "",
    address: company.address ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    currency: company.currency,
    businessType: company.businessType ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-m-caption font-bold block mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Company name is required");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Invalid email address");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          gstin: form.gstin.trim() || null,
          pan: form.pan.trim() || null,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          currency: form.currency,
          businessType: form.businessType.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success("Company details saved");
      setSaved(true);
      setTimeout(() => {
        router.refresh();
        router.push("/m/settings");
      }, 800);
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return <MobileNoAccess what="company details editing" />;
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <CheckCircle2 className="size-12 mb-3" style={{ color: "var(--color-go)" }} />
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          Company details saved
        </p>
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          These details will appear on all printed bills and invoices.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
          Company Details
        </p>
      </div>

      {/* Info banner */}
      <div
        className="rounded-[0.5rem] border p-2.5 mb-4"
        style={{
          borderColor: "var(--color-signal)",
          backgroundColor: "var(--color-signal-bg, rgba(245, 158, 11, 0.08))",
        }}
      >
        <p className="text-m-caption leading-relaxed" style={{ color: "var(--color-ink-700)" }}>
          These details appear on every printed bill, invoice, receipt, and purchase order. Keep
          them accurate for GST compliance.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* ── Company Details ── */}
        <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Company Details
          </p>

          {/* Company Name */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Company Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. ABP Realty Pvt Ltd"
              required
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Business Type */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Business Type
            </label>
            <input
              type="text"
              value={form.businessType}
              onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
              placeholder="e.g. Real Estate, Construction"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* GSTIN + PAN */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                GSTIN
              </label>
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className={`${inputClass} uppercase`}
                style={inputStyle}
              />
            </div>
            <div className="pl-2">
              <label className={labelClass} style={labelStyle}>
                PAN
              </label>
              <input
                type="text"
                value={form.pan}
                onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
                placeholder="AAAAA0000A"
                maxLength={10}
                className={`${inputClass} uppercase`}
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
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Registered office address"
              rows={1}
              className={`${inputClass} resize-none`}
              style={{ ...inputStyle, height: "auto", paddingTop: "0.5rem", paddingBottom: "0.5rem" }}
            />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+91 98765 43210"
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div className="pl-2">
              <label className={labelClass} style={labelStyle}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="accounts@company.com"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Currency */}
          <EnumSelect
            label="Currency"
            value={form.currency}
            onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
            options={["INR", "USD", "EUR", "GBP", "AED"].map((c) => ({ value: c, label: c }))}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50 mt-2"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Save className="size-4" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
