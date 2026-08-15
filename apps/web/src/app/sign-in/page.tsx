"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2, AlertCircle } from "lucide-react";
import { homeWorldFor } from "@/lib/nav";
import { ALL_ROLES, type Role, ROLES } from "@/lib/roles";

/**
 * SIGN IN — the first screen, so it sets the expectation for the rest.
 *
 * Two design decisions worth stating:
 *
 * 1. It is calm and plain. No gradient, no hero. One card on warm paper,
 *    the ochre brand mark, two fields. A login screen's only job is to
 *    be trustworthy and fast.
 *
 * 2. It lands you where your work is. Previously everyone was dropped on
 *    `/` regardless of role or device. Now:
 *      · a `redirect` param (set by middleware) always wins
 *      · on a phone you go to `/m`, the mobile surface — a supervisor
 *        should never have to pinch-zoom a desktop table to start
 *      · otherwise you land in your role's home world (`homeWorldFor`):
 *        a supervisor starts in People, an accountant in Money, an owner
 *        on Today
 *
 * One-click login (dev only): a quiet row of role buttons below the form.
 * Each button asks /api/auth/demo-login to guarantee a credential Account
 * with the shared demo password for that role's user, then runs the real
 * `signIn.email` flow — so the session is a real one, not a bypass.
 */
function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oneClickRole, setOneClickRole] = useState<Role | null>(null);
  const [error, setError] = useState("");

  // Clear any stale session on mount (e.g. after a DB re-seed) so the
  // form starts clean. Fire-and-forget — a no-op if there's no session.
  useEffect(() => {
    authClient.signOut().catch(() => {});
  }, []);

  // Shared post-login routing. Honours an explicit redirect first, then
  // sends phones to /m, otherwise to the role's home world.
  async function routeAfterLogin() {
    const redirect = searchParams.get("redirect");
    if (redirect) {
      router.push(redirect);
      router.refresh();
      return;
    }
    const onPhone = window.matchMedia("(max-width: 1023px)").matches;
    if (onPhone) {
      router.push("/m");
      router.refresh();
      return;
    }
    const me = await fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    router.push(homeWorldFor(me?.role ?? "MANAGER").href);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      setError(signInError.message ?? "That email and password didn't match. Try again.");
      setLoading(false);
      return;
    }
    await routeAfterLogin();
  }

  // One-click: provision (idempotent) then sign in through the real flow.
  async function handleOneClick(role: Role) {
    setOneClickRole(role);
    setError("");
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not set up the demo login. Is the dev server running?");
        setOneClickRole(null);
        return;
      }
      const { email: demoEmail, password: demoPassword } = await res.json();
      const { error: signInError } = await authClient.signIn.email({
        email: demoEmail,
        password: demoPassword,
      });
      if (signInError) {
        setError(signInError.message ?? "One-click sign-in failed. Try the form below.");
        setOneClickRole(null);
        return;
      }
      await routeAfterLogin();
    } catch {
      setError("Could not reach the demo-login endpoint. Is the dev server running?");
      setOneClickRole(null);
    }
  }

  const busy = loading || oneClickRole !== null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand font-mono text-xl font-bold text-brand-foreground">
            N
          </span>
          <div>
            <h1 className="text-title text-foreground">Nirman</h1>
            <p className="mt-1 text-meta text-muted-foreground">
              Materials, property, people and money — in one place.
            </p>
          </div>
        </div>

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
              disabled={busy}
            />
          </div>

          <div>
            <Label htmlFor="password" className="mb-1.5 block">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </div>

          {/* An auth error is the user's problem to solve, so it gets an
              icon and a full sentence rather than a red fragment. */}
          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-md bg-danger-soft px-2.5 py-2 text-caption leading-relaxed text-danger"
            >
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <Button type="submit" size="touch" className="w-full" disabled={busy}>
            {(loading || oneClickRole !== null) && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {/*
          One-click login — dev only. A quiet, secondary surface: the
          form above is the primary action, these buttons just shortcut
          it for local development. Hidden entirely in production so the
          sign-in screen stays trustworthy.
        */}
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-5 rounded-lg border border-dashed border-border bg-card/50 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-caption font-medium text-foreground">One-click login (dev)</p>
              <span className="text-micro text-muted-foreground">password: nirman123</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map((role) => (
                <Button
                  key={role}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  disabled={busy}
                  onClick={() => handleOneClick(role)}
                >
                  {oneClickRole === role && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span className="truncate">{ROLES[role].label}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-5 text-center text-caption text-muted-foreground">
          No account?{" "}
          <a href="/sign-up" className="font-medium text-foreground underline">
            Set up your company
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
