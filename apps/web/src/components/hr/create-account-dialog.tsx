"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  UserPlus,
  Link2,
  Phone,
  Shield,
  Network,
  Check,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  Recycle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  ROLE_LIST,
  assignableRoles,
  PERMISSION_MODULES,
  type Role,
} from "@/lib/roles";

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

/**
 * CreateAccountDialog — creates a login account for an employee and links
 * it. Handles the full interconnected flow:
 *   1. Role selection (filtered by hierarchical RBAC)
 *   2. Module permissions (checkboxes)
 *   3. Scope (Company / Project / Department)
 *   4. Phone number (existing company number OR new number with OTP verify)
 *
 * Calls POST /api/employees/[id]/create-account which does the atomic
 * transaction: User + UserCompany + Account + permissions + scope +
 * Employee.userId link + CompanyPhone assignment.
 */
export function CreateAccountDialog({
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
  // Auto-suggest a role based on the employee's hierarchy level:
  // H1 → PROJECT_DIRECTOR, H2 → PROJECT_MANAGER, H3 → SITE_ENGINEER,
  // H4 → SUPERVISOR, H5/H6 → SUPERVISOR (field worker, minimal access)
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
  const defaultRole = suggestedRole && roles.includes(suggestedRole) ? suggestedRole : roles[0] ?? "SITE_ENGINEER";
  const [role, setRole] = useState<Role>(defaultRole);
  const [email] = useState(employeeEmail ?? "");
  const [employeeCode, setEmployeeCode] = useState("");
  const [designation, setDesignation] = useState(employeeDesignation ?? "");
  const [department, setDepartment] = useState("");

  // ── Permissions ──
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());

  // ── Scope ──
  const [scopeType, setScopeType] = useState<"COMPANY" | "PROJECT" | "DEPARTMENT">("COMPANY");
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());

  // ── Phone assignment ──
  const [phoneSource, setPhoneSource] = useState<"existing" | "new">(
    availableNumbers.length > 0 ? "existing" : "new",
  );
  const [selectedPhoneId, setSelectedPhoneId] = useState<string>("");
  const [newPhone, setNewPhone] = useState(employeePhone ?? "");
  const [newPhoneLabel, setNewPhoneLabel] = useState("");
  const [newPhoneCost, setNewPhoneCost] = useState("");

  // ── Phone check (availability + recycled detection) ──
  const [phoneCheck, setPhoneCheck] = useState<PhoneCheckResult | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  // ── Link mode ──
  const [linkUserId, setLinkUserId] = useState("");

  // Auto-select first available number
  useEffect(() => {
    if (phoneSource === "existing" && availableNumbers.length > 0 && !selectedPhoneId) {
      setSelectedPhoneId(availableNumbers[0]!.id);
    }
  }, [phoneSource, availableNumbers, selectedPhoneId]);

  // Check phone availability when a new number is entered
  const checkPhone = useCallback(async (phoneToCheck: string) => {
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
  }, [employeeId]);

  useEffect(() => {
    if (phoneSource === "new" && newPhone) {
      const timer = setTimeout(() => checkPhone(newPhone), 500);
      return () => clearTimeout(timer);
    }
    setPhoneCheck(null);
  }, [phoneSource, newPhone, checkPhone]);

  function toggleModule(key: string) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleProject(id: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Collect permissions from selected modules
  const selectedPermissions: string[] = [];
  for (const modKey of selectedModules) {
    const mod = PERMISSION_MODULES.find((m) => m.key === modKey);
    if (mod) selectedPermissions.push(...mod.permissions);
  }

  async function handleCreate() {
    // Determine the login phone from the selected source
    const loginPhone =
      phoneSource === "existing"
        ? availableNumbers.find((n) => n.id === selectedPhoneId)?.phoneNumber ?? ""
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

      const res = await fetch(`/api/employees/${employeeId}/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create account");

      toast.success(data.message ?? "Account created and linked");
      setSuccess(true);
      router.refresh();
    } catch (err: unknown) {
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
      const res = await fetch(`/api/employees/${employeeId}/link-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: linkUserId.trim() }),
      });
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

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={success ? "Account Created" : `Create Login Account — ${employeeName}`}
      description={success ? undefined : "Give this employee app access with a phone-based OTP login."}
      size="lg"
    >
      {success ? (
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <p className="text-center text-body">
            Login account created for <span className="font-medium">{employeeName}</span>.
          </p>
          <div className="rounded-lg border border-border bg-subtle p-3 space-y-2">
            <p className="text-label text-muted-foreground/75 font-medium">NEXT STEPS</p>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-caption">
                <span className="text-muted-foreground">1.</span>
                <span>Generate the employment agreement from the profile sidebar</span>
              </div>
              <div className="flex items-start gap-2 text-caption">
                <span className="text-muted-foreground">2.</span>
                <span>Print it, get it signed, then click "Confirm Agreement"</span>
              </div>
              <div className="flex items-start gap-2 text-caption">
                <span className="text-muted-foreground">3.</span>
                <span>Set up auto-deposit with bank details</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onClose(); window.location.href = `/hr/employees/${employeeId}`; }}>
              Go to Profile
            </Button>
          </div>
        </div>
      ) : (
        <>
      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium transition-colors ${
            mode === "create" ? "bg-primary text-primary-foreground" : "bg-subtle text-foreground hover:bg-muted"
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" /> New Account
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-body font-medium transition-colors ${
            mode === "link" ? "bg-primary text-primary-foreground" : "bg-subtle text-foreground hover:bg-muted"
          }`}
        >
          <Link2 className="h-3.5 w-3.5" /> Link Existing
        </button>
      </div>

      {mode === "link" ? (
        /* ── Link existing account ── */
        <div className="space-y-3">
          <p className="text-caption text-muted-foreground">
            Link an existing user account (created via Settings → People) to this employee.
            The user must already be a member of this company.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="link-user-id">User ID</Label>
            <Input
              id="link-user-id"
              value={linkUserId}
              onChange={(e) => setLinkUserId(e.target.value)}
              placeholder="Paste the user ID from Settings → People"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleLink} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Link Account
            </Button>
          </div>
        </div>
      ) : (
        /* ── Create new account ── */
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Role & Identity */}
          <section className="space-y-3">
            <h3 className="text-label font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Role & Identity
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {roles.map((r) => {
                    const roleDef = ROLE_LIST.find((rl) => rl.key === r);
                    return (
                      <option key={r} value={r}>
                        {roleDef?.label ?? r}
                      </option>
                    );
                  })}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Employee Code</Label>
                <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="EMP-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Designation</Label>
                <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Site Engineer" />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Construction" />
              </div>
            </div>
          </section>

          {/* Phone Number */}
          <section className="space-y-3">
            <h3 className="text-label font-semibold text-foreground flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Login Phone Number
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhoneSource("existing")}
                className={`flex-1 rounded-md border px-3 py-2 text-body font-medium transition-colors ${
                  phoneSource === "existing" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
                }`}
              >
                Existing company number
              </button>
              <button
                type="button"
                onClick={() => setPhoneSource("new")}
                className={`flex-1 rounded-md border px-3 py-2 text-body font-medium transition-colors ${
                  phoneSource === "new" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
                }`}
              >
                New number
              </button>
            </div>

            {phoneSource === "existing" ? (
              <div className="space-y-1.5">
                <Label>Company Number *</Label>
                {availableNumbers.length === 0 ? (
                  <p className="text-caption text-muted-foreground py-2">
                    No available company numbers. Add one in Telephony or use a new number.
                  </p>
                ) : (
                  <Select value={selectedPhoneId} onChange={(e) => setSelectedPhoneId(e.target.value)}>
                    {availableNumbers.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.phoneNumber}
                        {n.label ? ` — ${n.label}` : ""}
                        {n.status === "RECYCLED" ? " (recycled)" : ""}
                        {n.monthlyCost ? ` — ₹${n.monthlyCost}/mo` : ""}
                      </option>
                    ))}
                  </Select>
                )}
                <p className="text-caption text-muted-foreground">
                  This number becomes the employee&apos;s login (OTP) and is connected to call tracking.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label>Phone Number *</Label>
                  <Input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="98765 43210"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Label (optional)</Label>
                    <Input value={newPhoneLabel} onChange={(e) => setNewPhoneLabel(e.target.value)} placeholder="Site office" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Monthly Cost (₹)</Label>
                    <Input type="number" min="0" step="any" value={newPhoneCost} onChange={(e) => setNewPhoneCost(e.target.value)} placeholder="0" />
                  </div>
                </div>
                {/* Phone availability check */}
                {checkingPhone && (
                  <p className="text-caption text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking availability...
                  </p>
                )}
                {phoneCheck && !checkingPhone && (
                  <div
                    className={`flex items-start gap-2 rounded-md p-2 text-caption ${
                      phoneCheck.available
                        ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                        : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                    }`}
                  >
                    {phoneCheck.available ? (
                      <>
                        <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          {phoneCheck.recycled ? (
                            <>
              <Recycle className="inline h-3 w-3" /> This number was previously used. It will be re-verified and assigned.
            </>
                          ) : phoneCheck.existingUser ? (
                            <>A user account already exists for this phone. It will be linked to this employee.</>
                          ) : (
                            <>Number is available. It will be added to the company and assigned.</>
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{phoneCheck.reason}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Module Access */}
          <section className="space-y-3">
            <h3 className="text-label font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Module Access
            </h3>
            <p className="text-caption text-muted-foreground">
              Grant access to specific modules. The role&apos;s default permissions are included automatically — these are additive overrides.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PERMISSION_MODULES.map((mod) => (
                <label
                  key={mod.key}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                    selectedModules.has(mod.key)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedModules.has(mod.key)}
                    onChange={() => toggleModule(mod.key)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-body text-foreground">{mod.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Scope */}
          <section className="space-y-3">
            <h3 className="text-label font-semibold text-foreground flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" /> Access Scope
            </h3>
            <div className="flex gap-2">
              {(["COMPANY", "PROJECT", "DEPARTMENT"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setScopeType(st)}
                  className={`flex-1 rounded-md border px-3 py-2 text-body font-medium transition-colors ${
                    scopeType === st ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  {st === "COMPANY" ? "Company-wide" : st === "PROJECT" ? "Project(s)" : "Department"}
                </button>
              ))}
            </div>
            {scopeType === "PROJECT" && (
              <div className="space-y-1.5">
                <Label>Projects *</Label>
                <div className="max-h-32 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProjects.has(p.id)}
                        onChange={() => toggleProject(p.id)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span className="text-body text-foreground">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {scopeType === "DEPARTMENT" && (
              <p className="text-caption text-muted-foreground">
                Department scoping requires department setup. Use Company-wide or Project scope for now.
              </p>
            )}
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create & Link Account
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
        </>
      )}
    </Dialog>
  );
}
