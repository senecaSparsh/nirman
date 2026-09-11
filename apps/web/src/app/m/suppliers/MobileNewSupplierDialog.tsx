"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";

/**
 * Form content for creating a supplier — used inside MobileFabModal
 * (spring-from-FAB animation) or wrapped by MobileNewSupplierDialog
 * (legacy bottom-sheet backdrop).
 *
 * POSTs to /api/suppliers { name, gstin, phone, email, address }.
 * On success calls onCreated({ id, name }) so the parent can wire it
 * into its local state without a full page reload.
 */
export function MobileNewSupplierForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (supplier: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
    const gstinVal = gstin.trim().toUpperCase();
    if (gstinVal && !gstinRegex.test(gstinVal)) {
      toast.error("Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          gstin: gstinVal || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create supplier");
      haptic([10, 40, 80]);
      toast.success(`${data.name} supplier created`);
      router.refresh();
      onCreated?.({ id: data.id, name: data.name });
      setName("");
      setGstin("");
      setPhone("");
      setEmail("");
      setAddress("");
      onClose();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* Identity */}
        <SectionCard title="Identity">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Name"
              value={name}
              onChange={setName}
              placeholder="e.g. ABC Cement"
              required
              autoFocus
            />
            <div className="pl-2">
              {/* GSTIN has toUpperCase transform — stays inline */}
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                GSTIN
              </label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                className="w-full h-7 px-1 text-m-caption font-mono outline-none border-b focus:border-b-2 transition-colors"
                style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>
        </SectionCard>

        {/* Contact */}
        <SectionCard title="Contact">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Phone"
              value={phone}
              onChange={setPhone}
              placeholder="9876543210"
              type="tel"
              inputMode="tel"
            />
            <div className="pl-2">
              <UnderlineInput
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="contact@abc.com"
                type="email"
              />
            </div>
          </div>
        </SectionCard>

        {/* Address */}
        <SectionCard title="Address">
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Shop 12, Market Road, City"
              rows={2}
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-500)" }}
            />
          </div>
        </SectionCard>

        {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
        <div
          className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
          style={{
            backgroundColor: "var(--color-paper)",
            borderColor: "var(--color-line)",
          }}
        >
          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" />
                  <span>Create Supplier</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

/**
 * Mobile bottom-sheet dialog for creating a supplier inline.
 * Legacy backdrop version — kept for backward compatibility.
 * Prefer wrapping <MobileNewSupplierForm> in <MobileFabModal> instead.
 */
export function MobileNewSupplierDialog({
  open,
  onClose,
  onCreated,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (supplier: { id: string; name: string }) => void;
  nested?: boolean;
}) {
  return (
    <MobileDialog open={open} onClose={onClose} title="New Supplier" nested={nested}>
      <MobileNewSupplierForm onClose={onClose} onCreated={onCreated} />
    </MobileDialog>
  );
}
