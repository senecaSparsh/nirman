"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * RESET PASSWORD — set a new password using a reset token.
 *
 * Better-Auth redirects here with a `token` query param after the user
 * clicks the reset link in their email. We read the token from the URL
 * and call `resetPassword` with the new password.
 *
 * On success, the user is redirected to /sign-in to log in with their
 * new password. All other sessions are revoked (configured in auth.ts).
 */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // No token → invalid link
  useEffect(() => {
    if (!token) {
      setError("This reset link is invalid or incomplete. Please request a new one.");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    setError("");

    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token,
    });

    if (resetError) {
      setError(
        resetError.message ??
          "Could not reset password. The link may have expired — request a new one.",
      );
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    // Redirect to sign-in after a short delay so the user sees the success state.
    setTimeout(() => router.push("/sign-in"), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand font-mono text-xl font-bold text-brand-foreground">
            N
          </span>
          <div>
            <h1 className="text-title text-foreground">New password</h1>
            <p className="mt-1 text-meta text-muted-foreground">
              Choose a new password for your account.
            </p>
          </div>
        </div>

        {success ? (
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised">
            <div className="flex flex-col items-center text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-green-600" />
              <p className="text-body font-medium text-foreground">
                Password reset
              </p>
              <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
                Your password has been changed. All other sessions have been
                signed out. Redirecting to sign in…
              </p>
            </div>
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised"
          >
            <div>
              <Label htmlFor="password" className="mb-1.5 block">
                New password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                autoFocus
                disabled={loading || !token}
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword" className="mb-1.5 block">
                Confirm new password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                disabled={loading || !token}
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

            <Button
              type="submit"
              size="touch"
              className="w-full"
              disabled={loading || !token}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Resetting…" : "Set new password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
