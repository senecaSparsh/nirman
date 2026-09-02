"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import { homeWorldFor } from "@/lib/nav";

/**
 * Change password page.
 *
 * Shown when `mustChangePassword` is true after login (first-login forced
 * change), or accessible from Settings → Security for voluntary changes.
 *
 * The session is already established (the auth endpoint set the cookie
 * before redirecting here). This page calls POST /api/me/change-password
 * to update the password, then routes to the user's home world.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/me/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not change password. Try again.");
        setLoading(false);
        return;
      }
      // Success — route to home world
      const me = await fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      router.push(homeWorldFor(me?.role ?? "PROJECT_MANAGER").href);
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand font-mono text-xl font-bold text-brand-foreground">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title text-foreground">Set a new password</h1>
            <p className="mt-1 text-meta text-muted-foreground">
              This is your first login. Please choose a new password to continue.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised"
        >
          <div>
            <Label htmlFor="currentPassword" className="mb-1.5 block">
              Current password
            </Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              autoFocus
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="newPassword" className="mb-1.5 block">
              New password
            </Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              disabled={loading}
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
            {loading ? "Changing password…" : "Set new password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
