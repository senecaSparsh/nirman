"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { useMobileBack } from "@/components/mobile/v2/mobile-back-button";

export function MobileNewBrokerClient({
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
  const goBack = useMobileBack("/m/brokers");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agency, setAgency] = useState("");
  const [commission, setCommission] = useState("");
  const [notes, setNotes] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Broker name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/brokers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          agency: agency.trim() || undefined,
          defaultCommissionPercent: commission ? Number(commission) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create broker");
      haptic([10, 40, 80]);
      toast.success("Broker added");
      if (onCreated) {
        onCreated(data.id);
        onClose?.();
      } else {
        router.push("/m/real-estate?tab=brokers");
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
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            New Broker
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 text-m-section font-extrabold tracking-tight px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-ink-500)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          Master
        </span>
      </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* Broker Details */}
        <SectionCard title="Broker Details">
          <UnderlineInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Rajesh Sharma"
            required
            autoFocus
          />

          {/* Phone + Agency */}
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
                label="Agency"
                value={agency}
                onChange={setAgency}
                placeholder="Sharma Properties"
              />
            </div>
          </div>

          {/* Commission */}
          <div>
            <UnderlineInput
              label="Default Commission %"
              value={commission}
              onChange={setCommission}
              placeholder="e.g. 2.5"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
            />
            <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-700)" }}>
              Auto-fills commission on new deals using this broker.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this broker…"
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
              style={inputStyle}
            />
          </div>
        </SectionCard>

        {/* Submit */}
        <div className="flex gap-1 pt-2">
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
            {saving ? "Adding…" : "Add Broker"}
          </button>
        </div>
      </form>
    </div>
  );
}
