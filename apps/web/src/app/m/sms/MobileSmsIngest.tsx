"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, X } from "lucide-react";
import { formatCurrencyCompact } from "@/lib/utils";

/**
 * Mobile SMS ingest — a bottom-sheet style dialog for pasting
 * bank SMS text. Auto-parses and matches on submit.
 */
export function MobileSmsIngest() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sender, setSender] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sender.trim() || !message.trim()) {
      toast.error("Sender and message are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: sender.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to ingest SMS");
      const r = data.results?.[0];
      if (r?.status === "MATCHED") {
        toast.success(`Matched to ${r.matchedEntityType}`, {
          description: `Auto-created payment of ${formatCurrencyCompact(Number(r.amount))}`,
        });
      } else if (r?.duplicate) {
        toast.info("Duplicate SMS — already processed");
      } else if (r?.status === "UNMATCHED") {
        toast.warning("No matching payment found", { description: r.matchReason });
      } else {
        toast.info(`SMS ingested (${r?.status})`);
      }
      setSender("");
      setMessage("");
      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to ingest SMS");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="ml-auto flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-m-caption font-semibold press"
        style={{
          backgroundColor: "var(--color-brand)",
          color: "var(--color-paper)",
        }}
      >
        <Plus className="size-3" /> Add SMS
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
      onClick={() => !saving && setOpen(false)}
    >
      <div
        className="w-full rounded-t-[1rem] mx-auto max-w-md p-4 pb-6 space-y-3"
        style={{ backgroundColor: "var(--color-paper)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            Paste Bank SMS
          </h2>
          <button onClick={() => !saving && setOpen(false)}>
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* ── SMS Details ── */}
          <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              SMS Details
            </p>
            <div>
              <label
                className="mb-0 block text-m-caption font-bold uppercase"
                style={{ color: "var(--color-ink-700)" }}
              >
                Sender ID
              </label>
              <input
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="e.g. HD-FBANK"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
                required
              />
            </div>
            <div>
              <label
                className="mb-0 block text-m-caption font-bold uppercase"
                style={{ color: "var(--color-ink-700)" }}
              >
                SMS Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Paste the full SMS text…"
                rows={3}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-[0.375rem] py-2.5 text-m-body font-semibold press"
            style={{
              backgroundColor: "var(--color-brand)",
              color: "var(--color-paper)",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Processing…" : "Parse & Match"}
          </button>
        </form>
      </div>
    </div>
  );
}
