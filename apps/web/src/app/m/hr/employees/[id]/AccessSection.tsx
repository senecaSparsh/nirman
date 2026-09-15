"use client";

import { useState } from "react";
import { useFetch } from "@/lib/use-fetch";
import { useRouter } from "next/navigation";
import {
  Shield,
  Lock,
  KeyRound,
  Loader2,
  Check,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Plus,
  Phone,
  Recycle,
} from "lucide-react";
import { toast } from "sonner";
import { ROLES, type Role, ROLE_META } from "@/lib/roles";
import { haptic } from "@/lib/haptic";
import { formatDate, displayEmail } from "@/lib/utils";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { Button } from "@/components/mobile/v2/primitives";
import { ScopeEditorDialog } from "@/components/settings/scope-editor-dialog";
import { PermissionsEditorDialog } from "@/components/settings/permissions-editor-dialog";
import { ResetPasswordDialog } from "@/components/settings/reset-password-dialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { MobileCreateAccountDialog } from "../MobileCreateAccountDialog";

const HIERARCHY_LABELS_MOBILE = ["Management", "Manager", "Engineer", "Supervisor", "Skilled", "Labor"];

export type AccessSectionUser = {
  id: string;
  email: string;
  role: string | null;
  phone: string | null;
  active: boolean;
  lastLoginAt: string | null;
  phoneVerified: boolean | null;
  phoneVerifiedAt: string | null;
  phoneSyncedAt: string | null;
};

export type AssignableRole = { key: string; label: string };

type Department = { id: string; code: string; name: string; active: boolean };

/**
 * Access & Permissions section for the employee profile.
 *
 * Gating rules:
 * - The ENTIRE section is only rendered if canManageUsers is true.
 *   Users without USERS_MANAGE permission never see this section at all.
 * - Self-management is allowed for profile fields but not for role/active changes.
 * - Role change, scope, permissions, password reset, and activate/deactivate
 *   all require canManageUsers AND not being the current user (can't change your
 *   own role or deactivate yourself).
 *
 * This merges the Team page functionality into the employee profile.
 */
export function AccessSection({
  employeeId,
  employeeName,
  employeePhone,
  employeeEmail,
  employeeDesignation,
  employeeHierarchyLevel,
  actorRole,
  user,
  canManageUsers,
  isSelf,
  assignableRoles,
  projects,
  departments,
}: {
  employeeId: string;
  employeeName: string;
  employeePhone: string | null;
  employeeEmail: string | null;
  employeeDesignation: string | null;
  employeeHierarchyLevel: number | null;
  actorRole: string;
  user: AccessSectionUser | null;
  canManageUsers: boolean;
  isSelf: boolean;
  assignableRoles: AssignableRole[];
  projects: { id: string; name: string }[];
  departments: Department[];
}) {
  // If the viewer can't manage users, this section is completely invisible.
  if (!canManageUsers) return null;

  // Case 1: Employee has no linked user account — show provision login UI
  if (!user) {
    return (
      <ProvisionLoginCard
        employeeId={employeeId}
        employeeName={employeeName}
        employeePhone={employeePhone}
        employeeEmail={employeeEmail}
        employeeDesignation={employeeDesignation}
        employeeHierarchyLevel={employeeHierarchyLevel}
        actorRole={actorRole}
        projects={projects}
      />
    );
  }

  // Case 2: Employee has a linked user account — show access management UI
  return (
    <AccessManagementCard
      employeeId={employeeId}
      user={user}
      employeeName={employeeName}
      isSelf={isSelf}
      assignableRoles={assignableRoles}
      projects={projects}
      departments={departments}
    />
  );
}

/* ----------------------------------------------------------------
 * Provision Login — for employees without a user account.
 * Reuses the same MobileCreateAccountDialog as the onboarding tab
 * so the user gets the same full-featured experience (phone pool,
 * role, permissions, scope) regardless of which page they're on.
 * ---------------------------------------------------------------- */
function ProvisionLoginCard({
  employeeId,
  employeeName,
  employeePhone,
  employeeEmail,
  employeeDesignation,
  employeeHierarchyLevel,
  actorRole,
  projects,
}: {
  employeeId: string;
  employeeName: string;
  employeePhone: string | null;
  employeeEmail: string | null;
  employeeDesignation: string | null;
  employeeHierarchyLevel: number | null;
  actorRole: string;
  projects: { id: string; name: string }[];
}) {
  const [showProvision, setShowProvision] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<
    { id: string; phoneNumber: string; label: string | null; department: string | null; status: string; monthlyCost: number | null; provider: string | null }[]
  >([]);

  async function openProvision() {
    haptic(10);
    try {
      const res = await fetch("/api/telephony/numbers/available");
      if (res.ok) setAvailableNumbers(await res.json());
    } catch { /* non-critical — dialog still works with empty pool */ }
    setShowProvision(true);
  }

  return (
    <div
      className="rounded-[0.625rem] border mb-3 overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Access & Login
          </p>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="grid place-items-center size-7 rounded-full shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <XCircle className="size-3.5" style={{ color: "var(--color-ink-400)" }} />
          </div>
          <div className="flex-1">
            <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
              No login account
            </p>
            <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              This employee cannot sign in. Provision access to allow login.
            </p>
          </div>
        </div>
        <button
          onClick={openProvision}
          className="flex w-full items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-m-caption font-bold text-m-body press"
          style={{
            color: "var(--color-paper)",
            backgroundColor: "var(--color-ink-950)",
          }}
        >
          <UserPlus className="size-3" />
          Provision Login Access
        </button>
      </div>

      {showProvision && (
        <MobileCreateAccountDialog
          employeeId={employeeId}
          employeeName={employeeName}
          employeePhone={employeePhone}
          employeeEmail={employeeEmail}
          employeeDesignation={employeeDesignation}
          employeeHierarchyLevel={employeeHierarchyLevel}
          actorRole={actorRole}
          projects={projects}
          availableNumbers={availableNumbers}
          onClose={() => setShowProvision(false)}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Phone Status Row — verification + Twilio/call-tracking sync
 * ---------------------------------------------------------------- */
function PhoneStatusRow({ user, canManage }: { user: AccessSectionUser; canManage: boolean }) {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [showVerify, setShowVerify] = useState(false);

  if (!user.phone) {
    return (
      <div className="flex items-center gap-2 mb-3">
        <span
          className="flex items-center gap-1 text-m-caption font-bold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
        >
          <AlertCircle className="size-2.5" />
          No phone number
        </span>
      </div>
    );
  }

  const isVerified = user.phoneVerified === true;
  const isSynced = !!user.phoneSyncedAt;

  async function sendOtp() {
    setSending(true);
    haptic(10);
    try {
      const res = await fetch(`/api/users/${user.id}/verify-phone?action=send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Verification code sent");
      setShowVerify(true);
      if (data.devCode) {
        toast.info(`Dev code: ${data.devCode}`);
      }
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    if (!otpCode || otpCode.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    haptic(10);
    try {
      const res = await fetch(`/api/users/${user.id}/verify-phone?action=verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Phone verified");
      if (data.syncedWithTwilio) {
        toast.success("Also synced with Twilio");
      }
      setShowVerify(false);
      setOtpCode("");
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setVerifying(false);
    }
  }

  async function syncTwilio() {
    setSyncing(true);
    haptic(10);
    try {
      const res = await fetch(`/api/users/${user.id}/verify-phone?action=sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      if (data.synced) {
        haptic([10, 40, 80]);
        toast.success(data.message ?? "Synced with Twilio");
      } else {
        haptic([50, 20, 50]);
        toast.error(data.message ?? "Not found in Twilio");
      }
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 mb-3">
      {/* Stateful buttons — status + action combined.
          Green = done, amber = needs attention. Tapping performs the action. */}
      <div className="flex gap-1.5">
        {/* Phone verification */}
        <button
          onClick={canManage && !showVerify ? sendOtp : undefined}
          disabled={sending}
          className={`flex flex-1 items-center justify-center gap-1 h-8 px-1 rounded-[0.375rem] text-m-caption font-bold text-m-body ${canManage && !showVerify ? "press" : "cursor-default"} disabled:opacity-70`}
          style={
            isVerified
              ? { color: "var(--color-go)", backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)" }
              : { color: "var(--color-signal)", backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)" }
          }
        >
          {sending
            ? <Loader2 className="size-3 shrink-0 animate-spin" />
            : isVerified
              ? <CheckCircle2 className="size-3 shrink-0" />
              : <AlertCircle className="size-3 shrink-0" />}
          <span className="truncate">{isVerified ? "Phone Verified" : "Verify Phone"}</span>
        </button>

        {/* Twilio sync */}
        <button
          onClick={canManage ? syncTwilio : undefined}
          disabled={syncing}
          className={`flex flex-1 items-center justify-center gap-1 h-8 px-1 rounded-[0.375rem] text-m-caption font-bold text-m-body ${canManage ? "press" : "cursor-default"} disabled:opacity-70`}
          style={
            isSynced
              ? { color: "var(--color-go)", backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)" }
              : { color: "var(--color-signal)", backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)" }
          }
        >
          {syncing
            ? <Loader2 className="size-3 shrink-0 animate-spin" />
            : isSynced
              ? <CheckCircle2 className="size-3 shrink-0" />
              : <XCircle className="size-3 shrink-0" />}
          <span className="truncate">{isSynced ? "Twilio Synced" : "Sync Twilio"}</span>
        </button>
      </div>

      {/* OTP verification input */}
      {showVerify && (
        <div className="flex items-center gap-1.5 mt-1">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6-digit code"
            className="w-24 h-7 px-1 text-m-caption font-mono outline-none border-b focus:border-b-2 transition-colors"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          />
          <button
            onClick={verifyOtp}
            disabled={verifying || otpCode.length !== 6}
            className="flex items-center gap-1 h-6 px-2 rounded-[0.25rem] text-m-caption font-semibold text-m-body press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {verifying ? <Loader2 className="size-2.5 animate-spin" /> : <Check className="size-2.5" />}
            Verify
          </button>
          <button
            onClick={() => { setShowVerify(false); setOtpCode(""); }}
            className="h-6 px-2 rounded-[0.25rem] text-m-caption font-semibold text-m-body press"
            style={{ color: "var(--color-ink-500)" }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Access Management — for employees with a linked user account
 * ---------------------------------------------------------------- */
function AccessManagementCard({
  employeeId,
  user,
  employeeName,
  isSelf,
  assignableRoles,
  projects,
  departments,
}: {
  employeeId: string;
  user: AccessSectionUser;
  employeeName: string;
  isSelf: boolean;
  assignableRoles: AssignableRole[];
  projects: { id: string; name: string }[];
  departments: Department[];
}) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  // canManage checks: must have USERS_MANAGE AND can't manage yourself
  const canManageAccess = !isSelf;

  const userRole = user.role ?? "SUPERVISOR";
  // Build a label lookup from assignableRoles so custom roles show their
  // actual DB label (e.g. "Sales Lead") instead of a derived string.
  const roleLabelMap = new Map(assignableRoles.map((r) => [r.key, r.label]));
  const meta = ROLE_META[userRole as Role] ?? {
    color: "var(--color-ink-600)",
    label: roleLabelMap.get(userRole) ?? userRole.replace(/^CUSTOM_/, "").replace(/_/g, " "),
    icon: "Shield",
  };

  async function changeRole(newRole: string) {
    if (newRole === userRole) return;
    setChanging(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update role");
      const label = roleLabelMap.get(newRole) ?? ROLES[newRole as Role]?.label ?? newRole;
      toast.success(`${employeeName} is now ${label}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setChanging(false);
    }
  }

  async function toggleActive() {
    if (user.active) {
      setConfirmDeactivate(true);
      return;
    }
    await doToggleActive();
  }

  async function doToggleActive() {
    setChanging(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update status");
      toast.success(`${employeeName} ${user.active ? "deactivated" : "activated"}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setChanging(false);
    }
  }

  return (
    <div
      className="rounded-[0.625rem] border mb-3 overflow-hidden"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", opacity: user.active ? 1 : 0.6 }}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="grid place-items-center size-7 rounded-full shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}
          >
            <Shield className="size-3" style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Access & Login
            </p>
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
              {displayEmail(user.email) ?? user.phone ?? "—"}
            </p>
          </div>
          <span
            className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
          >
            {meta.label}
          </span>
        </div>

        {/* Login status */}
        <div className="flex items-center gap-2 mb-3">
          {user.active ? (
            <span
              className="flex items-center gap-1 text-m-caption font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 10%, transparent)", color: "var(--color-go)" }}
            >
              <CheckCircle2 className="size-2.5" />
              Active
            </span>
          ) : (
            <span
              className="flex items-center gap-1 text-m-caption font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
            >
              <AlertCircle className="size-2.5" />
              Deactivated
            </span>
          )}
          {user.lastLoginAt && (
            <span className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
              Last login: {formatDate(user.lastLoginAt)}
            </span>
          )}
        </div>

        {/* Phone verification + Twilio sync status.
            canManage=true for managers viewing others; isSelf=true for
            viewing your own profile. Both should be able to verify phone —
            a manager verifies an employee's phone, a user verifies their own. */}
        <PhoneStatusRow user={user} canManage={canManageAccess || isSelf} />

        {/* Access management actions — gated by canManageAccess */}
        {canManageAccess ? (
          <>
            {/* ── Divider ── */}
            <div className="h-px -mx-3 mb-3" style={{ backgroundColor: "var(--color-line)" }} />

            {/* Section: Access Management */}
            <p className="text-m-caption font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-ink-400)" }}>
              Access Management
            </p>
            <div className="flex gap-1.5 mb-3">
              {/* Set Access Scope */}
              <button
                onClick={() => setShowScope(true)}
                className="flex flex-1 items-center justify-center gap-1 h-8 px-1 rounded-[0.375rem] text-m-caption font-bold text-m-body press"
                style={{ color: "var(--color-ink-500)", backgroundColor: "var(--color-concrete)" }}
              >
                <Shield className="size-3 shrink-0" />
                <span className="truncate">Access Scope</span>
              </button>

              {/* Module Permissions */}
              <button
                onClick={() => setShowPerms(true)}
                className="flex flex-1 items-center justify-center gap-1 h-8 px-1 rounded-[0.375rem] text-m-caption font-bold text-m-body press"
                style={{ color: "var(--color-ink-500)", backgroundColor: "var(--color-concrete)" }}
              >
                <Lock className="size-3 shrink-0" />
                <span className="truncate">Permissions</span>
              </button>

              {/* Reset Password */}
              <button
                onClick={() => setShowResetPwd(true)}
                className="flex flex-1 items-center justify-center gap-1 h-8 px-1 rounded-[0.375rem] text-m-caption font-bold text-m-body press"
                style={{ color: "var(--color-ink-500)", backgroundColor: "var(--color-concrete)" }}
              >
                <KeyRound className="size-3 shrink-0" />
                <span className="truncate">Reset Pwd</span>
              </button>

              {/* Change Phone — reassign or replace the company phone */}
              <button
                onClick={() => setShowChangePhone(true)}
                className="flex flex-1 items-center justify-center gap-1 h-8 px-1 rounded-[0.375rem] text-m-caption font-bold text-m-body press"
                style={{ color: "var(--color-ink-500)", backgroundColor: "var(--color-concrete)" }}
              >
                <Phone className="size-3 shrink-0" />
                <span className="truncate">Change Phone</span>
              </button>
            </div>

            {/* ── Divider ── */}
            <div className="h-px -mx-3 mb-3" style={{ backgroundColor: "var(--color-line)" }} />

            {/* Section: Role */}
            <p className="text-m-caption font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-ink-400)" }}>
              Role
            </p>
            <div className="flex flex-wrap gap-1 mb-3">
              {assignableRoles.map((r) => {
                const isCustom = r.key.startsWith("CUSTOM_");
                const rMeta = ROLE_META[r.key as Role];
                const isCurrent = r.key === userRole;
                return (
                  <button
                    key={r.key}
                    onClick={() => changeRole(r.key)}
                    disabled={changing || isCurrent}
                    className="flex items-center gap-1 h-7 px-2 rounded-[0.25rem] text-m-caption font-semibold text-m-body press disabled:opacity-40"
                    style={{
                      color: isCurrent
                        ? "var(--color-paper)"
                        : isCustom
                          ? "var(--color-ink-600)"
                          : rMeta?.color ?? "var(--color-ink-600)",
                      backgroundColor: isCurrent
                        ? isCustom
                          ? "var(--color-ink-600)"
                          : rMeta?.color ?? "var(--color-ink-600)"
                        : `color-mix(in srgb, ${isCustom ? "var(--color-ink-600)" : rMeta?.color ?? "var(--color-ink-600)"} 8%, transparent)`,
                    }}
                  >
                    {isCurrent && <Check className="size-2.5" />}
                    {r.label}
                  </button>
                );
              })}
            </div>

            {/* ── Divider ── */}
            <div className="h-px -mx-3 mb-3" style={{ backgroundColor: "var(--color-line)" }} />

            {/* Section: Account */}
            <div className="flex gap-1.5">
              {/* Create Custom Role */}
              <button
                onClick={() => setShowCreateRole(true)}
                className="flex flex-1 items-center justify-center gap-1 h-8 px-1 rounded-[0.375rem] text-m-caption font-bold text-m-body press"
                style={{
                  color: "var(--color-ink-500)",
                  backgroundColor: "var(--color-concrete)",
                  border: "1px dashed var(--color-line)",
                }}
              >
                <Plus className="size-3 shrink-0" />
                <span className="truncate">Custom Role</span>
              </button>

              {/* Activate / Deactivate */}
              <button
                onClick={toggleActive}
                disabled={changing}
                className="flex flex-1 items-center justify-center gap-1 h-8 px-1 rounded-[0.375rem] text-m-caption font-bold text-m-body press disabled:opacity-50"
                style={{
                  color: user.active ? "var(--color-stop)" : "var(--color-go)",
                  backgroundColor: `color-mix(in srgb, ${user.active ? "var(--color-stop)" : "var(--color-go)"} 8%, transparent)`,
                }}
              >
                {changing ? <Loader2 className="size-3 animate-spin shrink-0" /> : null}
                <span className="truncate">{user.active ? "Deactivate" : "Activate"}</span>
              </button>
            </div>
          </>
        ) : (
          <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
            This is your own account — role and access changes are restricted.
          </p>
        )}
      </div>

      {/* Scope editor dialog */}
      {showScope && (
        <ScopeEditorDialog
          userId={user.id}
          userName={employeeName}
          userRole={userRole as Role}
          projects={projects}
          departments={departments}
          canEdit={true}
          onClose={() => setShowScope(false)}
          onSaved={() => { setShowScope(false); router.refresh(); }}
        />
      )}

      {/* Permissions editor dialog */}
      {showPerms && (
        <PermissionsEditorDialog
          userId={user.id}
          userName={employeeName}
          userRole={userRole as Role}
          canEdit={true}
          onClose={() => setShowPerms(false)}
          onSaved={() => { setShowPerms(false); router.refresh(); }}
        />
      )}

      {/* Reset password dialog */}
      {showResetPwd && (
        <ResetPasswordDialog
          userId={user.id}
          userName={employeeName}
          onClose={() => setShowResetPwd(false)}
          onSaved={() => { setShowResetPwd(false); }}
        />
      )}

      {showChangePhone && (
        <ChangePhoneDialog
          employeeId={employeeId}
          currentPhone={user.phone}
          employeeName={employeeName}
          onClose={() => setShowChangePhone(false)}
        />
      )}

      {/* Deactivation confirmation */}
      {confirmDeactivate && (
        <MobileDialog open={true} onClose={() => setConfirmDeactivate(false)} title={`Deactivate ${employeeName}?`}>
          <p className="text-m-body mb-3" style={{ color: "var(--color-ink-700)" }}>
            This will log them out, clear pending approvals, cancel tasks, and remove project assignments. They can be reactivated later.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setConfirmDeactivate(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              className="flex-1"
              disabled={changing}
              onClick={() => {
                setConfirmDeactivate(false);
                void doToggleActive();
              }}
            >
              {changing ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Deactivate
            </Button>
          </div>
        </MobileDialog>
      )}

      {/* Create custom role dialog */}
      {showCreateRole && (
        <CreateCustomRoleDialog
          onClose={() => setShowCreateRole(false)}
          onCreated={() => setShowCreateRole(false)}
          allowedBaseRoles={assignableRoles
            .filter((r) => !r.key.startsWith("CUSTOM_"))
            .map((r) => r.key)}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Create Custom Role Dialog — mobile port from Team page
 * ---------------------------------------------------------------- */
function CreateCustomRoleDialog({
  onClose,
  onCreated,
  allowedBaseRoles,
}: {
  onClose: () => void;
  onCreated: () => void;
  allowedBaseRoles: string[];
}) {
  const router = useRouter();
  const initialBase = (allowedBaseRoles[0] as Role) ?? "SITE_ENGINEER";
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [baseRole, setBaseRole] = useState<Role>(initialBase);
  const [hierarchyLevel, setHierarchyLevel] = useState<number>(ROLES[initialBase]?.tier ?? 3);
  const [saving, setSaving] = useState(false);

  // Only offer base roles the actor can actually assign (tier-filtered).
  // assignableRoles is already filtered by canAssignRole on the server, so
  // we derive the allowed base roles from it. This prevents an HR_MANAGER
  // from creating a custom role based on PROJECT_DIRECTOR (tier 2).
  const baseRoles = (Object.keys(ROLES) as Role[])
    .filter((r) => r !== "OWNER" && r !== "DEVELOPER")
    .filter((r) => allowedBaseRoles.includes(r));

  async function handleCreate() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      // Auto-generate the key from the label — the user never sees or
      // types the key. "Sales Lead" → "SALES_LEAD" → API stores "CUSTOM_SALES_LEAD".
      const autoKey = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      const res = await fetch("/api/custom-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: autoKey,
          label: label.trim(),
          description: description.trim(),
          baseRole,
          hierarchyLevel,
          permissions: [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to create role");
      haptic([10, 40, 80]);
      toast.success(data.message ?? "Custom role created");
      router.refresh();
      onCreated();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog open={true} onClose={onClose} title="Create Custom Role">
      <div className="space-y-3">
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Create a custom role by copying permissions from an existing role.
          You can fine-tune permissions later from desktop settings.
        </p>

        <div className="space-y-1">
          <label className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-400)" }}>
            Role Name *
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sales Lead"
            className="w-full rounded-[0.5rem] border p-2.5 text-m-label"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-400)" }}>
            Description
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full rounded-[0.5rem] border p-2.5 text-m-label"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          />
        </div>

        <div className="space-y-1">
          <EnumSelect
            label="Copy Permissions From"
            value={baseRole}
            onChange={(v) => {
              const r = v as Role;
              setBaseRole(r);
              setHierarchyLevel(ROLES[r]?.tier ?? 3);
            }}
            options={baseRoles.map((r) => ({ value: r, label: ROLES[r].label }))}
          />
          <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
            The new role starts with the same access level as the selected role.
          </p>
        </div>

        <div className="space-y-1">
          <EnumSelect
            label="Hierarchy Level (H1–H6)"
            value={String(hierarchyLevel)}
            onChange={(v) => setHierarchyLevel(Number(v))}
            options={[1, 2, 3, 4, 5, 6].map((h) => ({
              value: String(h),
              label: `H${h} — ${HIERARCHY_LABELS_MOBILE[h - 1] ?? `Level ${h}`}`,
            }))}
          />
          <p className="text-m-caption" style={{ color: "var(--color-ink-400)" }}>
            Controls where this role sits in the org tree. Use a level between the base role and the next level to create sub-roles (e.g. H2 for a sub-admin based on H1).
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-[0.5rem] border p-2.5 text-m-label font-semibold press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !label.trim()}
            className="flex-1 rounded-[0.5rem] p-2.5 text-m-label font-semibold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Create Role"}
          </button>
        </div>
      </div>
    </MobileDialog>
  );
}

/* ----------------------------------------------------------------
 * Change Phone — reassign or replace the company phone number
 * Uses POST /api/employees/[id]/assign-phone which atomically:
 *   - Closes the old PhoneAssignment (reason: "Reassigned")
 *   - Creates a new CompanyPhone (if new number) or reuses existing
 *   - Creates a new PhoneAssignment
 *   - Updates User.phone + Employee.phone
 * ---------------------------------------------------------------- */
function ChangePhoneDialog({
  employeeId,
  currentPhone,
  employeeName,
  onClose,
}: {
  employeeId: string;
  currentPhone: string | null;
  employeeName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const { data: nums } = useFetch<
    { id: string; phoneNumber: string; label: string | null; department: string | null; status: string }[]
  >("/api/telephony/numbers/available");
  const availableNumbers = nums ?? [];
  const [selectedPhoneId, setSelectedPhoneId] = useState<string>("");
  const [newPhone, setNewPhone] = useState("");

  async function handleSubmit() {
    const phoneToAssign = selectedPhoneId
      ? availableNumbers.find((n) => n.id === selectedPhoneId)?.phoneNumber
      : newPhone.trim();
    if (!phoneToAssign) {
      toast.error("Select an available number or enter a new one");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const body: Record<string, unknown> = {};
      if (selectedPhoneId) {
        body.companyPhoneId = selectedPhoneId;
      } else {
        body.newPhoneNumber = newPhone.trim();
      }
      const res = await fetch(`/api/employees/${employeeId}/assign-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to change phone");
      haptic([10, 40, 80]);
      toast.success(`Phone changed to ${phoneToAssign} for ${employeeName}`);
      router.refresh();
      onClose();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog open={true} onClose={onClose} title="Change Phone Number">
      <div className="space-y-3">
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Current: <strong style={{ color: "var(--color-ink-950)" }}>{currentPhone ?? "None"}</strong>
          <br />
          Reassigning closes the old assignment and creates a new one. The old number returns to the pool.
        </p>

        {/* Available company phones */}
        {availableNumbers.length > 0 && (
          <div>
            <p className="text-m-caption font-bold mb-1.5" style={{ color: "var(--color-ink-700)" }}>
              Available numbers
            </p>
            <div className="flex flex-col gap-1">
              {availableNumbers.map((n) => {
                const isSel = selectedPhoneId === n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => { setSelectedPhoneId(n.id); setNewPhone(""); haptic(10); }}
                    className="flex items-center gap-2 p-2 rounded-[0.375rem] border text-left press"
                    style={{
                      borderColor: isSel ? "var(--color-ink-950)" : "var(--color-line)",
                      backgroundColor: isSel ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)" : "transparent",
                    }}
                  >
                    <div className="grid place-items-center size-5 rounded-full border shrink-0" style={{ borderColor: "var(--color-line)" }}>
                      {isSel && <Check className="size-3" style={{ color: "var(--color-ink-950)" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-m-caption font-semibold flex items-center gap-1.5" style={{ color: "var(--color-ink-950)" }}>
                        <Phone className="size-3" /> {n.phoneNumber}
                      </p>
                      <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>
                        {n.label ?? n.department ?? "Unlabeled"}
                      </p>
                    </div>
                    {n.status === "RECYCLED" && (
                      <span className="text-micro font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                        style={{ backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)", color: "var(--color-signal-dark)" }}>
                        <Recycle className="size-2.5" /> Recycled
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Or enter a new number */}
        <div>
          <p className="text-m-caption font-bold mb-1" style={{ color: "var(--color-ink-700)" }}>
            {availableNumbers.length > 0 ? "Or enter a new number" : "New phone number"}
          </p>
          <input
            type="tel"
            value={newPhone}
            onChange={(e) => { setNewPhone(e.target.value); setSelectedPhoneId(""); }}
            placeholder="98765 43210"
            inputMode="tel"
            className="w-full h-9 px-2 rounded-[0.375rem] border text-m-caption outline-none"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)" }}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-9 rounded-[0.5rem] border text-m-label font-bold press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || (!selectedPhoneId && !newPhone.trim())}
            className="flex-1 h-9 rounded-[0.5rem] text-m-label font-bold press flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Phone className="size-3.5" />}
            Change Phone
          </button>
        </div>
      </div>
    </MobileDialog>
  );
}
