"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  User,
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
} from "lucide-react";
import { useSession, signOut as authSignOut, authClient } from "@/lib/auth-client";
import { useFieldMode } from "@/lib/field-mode";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import {
  Card,
  MobileSectionTitle,
  MobileRow,
  Button,
  Badge,
} from "@/components/mobile/v2/primitives";
import { toast } from "sonner";

/**
 * Me page — profile, settings, and rehomed header features.
 *
 * This is where features that were removed from the minimal header now
 * live: desktop mode switcher, theme toggle, field mode, notifications,
 * and sign-out.
 */
export default function MePage() {
  const router = useRouter();
  useSession();
  const { enabled: fieldMode, toggle: toggleFieldMode } = useFieldMode();
  const { pending: offlineQueueCount, online, syncing, sync: syncOfflineQueue } = useOfflineQueue();
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
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

  useEffect(() => {
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
  }, []);

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

  return (
    <div>
      {/* ── Profile card ──────────────────────────────────────────── */}
      <div className="mb-4">
        <Card className="p-4" style={{ borderLeftColor: "var(--color-signal)", borderLeftWidth: 4 }}>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full grid place-items-center shrink-0"
              style={{ backgroundColor: "var(--color-signal-wash)" }}
            >
              <User className="size-6" style={{ color: "var(--color-signal-dark)" }} />
            </div>
            <div className="min-w-0 flex-1">
              {profileLoading ? (
                <>
                  <div className="h-5 w-32 rounded animate-pulse" style={{ backgroundColor: "var(--color-paper-2)" }} />
                  <div className="h-4 w-24 mt-1 rounded animate-pulse" style={{ backgroundColor: "var(--color-paper-2)" }} />
                </>
              ) : (
                <>
                  <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                    {userName || "User"}
                  </p>
                  <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
                    {userRole} · {companyName}
                  </p>
                </>
              )}
            </div>
            <Badge tone="signal">{profileLoading ? "…" : userRole}</Badge>
          </div>

          {/* Profile details / edit form */}
          {editingProfile ? (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-line)" }}>
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Profile
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className="text-m-caption font-bold uppercase block mb-0" style={{ color: "var(--color-ink-700)" }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                  <div className="pl-2">
                    <label className="text-m-caption font-bold uppercase block mb-0" style={{ color: "var(--color-ink-700)" }}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="—"
                      className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-3">
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
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-line)" }}>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
                    {userEmail || "—"}
                  </p>
                  <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
                    {userPhone || "No phone"}
                  </p>
                </div>
                <button
                  onClick={startEditProfile}
                  className="flex items-center gap-1 rounded-[0.375rem] px-2.5 py-1.5 text-m-label font-bold text-m-body press active:scale-95"
                  style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-700)" }}
                >
                  <Pencil className="size-3" />
                  Edit
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Password change ────────────────────────────────────────── */}
      <div className="mb-4">
        <Card className="p-4">
          {showPasswordForm ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lock className="size-4" style={{ color: "var(--color-ink-500)" }} />
                <p className="text-m-section font-semibold" style={{ color: "var(--color-ink-950)" }}>
                  Change Password
                </p>
              </div>
              <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Security
                </p>
                <div>
                  <label className="text-m-caption font-bold uppercase block mb-0" style={{ color: "var(--color-ink-700)" }}>
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
                    disabled={savingPassword}
                    placeholder="••••••••"
                    className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                    style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className="text-m-caption font-bold uppercase block mb-0" style={{ color: "var(--color-ink-700)" }}>
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                      disabled={savingPassword}
                      placeholder="At least 8 characters"
                      className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                  <div className="pl-2">
                    <label className="text-m-caption font-bold uppercase block mb-0" style={{ color: "var(--color-ink-700)" }}>
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                      disabled={savingPassword}
                      placeholder="••••••••"
                      className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-3">
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

      {/* ── Sync status ───────────────────────────────────────────── */}
      <div className="mb-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {online ? (
                <Wifi className="size-4" style={{ color: "var(--color-go)" }} />
              ) : (
                <WifiOff className="size-4" style={{ color: "var(--color-stop)" }} />
              )}
              <span className="text-m-section font-semibold" style={{ color: "var(--color-ink-900)" }}>
                {online ? "Online" : "Offline"}
              </span>
            </div>
            {offlineQueueCount > 0 ? (
              <div className="flex flex-col gap-2">
                <Button variant="secondary" size="md" fullWidth onClick={() => router.push("/m/queue")}>
                  View Queue ({offlineQueueCount})
                </Button>
                <Button variant="secondary" size="md" fullWidth onClick={() => void syncOfflineQueue()} disabled={syncing}>
                  <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
                  {syncing ? "Syncing…" : "Sync"}
                </Button>
              </div>
            ) : null}
          </div>
          {offlineQueueCount > 0 ? (
            <p className="text-m-body mt-2" style={{ color: "var(--color-ink-500)" }}>
              {offlineQueueCount} action{offlineQueueCount === 1 ? "" : "s"} queued for sync
            </p>
          ) : null}
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
