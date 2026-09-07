"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Hammer } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { useMobileBack } from "@/components/mobile/v2/mobile-back-button";

export function MobileNewSubcontractorClient({
  onClose,
  onCreated,
}: {
  /** When provided, the component renders in modal mode (no header,
   *  cancel calls onClose, success calls onCreated + onClose instead
   *  of router.push). */
  onClose?: () => void;
  onCreated?: (id: string) => void;
} = {}) {
  const router = useRouter();
  const goBack = useMobileBack("/m/subcontractors");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [gstin, setGstin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade: trade.trim() || undefined,
          gstin: gstin.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create subcontractor");
      haptic([10, 40, 80]);
      toast.success("Subcontractor added");
      if (onCreated) {
        onCreated(data.id);
        onClose?.();
      } else {
        router.push("/m/subcontractors");
        router.refresh();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };

  return (
    <div className={onClose ? "" : "pb-32"}>
      {/* Header — hidden in modal mode (MobileFabModal provides title) */}
      {onClose ? null : (
      <div className="flex items-center gap-1 mb-3">
        <button
          onClick={goBack}
          className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] text-m-body press"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Subcontractor
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 text-m-section font-extrabold tracking-tight px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-ink-500)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <Hammer className="size-2.5" />
          Master
        </span>
      </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* Identity */}
        <SectionCard title="Identity">
          <UnderlineInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Ramesh Masonry"
            required
            autoFocus
          />
        </SectionCard>

        {/* Trade & Tax */}
        <SectionCard title="Trade & Tax">
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <UnderlineInput
              label="Trade"
              value={trade}
              onChange={setTrade}
              placeholder="Masonry, Plumbing…"
            />
            <div className="pl-2">
              <UnderlineInput
                label="GSTIN"
                value={gstin}
                onChange={setGstin}
                placeholder="22AAAAA0000A1Z5"
                mono
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
                placeholder="contact@firm.com"
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
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Office address…"
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
              style={inputStyle}
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (onClose ? onClose() : goBack())}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
                opacity: saving || !name.trim() ? 0.5 : 1,
              }}
            >
              {saving ? "Adding…" : "Add Subcontractor"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
