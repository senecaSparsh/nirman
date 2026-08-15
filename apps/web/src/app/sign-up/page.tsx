"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * SIGN UP — first owner setup page.
 *
 * Only accessible when the database has zero users (fresh deploy).
 * Creates the first Company + OWNER account via /api/auth/bootstrap,
 * then signs the owner in and routes them to the dashboard.
 *
 * Once the first user exists, this page redirects to /sign-in.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Check if bootstrap is needed (database is empty)
  useEffect(() => {
    fetch("/api/auth/bootstrap", { method: "GET" })
      .then((r) => r.json())
      .then((data) => {
        setNeedsBootstrap(data.needsBootstrap === true);
        setChecking(false);
        if (!data.needsBootstrap) {
          router.replace("/sign-in");
        }
      })
      .catch(() => {
        setChecking(false);
        setNeedsBootstrap(true); // assume needed on error
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim().toLowerCase(),
          ownerPassword,
          companyName: companyName.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not create account. Try again.");
        setLoading(false);
        return;
      }

      setSuccess(true);

      // Sign in with the newly created credentials
      const { error: signInError } = await authClient.signIn.email({
        email: ownerEmail.trim().toLowerCase(),
        password: ownerPassword,
      });

      if (signInError) {
        // Account was created but auto-sign-in failed — redirect to sign-in
        setTimeout(() => router.push("/sign-in"), 1500);
        return;
      }

      // Route to dashboard
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1000);
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!needsBootstrap) {
    return null; // redirecting to /sign-in
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand font-mono text-xl font-bold text-brand-foreground">
            N
          </span>
          <div>
            <h1 className="text-title text-foreground">Set up Nirman</h1>
            <p className="mt-1 text-meta text-muted-foreground">
              Create your owner account and company to get started.
            </p>
          </div>
        </div>

        {success ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center shadow-raised">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
            <p className="text-sm font-medium text-foreground">
              Account created! Signing you in…
            </p>
            <Loader2 className="mx-auto mt-3 h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised"
          >
            <div>
              <Label htmlFor="companyName" className="mb-1.5 block">
                Company Name
              </Label>
              <Input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Vardaan Constructions"
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="ownerName" className="mb-1.5 block">
                Your Name
              </Label>
              <Input
                id="ownerName"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Vardaan Rama"
                required
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="ownerEmail" className="mb-1.5 block">
                Email
              </Label>
              <Input
                id="ownerEmail"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="vardaan@company.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="ownerPassword" className="mb-1.5 block">
                Password
              </Label>
              <Input
                id="ownerPassword"
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-caption leading-relaxed text-danger"
              >
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <Button type="submit" size="touch" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Creating account…" : "Create owner account"}
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-caption text-muted-foreground">
          This setup is only available once, for the first owner.
        </p>
      </div>
    </div>
  );
}
