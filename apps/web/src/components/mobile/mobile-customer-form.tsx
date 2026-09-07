"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UserPlus, Loader2, Check, AlertCircle, Send,
} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { BottomSheet } from "@/components/mobile/v2/bottom-sheet";

const inputClass =
  "w-full h-7 px-1 text-m-caption font-medium outline-none border-b focus:border-b-2 transition-colors";
const inputStyle = {
  borderColor: "var(--color-line)",
  backgroundColor: "transparent",
  color: "var(--color-ink-950)",
} as React.CSSProperties;

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-m-caption font-semibold mb-1"
        style={{ color: "var(--color-ink-700)" }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

/**
 * Mobile customer creation form — minimal fields (name, phone, email, GSTIN)
 * for fast on-the-spot customer creation during a sale. Includes
 * duplicate-check on phone number and "Save & continue" flow that
 * redirects back to the sale form with the new customer pre-selected.
 */
export function MobileCustomerForm({
  redirectTo,
  existingPhones,
  onClose,
  onCreated,
}: {
  /** URL to redirect to after creating (e.g. "/m/sales/new?customerId=..."). */
  redirectTo?: string;
  /** Existing phone numbers in the company for duplicate-check. */
  existingPhones: string[];
  /** When provided, the component renders in modal mode (no header,
   *  no sticky bottom bar, inline Cancel/Create buttons, and success
   *  calls onCreated + onClose instead of router.push). */
  onClose?: () => void;
  onCreated?: (customer: { id: string; name: string; phone: string | null }) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", gstin: "" });
  const [duplicatePhone, setDuplicatePhone] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "phone") {
      const normalized = value.trim().replace(/\s+/g, "");
      const match = existingPhones.find(
        (p) => p && p.replace(/\s+/g, "") === normalized && normalized.length > 0,
      );
      setDuplicatePhone(match ?? null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      haptic([50, 20, 50]);
      toast.error("Customer name is required");
      return;
    }
    if (!form.phone.trim()) {
      haptic([50, 20, 50]);
      toast.error("Phone number is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        gstin: form.gstin.trim() || null,
        address: null,
      };
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create customer");
      haptic([10, 40, 80]);
      toast.success("Customer created", {
        description: form.phone ? `${form.name} · ${form.phone}` : form.name,
      });
      if (onCreated) {
        onCreated({ id: data.id, name: data.name, phone: data.phone ?? null });
        onClose?.();
      } else {
        // Redirect to sale form with the new customer pre-selected
        const dest = redirectTo
          ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}customerId=${data.id}`
          : `/m/sales/new?customerId=${data.id}`;
        router.push(dest);
        router.refresh();
      }
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={onClose ? "" : "pb-32"}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* ── Name ── */}
        <FormField label="Customer name" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Rajesh Sharma"
            required
            autoFocus
            autoComplete="name"
            enterKeyHint="next"
            className={inputClass}
            style={inputStyle}
          />
        </FormField>

        {/* ── Phone + Email ── */}
        <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <FormField label="Phone" required>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="98765 43210"
              required
              autoComplete="tel"
              enterKeyHint="next"
              className={`${inputClass} tabular-nums`}
              style={inputStyle}
            />
            {duplicatePhone && (
              <p
                className="flex items-center gap-1.5 text-m-caption mt-1.5"
                style={{ color: "var(--color-signal-dark)" }}
              >
                <AlertCircle className="size-3" />
                A customer with this phone already exists
              </p>
            )}
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="customer@example.com"
              autoComplete="email"
              enterKeyHint="next"
              className={inputClass}
              style={inputStyle}
            />
          </FormField>
        </div>

        {/* ── GSTIN ── */}
        <FormField label="GSTIN">
          <input
            type="text"
            value={form.gstin}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
            placeholder="27ABCDE1234F1Z5"
            pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3}"
            maxLength={15}
            enterKeyHint="done"
            className={`${inputClass} font-mono uppercase`}
            style={inputStyle}
          />
        </FormField>

        {/* ── Inline buttons (modal mode only) ── */}
        {onClose ? (
          <div className="flex gap-1 ">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => onSubmit(e as unknown as React.FormEvent)}
              disabled={saving || !form.name.trim() || !form.phone.trim()}
              className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {saving ? "Creating…" : "Create Customer"}
            </button>
          </div>
        ) : null}
      </form>

      {/* ── Sticky bottom bar (page mode only) ── */}
      {onClose ? null : (
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2">
          <button
            type="button"
            onClick={(e) => onSubmit(e as unknown as React.FormEvent)}
            disabled={saving || !form.name.trim() || !form.phone.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                Save &amp; Continue
              </>
            )}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * Inline "Create Customer" button + bottom-sheet modal for embedding
 * in the mobile sales form. Opens an inline modal instead of navigating
 * to a separate page. After creation, calls onCreated with the new
 * customer so the parent form can auto-select it.
 */
export function MobileCreateCustomerButton({
  existingPhones = [],
  onCreated,
}: {
  existingPhones?: string[];
  onCreated?: (customer: { id: string; name: string; phone: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", gstin: "" });
  const [duplicatePhone, setDuplicatePhone] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "phone") {
      const normalized = value.trim().replace(/\s+/g, "");
      const match = existingPhones.find(
        (p) => p && p.replace(/\s+/g, "") === normalized && normalized.length > 0,
      );
      setDuplicatePhone(match ?? null);
    }
  }

  function close() {
    setOpen(false);
    setForm({ name: "", phone: "", email: "", gstin: "" });
    setDuplicatePhone(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      haptic([50, 20, 50]);
      return toast.error("Customer name is required");
    }
    if (!form.phone.trim()) {
      haptic([50, 20, 50]);
      return toast.error("Phone number is required");
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          gstin: form.gstin.trim() || null,
          address: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create customer");
      haptic([10, 40, 80]);
      toast.success("Customer created", { description: `${form.name} · ${form.phone}` });
      onCreated?.({ id: data.id, name: data.name, phone: data.phone ?? null });
      close();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); haptic(10); }}
        className="flex items-center gap-1 text-m-caption font-bold text-m-body press"
        style={{ color: "var(--color-signal-dark)" }}
      >
        <UserPlus className="size-3" /> New
      </button>

      {open && (
        <BottomSheet title="New Customer" onClose={close}>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <FormField label="Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Rajesh Sharma"
                required
                autoFocus
                autoComplete="name"
                enterKeyHint="next"
                className={inputClass}
                style={inputStyle}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
              <FormField label="Phone" required>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="98765 43210"
                  required
                  autoComplete="tel"
                  enterKeyHint="next"
                  className={`${inputClass} tabular-nums`}
                  style={inputStyle}
                />
                {duplicatePhone && (
                  <p
                    className="flex items-center gap-1.5 text-m-caption mt-1.5"
                    style={{ color: "var(--color-signal-dark)" }}
                  >
                    <AlertCircle className="size-3" />
                    A customer with this phone already exists
                  </p>
                )}
              </FormField>
              <FormField label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="customer@example.com"
                  autoComplete="email"
                  enterKeyHint="next"
                  className={inputClass}
                  style={inputStyle}
                />
              </FormField>
            </div>
            <FormField label="GSTIN">
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                placeholder="27ABCDE1234F1Z5"
                maxLength={15}
                enterKeyHint="done"
                className={`${inputClass} font-mono uppercase`}
                style={inputStyle}
              />
            </FormField>
            <div className="flex gap-1 ">
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-[0.5rem] border py-2.5 text-m-body font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !form.name.trim() || !form.phone.trim()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold text-m-body press disabled:opacity-50"
                style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="size-3.5" /> Create
                  </>
                )}
              </button>
            </div>
          </form>
        </BottomSheet>
      )}
    </>
  );
}
