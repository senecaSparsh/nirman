"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Loader2, AlertCircle, Building2, Phone, Mail } from "lucide-react";
import { homeWorldFor } from "@/lib/nav";
import { type Role, ROLES } from "@/lib/roles";

type CompanyOption = { id: string; name: string; role: string };
type LoginMode = "phone" | "email";
type PhoneStep = "enter" | "verify" | "select-user";

type MultiUserEntry = {
  id: string;
  name: string;
  email: string;
  role: string;
  companies: { id: string; name: string; role: string }[];
};

// Demo roles shown as one-click buttons (dev only).
const DEMO_ROLES: Role[] = ["OWNER", "ADMIN", "PROJECT_MANAGER", "SUPERVISOR", "SALES_MANAGER", "ACCOUNTANT"];

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
  // Company picker state — fetched after email entry
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [fetchingCompanies, setFetchingCompanies] = useState(false);
  // Phone OTP state
  const [mode, setMode] = useState<LoginMode>("email");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("enter");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [multiUsers, setMultiUsers] = useState<MultiUserEntry[]>([]);
  const [pendingOtpId, setPendingOtpId] = useState("");

  // Check if this is a fresh deploy (no users yet) — if so, redirect
  // to /sign-up so the first owner can set up their company.
  useEffect(() => {
    fetch("/api/auth/bootstrap")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsBootstrap) {
          router.replace("/sign-up");
        }
      })
      .catch(() => {});
  }, [router]);

  // Resend cooldown timer — counts down from 30s after a code is sent.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Fetch companies for the entered email — shows a company picker
  // when the user belongs to multiple companies (multi-company login).
  const fetchCompanies = useCallback(async (emailValue: string) => {
    if (!emailValue.trim() || !emailValue.includes("@")) {
      setCompanies([]);
      setSelectedCompanyId("");
      return;
    }
    setFetchingCompanies(true);
    try {
      const res = await fetch(
        `/api/auth/companies?email=${encodeURIComponent(emailValue.trim())}`,
      );
      const data = await res.json();
      const list: CompanyOption[] = data.companies ?? [];
      setCompanies(list);
      // Auto-select if only one company
      if (list.length === 1 && list[0]) {
        setSelectedCompanyId(list[0].id);
      } else if (list.length > 1 && list[0]) {
        // Default to the first company
        setSelectedCompanyId(list[0].id);
      } else {
        setSelectedCompanyId("");
      }
    } catch {
      setCompanies([]);
      setSelectedCompanyId("");
    } finally {
      setFetchingCompanies(false);
    }
  }, []);

  // Shared post-login routing. Honours an explicit redirect first, then
  // sends phones to /m, otherwise to the role's home world.
  async function routeAfterLogin() {
    // If the user selected a company on the login screen, set the cookie
    // before navigating so the first page load uses the right company.
    if (selectedCompanyId) {
      await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      }).catch(() => {});
    }
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
    router.push(homeWorldFor(me?.role ?? "PROJECT_MANAGER").href);
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

  // Phone OTP: send code
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/phone-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not send code. Try again.");
        setLoading(false);
        return;
      }
      setPhoneStep("verify");
      setResendCooldown(30);
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    }
    setLoading(false);
  }

  // Phone OTP: resend code (no form submit — just a button click)
  async function handleResendOtp() {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setError("");
    setOtp("");
    try {
      const res = await fetch("/api/auth/phone-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not resend code. Try again.");
        setLoading(false);
        return;
      }
      setResendCooldown(30);
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    }
    setLoading(false);
  }

  // Phone OTP: verify code + create session
  async function handleVerifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (otp.length !== 6 || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/phone-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not verify code. Try again.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      // Multi-user: show a picker instead of creating a session
      if (data.multiUser) {
        setMultiUsers(data.users);
        setPendingOtpId(data.otpId);
        setPhoneStep("select-user");
        setLoading(false);
        return;
      }
      // Single user: session cookie is set — just route.
      await routeAfterLogin();
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    }
    setLoading(false);
  }

  // Phone OTP: select user (when multiple users share a phone number)
  async function handleSelectUser(userId: string) {
    if (loading || !pendingOtpId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/phone-otp/select-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpId: pendingOtpId, userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not complete login. Try again.");
        setLoading(false);
        return;
      }
      await routeAfterLogin();
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    }
    setLoading(false);
  }

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    if (phoneStep === "verify" && otp.length === 6 && !loading) {
      handleVerifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, phoneStep]);

  function resetPhoneFlow() {
    setPhoneStep("enter");
    setOtp("");
    setError("");
    setMultiUsers([]);
    setPendingOtpId("");
    setResendCooldown(0);
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

        {/* Mode toggle — Phone (default) vs Email */}
        <div className="mb-4 flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => { setMode("phone"); resetPhoneFlow(); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-caption font-medium transition-colors ${
              mode === "phone" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Phone className="h-3.5 w-3.5" />
            Phone
          </button>
          <button
            type="button"
            onClick={() => { setMode("email"); setError(""); }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-caption font-medium transition-colors ${
              mode === "email" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Email
          </button>
        </div>

        {/* ── Phone OTP form ── */}
        {mode === "phone" && phoneStep !== "select-user" && (
          <form
            onSubmit={phoneStep === "enter" ? handleSendOtp : handleVerifyOtp}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised"
          >
            {phoneStep === "enter" ? (
              <div>
                <Label htmlFor="phone" className="mb-1.5 block">
                  Phone number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98765 43210"
                  autoComplete="tel"
                  required
                  autoFocus
                  disabled={busy}
                />
                <p className="mt-1.5 text-micro text-muted-foreground">
                  We&apos;ll send a 6-digit code to verify your number.
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="otp" className="mb-1.5 block">
                  Enter the 6-digit code
                </Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                  autoFocus
                  disabled={busy}
                  className="text-center text-lg tracking-[0.5em]"
                />
                <div className="mt-1.5 flex items-center justify-between text-micro text-muted-foreground">
                  <span>
                    Code sent to {phone}.{" "}
                    <button
                      type="button"
                      onClick={resetPhoneFlow}
                      className="font-medium text-foreground underline"
                      disabled={busy}
                    >
                      Change
                    </button>
                  </span>
                  {resendCooldown > 0 ? (
                    <span className="tabular-nums">Resend in {resendCooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      className="font-medium text-foreground underline disabled:opacity-50"
                      disabled={busy}
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            )}

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
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading
                ? phoneStep === "enter" ? "Sending code…" : "Verifying…"
                : phoneStep === "enter" ? "Send code" : "Verify & sign in"}
            </Button>
          </form>
        )}

        {/* ── Phone OTP: multi-user picker ── */}
        {mode === "phone" && phoneStep === "select-user" && (
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised">
            <div>
              <p className="text-body font-medium text-foreground">Select an account</p>
              <p className="mt-1 text-micro text-muted-foreground">
                This phone number is linked to multiple accounts. Pick which one to sign into.
              </p>
            </div>
            <div className="space-y-2">
              {multiUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelectUser(u.id)}
                  disabled={busy}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-caption font-medium text-brand">
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-caption font-medium text-foreground">{u.name}</p>
                    <p className="truncate text-micro text-muted-foreground">{u.email}</p>
                    {u.companies.length > 0 && (
                      <p className="mt-0.5 truncate text-micro text-muted-foreground">
                        {u.companies.map((c) => c.name).join(" · ")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
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
            <button
              type="button"
              onClick={resetPhoneFlow}
              className="text-micro font-medium text-muted-foreground underline hover:text-foreground"
              disabled={busy}
            >
              Use a different phone number
            </button>
          </div>
        )}

        {/* ── Email + password form ── */}
        {mode === "email" && (
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
                onBlur={(e) => fetchCompanies(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                autoFocus
                disabled={busy}
              />
            </div>

            {/* Company picker — shown when the user belongs to multiple companies.
                Fetches on email blur; auto-selects if only one company. */}
            {companies.length > 1 && (
              <div>
                <Label htmlFor="company" className="mb-1.5 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Company
                </Label>
                <Select
                  id="company"
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  disabled={busy}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role})
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-micro text-muted-foreground">
                  You have access to {companies.length} companies. Pick which one to log into.
                </p>
              </div>
            )}
            {fetchingCompanies && (
              <p className="flex items-center gap-1.5 text-micro text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Looking up companies…
              </p>
            )}

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
        )}

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
              {DEMO_ROLES.map((role) => (
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
