"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Link2, Copy, Check, Pencil } from "lucide-react";
import { haptic } from "@/lib/haptic";

/**
 * TermsEditor — HR-editable terms & conditions with shareable acceptance link.
 *
 * Used in both the Offer sub-tab and Agreement sub-tab of the onboarding flow.
 *
 * Features:
 *  · HR can edit custom T&Cs (overrides the default template)
 *  · Shows a shareable link for the employee to accept online
 *  · Copy link to clipboard
 *  · Shows acceptance status (accepted date) if already accepted
 */
export function TermsEditor({
  employeeId,
  type,
  terms,
  token,
  acceptedAt,
  issued,
  canManage,
}: {
  employeeId: string;
  type: "offer" | "agreement";
  terms: string | null;
  token: string | null;
  acceptedAt: string | null;
  issued: boolean;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(terms ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const label = type === "offer" ? "Offer Letter" : "Agreement";
  const acceptUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/accept/${type}/${token}`
    : null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/terms`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, terms: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      haptic([10, 40, 80]);
      toast.success(`${label} terms updated`);
      setEditing(false);
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!acceptUrl) return;
    try {
      await navigator.clipboard.writeText(acceptUrl);
      haptic(10);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }

  // ── If not issued yet, don't show the editor or link ──
  if (!issued) {
    return (
      <div
        className="rounded-[0.75rem] p-3"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Custom terms & shareable link will be available after the {label.toLowerCase()} is issued.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Terms & Conditions editor ── */}
      {canManage && (
        <div
          className="rounded-[0.75rem] overflow-hidden"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pencil className="size-4" style={{ color: "var(--color-ink-500)" }} />
              <span className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                Terms & Conditions
              </span>
            </div>
            {!editing && (
              <button
                onClick={() => { setEditing(true); setText(terms ?? ""); haptic(10); }}
                className="text-m-caption font-semibold press"
                style={{ color: "var(--color-accent, #2563eb)" }}
              >
                Edit
              </button>
            )}
          </div>
          <div className="px-3 pb-3">
            {!editing ? (
              terms ? (
                <p className="text-m-body whitespace-pre-wrap" style={{ color: "var(--color-ink-700)" }}>
                  {terms}
                </p>
              ) : (
                <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
                  Using default template. Tap Edit to add custom terms.
                </p>
              )
            ) : (
              <div className="space-y-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter custom terms & conditions…"
                  rows={6}
                  className="w-full p-2 text-m-body rounded-[0.375rem] outline-none border resize-none"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "var(--color-paper-2)",
                    color: "var(--color-ink-950)",
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press"
                    style={{ backgroundColor: "var(--color-ink-100)", color: "var(--color-ink-700)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Shareable acceptance link ── */}
      {canManage && acceptUrl && (
        <div
          className="rounded-[0.75rem] p-3"
          style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="size-4" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              Shareable Acceptance Link
            </span>
          </div>
          <p className="text-m-caption mb-2" style={{ color: "var(--color-ink-500)" }}>
            Send this link to the employee. They can view the {label.toLowerCase()} and accept it online —
            the status updates automatically here.
          </p>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 min-w-0 px-2 py-1.5 rounded-[0.375rem] truncate"
              style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-line)" }}
            >
              <span className="text-m-caption font-mono" style={{ color: "var(--color-ink-600)" }}>
                {acceptUrl}
              </span>
            </div>
            <button
              onClick={copyLink}
              className="shrink-0 h-9 px-3 rounded-[0.5rem] text-m-label font-semibold press flex items-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* ── Acceptance status ── */}
      {acceptedAt && (
        <div
          className="rounded-[0.75rem] p-3 flex items-center gap-2"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-go) 30%, transparent)",
          }}
        >
          <Check className="size-4" style={{ color: "var(--color-go)" }} />
          <div>
            <p className="text-m-label font-semibold" style={{ color: "var(--color-go)" }}>
              {label} Accepted
            </p>
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Accepted on {new Date(acceptedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
