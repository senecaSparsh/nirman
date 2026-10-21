"use client";

import { useState } from "react";

export function EnquiryForm({
  companyId,
  builtUnitId,
  projectName,
}: {
  companyId: string;
  builtUnitId: string | null;
  projectName: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          interestedUnitId: builtUnitId,
          name: name.trim(),
          phone: phone.trim(),
          notes: notes.trim() || `Enquiry via public properties page — ${projectName}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit enquiry");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit enquiry");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
        Thank you — our team will call you back shortly.
      </div>
    );
  }

  const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={input} required />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel" className={input} required />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any question? (optional)" rows={2} className={input} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-md bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
        {saving ? "Sending…" : "Request callback"}
      </button>
    </form>
  );
}
