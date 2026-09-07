"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Loader2, AlertCircle, Building2, Phone, Mail, Fingerprint, Eye, EyeOff, ArrowUp } from "lucide-react";
import { homeWorldFor } from "@/lib/nav";
import { type Role, ROLES } from "@/lib/roles";

type CompanyOption = { id: string; name: string; role: string };
type LoginMode = "phone" | "email";
type PhoneStep = "password" | "otp-enter" | "otp-verify" | "otp-select-user" | "select-user";

type MultiUserEntry = {
  id: string;
  name: string;
  email: string;
  role: string;
  companies: { id: string; name: string; role: string }[];
};

// Demo roles shown as one-click buttons (dev only).
const DEMO_ROLES: Role[] = ["OWNER", "ADMIN", "DEVELOPER", "PROJECT_MANAGER", "SUPERVISOR", "SALES_MANAGER", "ACCOUNTANT"];

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
  const [mode, setMode] = useState<LoginMode>("phone");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("password");
  const [phone, setPhone] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [multiUsers, setMultiUsers] = useState<MultiUserEntry[]>([]);
  const [pendingOtpId, setPendingOtpId] = useState("");
  // Passkey / biometric login state
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  // Password visibility + caps lock + remember me
  const [showPhonePassword, setShowPhonePassword] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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

  // ── Restore saved credentials if "Remember me" was checked previously ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nirman.remember");
      if (!saved) return;
      const data = JSON.parse(saved);
      if (data.mode === "phone") {
        setMode("phone");
        setPhone(data.phone ?? "");
        setPhonePassword(data.password ?? "");
      } else if (data.mode === "email") {
        setMode("email");
        setEmail(data.email ?? "");
        setPassword(data.password ?? "");
      }
      setRememberMe(true);
    } catch { /* ignore corrupt storage */ }
  }, []);

  // ── Caps Lock detection — track on keydown/keyup at window level ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // getModifierState is the reliable cross-browser way to detect Caps Lock
      if (typeof e.getModifierState === "function") {
        setCapsLockOn(e.getModifierState("CapsLock"));
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", handler);
    };
  }, []);

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
  //
  // IMPORTANT: We use window.location.assign() (full page load) instead of
  // router.push() (client-side navigation). This is necessary because
  // Better-Auth's useSession() hook caches session state in a nanostore.
  // When the sign-in page loaded, useSession() called get-session and
  // cached null. Our custom phone-auth route creates a session via a
  // plain fetch(), but the nanostore still holds the stale null.
  // router.push() navigates without re-initializing hooks, so AppShell's
  // useSession() reads the stale null and triggers authSignOut().
  // window.location.assign() forces a full page load, which re-initializes
  // useSession() with a fresh get-session call that sees the new session
  // cookie and returns the real session.
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
    // Fetch the user profile once — used both for the must-change-password
    // check and for role-based routing. The phone flow already handles
    // mustChangePassword server-side and returns before reaching here, so
    // this check is what enforces it for email sign-in (admin-created email
    // users default to mustChangePassword=true).
    const me = await fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (me?.mustChangePassword) {
      window.location.assign("/change-password");
      return;
    }
    const redirect = searchParams.get("redirect");
    if (redirect) {
      window.location.assign(redirect);
      return;
    }
    const onPhone = window.matchMedia("(max-width: 1023px)").matches;
    if (onPhone) {
      window.location.assign("/m");
      return;
    }
    window.location.assign(homeWorldFor(me?.role ?? "PROJECT_MANAGER").href);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    persistCredentials("email", email, password);

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
      setPhoneStep("otp-verify");
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
        setPhoneStep("otp-select-user");
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
    if (phoneStep === "otp-verify" && otp.length === 6 && !loading) {
      handleVerifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, phoneStep]);

  // ── Passkey / biometric login ──────────────────────────────────────
  // Detect WebAuthn support on mount. If the browser supports passkeys,
  // show the biometric button. If it also supports Conditional UI
  // (autofill-style passkey prompt), auto-start the passkey flow so
  // returning users get the Face ID / Touch ID prompt without clicking
  // anything — they just focus a field and the browser shows the sheet.
  useEffect(() => {
    // PublicKeyCredential is undefined on insecure origins (http://localhost
    // is treated as secure, but other http:// origins are not).
    if (typeof window === "undefined" || !window.PublicKeyCredential) return;
    setPasskeySupported(true);
    // Conditional UI: if available, preload the passkey mediation so the
    // browser can show the biometric prompt when the user interacts with
    // an input field. This is the "fast login" experience — no button click.
    if (PublicKeyCredential.isConditionalMediationAvailable) {
      PublicKeyCredential.isConditionalMediationAvailable().then((available) => {
        if (available) {
          void handlePasskeySignIn(true).catch(() => {});
        }
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Passkey sign-in: calls the Better-Auth passkey client, which triggers
  // the browser's native biometric prompt (Face ID / Touch ID / Windows
  // Hello / Android fingerprint). On success, routes the same way as
  // password login. `autoFill=true` enables Conditional UI (non-modal
  // prompt that appears when the user focuses an input).
  async function handlePasskeySignIn(autoFill = false) {
    // Conditional UI (autoFill) is a non-blocking background preload — it
    // must NOT disable the form. If the user doesn't have a passkey or
    // dismisses the prompt, the password form stays fully usable. Only
    // an explicit button click sets passkeyLoading (which blocks the form).
    if (!autoFill) setPasskeyLoading(true);
    setError("");
    try {
      const { error: pkError } = await authClient.signIn.passkey({
        autoFill,
      });
      if (pkError) {
        // Don't show an error for conditional-UI cancellations — the user
        // simply dismissed the prompt or doesn't have a passkey yet.
        if (!autoFill) {
          setError(pkError.message ?? "Biometric sign-in was cancelled or failed.");
          setPasskeyLoading(false);
        }
        return;
      }
      await routeAfterLogin();
    } catch {
      if (!autoFill) {
        setError("Biometric sign-in failed. Try password instead.");
        setPasskeyLoading(false);
      }
    }
  }

  function resetPhoneFlow() {
    setPhoneStep("password");
    setOtp("");
    setPhonePassword("");
    setError("");
    setMultiUsers([]);
    setPendingOtpId("");
    setResendCooldown(0);
  }

  // Save or clear remembered credentials based on the checkbox state.
  function persistCredentials(mode: LoginMode, id: string, pw: string) {
    try {
      if (rememberMe) {
        localStorage.setItem("nirman.remember", JSON.stringify({ mode, [mode === "phone" ? "phone" : "email"]: id, password: pw }));
      } else {
        localStorage.removeItem("nirman.remember");
      }
    } catch { /* storage may be blocked — silent fail */ }
  }

  // Phone + password login
  async function handlePhonePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    persistCredentials("phone", phone, phonePassword);
    try {
      const res = await fetch("/api/auth/phone-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password: phonePassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Invalid phone number or password.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      // Multi-user: show account picker (Shape C — same phone, same password)
      if (data.multiUser) {
        setMultiUsers(data.users);
        setPhoneStep("select-user");
        setLoading(false);
        return;
      }
      // Company picker: user has multiple memberships
      if (data.requiresCompanySelect) {
        setCompanies(data.companies.map((c: { id: string; name: string; role: string }) => ({
          id: c.id, name: c.name, role: c.role,
        })));
        setSelectedCompanyId(data.companies[0]?.id ?? "");
        // Session is already created — just need to pick company
        if (data.mustChangePassword) {
          window.location.assign("/change-password");
          return;
        }
        await routeAfterLogin();
        return;
      }
      // Must change password on first login
      if (data.mustChangePassword) {
        window.location.assign("/change-password");
        return;
      }
      await routeAfterLogin();
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    }
    setLoading(false);
  }

  // Phone-password: select user (Shape C — multiple accounts, same phone+password)
  async function handlePhonePasswordSelectUser(userId: string) {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/phone-password/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not complete login. Try again.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.requiresCompanySelect) {
        setCompanies(data.companies.map((c: { id: string; name: string; role: string }) => ({
          id: c.id, name: c.name, role: c.role,
        })));
        setSelectedCompanyId(data.companies[0]?.id ?? "");
        if (data.mustChangePassword) {
          window.location.assign("/change-password");
          return;
        }
        await routeAfterLogin();
        return;
      }
      if (data.mustChangePassword) {
        window.location.assign("/change-password");
        return;
      }
      await routeAfterLogin();
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    }
    setLoading(false);
  }

  const busy = loading || oneClickRole !== null || passkeyLoading;

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

        {/* ── Biometric / passkey sign-in ──────────────────────────────
            Shown only when the browser supports WebAuthn. This is the
            fastest path — one tap, Face ID / Touch ID / Windows Hello,
            done. The button triggers a modal biometric prompt. Returning
            users on supporting browsers also get a Conditional UI
            auto-prompt (non-modal sheet) when they focus an input. */}
        {passkeySupported && (
          <div className="mb-4 space-y-3">
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full gap-2 border-brand/30 bg-brand-soft/40 font-medium text-brand hover:bg-brand-soft"
              disabled={busy}
              onClick={() => handlePasskeySignIn(false)}
            >
              {passkeyLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="h-4 w-4" />
              )}
              {passkeyLoading ? "Waiting for biometric…" : "Sign in with Face ID / Touch ID"}
            </Button>
            <div className="flex items-center gap-2 text-micro text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or use password</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

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

        {/* ── Phone + password form (default phone mode) ── */}
        {mode === "phone" && phoneStep === "password" && (
          <form
            onSubmit={handlePhonePasswordLogin}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised"
          >
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
                autoComplete="tel webauthn"
                required
                autoFocus
                disabled={busy}
              />
            </div>

            <div>
              <Label htmlFor="phonePassword" className="mb-1.5 block">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="phonePassword"
                  type={showPhonePassword ? "text" : "password"}
                  value={phonePassword}
                  onChange={(e) => setPhonePassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={busy}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPhonePassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPhonePassword ? "Hide password" : "Show password"}
                >
                  {showPhonePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLockOn && (
                <p className="mt-1 flex items-center gap-1 text-micro text-warning">
                  <ArrowUp className="h-3 w-3" />
                  Caps Lock is on
                </p>
              )}
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 text-caption text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={busy}
                className="h-4 w-4 rounded border-input accent-brand"
              />
              Remember my phone &amp; password on this device
            </label>

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
              {loading ? "Signing in…" : "Sign in"}
            </Button>

            <div className="space-y-2 text-center">
              <p className="text-micro text-muted-foreground">
                Forgot your password? Contact your administrator to reset it.
              </p>
              <button
                type="button"
                onClick={() => { setPhoneStep("otp-enter"); setError(""); }}
                className="text-caption text-muted-foreground underline hover:text-foreground"
                disabled={busy}
              >
                Sign in with a code instead
              </button>
            </div>
          </form>
        )}

        {/* ── Phone OTP: enter phone (secondary option) ── */}
        {mode === "phone" && phoneStep === "otp-enter" && (
          <form
            onSubmit={handleSendOtp}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised"
          >
            <div>
              <Label htmlFor="phone-otp" className="mb-1.5 block">
                Phone number
              </Label>
              <Input
                id="phone-otp"
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
              {loading ? "Sending code…" : "Send code"}
            </Button>

            <button
              type="button"
              onClick={() => { setPhoneStep("password"); setError(""); }}
              className="block w-full text-center text-caption text-muted-foreground underline hover:text-foreground"
              disabled={busy}
            >
              Use password instead
            </button>
          </form>
        )}

        {/* ── Phone OTP: verify code ── */}
        {mode === "phone" && phoneStep === "otp-verify" && (
          <form
            onSubmit={handleVerifyOtp}
            className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-raised"
          >
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
              {loading ? "Verifying…" : "Verify & sign in"}
            </Button>
          </form>
        )}

        {/* ── Phone OTP: multi-user picker ── */}
        {mode === "phone" && (phoneStep === "otp-select-user" || phoneStep === "select-user") && (
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
                  onClick={() => phoneStep === "select-user" ? handlePhonePasswordSelectUser(u.id) : handleSelectUser(u.id)}
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
                autoComplete="email webauthn"
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
              <div className="relative">
                <Input
                  id="password"
                  type={showEmailPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={busy}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowEmailPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showEmailPassword ? "Hide password" : "Show password"}
                >
                  {showEmailPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLockOn && (
                <p className="mt-1 flex items-center gap-1 text-micro text-warning">
                  <ArrowUp className="h-3 w-3" />
                  Caps Lock is on
                </p>
              )}
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 text-caption text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={busy}
                className="h-4 w-4 rounded border-input accent-brand"
              />
              Remember my email &amp; password on this device
            </label>

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

            <p className="text-center text-micro text-muted-foreground">
              Forgot your password? Contact your administrator to reset it.
            </p>
          </form>
        )}

        {/*
          One-click login — dev only. A quiet, secondary surface: the
          form above is the primary action, these buttons just shortcut
          it for local development. Hidden entirely in production so the
          sign-in screen stays trustworthy.
        */}
        {/* eslint-disable-next-line nirman/no-process-env-node-env-in-client -- route page, not dynamically imported */}
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
          Need an account? Contact your administrator.
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
