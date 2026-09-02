"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

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
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: { id: string; name: string }) => void;
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
      onCreated({ id: data.id, name: data.name });
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
    >
      <div
        className="w-full max-w-md rounded-t-[1rem] border-t p-4 pb-safe"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-m-section font-bold"
            style={{ color: "var(--color-ink-950)" }}
          >
            New Customer
          </h2>
          <button
            onClick={onClose}
            className="touch text-m-body press grid place-items-center rounded-[0.375rem]"
            style={{ color: "var(--color-ink-700)" }}
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Constructions"
              autoFocus
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accounts@acme.in"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
          </div>

          {/* GSTIN */}
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              GSTIN
            </label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="27ABCDE1234F1Z5"
              className="w-full h-7 px-1 text-m-caption font-mono uppercase outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Address */}
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
              placeholder="Billing address"
              rows={2}
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-1 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
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
        </form>
      </div>
    </div>
  );
}
