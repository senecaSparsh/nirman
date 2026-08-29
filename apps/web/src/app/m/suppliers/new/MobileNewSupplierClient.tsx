"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Truck, Loader2, Check, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { useDrafts } from "@/lib/offline/use-drafts";
import { DraftBanner } from "@/components/mobile/draft-banner";

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
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null);
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<typeof form>("supplier", "supplier-new");
  const [draftRestored, setDraftRestored] = useState(false);
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

  // ── Draft auto-save ──
  useEffect(() => {
    if (success) return;
    saveDraft(form);
  }, [form, success, saveDraft]);

  // ── Restore draft on mount ──
  useEffect(() => {
    if (draft && !draftRestored && hasDraft) {
      setForm(draft);
      setDraftRestored(true);
    }
  }, [draft, hasDraft, draftRestored]);

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
      clearDraft();
      toast.success("Supplier created", {
        description: form.phone ? `${form.name} · ${form.phone}` : form.name,
      });
      setSuccess({ id: data.id, name: data.name ?? form.name });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
        </div>
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          Supplier Created
        </p>
        <p className="text-[0.6875rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          {success.name}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/m/suppliers/${success.id}`)}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            View {success.name}
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setForm({ name: "", gstin: "", phone: "", email: "", address: "", leadTimeDays: "" });
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  if (!canCreate) {
    return <MobileNoAccess what="create suppliers" />;
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
      {hasDraft && !draftRestored && !success ? (
        <DraftBanner
          formName="supplier-new"
          updatedAt={draftUpdatedAt}
          onRestore={() => setDraftRestored(true)}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      ) : null}
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
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
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
