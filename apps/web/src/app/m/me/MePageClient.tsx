"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
import {
  Monitor,
  Sun,
  Moon,
  LogOut,
  Wifi,
  WifiOff,
  RefreshCw,
  ClipboardCheck,
  Pencil,
  Check,
  X,
  Loader2,
  Lock,
  Fingerprint,
  Trash2,
  Phone,
  Mail,
  MessageSquare,
  Briefcase,
  Building2,
  IdCard,
  Calendar,
  Clock,
  UserCircle,
  Users,
  GitBranch,
} from "lucide-react";
import { useSession, signOut as authSignOut, authClient } from "@/lib/auth-client";
import { useFieldMode } from "@/lib/field-mode";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { useDeviceTierWithCaps } from "@/lib/device-tier-client";
import {
  Card,
  MobileSectionTitle,
  MobileRow,
  Button,
  Badge,
} from "@/components/mobile/v2/primitives";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { OnboardingProgress } from "@/components/mobile/v2/onboarding-progress";
import { buildOnboardingSteps } from "@/lib/onboarding-steps";
import { ROLES } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Me page — profile, settings, and rehomed header features.
 *
 * This is where features that were removed from the minimal header now
 * live: desktop mode switcher, theme toggle, field mode, notifications,
 * and sign-out.
 *
 * Accepts `initial` (server-resolved user + company data) so the profile
 * renders with real data on first paint — no client-side /api/me +
 * /api/company waterfall, no skeleton-then-swap flash.
 */
export interface OnboardingProgress {
  employeeId: string;
  hasProfile: boolean;
  hasEmploymentTerms: boolean;
  hasSalaryStructure: boolean;
  documentsSubmitted: boolean;
  backgroundVerified: boolean;
  offerLetterIssued: boolean;
  agreementIssued: boolean;
  agreementConfirmed: boolean;
  appointmentLetterIssued: boolean;
  idCardIssued: boolean;
  autoDepositEnabled: boolean;
  isComplete: boolean;
}

export interface MePageInitial {
  name: string;
  role: string;
  roleLabel: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  active: boolean;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  joiningDate: string | null;
  lastLoginAt: string | null;
  companyName: string;
  /** Custom hierarchy level (H1-H6) from Employee.hierarchyLevel. */
  hierarchyLevel: number | null;
  /** Name of the person this user reports to (null for OWNER/ADMIN). */
  reportsToName: string | null;
  /** Designation of the person this user reports to. */
  reportsToDesignation: string | null;
  /** Onboarding progress from the Employee record (null if no Employee linked). */
  onboarding: OnboardingProgress | null;
}

export function MePageClient({ initial }: { initial: MePageInitial | null }) {
  const router = useRouter();
  useSession();
  const { enabled: fieldMode, toggle: toggleFieldMode } = useFieldMode();
  const { pending: offlineQueueCount, online, syncing, sync: syncOfflineQueue } = useOfflineQueue();
  const deviceCaps = useDeviceTierWithCaps();
  const [userName, setUserName] = useState(initial?.name ?? "");
  const [userRole, setUserRole] = useState(initial?.role ?? "");
  const [userEmail, setUserEmail] = useState(initial?.email ?? "");
  const [userPhone, setUserPhone] = useState(initial?.phone ?? "");
  const [userImage, setUserImage] = useState<string | null>(initial?.image ?? null);
  const [userActive, setUserActive] = useState(initial?.active ?? true);
  const [userEmployeeCode, setUserEmployeeCode] = useState<string | null>(initial?.employeeCode ?? null);
  const [userDesignation, setUserDesignation] = useState<string | null>(initial?.designation ?? null);
  const [userDepartment, setUserDepartment] = useState<string | null>(initial?.department ?? null);
  const [userJoiningDate, setUserJoiningDate] = useState<string | null>(initial?.joiningDate ?? null);
  const [userLastLoginAt, setUserLastLoginAt] = useState<string | null>(initial?.lastLoginAt ?? null);
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [hierarchyLevel] = useState<number | null>(initial?.hierarchyLevel ?? null);
  const [reportsToName] = useState<string | null>(initial?.reportsToName ?? null);
  const [reportsToDesignation] = useState<string | null>(initial?.reportsToDesignation ?? null);
  const [onboarding] = useState<OnboardingProgress | null>(initial?.onboarding ?? null);
  // When the server provides initial data, the profile is never in a
  // loading state — we render real data on first paint. The loading
  // state is only used as a fallback when initial is null (e.g. the
  // server couldn't resolve the session).
  const [profileLoading, setProfileLoading] = useState(!initial);
  const [isDark, setIsDark] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);

  // ── Passkey / biometric login ──
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeys, setPasskeys] = useState<Array<{
    id: string; name?: string | null; aaguid?: string | null;
    createdAt: Date; backedUp: boolean;
  }>>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(true);
  const [enrollingPasskey, setEnrollingPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);

  // ── Fallback fetch — only when the server didn't provide initial data ──
  // When `initial` is present, the profile fields are already seeded from
  // server-side data and this effect is skipped entirely.
  useEffect(() => {
    if (initial) {
      // Still need to check dark mode + passkeys (client-only concerns)
      const isDarkNow = document.documentElement.classList.contains("dark");
      setIsDark((prev) => (prev !== isDarkNow ? isDarkNow : prev));
      if (window.PublicKeyCredential) {
        setPasskeySupported(true);
        void loadPasskeys();
      }
      return;
    }
    let meDone = false;
    let companyDone = false;
    const checkDone = () => { if (meDone && companyDone) setProfileLoading(false); };
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.name) setUserName(d.name);
        if (d?.role) setUserRole(d.role);
        if (d?.email) setUserEmail(d.email);
        if (d?.phone) setUserPhone(d.phone);
        if (d?.image !== undefined) setUserImage(d.image ?? null);
        if (d?.active !== undefined) setUserActive(d.active ?? true);
        if (d?.employeeCode !== undefined) setUserEmployeeCode(d.employeeCode ?? null);
        if (d?.designation !== undefined) setUserDesignation(d.designation ?? null);
        if (d?.department !== undefined) setUserDepartment(d.department ?? null);
        if (d?.joiningDate !== undefined) setUserJoiningDate(d.joiningDate ?? null);
        if (d?.lastLoginAt !== undefined) setUserLastLoginAt(d.lastLoginAt ?? null);
      })
      .catch(() => {})
      .finally(() => { meDone = true; checkDone(); });
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c?.name) setCompanyName(c.name);
      })
      .catch(() => {})
      .finally(() => { companyDone = true; checkDone(); });
    const isDarkNow = document.documentElement.classList.contains("dark");
    setIsDark((prev) => (prev !== isDarkNow ? isDarkNow : prev));
    // Check WebAuthn support + load passkeys
    if (window.PublicKeyCredential) {
      setPasskeySupported(true);
      void loadPasskeys();
    }
  }, [initial]);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("nirman.theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("nirman.theme", "light");
    }
  };

  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authSignOut();
    } catch {
      // Even if the server call fails, clear the client and redirect.
    }
    // Hard redirect — drops all client state/cache, ensures a clean session.
    window.location.href = "/sign-in";
  };

  function startEditProfile() {
    setEditName(userName);
    setEditPhone(userPhone);
    setEditingProfile(true);
  }

  async function saveProfile() {
    if (!editName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update profile");
      }
      setUserName(editName.trim());
      setUserPhone(editPhone.trim());
      setEditingProfile(false);
      toast.success("Profile updated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Failed to change password");
      } else {
        toast.success("Password changed");
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setShowPasswordForm(false);
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSavingPassword(false);
    }
  }

  // ── Passkey handlers ──
  async function loadPasskeys() {
    setPasskeyLoading(true);
    try {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (!error) setPasskeys(data ?? []);
    } catch (err) { console.warn("Failed to load passkeys:", err); } finally {
      setPasskeyLoading(false);
    }
  }

  async function handleEnrollPasskey() {
    setEnrollingPasskey(true);
    try {
      const { error } = await authClient.passkey.addPasskey({ name: undefined });
      if (error) {
        toast.error(error.message ?? "Could not register this device.");
      } else {
        toast.success("Device registered — use biometrics to sign in next time.");
        await loadPasskeys();
      }
    } catch {
      toast.error("Biometric enrollment failed.");
    } finally {
      setEnrollingPasskey(false);
    }
  }

  async function handleRemovePasskey(id: string) {
    setRemovingPasskeyId(id);
    try {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) {
        toast.error(error.message ?? "Could not remove device.");
      } else {
        toast.success("Device removed.");
        await loadPasskeys();
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setRemovingPasskeyId(null);
    }
  }

  // Resolve the role enum to a human label (e.g. "PROJECT_MANAGER" → "Project Manager").
  // For custom roles, prefer the server-resolved DB label (initial.roleLabel)
  // over deriving from the key string.
  const roleLabel = initial?.roleLabel
    ?? (userRole && (ROLES as Record<string, { label: string }>)[userRole]?.label)
    ?? (userRole ? userRole.replace(/^CUSTOM_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : null);

  return (
    <div>
      {/* ── Profile header card — color strip + avatar + identity + contact ── */}
      <div
        className="rounded-[0.75rem] overflow-hidden mb-3"
        style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-line)" }}
      >
        {/* Color strip — amber for active, grey for inactive */}
        <div
          className="h-1 w-full"
          style={{ backgroundColor: userActive ? "var(--color-signal)" : "var(--color-ink-300)" }}
        />
        <div className="flex items-start gap-3 p-3">
          {/* Avatar — 56px, photo or initials (not a generic icon) */}
          <div className="shrink-0 relative size-14 rounded-[0.625rem] overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
            {profileLoading ? (
              <div className="h-full w-full animate-pulse" style={{ backgroundColor: "var(--color-paper-2)" }} />
            ) : userImage ? (
              <Image src={userImage} alt={userName} fill sizes="56px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-m-section font-bold" style={{ color: "var(--color-ink-700)" }}>
                {(userName || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name + role + badges */}
          <div className="min-w-0 flex-1">
            {profileLoading ? (
              <>
                <div className="h-5 w-32 rounded animate-pulse" style={{ backgroundColor: "var(--color-paper-2)" }} />
                <div className="h-4 w-24 mt-1 rounded animate-pulse" style={{ backgroundColor: "var(--color-paper-2)" }} />
              </>
            ) : (
              <>
                <h1 className="text-m-section font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
                  {userName || "User"}
                </h1>
                <p className="text-m-caption mt-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                  {userDesignation ?? roleLabel ?? "User"}
                  {companyName ? ` · ${companyName}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                  <span
                    className="text-m-label font-bold px-1.5 py-0.5 rounded-[0.25rem]"
                    style={{
                      backgroundColor: userActive ? "var(--color-go-wash)" : "var(--color-concrete)",
                      color: userActive ? "var(--color-go)" : "var(--color-ink-500)",
                    }}
                  >
                    {userActive ? "Active" : "Inactive"}
                  </span>
                  {userEmployeeCode && (
                    <span
                      className="text-m-label font-mono px-1.5 py-0.5 rounded-[0.25rem] flex items-center gap-0.5"
                      style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
                    >
                      <IdCard className="size-2.5" /> {userEmployeeCode}
                    </span>
                  )}
                  {userDepartment && (
                    <span
                      className="text-m-label px-1.5 py-0.5 rounded-[0.25rem] flex items-center gap-0.5"
                      style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
                    >
                      <Building2 className="size-2.5" /> {userDepartment}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Edit icon */}
          {!profileLoading && !editingProfile && (
            <button
              onClick={startEditProfile}
              aria-label="Edit profile"
              className="shrink-0 flex items-center justify-center size-8 rounded-[0.375rem] text-m-body press"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>

        {/* Quick contact actions — Call, Text, Email */}
        {!profileLoading && !editingProfile && (userPhone || userEmail) && (
          <div className="flex gap-1.5 px-3 pb-3">
            {userPhone ? (
              <a
                href={`tel:${userPhone.replace(/\s/g, "")}`}
                className="flex-1 flex items-center justify-center gap-1 h-9 rounded-[0.5rem] text-m-label font-bold text-m-body press"
                style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
              >
                <Phone className="size-3.5" /> Call
              </a>
            ) : null}
            {userPhone ? (
              <a
                href={`sms:${userPhone.replace(/\s/g, "")}`}
                className="flex-1 flex items-center justify-center gap-1 h-9 rounded-[0.5rem] border-2 text-m-label font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
              >
                <MessageSquare className="size-3.5" /> Text
              </a>
            ) : null}
            {userEmail ? (
              <a
                href={`mailto:${userEmail}`}
                className="flex-1 flex items-center justify-center gap-1 h-9 rounded-[0.5rem] border-2 text-m-label font-bold text-m-body press"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)", backgroundColor: "var(--color-paper)" }}
              >
                <Mail className="size-3.5" /> Email
              </a>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Edit profile form (inline, using form primitives) ── */}
      {editingProfile ? (
        <div className="mb-3">
          <SectionCard title="Edit Profile">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <UnderlineInput
                label="Name"
                value={editName}
                onChange={setEditName}
                placeholder="Your name"
                required
                autoFocus
              />
              <UnderlineInput
                label="Phone"
                value={editPhone}
                onChange={setEditPhone}
                placeholder="—"
                type="tel"
                inputMode="tel"
              />
            </div>
          </SectionCard>
          <div className="flex gap-2 mt-2">
            <Button variant="secondary" size="md" fullWidth onClick={() => setEditingProfile(false)} disabled={savingProfile}>
              <X className="size-3.5" />
              Cancel
            </Button>
            <Button variant="primary" size="md" fullWidth onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        /* ── Account info — dense 2-col field grid ── */
        !profileLoading && (
          <div
            className="rounded-[0.625rem] border mb-3 overflow-hidden"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="px-3 pt-2.5 pb-1">
              <p className="text-m-caption font-bold uppercase tracking-[0.04em]" style={{ color: "var(--color-ink-400)" }}>
                Account
              </p>
            </div>
            <div className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <InfoField icon={<UserCircle className="size-3" />} label="Role" value={roleLabel} />
                <InfoField icon={<Building2 className="size-3" />} label="Company" value={companyName || null} />
                {hierarchyLevel != null && (
                  <InfoField icon={<GitBranch className="size-3" />} label="Hierarchy" value={`H${hierarchyLevel}`} />
                )}
                {reportsToName && (
                  <InfoField icon={<Users className="size-3" />} label="Reports to" value={reportsToDesignation ? `${reportsToName} · ${reportsToDesignation}` : reportsToName} />
                )}
                <InfoField icon={<Mail className="size-3" />} label="Email" value={userEmail || null} />
                <InfoField icon={<Phone className="size-3" />} label="Phone" value={userPhone || null} />
                {userDepartment && <InfoField icon={<Briefcase className="size-3" />} label="Dept" value={userDepartment} />}
                {userEmployeeCode && <InfoField icon={<IdCard className="size-3" />} label="Emp Code" value={userEmployeeCode} />}
                {userJoiningDate && <InfoField icon={<Calendar className="size-3" />} label="Joined" value={formatDate(userJoiningDate)} />}
                {userLastLoginAt && <InfoField icon={<Clock className="size-3" />} label="Last Login" value={formatDate(userLastLoginAt)} />}
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Onboarding progress (only if Employee record exists) ── */}
      {!profileLoading && onboarding && (() => {
        const { steps, completedCount, isComplete } = buildOnboardingSteps({
          hasProfile: onboarding.hasProfile,
          hasWage: true, // profile page doesn't have wage info; assume set
          hasEmploymentTerms: onboarding.hasEmploymentTerms,
          hasSalaryStructure: onboarding.hasSalaryStructure,
          documentsSubmitted: onboarding.documentsSubmitted,
          backgroundVerified: onboarding.backgroundVerified,
          hasAccount: true, // they're logged in, so they have an account
          offerLetterIssued: onboarding.offerLetterIssued,
          agreementIssued: onboarding.agreementIssued,
          agreementConfirmed: onboarding.agreementConfirmed,
          appointmentLetterIssued: onboarding.appointmentLetterIssued,
          idCardIssued: onboarding.idCardIssued,
          hasAutoDeposit: onboarding.autoDepositEnabled,
        });
        return (
          <OnboardingProgress
            steps={steps}
            completedCount={completedCount}
            isComplete={isComplete}
            canManage={false}
            employeeId={onboarding.employeeId}
            onboardingComplete={onboarding.isComplete}
            showCompleteButton={false}
            href={onboarding.employeeId ? `/m/hr/onboarding/${onboarding.employeeId}` : undefined}
          />
        );
      })()}

      {/* ── Password change ────────────────────────────────────────── */}
      <div className="mb-4">
        <Card className="p-4">
          {showPasswordForm ? (
            <div>
              <SectionCard title="Change Password">
                <UnderlineInput
                  label="Current Password"
                  value={passwordForm.currentPassword}
                  onChange={(v) => setPasswordForm((f) => ({ ...f, currentPassword: v }))}
                  placeholder="••••••••"
                  type="password"
                />
                <UnderlineInput
                  label="New Password"
                  value={passwordForm.newPassword}
                  onChange={(v) => setPasswordForm((f) => ({ ...f, newPassword: v }))}
                  placeholder="At least 8 characters"
                  type="password"
                />
                <UnderlineInput
                  label="Confirm New Password"
                  value={passwordForm.confirmPassword}
                  onChange={(v) => setPasswordForm((f) => ({ ...f, confirmPassword: v }))}
                  placeholder="••••••••"
                  type="password"
                />
              </SectionCard>
              <div className="flex gap-2 mt-3">
                <Button variant="secondary" size="md" fullWidth onClick={() => setShowPasswordForm(false)} disabled={savingPassword}>
                  <X className="size-3.5" />
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={handleChangePassword}
                  disabled={savingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                >
                  {savingPassword ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
                  Change Password
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="flex items-center gap-3 w-full text-left press"
            >
              <Lock className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              <div className="flex-1">
                <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>
                  Change Password
                </p>
                <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
                  Update your account password
                </p>
              </div>
            </button>
          )}
        </Card>
      </div>

      {/* ── Biometric / passkey login ─────────────────────────────── */}
      {passkeySupported && (
        <div className="mb-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Fingerprint className="size-4" style={{ color: "var(--color-signal-dark)" }} />
              <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>
                Biometric Login
              </p>
            </div>
            <p className="text-m-body mb-3" style={{ color: "var(--color-ink-500)" }}>
              Register Face ID, Touch ID, or fingerprint for one-tap sign-in.
            </p>

            {/* Enrolled devices */}
            {passkeyLoading ? (
              <div className="flex items-center gap-2 text-m-body" style={{ color: "var(--color-ink-500)" }}>
                <Loader2 className="size-3.5 animate-spin" />
                Loading…
              </div>
            ) : passkeys.length > 0 ? (
              <div className="mb-3 rounded-[0.625rem] border divide-y" style={{ borderColor: "var(--color-line)" }}>
                {passkeys.map((pk) => (
                  <div key={pk.id} className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: "var(--color-paper)" }}>
                    <Fingerprint className="size-3.5 shrink-0" style={{ color: "var(--color-signal-dark)" }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-m-caption font-medium truncate" style={{ color: "var(--color-ink-950)" }}>
                        {pk.name || "Passkey"}
                      </p>
                      <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
                        {new Date(pk.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Kolkata" })}
                        {pk.backedUp && " · Synced"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemovePasskey(pk.id)}
                      disabled={removingPasskeyId === pk.id}
                      aria-label="Delete passkey"
                      className="shrink-0 p-1.5 rounded press"
                      style={{ color: "var(--color-ink-500)" }}
                    >
                      {removingPasskeyId === pk.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-m-body mb-3" style={{ color: "var(--color-ink-500)" }}>
                No devices enrolled.
              </p>
            )}

            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={handleEnrollPasskey}
              disabled={enrollingPasskey}
            >
              {enrollingPasskey ? <Loader2 className="size-3.5 animate-spin" /> : <Fingerprint className="size-3.5" />}
              {enrollingPasskey ? "Waiting for biometric…" : "Register this device"}
            </Button>
          </Card>
        </div>
      )}

      {/* ── Sync status ───────────────────────────────────────────── */}
      <div className="mb-4">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {online ? (
                <Wifi className="size-4" style={{ color: "var(--color-go)" }} />
              ) : (
                <WifiOff className="size-4" style={{ color: "var(--color-stop)" }} />
              )}
              <span className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>
                {online ? "Online" : "Offline"}
              </span>
            </div>
            {offlineQueueCount > 0 ? (
              <Badge tone="signal">{offlineQueueCount} queued</Badge>
            ) : null}
          </div>
          {offlineQueueCount > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                {offlineQueueCount} action{offlineQueueCount === 1 ? "" : "s"} waiting to sync
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="md" fullWidth onClick={() => router.push("/m/queue")}>
                  View Queue
                </Button>
                <Button variant="secondary" size="md" fullWidth onClick={() => void syncOfflineQueue()} disabled={syncing}>
                  <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
                  {syncing ? "Syncing…" : "Sync"}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        {/* ── Device performance — shows detected tier + capabilities ── */}
        <Card className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Monitor className="size-4" style={{ color: "var(--color-ink-500)" }} />
              <span className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>
                Device
              </span>
            </div>
            <Badge tone={deviceCaps.tier === "high" ? "go" : deviceCaps.tier === "mid" ? "signal" : "stop"}>
              {deviceCaps.tier.toUpperCase()}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <InfoField label="RAM" value={deviceCaps.memoryGB ? `${deviceCaps.memoryGB} GB` : null} />
            <InfoField label="CPU" value={deviceCaps.cpuCores != null ? `${deviceCaps.cpuCores} cores` : null} />
            <InfoField label="Network" value={deviceCaps.networkType ? deviceCaps.networkType.toUpperCase() : null} />
            <InfoField label="Data Saver" value={deviceCaps.saveData ? "On" : "Off"} />
          </div>
          <p className="text-m-caption mt-3 pt-2 border-t leading-relaxed" style={{ color: "var(--color-ink-500)", borderColor: "var(--color-line)" }}>
            {deviceCaps.tier === "high"
              ? "Data loads on-demand for faster server response."
              : deviceCaps.tier === "mid"
              ? "Balanced mode — server pre-renders key pages."
              : "Optimized for your device — full server rendering."}
          </p>
        </Card>
      </div>

      {/* ── Display settings ──────────────────────────────────────── */}
      <MobileSectionTitle>Display</MobileSectionTitle>
      <div>
        <button
          onClick={() => toggleFieldMode()}
          className="flex items-center gap-3 min-h-[3.5rem] px-4 border-b w-full text-m-body press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Sun className="size-4 shrink-0" style={{ color: fieldMode ? "var(--color-signal-dark)" : "var(--color-ink-500)" }} />
          <div className="flex-1 text-left">
            <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>
              Field Mode
            </p>
            <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
              Larger text for outdoor use
            </p>
          </div>
          <Badge tone={fieldMode ? "signal" : "neutral"}>
            {fieldMode ? "ON" : "OFF"}
          </Badge>
        </button>

        <button
          onClick={toggleDark}
          className="flex items-center gap-3 min-h-[3.5rem] px-4 border-b w-full text-m-body press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          {isDark ? (
            <Moon className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          ) : (
            <Sun className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
          )}
          <div className="flex-1 text-left">
            <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>
              Dark Mode
            </p>
            <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
              {isDark ? "On" : "Off"}
            </p>
          </div>
          <Badge tone={isDark ? "steel" : "neutral"}>
            {isDark ? "ON" : "OFF"}
          </Badge>
        </button>
      </div>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <MobileSectionTitle>Switch view</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        <MobileRow
          href="/"
          icon={Monitor}
          title="Desktop ERP"
          subtitle="Full desktop view"
        />
        <MobileRow
          href="/m/pulse/approvals"
          icon={ClipboardCheck}
          title="Approvals Queue"
          subtitle="POs & indents"
        />
      </div>

      {/* ── Sign out ──────────────────────────────────────────────── */}
      <div className="mt-6">
        <Button variant="danger" fullWidth size="lg" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          {signingOut ? "Signing out…" : "Sign Out"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Compact info field for the account info card ─── */
function InfoField({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <div
        className="flex items-center gap-1 text-m-caption font-bold uppercase tracking-[0.04em] mb-0.5"
        style={{ color: "var(--color-ink-400)" }}
      >
        {icon} {label}
      </div>
      <div
        className="text-m-body font-semibold leading-snug break-words"
        style={{ color: value ? "var(--color-ink-950)" : "var(--color-ink-300)" }}
      >
        {value || "—"}
      </div>
    </div>
  );
}
