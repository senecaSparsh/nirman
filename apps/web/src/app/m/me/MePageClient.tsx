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
  Briefcase,
  Building2,
  IdCard,
  Calendar,
  Clock,
  UserCircle,
  Users,
  GitBranch,
  Wallet,
  CalendarOff,
  FileText,
} from "lucide-react";
import { useSession, authClient } from "@/lib/auth-client";
import { useSignOut } from "@/lib/use-sign-out";
import { useFieldMode } from "@/lib/field-mode";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { useDeviceTierWithCaps } from "@/lib/device-tier-client";
import { useFetch } from "@/lib/use-fetch";
import {
  Card,
  MobileSectionTitle,
  MobileRow,
  Button,
  Badge,
} from "@/components/mobile/v2/primitives";
import { SectionCard, UnderlineInput } from "@/components/mobile/v2/form-primitives";
import { DelegationCard } from "@/components/settings/delegation-card";
import { OnboardingProgress } from "@/components/mobile/v2/onboarding-progress";
import { buildOnboardingSteps } from "@/lib/onboarding-steps";
import { ROLES } from "@/lib/roles";
import { formatDate, displayEmail } from "@/lib/utils";
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
  /** Worker self-service — payslip + leave history + attendance.
   *  Null when the user has no linked Employee record. */
  hr: {
    payslip: {
      /** PayrollLine id — powers the printable payslip at /print/payslip/[id]. */
      id: string;
      month: number;
      year: number;
      daysWorked: number;
      grossPay: number;
      netPay: number;
      deductions: number;
      /** Itemized breakdown (HRA, travel ₹3/km, PF…) from PayrollLineComponent. */
      components: {
        label: string;
        calculationType: string;
        unitType: string | null;
        unitLabel: string | null;
        rate: number;
        quantity: number | null;
        amount: number;
        bucket: string;
        isDeduction: boolean;
      }[];
    } | null;
    leaves: {
      id: string;
      type: string;
      startDate: string;
      endDate: string;
      days: number;
      status: string;
    }[];
    presentDaysThisMonth: number;
    /** Open advances/loans — what the worker still owes back via payroll. */
    advances: {
      id: string;
      amount: number;
      recoveredAmount: number;
      outstanding: number;
      monthlyRecovery: number;
      status: string;
      issueDate: string;
    }[];
  } | null;
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
  // server-side data and these queries are skipped entirely.
  const meQ = useFetch<{
    name?: string; role?: string; email?: string; phone?: string;
    image?: string | null; active?: boolean; employeeCode?: string | null;
    designation?: string | null; department?: string | null;
    joiningDate?: string | null; lastLoginAt?: string | null;
  } | null>("/api/me", { skip: !!initial });
  const companyQ = useFetch<{ name?: string } | null>("/api/company", { skip: !!initial });

  useEffect(() => {
    const d = meQ.data;
    if (!d) return;
    if (d.name) setUserName(d.name);
    if (d.role) setUserRole(d.role);
    if (d.email) setUserEmail(displayEmail(d.email) ?? "");
    if (d.phone) setUserPhone(d.phone);
    if (d.image !== undefined) setUserImage(d.image ?? null);
    if (d.active !== undefined) setUserActive(d.active ?? true);
    if (d.employeeCode !== undefined) setUserEmployeeCode(d.employeeCode ?? null);
    if (d.designation !== undefined) setUserDesignation(d.designation ?? null);
    if (d.department !== undefined) setUserDepartment(d.department ?? null);
    if (d.joiningDate !== undefined) setUserJoiningDate(d.joiningDate ?? null);
    if (d.lastLoginAt !== undefined) setUserLastLoginAt(d.lastLoginAt ?? null);
  }, [meQ.data]);

  useEffect(() => {
    if (companyQ.data?.name) setCompanyName(companyQ.data.name);
  }, [companyQ.data]);

  useEffect(() => {
    if (!initial && !meQ.loading && !companyQ.loading) setProfileLoading(false);
  }, [initial, meQ.loading, companyQ.loading]);

  // Client-only concerns: dark mode + WebAuthn passkeys.
  useEffect(() => {
    const isDarkNow = document.documentElement.classList.contains("dark");
    setIsDark((prev) => (prev !== isDarkNow ? isDarkNow : prev));
    if (window.PublicKeyCredential) {
      setPasskeySupported(true);
      void loadPasskeys();
    }
     
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

  const { handleSignOut, signingOut, dialog: signOutDialog } = useSignOut();

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

        {/* Self-profile has no Call/Text/Email actions — you cannot contact
            yourself. The pencil above is the only action (edit profile). */}
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

      {/* ── My Pay & Leave — the two questions every worker asks:
          "kitna paisa aaya" (latest payslip) + "kitni chhutti" (leave
          status). Only rendered when an Employee record exists. ── */}
      {initial?.hr ? (
        <>
          <MobileSectionTitle>My Pay</MobileSectionTitle>
          <div className="mb-4">
            <Card className="p-4">
              {initial.hr.payslip ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                      {new Date(initial.hr.payslip.year, initial.hr.payslip.month - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })}
                    </p>
                    <span className="rounded-full px-2 py-0.5 text-m-caption font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 12%, transparent)", color: "var(--color-go)" }}>
                      Paid
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <Wallet className="size-4 self-center" style={{ color: "var(--color-go)" }} />
                    <span className="text-m-title font-extrabold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                      ₹{initial.hr.payslip.netPay.toLocaleString("en-IN")}
                    </span>
                    <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>net pay</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2" style={{ borderTop: "1px solid var(--color-line)" }}>
                    <div>
                      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Days worked</p>
                      <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{initial.hr.payslip.daysWorked}</p>
                    </div>
                    <div>
                      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Gross</p>
                      <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>₹{initial.hr.payslip.grossPay.toLocaleString("en-IN")}</p>
                    </div>
                    <div>
                      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>Deductions</p>
                      <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-stop)" }}>−₹{initial.hr.payslip.deductions.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  {/* Itemized breakdown — "Travel · 420 km × ₹3 = ₹1,260" */}
                  {initial.hr.payslip.components.length > 0 && (
                    <div className="pt-2 mt-2 space-y-0.5" style={{ borderTop: "1px solid var(--color-line)" }}>
                      {initial.hr.payslip.components.map((c, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-2">
                          <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                            {c.label}
                            {c.calculationType === "UNIT_RATE" && c.quantity != null && (
                              <span style={{ color: "var(--color-ink-400)" }}>
                                {" "}· {c.quantity} {(c.unitType === "CUSTOM" ? c.unitLabel : c.unitType?.toLowerCase()) ?? "units"} × ₹{c.rate}
                              </span>
                            )}
                            {c.calculationType === "PERCENTAGE_OF_BASIC" && (
                              <span style={{ color: "var(--color-ink-400)" }}> · {c.rate}% of basic</span>
                            )}
                          </p>
                          <p
                            className="text-m-caption font-semibold tabular-nums shrink-0"
                            style={{ color: c.isDeduction ? "var(--color-stop)" : "var(--color-ink-950)" }}
                          >
                            {c.isDeduction ? "−" : ""}₹{c.amount.toLocaleString("en-IN")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Printable payslip — same data, formatted for handing to
                      a bank / saving as PDF. Opens the /print document. */}
                  <a
                    href={`/print/payslip/${initial.hr.payslip.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg py-2 text-m-caption font-bold"
                    style={{ border: "1px solid var(--color-line)", color: "var(--color-ink-700)" }}
                  >
                    <FileText className="size-3.5" />
                    View full payslip (PDF)
                  </a>
                </div>
              ) : (
                <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
                  No payslip yet — your salary will appear here after payroll runs.
                </p>
              )}
              <p className="text-m-caption mt-2" style={{ color: "var(--color-ink-500)" }}>
                Present this month: <span className="font-bold" style={{ color: "var(--color-ink-950)" }}>{initial.hr.presentDaysThisMonth} day{initial.hr.presentDaysThisMonth === 1 ? "" : "s"}</span>
              </p>
              {/* Open advances — the worker's own ledger ("kitna udhaar bacha
                  hai"): what was taken, recovered, and still being deducted. */}
              {initial.hr.advances.length > 0 && (
                <div className="pt-2 mt-2 space-y-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
                  {initial.hr.advances.map((a) => (
                    <div key={a.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                          Advance · {formatDate(a.issueDate)}
                          {a.status === "PAUSED" && <span style={{ color: "var(--color-warn)" }}> · paused</span>}
                        </p>
                        <p className="text-m-caption font-semibold tabular-nums shrink-0" style={{ color: "var(--color-ink-950)" }}>
                          ₹{a.outstanding.toLocaleString("en-IN")} left
                        </p>
                      </div>
                      <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-ink-100)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, (a.recoveredAmount / Math.max(a.amount, 1)) * 100)}%`, backgroundColor: "var(--color-warn)" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <MobileSectionTitle>My Leaves</MobileSectionTitle>
          <div className="mb-4">
            <Card className="p-4">
              {/* Self-service leave request — every employee can file their
                  own leave; HR no longer has to do it on their behalf. */}
              <LeaveRequestForm />
              {initial.hr.leaves.length === 0 ? (
                <p className="text-m-body" style={{ color: "var(--color-ink-500)" }}>
                  No leave requests yet.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {initial.hr.leaves.map((l) => (
                    <div key={l.id} className="flex items-center gap-2.5">
                      <CalendarOff className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>
                          {l.type.charAt(0) + l.type.slice(1).toLowerCase()} · {l.days} day{l.days === 1 ? "" : "s"}
                        </p>
                        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                          {formatDate(l.startDate)}{l.startDate !== l.endDate ? ` → ${formatDate(l.endDate)}` : ""}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-m-caption font-bold shrink-0"
                        style={{
                          backgroundColor: l.status === "APPROVED"
                            ? "color-mix(in srgb, var(--color-go) 12%, transparent)"
                            : l.status === "REJECTED" || l.status === "CANCELLED"
                              ? "color-mix(in srgb, var(--color-stop) 12%, transparent)"
                              : "color-mix(in srgb, var(--color-signal) 12%, transparent)",
                          color: l.status === "APPROVED"
                            ? "var(--color-go)"
                            : l.status === "REJECTED" || l.status === "CANCELLED"
                              ? "var(--color-stop)"
                              : "var(--color-signal-dark)",
                        }}
                      >
                        {l.status.charAt(0) + l.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}

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

      {/* ── Out of office — delegate authority ────────────────────── */}
      <div className="mb-4">
        <DelegationCard />
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
                        {formatDate(pk.createdAt)}
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
      {signOutDialog}
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

/**
 * Self-service leave request — expandable mini-form inside the My Leaves
 * card. POST /api/leaves resolves the caller's own Employee record for
 * non-HR callers, so no employeeId is sent. After submit the list below
 * refreshes on the next /api/me fetch.
 */
function LeaveRequestForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"CASUAL" | "SICK" | "EARNED" | "UNPAID">("CASUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!startDate || !endDate) {
      toast.error("Pick the leave dates first");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date can't be before the start date");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, startDate, endDate, reason: reason.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not submit leave request");
        return;
      }
      toast.success(
        data.status === "APPROVED"
          ? "Leave approved"
          : "Leave request submitted — pending approval",
      );
      setOpen(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      setType("CASUAL");
      // Re-render the server component so the new request appears in the
      // list below — the card's data is server-fetched, not client-state.
      router.refresh();
    } catch {
      toast.error("Could not submit leave request");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] border border-dashed py-2.5 text-m-caption font-semibold press"
        style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}
      >
        <CalendarOff className="size-3.5" />
        Request leave
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)" }}>
      <div className="mb-2 grid grid-cols-4 gap-1.5">
        {(["CASUAL", "SICK", "EARNED", "UNPAID"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className="rounded-[0.375rem] py-1.5 text-m-caption font-semibold press"
            style={{
              backgroundColor: type === t ? "var(--color-ink-950)" : "var(--color-concrete)",
              color: type === t ? "var(--color-paper)" : "var(--color-ink-700)",
            }}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-0.5 w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)" }}
          />
        </label>
        <label className="block">
          <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>To</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-0.5 w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)" }}
          />
        </label>
      </div>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        maxLength={200}
        className="mb-2 w-full rounded-[0.375rem] border px-2 py-1.5 text-m-body"
        style={{ borderColor: "var(--color-line)", color: "var(--color-ink-950)" }}
      />
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button className="flex-1" onClick={submit} disabled={saving}>
          {saving ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </div>
  );
}
