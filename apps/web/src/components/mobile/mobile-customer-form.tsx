"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Loader2, Check, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MobileDetailHeader } from "@/components/mobile/mobile-primitives";

/**
 * Mobile customer creation form — minimal fields (name, phone, email, GSTIN)
 * for fast on-the-spot customer creation during a sale. Includes
 * duplicate-check on phone number and "Save & continue" flow that
 * redirects back to the sale form with the new customer pre-selected.
 */
export function MobileCustomerForm({
  redirectTo,
  existingPhones,
}: {
  /** URL to redirect to after creating (e.g. "/m/sales/new?customerId=..."). */
  redirectTo?: string;
  /** Existing phone numbers in the company for duplicate-check. */
  existingPhones: string[];
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
      toast.error("Customer name is required");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    setSaving(true);
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
      toast.success("Customer created", {
        description: form.phone ? `${form.name} · ${form.phone}` : form.name,
      });
      // Redirect to sale form with the new customer pre-selected
      const dest = redirectTo
        ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}customerId=${data.id}`
        : `/m/sales/new?customerId=${data.id}`;
      router.push(dest);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <MobileDetailHeader title="New Customer" backHref="/m/sales/new" />
      <form onSubmit={onSubmit} className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="mc-name">Customer Name *</Label>
          <Input
            id="mc-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Rajesh Sharma"
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mc-phone">Phone *</Label>
          <Input
            id="mc-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="98765 43210"
            required
          />
          {duplicatePhone && (
            <p className="flex items-center gap-1.5 text-caption text-warning">
              <AlertCircle className="h-3.5 w-3.5" />
              A customer with this phone already exists
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mc-email">Email</Label>
          <Input
            id="mc-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="customer@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mc-gstin">GSTIN</Label>
          <Input
            id="mc-gstin"
            value={form.gstin}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
            placeholder="27ABCDE1234F1Z5"
            maxLength={15}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="submit"
            size="touch"
            disabled={saving || !form.name.trim() || !form.phone.trim()}
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" /> Save &amp; Continue
              </>
            )}
          </Button>
        </div>
      </form>
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
    if (!form.name.trim()) return toast.error("Customer name is required");
    if (!form.phone.trim()) return toast.error("Phone number is required");
    setSaving(true);
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
      toast.success("Customer created", { description: `${form.name} · ${form.phone}` });
      onCreated?.({ id: data.id, name: data.name, phone: data.phone ?? null });
      close();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-brand"
        onClick={() => setOpen(true)}
      >
        <UserPlus className="mr-1 h-4 w-4" /> New
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={close}>
          <div
            className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-body font-semibold">New Customer</h3>
              <button onClick={close} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ic-name">Name *</Label>
                <Input
                  id="ic-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Rajesh Sharma"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ic-phone">Phone *</Label>
                <Input
                  id="ic-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="98765 43210"
                  required
                />
                {duplicatePhone && (
                  <p className="flex items-center gap-1.5 text-caption text-warning">
                    <AlertCircle className="h-3.5 w-3.5" />
                    A customer with this phone already exists
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ic-email">Email</Label>
                <Input
                  id="ic-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="customer@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ic-gstin">GSTIN</Label>
                <Input
                  id="ic-gstin"
                  value={form.gstin}
                  onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                  placeholder="27ABCDE1234F1Z5"
                  maxLength={15}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" size="touch" onClick={close} className="flex-1">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="touch"
                  disabled={saving || !form.name.trim() || !form.phone.trim()}
                  className="flex-1"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" /> Create
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
