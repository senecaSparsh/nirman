"use client";

import { useState } from "react";
import { toast } from "sonner";

export function AcceptButton({ employeeId, token }: { employeeId: string; token: string }) {
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function accept() {
    setAccepting(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/accept-offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to accept");
      toast.success(data.message ?? "Offer accepted");
      setAccepted(true);
      // Reload to show the accepted state
      setTimeout(() => window.location.reload(), 1000);
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
        Offer Accepted
      </div>
    );
  }

  return (
    <button
      onClick={accept}
      disabled={accepting}
      className="w-full h-12 rounded-xl font-bold text-white transition-colors disabled:opacity-50"
      style={{ backgroundColor: "#16a34a" }}
    >
      {accepting ? "Accepting…" : "Accept Offer"}
    </button>
  );
}
