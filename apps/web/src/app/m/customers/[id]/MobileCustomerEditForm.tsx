"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/mobile/v2/bottom-sheet";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";

interface CustomerData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
}

export function MobileCustomerEditForm({
  customer,
  onClose,
}: {
  customer: CustomerData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [gstin, setGstin] = useState(customer.gstin ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Invalid email address");
      return;
    }
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
    if (gstin && !gstinRegex.test(gstin)) {
      toast.error("Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          gstin: gstin.trim() || null,
          address: address.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update customer");
      }
      toast.success("Customer updated");
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet title="Edit Customer" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {/* ── Customer Details ── */}
        <SectionCard title="Customer Details">
          {/* Name */}
          <UnderlineInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Customer name"
            required
            enterKeyHint="next"
          />

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Phone"
              value={phone}
              onChange={setPhone}
              type="tel"
              inputMode="tel"
              mono
              placeholder="9876543210"
              enterKeyHint="next"
            />
            <div className="pl-2">
              <UnderlineInput
                label="Email"
                value={email}
                onChange={setEmail}
                type="email"
                inputMode="email"
                placeholder="customer@example.com"
                enterKeyHint="next"
              />
            </div>
          </div>

          {/* GSTIN */}
          <UnderlineInput
            label="GSTIN"
            value={gstin}
            onChange={(v) => setGstin(v.toUpperCase())}
            mono
            placeholder="22AAAAA0000A1Z5"
            maxLength={15}
          />

          {/* Address — textarea, not supported by UnderlineInput */}
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={1}
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              placeholder="Billing address"
            />
          </div>
        </SectionCard>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-[0.625rem] py-3 text-m-section font-bold text-m-body press transition-transform active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
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
