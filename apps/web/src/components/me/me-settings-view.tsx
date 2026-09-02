"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, Lock, Building2, Check, Loader2, ShieldAlert, Monitor, Smartphone, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import type { MembershipData } from "@/components/profile/profile-tabs";

interface MeSettingsViewProps {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    image: string | null;
    assignedCompanyPhones?: { id: string; phoneNumber: string; label: string | null; provider: string | null }[];
  };
  roleLabel: string;
  roleDescription: string;
  memberships: MembershipData[];
}

export function MeSettingsView({ user, roleLabel, roleDescription, memberships }: MeSettingsViewProps) {
  const router = useRouter();

  // ── Profile editing ──────────────────────────────────────────
  const [profileForm, setProfileForm] = useState({
    name: user.name,
    phone: user.phone ?? "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileForm.name.trim(),
          phone: profileForm.phone.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to update profile");
      } else {
        toast.success("Profile updated");
        router.refresh();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Password change ──────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);

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
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSavingPassword(false);
    }
  }

  // ── Company switching ────────────────────────────────────────
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);

  async function handleSwitchCompany(companyId: string, companyName: string) {
    setSwitchingCompanyId(companyId);
    try {
      const res = await fetch("/api/companies/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to switch company");
      } else {
        toast.success(`Switched to ${companyName}`);
        // Full page reload to refresh all server-side data with new company cookie
        window.location.reload();
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSwitchingCompanyId(null);
    }
  }

  const isDevBypass = user.id === "dev";

  return (
    <div className="space-y-6">
      {/* ── Profile ────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-body font-semibold text-foreground">Profile</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input
              value={profileForm.name}
              onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
              disabled={isDevBypass || savingProfile}
              placeholder="Your name"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted/50" />
            <p className="mt-1 text-micro text-muted-foreground">Email cannot be changed — contact an admin.</p>
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={profileForm.phone}
              onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
              disabled={isDevBypass || savingProfile}
              placeholder="+91 98765 43210"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={roleLabel} disabled className="bg-muted/50" />
            <p className="mt-1 text-micro text-muted-foreground">{roleDescription}</p>
          </div>
        </div>

        {/* Assigned company phone numbers */}
        {user.assignedCompanyPhones && user.assignedCompanyPhones.length > 0 && (
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-caption font-medium text-foreground">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              Assigned Company Numbers
            </div>
            <div className="mt-2 space-y-1">
              {user.assignedCompanyPhones.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-meta">
                  <span className="font-medium">{p.phoneNumber}</span>
                  <span className="text-muted-foreground">
                    {p.label && <span className="mr-2">{p.label}</span>}
                    {p.provider === "TWILIO" && <span className="rounded bg-muted px-1.5 py-0.5 text-micro">Twilio</span>}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-micro text-muted-foreground">
              Incoming calls to these numbers are tracked and logged automatically. Ask an admin to assign or unassign numbers.
            </p>
          </div>
        )}
        {!isDevBypass && (
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSaveProfile} disabled={savingProfile || (profileForm.name === user.name && profileForm.phone === (user.phone ?? ""))}>
              {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save Profile
            </Button>
          </div>
        )}
      </section>

      {/* ── Password ───────────────────────────────────────────── */}
      {!isDevBypass && (
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-body font-semibold text-foreground">Change Password</h3>
          </div>
          <div className="grid gap-4 sm:max-w-md">
            <div>
              <Label>Current Password</Label>
              <Input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
                disabled={savingPassword}
                placeholder="••••••••"
              />
            </div>
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                disabled={savingPassword}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                disabled={savingPassword}
                placeholder="••••••••"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleChangePassword}
                disabled={savingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
              >
                {savingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                Change Password
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── Security / Sessions ─────────────────────────────────── */}
      {!isDevBypass && (
        <SessionsSection />
      )}

      {/* ── Company Switcher ───────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-body font-semibold text-foreground">Companies</h3>
        </div>
        <div className="divide-y divide-border">
          {memberships.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex items-center gap-2.5 px-4 py-3",
                m.isCurrent ? "bg-subtle/50" : "transition-colors hover:bg-subtle",
              )}
            >
              <span className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                m.isCurrent ? "bg-foreground" : "bg-muted-foreground/30",
              )} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-caption font-medium text-foreground">{m.company.name}</div>
                {m.company.businessType && (
                  <div className="text-micro text-muted-foreground">{m.company.businessType}</div>
                )}
              </div>
              <span className="shrink-0 text-micro text-muted-foreground">{m.role}</span>
              {m.isCurrent ? (
                <span className="shrink-0 text-micro font-medium text-foreground">Current</span>
              ) : (
                <button
                  onClick={() => handleSwitchCompany(m.company.id, m.company.name)}
                  disabled={switchingCompanyId === m.company.id}
                  className="shrink-0 text-micro font-medium text-brand transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  {switchingCompanyId === m.company.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Switch"
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Sessions / "Sign out all devices" ─────────────────────────
function SessionsSection() {
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleRevokeAll() {
    setRevokingAll(true);
    try {
      const { error } = await authClient.revokeSessions();
      if (error) {
        toast.error(error.message ?? "Could not revoke sessions");
        setRevokingAll(false);
        return;
      }
      toast.success("All other sessions signed out");
      setConfirmOpen(false);
      // Hard redirect to sign-in since the current session is also revoked.
      setTimeout(() => { window.location.href = "/sign-in"; }, 1000);
    } catch {
      toast.error("Network error");
      setRevokingAll(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-body font-semibold text-foreground">Security</h3>
      </div>

      {confirmOpen ? (
        <div className="space-y-3 rounded-md border border-danger/30 bg-danger-soft/30 p-4">
          <p className="text-caption leading-relaxed text-foreground">
            This will sign out <strong>every device</strong> currently logged
            into your account — including this one. You&apos;ll need to sign in
            again everywhere.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRevokeAll}
              disabled={revokingAll}
            >
              {revokingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              {revokingAll ? "Revoking…" : "Yes, sign out everywhere"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={revokingAll}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-caption font-medium text-foreground">
                Sign out all devices
              </p>
              <p className="mt-0.5 text-micro text-muted-foreground">
                Revoke all active sessions across every device.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Revoke all
          </Button>
        </div>
      )}
    </section>
  );
}
