"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Hammer } from "lucide-react";
import { haptic } from "@/lib/haptic";

export function MobileNewSubcontractorClient() {
  const router = useRouter();
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
      router.push("/m/subcontractors");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-m-caption font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => router.back()}
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
          className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <Hammer className="size-2.5" />
          Master
        </span>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* Name */}
        <div>
          <label className={labelClass} style={labelStyle}>Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ramesh Masonry"
            className={inputClass}
            style={inputStyle}
            required
          />
        </div>

        {/* Trade + GSTIN */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass} style={labelStyle}>Trade</label>
            <input
              type="text"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              placeholder="Masonry, Plumbing…"
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>GSTIN</label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="22AAAAA0000A1Z5"
              className={`${inputClass} font-mono`}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Phone + Email */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass} style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              inputMode="tel"
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@firm.com"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Address */}
        <div>
          <label className={labelClass} style={labelStyle}>Address</label>
          <textarea
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Office address…"
            className="w-full rounded-[0.5rem] border px-2.5 py-2 text-m-section resize-none outline-none"
            style={inputStyle}
          />
        </div>

        {/* Submit */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
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
      </form>
    </div>
  );
}
