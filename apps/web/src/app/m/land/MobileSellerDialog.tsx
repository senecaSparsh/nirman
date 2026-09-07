"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";

export function MobileSellerDialog({
  open,
  onClose,
  onCreated,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (seller: {
    id: string;
    name: string;
    phone?: string | null;
  }) => void;
  initial?: { name?: string; phone?: string; address?: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: "",
    gstin: "",
    address: initial?.address ?? "",
    notes: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) {
      toast.error("Seller name is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/land-sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          gstin: form.gstin.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create seller");
      haptic([10, 40, 80]);
      toast.success("Seller created");
      if (onCreated)
        onCreated({ id: data.id, name: data.name, phone: data.phone });
      onClose();
      if (!onCreated) router.refresh();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog open={open} onClose={onClose} title="Seller Details">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Seller Details */}
          <SectionCard title="Seller Details">
            <UnderlineInput
              label="Name"
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder="e.g. Suresh Patel"
              required
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="Phone"
                value={form.phone}
                onChange={(v) => set("phone", v)}
                placeholder="98765 43210"
                type="tel"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Email"
                  value={form.email}
                  onChange={(v) => set("email", v)}
                  placeholder="seller@email.com"
                  type="email"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <UnderlineInput
                label="GSTIN"
                value={form.gstin}
                onChange={(v) => set("gstin", v)}
                placeholder="22AAAAA0000A1Z5"
              />
              <div className="pl-2">
                <UnderlineInput
                  label="Address"
                  value={form.address}
                  onChange={(v) => set("address", v)}
                  placeholder="Village, district"
                />
              </div>
            </div>
            {/* Notes — textarea, kept hand-rolled (UnderlineInput only supports <input>) */}
            <div>
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={1}
                placeholder="Optional notes"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </div>
          </SectionCard>
          {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
          <div
            className="sticky bottom-0 left-0 right-0 z-20 border-t"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
            }}
          >
            <div className="px-3.5 py-2 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? "Creating…" : "Create Seller"}
              </button>
            </div>
          </div>
        </form>
    </MobileDialog>
  );
}
