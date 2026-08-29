"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Briefcase } from "lucide-react";
import { haptic } from "@/lib/haptic";

export function MobileNewBrokerClient() {
  const router = useRouter();
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
      router.push("/m/brokers");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full h-9 rounded-[0.5rem] border px-2.5 text-[0.75rem] outline-none";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };
  const labelClass = "text-[0.5625rem] font-semibold block mb-1";
  const labelStyle = { color: "var(--color-ink-500)" };

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center h-7 w-7 rounded-[0.375rem] press"
          style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Broker
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <Briefcase className="size-2.5" />
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
            placeholder="e.g. Rajesh Sharma"
            className={inputClass}
            style={inputStyle}
            required
          />
        </div>

        {/* Phone + Agency */}
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
            <label className={labelClass} style={labelStyle}>Agency</label>
            <input
              type="text"
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              placeholder="Sharma Properties"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Commission */}
        <div>
          <label className={labelClass} style={labelStyle}>Default Commission %</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            placeholder="e.g. 2.5"
            className={inputClass}
            style={inputStyle}
          />
          <p className="text-[0.5rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
            Auto-fills commission on new deals using this broker
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass} style={labelStyle}>Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this broker…"
            className="w-full rounded-[0.5rem] border px-2.5 py-2 text-[0.75rem] resize-none outline-none"
            style={inputStyle}
          />
        </div>

        {/* Submit */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={saving}
            className="flex-1 h-9 rounded-[0.5rem] border text-[0.625rem] font-bold press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 h-9 rounded-[0.5rem] text-[0.625rem] font-bold press"
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
