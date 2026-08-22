"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Mobile supplier creation form — minimal fields for fast on-the-spot
 * vendor creation. Mirrors the customer form pattern.
 */
export function MobileNewSupplierClient({
  canCreate,
  existingNames,
  existingPhones,
}: {
  canCreate: boolean;
  existingNames: string[];
  existingPhones: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    gstin: "",
    phone: "",
    email: "",
    address: "",
    leadTimeDays: "",
  });
  const [duplicateName, setDuplicateName] = useState<string | null>(null);
  const [duplicatePhone, setDuplicatePhone] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "name") {
      const match = existingNames.find(
        (n) => n.toLowerCase() === value.trim().toLowerCase() && value.trim().length > 0,
      );
      setDuplicateName(match ?? null);
    }
    if (key === "phone") {
      const normalized = value.trim().replace(/\s+/g, "");
      const match = existingPhones.find(
        (p) => p.replace(/\s+/g, "") === normalized && normalized.length > 0,
      );
      setDuplicatePhone(match ?? null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        gstin: form.gstin.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : null,
      };
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create supplier");
      toast.success("Supplier created", {
        description: form.phone ? `${form.name} · ${form.phone}` : form.name,
      });
      router.push("/m/suppliers");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (!canCreate) {
    return (
      <div>
        <div className="mb-4">
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-[0.5rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          <Truck className="size-8 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-700)" }}>
            You don&apos;t have permission to create suppliers
          </p>
          <p className="text-[0.6875rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
            Contact an admin or manager
          </p>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none focus:ring-2";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="space-y-3">
        <div
          className="rounded-[0.625rem] border p-3 space-y-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <Truck className="size-3.5" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Supplier Details
            </span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. UltraTech Cement Ltd"
              required
              autoFocus
              className={inputClass}
              style={inputStyle}
            />
            {duplicateName && (
              <p className="flex items-center gap-1 text-[0.5rem] mt-1" style={{ color: "var(--color-signal-dark)" }}>
                <AlertCircle className="size-3" />
                A supplier with this name already exists
              </p>
            )}
          </div>

          {/* GSTIN */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              GSTIN
            </label>
            <input
              type="text"
              value={form.gstin}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              placeholder="27ABCDE1234F1Z5"
              maxLength={15}
              className={`${inputClass} font-mono`}
              style={inputStyle}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Phone
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="98765 43210"
              className={`${inputClass} font-mono`}
              style={inputStyle}
            />
            {duplicatePhone && (
              <p className="flex items-center gap-1 text-[0.5rem] mt-1" style={{ color: "var(--color-signal-dark)" }}>
                <AlertCircle className="size-3" />
                A supplier with this phone already exists
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="sales@supplier.com"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Address
            </label>
            <textarea
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              rows={2}
              placeholder="Warehouse / office address"
              className={`${inputClass} resize-none`}
              style={inputStyle}
            />
          </div>

          {/* Lead time */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Lead time (days)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={form.leadTimeDays}
              onChange={(e) => set("leadTimeDays", e.target.value)}
              placeholder="e.g. 7"
              className={`${inputClass} font-mono w-24`}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] py-3.5 text-[0.8125rem] font-bold press transition-transform active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Check className="size-4" />
              <span>Create Supplier</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
