"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  UserPlus,
  Link2,
  Phone,
  Network,
  Check,
  CheckCircle2,
  AlertCircle,
  Recycle,
} from "lucide-react";
import {
  ROLE_LIST,
  assignableRoles,
  PERMISSION_MODULES,
  type Role,
} from "@/lib/roles";
import { haptic } from "@/lib/haptic";
import { formatCurrency } from "@/lib/utils";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import {
  SectionCard,
  UnderlineInput,
  EnumSelect,
  StickyActionBar,
} from "@/components/mobile/v2/form-primitives";

type ProjectOption = { id: string; name: string };

type AvailableNumber = {
  id: string;
  phoneNumber: string;
  phoneNormalized?: string;
  label: string | null;
  department: string | null;
  status: string;
  monthlyCost: number | null;
  provider: string | null;
};

type PhoneCheckResult = {
  available: boolean;
  recycled?: boolean;
  companyPhoneId?: string;
  reason?: string;
  assignedToName?: string;
  existingUser?: { id: string; name: string; email: string } | null;
};

/* ── Segmented toggle button (extracted to module scope to avoid
 *  react-hooks/static-components lint error — components defined inside
 *  another component reset their state on each parent render) ── */
function SegToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => { haptic(10); onClick(); }}
      className="h-9 rounded-[0.375rem] border-2 text-m-caption font-bold text-m-body press flex items-center justify-center gap-1.5"
      style={{
        borderColor: active ? "var(--color-ink-950)" : "var(--color-line)",
        backgroundColor: active
          ? "var(--color-ink-950)"
          : "var(--color-paper)",
        color: active ? "var(--color-paper)" : "var(--color-ink-500)",
      }}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

/* ── Module toggle chip (extracted to module scope) ── */
function ModuleChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[0.375rem] border px-2.5 py-1.5 text-m-caption font-medium press flex items-center gap-1.5 transition-colors`}
      style={{
        borderColor: selected ? "var(--color-ink-950)" : "var(--color-line)",
        backgroundColor: selected
          ? "color-mix(in srgb, var(--color-ink-950) 8%, transparent)"
          : "transparent",
        color: selected ? "var(--color-ink-950)" : "var(--color-ink-500)",
      }}
    >
      <div
        className="size-4 rounded-[0.25rem] border-2 flex items-center justify-center shrink-0"
        style={{
          borderColor: selected
            ? "var(--color-ink-950)"
            : "var(--color-line)",
          backgroundColor: selected
            ? "var(--color-ink-950)"
            : "transparent",
        }}
      >
        {selected && <Check className="size-2.5" style={{ color: "var(--color-paper)" }} />}
      </div>
      {label}
    </button>
  );
}

/**
 * MobileCreateAccountDialog — mobile-native version of CreateAccountDialog.
 * Uses the same v2 primitives (SectionCard, UnderlineInput, EnumSelect,
 * StickyActionBar) as the rest of the mobile surface.
 */
export function MobileCreateAccountDialog({
  employeeId,
  employeeName,
  employeePhone,
  employeeEmail,
  employeeDesignation,
  employeeHierarchyLevel,
  actorRole,
  projects,
  availableNumbers,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  employeePhone: string | null;
  employeeEmail: string | null;
  employeeDesignation: string | null;
  employeeHierarchyLevel: number | null;
  actorRole: string;
  projects: ProjectOption[];
  availableNumbers: AvailableNumber[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<"create" | "link">("create");

  // ── Account fields ──
  const roles = assignableRoles(actorRole);
  const HIERARCHY_ROLE_MAP: Record<number, Role> = {
    1: "PROJECT_DIRECTOR",
    2: "PROJECT_MANAGER",
    3: "SITE_ENGINEER",
    4: "SUPERVISOR",
    5: "SUPERVISOR",
    6: "SUPERVISOR",
  };
  const suggestedRole = employeeHierarchyLevel
    ? HIERARCHY_ROLE_MAP[employeeHierarchyLevel]
    : null;
  const defaultRole =
    suggestedRole && roles.includes(suggestedRole)
      ? suggestedRole
      : (roles[0] ?? "SITE_ENGINEER");
  const [role, setRole] = useState<Role>(defaultRole);
  const [email] = useState(employeeEmail ?? "");
  const [employeeCode, setEmployeeCode] = useState("");
  const [designation, setDesignation] = useState(employeeDesignation ?? "");
  const [department, setDepartment] = useState("");

  // ── Permissions ──
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set(),
  );

  // ── Scope ──
  const [scopeType, setScopeType] = useState<
    "COMPANY" | "PROJECT" | "DEPARTMENT"
  >("COMPANY");
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set(),
  );

  // ── Phone assignment ──
  const [phoneSource, setPhoneSource] = useState<"existing" | "new">(
    availableNumbers.length > 0 ? "existing" : "new",
  );
  const [selectedPhoneId, setSelectedPhoneId] = useState<string>("");
  const [newPhone, setNewPhone] = useState(employeePhone ?? "");
  const [newPhoneLabel, setNewPhoneLabel] = useState("");
  const [newPhoneCost, setNewPhoneCost] = useState("");

  // ── Phone check ──
  const [phoneCheck, setPhoneCheck] = useState<PhoneCheckResult | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  // ── Link mode ──
  const [linkUserId, setLinkUserId] = useState("");

  useEffect(() => {
    if (
      phoneSource === "existing" &&
      availableNumbers.length > 0 &&
      !selectedPhoneId
    ) {
      setSelectedPhoneId(availableNumbers[0]!.id);
    }
  }, [phoneSource, availableNumbers, selectedPhoneId]);

  const checkPhone = useCallback(
    async (phoneToCheck: string) => {
      if (phoneToCheck.replace(/\D/g, "").length < 10) {
        setPhoneCheck(null);
        return;
      }
      setCheckingPhone(true);
      try {
        const res = await fetch(
          `/api/employees/${employeeId}/check-phone?phone=${encodeURIComponent(phoneToCheck)}`,
        );
        const data = await res.json();
        setPhoneCheck(data);
      } catch {
        setPhoneCheck(null);
      } finally {
        setCheckingPhone(false);
      }
    },
    [employeeId],
  );

  useEffect(() => {
    if (phoneSource === "new" && newPhone) {
      const timer = setTimeout(() => checkPhone(newPhone), 500);
      return () => clearTimeout(timer);
    }
    setPhoneCheck(null);
  }, [phoneSource, newPhone, checkPhone]);

  function toggleModule(key: string) {
    haptic(10);
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleProject(id: string) {
    haptic(10);
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedPermissions: string[] = [];
  for (const modKey of selectedModules) {
    const mod = PERMISSION_MODULES.find((m) => m.key === modKey);
    if (mod) selectedPermissions.push(...mod.permissions);
  }

  async function handleCreate() {
    const loginPhone =
      phoneSource === "existing"
        ? (availableNumbers.find((n) => n.id === selectedPhoneId)?.phoneNumber ??
          "")
        : newPhone.trim();

    if (!loginPhone) {
      toast.error("Phone number is required for the login account");
      return;
    }
    if (phoneSource === "new" && phoneCheck && !phoneCheck.available) {
      toast.error(phoneCheck.reason ?? "This phone number is not available");
      return;
    }
    if (scopeType === "PROJECT" && selectedProjects.size === 0) {
      toast.error("Select at least one project for project-scoped access");
      return;
    }

    setSaving(true);
    haptic(10);
    try {
      const body: Record<string, unknown> = {
        phone: loginPhone,
        email: email.trim() || null,
        role,
        permissions: selectedPermissions,
        scopeType,
        designation: designation.trim() || null,
        department: department.trim() || null,
        employeeCode: employeeCode.trim() || null,
      };

      if (scopeType === "PROJECT") {
        body.scopes = Array.from(selectedProjects).map((pid) => ({
          scopeKind: "PROJECT" as const,
          projectId: pid,
        }));
      }

      if (phoneSource === "existing" && selectedPhoneId) {
        body.companyPhoneId = selectedPhoneId;
      } else if (phoneSource === "new" && newPhone.trim()) {
        body.newPhoneNumber = newPhone.trim();
        body.newPhoneLabel = newPhoneLabel.trim() || null;
        body.newPhoneMonthlyCost = newPhoneCost ? Number(newPhoneCost) : null;
      }

      const res = await fetch(
        `/api/employees/${employeeId}/create-account`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Failed to create account");

      haptic([10, 40, 80]);
      toast.success(data.message ?? "Account created and linked");
      setSuccess(true);
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleLink() {
    if (!linkUserId.trim()) {
      toast.error("Enter a user ID to link");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/employees/${employeeId}/link-account`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: linkUserId.trim() }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to link account");
      toast.success(data.message ?? "Account linked");
      router.refresh();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  /* ════════════════════════════════════════════════════════════════
   * SUCCESS STATE
   * ════════════════════════════════════════════════════════════════ */
  if (success) {
    return (
      <MobileDialog
        open
        onClose={onClose}
        title="Account Created"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center py-2">
            <CheckCircle2 className="size-10" style={{ color: "var(--color-go)" }} />
          </div>
          <p className="text-center text-m-body" style={{ color: "var(--color-ink-950)" }}>
            Login account created for{" "}
            <span className="font-bold">{employeeName}</span>.
          </p>
          <div
            className="rounded-[0.5rem] border p-3 space-y-2"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
          >
            <p
              className="text-m-caption font-bold uppercase tracking-wide"
              style={{ color: "var(--color-ink-500)" }}
            >
              Next Steps
            </p>
            <div className="space-y-1.5">
              {[
                "Generate the employment agreement from the profile",
                "Print it, get it signed, then confirm agreement",
                "Set up auto-deposit with bank details",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-m-caption" style={{ color: "var(--color-ink-700)" }}>
                  <span style={{ color: "var(--color-ink-400)" }}>{i + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-[0.5rem] border-2 text-m-section font-bold press"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => { onClose(); window.location.href = `/m/hr/employees/${employeeId}`; }}
              className="flex-1 h-11 rounded-[0.5rem] text-m-section font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              View Profile
            </button>
          </div>
        </div>
      </MobileDialog>
    );
  }

  /* ════════════════════════════════════════════════════════════════
   * MAIN FORM
   * ════════════════════════════════════════════════════════════════ */
  return (
    <MobileDialog
      open
      onClose={onClose}
      title={`Create Login Account — ${employeeName}`}
    >
      <div className="space-y-3">
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          Give this employee app access with a phone-based OTP login.
        </p>

        {/* ── Mode toggle ── */}
        <div className="grid grid-cols-2 gap-2">
          <SegToggle
            active={mode === "create"}
            onClick={() => setMode("create")}
            icon={UserPlus}
            label="New Account"
          />
          <SegToggle
            active={mode === "link"}
            onClick={() => setMode("link")}
            icon={Link2}
            label="Link Existing"
          />
        </div>

        {mode === "link" ? (
          /* ── Link existing account ── */
          <SectionCard title="Link Existing User">
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Link an existing user account (created via Settings → People) to
              this employee. The user must already be a member of this company.
            </p>
            <UnderlineInput
              label="User ID"
              value={linkUserId}
              onChange={setLinkUserId}
              placeholder="Paste the user ID"
            />
            <StickyActionBar
              summaryLabel="Action"
              summaryValue="Link"
              submitLabel="Link Account"
              onSubmit={handleLink}
              submitting={saving}
              disabled={!linkUserId.trim()}
            />
          </SectionCard>
        ) : (
          /* ── Create new account ── */
          <>
            {/* ── Role & Identity ── */}
            <SectionCard title="Role & Identity">
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                <div>
                  <EnumSelect
                    label="Role"
                    required
                    value={role}
                    onChange={(v) => setRole(v as Role)}
                    options={roles.map((r) => {
                      const roleDef = ROLE_LIST.find((rl) => rl.key === r);
                      return { value: r, label: roleDef?.label ?? r };
                    })}
                  />
                </div>
                <div>
                  <UnderlineInput
                    label="Employee Code"
                    value={employeeCode}
                    onChange={setEmployeeCode}
                    placeholder="EMP-001"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                <div>
                  <UnderlineInput
                    label="Designation"
                    value={designation}
                    onChange={setDesignation}
                    placeholder="Site Engineer"
                  />
                </div>
                <div>
                  <UnderlineInput
                    label="Department"
                    value={department}
                    onChange={setDepartment}
                    placeholder="Construction"
                  />
                </div>
              </div>
            </SectionCard>

            {/* ── Login Phone Number ── */}
            <SectionCard title="Login Phone Number">
              <div className="grid grid-cols-2 gap-2">
                <SegToggle
                  active={phoneSource === "existing"}
                  onClick={() => setPhoneSource("existing")}
                  icon={Phone}
                  label="Existing Number"
                />
                <SegToggle
                  active={phoneSource === "new"}
                  onClick={() => setPhoneSource("new")}
                  icon={Phone}
                  label="New Number"
                />
              </div>

              {phoneSource === "existing" ? (
                availableNumbers.length === 0 ? (
                  <p className="text-m-caption py-2" style={{ color: "var(--color-ink-500)" }}>
                    No available company numbers. Add one in Telephony or use a
                    new number.
                  </p>
                ) : (
                  <>
                    <EnumSelect
                      label="Company Number"
                      required
                      value={selectedPhoneId}
                      onChange={setSelectedPhoneId}
                      options={availableNumbers.map((n) => ({
                        value: n.id,
                        label: `${n.phoneNumber}${n.label ? ` — ${n.label}` : ""}${n.status === "RECYCLED" ? " (recycled)" : ""}${n.monthlyCost ? ` — ${formatCurrency(n.monthlyCost)}/mo` : ""}`,
                      }))}
                    />
                    <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                      This number becomes the employee&apos;s login (OTP) and is
                      connected to call tracking.
                    </p>
                  </>
                )
              ) : (
                <div className="space-y-3">
                  <UnderlineInput
                    label="Phone Number"
                    required
                    type="tel"
                    inputMode="tel"
                    value={newPhone}
                    onChange={setNewPhone}
                    placeholder="98765 43210"
                  />
                  <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <div>
                      <UnderlineInput
                        label="Label (opt.)"
                        value={newPhoneLabel}
                        onChange={setNewPhoneLabel}
                        placeholder="Site office"
                      />
                    </div>
                    <div>
                      <UnderlineInput
                        label="Monthly Cost (₹)"
                        type="number"
                        inputMode="numeric"
                        value={newPhoneCost}
                        onChange={setNewPhoneCost}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Phone availability check */}
                  {checkingPhone && (
                    <p className="text-m-caption flex items-center gap-1" style={{ color: "var(--color-ink-500)" }}>
                      <Loader2 className="size-3 animate-spin" /> Checking
                      availability...
                    </p>
                  )}
                  {phoneCheck && !checkingPhone && (
                    <div
                      className="flex items-start gap-2 rounded-[0.375rem] p-2 text-m-caption"
                      style={{
                        backgroundColor: phoneCheck.available
                          ? "color-mix(in srgb, var(--color-go) 12%, transparent)"
                          : "color-mix(in srgb, var(--color-stop) 12%, transparent)",
                        color: phoneCheck.available
                          ? "var(--color-go)"
                          : "var(--color-stop)",
                      }}
                    >
                      {phoneCheck.available ? (
                        <>
                          <Check className="size-3.5 shrink-0 mt-0.5" />
                          <span>
                            {phoneCheck.recycled ? (
                              <>
                                <Recycle className="inline size-3" /> This number
                                was previously used. It will be re-verified and
                                assigned.
                              </>
                              ) : phoneCheck.existingUser ? (
                                <>A user account already exists for this phone.
                                It will be linked to this employee.</>
                              ) : (
                                <>Number is available. It will be added to the
                                company and assigned.</>
                              )}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                          <span>{phoneCheck.reason}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* ── Module Access ── */}
            <SectionCard title="Module Access">
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                Grant access to specific modules. The role&apos;s default
                permissions are included automatically — these are additive
                overrides.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {PERMISSION_MODULES.map((mod) => (
                  <ModuleChip
                    key={mod.key}
                    label={mod.label}
                    selected={selectedModules.has(mod.key)}
                    onClick={() => toggleModule(mod.key)}
                  />
                ))}
              </div>
            </SectionCard>

            {/* ── Access Scope ── */}
            <SectionCard title="Access Scope">
              <div className="grid grid-cols-3 gap-2">
                {(["COMPANY", "PROJECT", "DEPARTMENT"] as const).map((st) => (
                  <SegToggle
                    key={st}
                    active={scopeType === st}
                    onClick={() => setScopeType(st)}
                    icon={Network}
                    label={
                      st === "COMPANY"
                        ? "Company"
                        : st === "PROJECT"
                          ? "Project(s)"
                          : "Dept"
                    }
                  />
                ))}
              </div>

              {scopeType === "PROJECT" && (
                <div className="space-y-1.5">
                  <label
                    className="block text-m-caption font-bold"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    Projects *
                  </label>
                  <div
                    className="max-h-32 overflow-y-auto rounded-[0.375rem] border p-2 space-y-1"
                    style={{
                      borderColor: "var(--color-line)",
                      backgroundColor: "var(--color-paper-2)",
                    }}
                  >
                    {projects.map((p) => (
                      <ModuleChip
                        key={p.id}
                        label={p.name}
                        selected={selectedProjects.has(p.id)}
                        onClick={() => toggleProject(p.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {scopeType === "DEPARTMENT" && (
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Department scoping requires department setup. Use
                  Company-wide or Project scope for now.
                </p>
              )}
            </SectionCard>

            {/* ── Sticky action bar ── */}
            <StickyActionBar
              summaryLabel="Action"
              summaryValue="Create"
              submitLabel={saving ? "Creating…" : "Create & Link Account"}
              onSubmit={handleCreate}
              submitting={saving}
            />
          </>
        )}
      </div>
    </MobileDialog>
  );
}
