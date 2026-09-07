"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
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
    const hasContent = form.name || form.gstin || form.phone || form.email || form.address || form.leadTimeDays;
    if (!hasContent) return;
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
      const data = await res.json().catch(() => ({}));
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
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          Supplier Created
        </p>
        <p className="text-m-body mb-4" style={{ color: "var(--color-ink-500)" }}>
          {success.name}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push(`/m/suppliers/${success.id}`)}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            View {success.name}
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setForm({ name: "", gstin: "", phone: "", email: "", address: "", leadTimeDays: "" });
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
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

  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <div className="space-y-3 pb-32">
      {hasDraft && !draftRestored && !success ? (
        <DraftBanner
          formName="supplier-new"
          updatedAt={draftUpdatedAt}
          onRestore={() => setDraftRestored(true)}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      ) : null}
      <form onSubmit={onSubmit} className="space-y-3">
        <SectionCard title="Supplier Details">
          {/* Name — full width (has duplicate detection, stays inline) */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. UltraTech Cement Ltd"
              required
              autoFocus
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={inputStyle}
            />
            {duplicateName && (
              <p className="flex items-center gap-1 text-m-caption mt-1" style={{ color: "var(--color-signal-dark)" }}>
                <AlertCircle className="size-3" />
                A supplier with this name already exists
              </p>
            )}
          </div>

          {/* GSTIN — full width (mono, has pattern/maxLength/toUpperCase, stays inline) */}
          <div>
            <label className={labelClass} style={labelStyle}>
              GSTIN
            </label>
            <input
              type="text"
              value={form.gstin}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              placeholder="27ABCDE1234F1Z5"
              pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3}"
              maxLength={15}
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors font-mono uppercase"
              style={inputStyle}
            />
          </div>

          {/* Phone + Email — side by side */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="98765 43210"
                enterKeyHint="next"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors tabular-nums"
                style={inputStyle}
              />
              {duplicatePhone && (
                <p className="flex items-center gap-1 text-m-caption mt-1" style={{ color: "var(--color-signal-dark)" }}>
                  <AlertCircle className="size-3" />
                  Already exists
                </p>
              )}
            </div>
            <div className="pl-2">
              <UnderlineInput
                label="Email"
                value={form.email}
                onChange={(v) => set("email", v)}
                placeholder="sales@supplier.com"
                type="email"
                enterKeyHint="next"
              />
            </div>
          </div>

          {/* Address — full width textarea */}
          <div>
            <label className={labelClass} style={labelStyle}>
              Address
            </label>
            <textarea
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              rows={2}
              placeholder="Warehouse / office address"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={inputStyle}
            />
          </div>

          {/* Lead time — narrow */}
          <div className="w-28">
            <UnderlineInput
              label="Lead time (days)"
              value={form.leadTimeDays}
              onChange={(v) => set("leadTimeDays", v)}
              placeholder="e.g. 7"
              type="number"
              inputMode="numeric"
              min="0"
            />
          </div>
        </SectionCard>

        {/* Sticky bottom bar */}
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
              disabled={saving || !form.name.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Check className="size-3.5" />
                  Create Supplier
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
