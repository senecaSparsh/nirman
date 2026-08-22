"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Mobile bottom-sheet dialog for creating a supplier inline.
 *
 * POSTs to /api/suppliers { name, gstin, phone, email, address }.
 * On success calls onCreated({ id, name }) so the parent can wire it
 * into its local state without a full page reload.
 */
export function MobileNewSupplierDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (supplier: { id: string; name: string }) => void;
}) {
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
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          gstin: gstin.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create supplier");
      haptic([10, 40, 80]);
      toast.success(`${data.name} supplier created`);
      onCreated({ id: data.id, name: data.name });
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Supplier
          </h2>
          <button onClick={onClose} className="press grid place-items-center size-7 rounded-[0.375rem]" style={{ color: "var(--color-ink-500)" }}>
            <X className="size-4" />
          </button>
        </div>

        <p className="text-[0.5625rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          Add a vendor you purchase materials from. Only the name is required.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ABC Cement Suppliers"
              autoFocus
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* GSTIN */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              GSTIN
            </label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@abcsuppliers.com"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Address */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Shop 12, Market Road, City"
              rows={2}
              className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem] outline-none resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
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
        </form>
      </div>
    </div>
  );
}
