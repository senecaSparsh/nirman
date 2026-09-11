"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";

/**
 * Mobile bottom-sheet dialog for creating a customer inline.
 *
 * Used on the mobile sales page so the user can add a new customer
 * without leaving the current screen. Returns the created entity via
 * the `onCreated` callback — does NOT use router.refresh().
 *
 * POSTs to /api/customers { name, phone, email, gstin, address }.
 */
export function MobileNewCustomerDialog({
  open,
  onClose,
  onCreated,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: { id: string; name: string; phone: string | null }) => void;
  /** When true, disables backdrop blur — use when opened inside another
   *  modal to avoid double-blur ("blurry inside blurry"). */
  nested?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          gstin: gstin.trim() || null,
          address: address.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create customer");
      haptic([10, 40, 80]);
      toast.success(`${data.name} customer created`);
      router.refresh();
      onCreated({ id: data.id, name: data.name, phone: data.phone ?? null });
      setName("");
      setPhone("");
      setEmail("");
      setGstin("");
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
    <MobileDialog open={open} onClose={onClose} title="New Customer" nested={nested}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Details */}
          <SectionCard title="Details">
            <UnderlineInput
              label="Name"
              value={name}
              onChange={setName}
              placeholder="e.g. Acme Constructions"
              required
              autoFocus
            />

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Phone"
              value={phone}
              onChange={setPhone}
              placeholder="98765 43210"
              type="tel"
              inputMode="tel"
            />
            <div className="pl-2">
              <UnderlineInput
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="accounts@acme.in"
                type="email"
              />
            </div>
          </div>
          </SectionCard>

          {/* Tax & Billing */}
          <SectionCard title="Tax & Billing">
          {/* GSTIN — toUpperCase, stays inline */}
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              GSTIN
            </label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="27ABCDE1234F1Z5"
              className="w-full h-7 px-1 text-m-caption font-mono uppercase outline-none border-b focus:border-b-2 transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Billing address"
              rows={2}
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
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
                    <span>Create Customer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}
