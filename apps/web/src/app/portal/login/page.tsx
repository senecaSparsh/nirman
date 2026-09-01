"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp" | "select">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [customers, setCustomers] = useState<{ id: string; name: string; companyName: string; activeBookings: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendOtp() {
    setError("");
    if (phone.trim().length < 10) {
      setError("Please enter a valid phone number.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError("");
    if (code.trim().length < 4) {
      setError("Please enter the code sent to your phone.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      if (data.requiresSelection) {
        setCustomers(data.customers);
        setStep("select");
      } else {
        router.push("/portal");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function selectCustomer(customerId: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Selection failed");
      router.push("/portal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white text-xl font-bold">
            N
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Customer Portal</h1>
          <p className="mt-1 text-sm text-slate-500">
            View your bookings, payments & documents
          </p>
        </div>

        <div className="portal-card">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === "phone" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Phone Number
                </label>
                <input
                  className="portal-input"
                  type="tel"
                  placeholder="+91 98XXX XXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                  autoFocus
                />
              </div>
              <button
                className="portal-btn portal-btn-primary w-full"
                onClick={sendOtp}
                disabled={loading}
              >
                {loading ? "Sending…" : "Send Login Code"}
              </button>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4">
              <div>
                <p className="mb-3 text-sm text-slate-600">
                  Enter the 6-digit code sent to <strong>{phone}</strong>
                </p>
                <input
                  className="portal-input text-center text-lg tracking-widest"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="------"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                  autoFocus
                />
              </div>
              <button
                className="portal-btn portal-btn-primary w-full"
                onClick={verifyOtp}
                disabled={loading}
              >
                {loading ? "Verifying…" : "Verify & Login"}
              </button>
              <button
                className="portal-btn portal-btn-secondary w-full"
                onClick={() => { setStep("phone"); setCode(""); setError(""); }}
              >
                Change Phone Number
              </button>
            </div>
          )}

          {step === "select" && (
            <div className="space-y-3">
              <p className="mb-2 text-sm text-slate-600">
                Multiple accounts found. Select which one to log in as:
              </p>
              {customers.map((c) => (
                <button
                  key={c.id}
                  className="portal-btn portal-btn-secondary w-full justify-between"
                  onClick={() => selectCustomer(c.id)}
                  disabled={loading}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-slate-500">
                    {c.companyName} · {c.activeBookings} booking(s)
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Protected by OTP authentication
        </p>
      </div>
    </div>
  );
}
