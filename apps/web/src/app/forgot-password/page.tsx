"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * FORGOT PASSWORD — request a password reset link.
 *
 * Calls Better-Auth's `forgetPassword` which generates a token and
 * triggers `sendResetPassword` (configured in auth.ts). In dev the
 * reset URL is logged to the server console; in production it would
 * be emailed.
 *
 * Always shows a success message regardless of whether the email
 * exists — prevents user-enumeration attacks.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: resetError } = await authClient.requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: "/reset-password",
    });

    if (resetError) {
      setError(resetError.message ?? "Could not send reset link. Try again.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand font-mono text-xl font-bold text-brand-foreground">
            N
          </span>
          <div>
            <h1 className="text-title text-foreground">Reset password</h1>
            <p className="mt-1 text-meta text-muted-foreground">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised">
            <div className="flex flex-col items-center text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-green-600" />
              <p className="text-body font-medium text-foreground">
                Check your email
              </p>
              <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
                If an account exists for <strong>{email}</strong>, a reset link
                has been sent. The link expires in 1 hour.
              </p>
              <p className="mt-2 text-micro text-muted-foreground">
                In development, check the server console for the reset URL.
              </p>
            </div>
            <Link href="/sign-in">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Button>
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised"
          >
            <div>
              <Label htmlFor="email" className="mb-1.5 block">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                autoFocus
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
              {loading ? "Sending link…" : "Send reset link"}
            </Button>

            <Link
              href="/sign-in"
              className="flex items-center justify-center gap-1.5 text-caption text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
