"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function accept() {
    if (!name.trim()) {
      toast.error("Please enter your name to sign");
      return;
    }
    setAccepting(true);
    try {
      const res = await fetch("/api/accept/ats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signerName: name.trim(), signerPhone: phone.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to accept");
      toast.success("Agreement accepted");
      setAccepted(true);
      setTimeout(() => router.refresh(), 1000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAccepting(false);
    }
  }

  if (accepted) {
    return (
      <div className="text-center text-green-600 font-bold py-3">
        <svg className="size-5 inline mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Agreement Accepted
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input aria-label="Full name (signature)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name (signature)"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
      />
      <input aria-label="Phone number"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number (optional)"
        inputMode="tel"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
      />
      <button
        onClick={accept}
        disabled={accepting}
        className="w-full h-12 rounded-xl font-bold text-white transition-colors disabled:opacity-50"
        style={{ backgroundColor: "#16a34a" }}
      >
        {accepting ? "Accepting…" : "Accept Agreement"}
      </button>
    </div>
  );
}
