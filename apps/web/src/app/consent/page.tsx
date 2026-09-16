"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { homeWorldFor } from "@/lib/nav";
import { signOutAndCleanup } from "@/lib/use-sign-out";
import { useFetch } from "@/lib/use-fetch";

/**
 * Consent page — blocking screen shown when a staff member hasn't accepted
 * the company's call-monitoring consent policy (or a new version was published).
 *
 * Fetches the active policy from /api/telephony/consent, displays the full
 * text, and requires the user to click "I understand and accept" before
 * they can proceed. On accept, calls /api/telephony/consent/accept and
 * routes to the home world.
 *
 * If there's no active policy (no telephony configured), this page
 * auto-redirects to the home world.
 */
export default function ConsentPage() {
  const router = useRouter();
  const { data, loading, error: fetchError } = useFetch<{ policy?: { id: string; version: number; policyText: string } | null }>(
    "/api/telephony/consent",
  );
  const policy = data?.policy ?? null;
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && data && !data.policy) {
      // No policy — nothing to accept, go home
      router.replace("/");
    }
  }, [data, loading, router]);
  useEffect(() => {
    if (fetchError) setError("Could not load the consent policy. Please try again.");
  }, [fetchError]);

  async function handleAccept() {
    setAccepting(true);
    setError("");
    try {
      const res = await fetch("/api/telephony/consent/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not record your acceptance. Try again.");
        setAccepting(false);
        return;
      }
      const me = await fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      router.push(homeWorldFor(me?.role ?? "PROJECT_MANAGER").href);
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    }
    setAccepting(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[32rem]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand font-mono text-xl font-bold text-brand-foreground">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title text-foreground">Communication Monitoring Consent</h1>
            <p className="mt-1 text-meta text-muted-foreground">
              Please review and accept the policy to continue.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-raised">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
            <span className="text-caption font-medium text-foreground">
              Policy v{policy?.version}
            </span>
            <span className="text-micro text-muted-foreground">
              You must accept to continue using the system.
            </span>
          </div>

          <div className="max-h-[40vh] overflow-y-auto rounded-md bg-accent/30 p-4">
            <pre className="whitespace-pre-wrap break-words text-caption leading-relaxed text-foreground">
              {policy?.policyText}
            </pre>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-caption leading-relaxed text-danger"
            >
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <Button
            type="button"
            size="touch"
            className="mt-4 w-full"
            disabled={accepting}
            onClick={handleAccept}
          >
            {accepting && <Loader2 className="h-4 w-4 animate-spin" />}
            {accepting ? "Accepting…" : "I understand and accept"}
          </Button>
          {/* A user who won't consent must still be able to leave — no
              sign-out path would trap them on this screen. */}
          <button
            type="button"
            onClick={() => void signOutAndCleanup()}
            className="mt-3 w-full text-center text-caption text-muted-foreground underline-offset-2 hover:underline"
          >
            I don&apos;t accept — sign me out
          </button>
        </div>
      </div>
    </div>
  );
}
