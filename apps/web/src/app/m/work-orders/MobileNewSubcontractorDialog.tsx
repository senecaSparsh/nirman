"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";

/**
 * Mobile bottom-sheet dialog for creating a subcontractor inline.
 *
 * POSTs to /api/subcontractors { name, gstin, phone, email, address, trade }.
 * On success calls onCreated({ id, name, trade }) so the parent can wire it
 * into its local state without a full page reload.
 */
export function MobileNewSubcontractorDialog({
  open,
  onClose,
  onCreated,
  nested,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (sub: { id: string; name: string; trade: string | null }) => void;
  nested?: boolean;
}) {
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Subcontractor name is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade: trade.trim() || null,
          gstin: gstin.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Failed to create subcontractor");
      haptic([10, 40, 80]);
      toast.success(`${name.trim()} subcontractor created`);
      onCreated({
        id: data.id,
        name: name.trim(),
        trade: trade.trim() || null,
      });
      setName("");
      setTrade("");
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
    <MobileDialog open={open} onClose={onClose} title="New Subcontractor" nested={nested}>
      <p
        className="text-m-caption mb-4"
        style={{ color: "var(--color-ink-500)" }}
      >
        Add a subcontractor to issue work orders to. Only the name is
        required.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Subcontractor Details */}
          <SectionCard title="Subcontractor Details">
            <UnderlineInput
              label="Name"
              value={name}
              onChange={setName}
              placeholder="e.g. ABC Plumbing Works"
              required
              autoFocus
            />
            <UnderlineInput
              label="Trade"
              value={trade}
              onChange={setTrade}
              placeholder="e.g. Plumbing, Electrical, Masonry"
            />
            <UnderlineInput
              label="GSTIN"
              value={gstin}
              onChange={(v) => setGstin(v.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
            />
          </SectionCard>

          {/* Contact & Address */}
          <SectionCard title="Contact & Address">
            {/* Phone + Email */}
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
                  placeholder="contact@abcworks.com"
                  type="email"
                  inputMode="email"
                />
              </div>
            </div>

            {/* Address — textarea (UnderlineInput only supports <input>) */}
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop 12, Market Road, City"
                rows={1}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
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
                className="flex-1 flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
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
                    <span>Create Subcontractor</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}
