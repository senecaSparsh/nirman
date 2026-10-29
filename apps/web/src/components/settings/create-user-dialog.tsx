"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus, ChevronRight, ChevronLeft, Check, Shield, Lock, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MemberScopeFields } from "@/components/settings/member-scope-fields";
import { draftForRole, scopePayload, type MemberScopeDraft } from "@/lib/member-scope";
import { ROLE_LIST, ROLES, assignableRoles, isCustomRole } from "@/lib/roles";
import type { DepartmentRow } from "@/lib/types";
import { useTodayDateState } from "@/lib/use-today-date";

type ProjectOption = { id: string; name: string };

/**
 * CreateUserDialog — a 3-step wizard for creating a new user with full
 * setup: profile + role, access scope, and module permissions.
 *
 * Step 1: Profile — name, email/phone, role, employee fields
 * Step 2: Scope — COMPANY/DEPARTMENT/PROJECT + entries
 * Step 3: Permissions — module-level additive overrides (optional)
 *
 * Creates the user via POST /api/users, then sets scope via
 * PATCH /api/users/[id]/scope, then permissions via
 * PATCH /api/users/[id]/permissions.
 */
export function CreateUserDialog({
  actorRole,
  projects,
  departments,
  managers,
  customRoles,
  onClose,
}: {
  actorRole: string;
  projects: ProjectOption[];
  departments: DepartmentRow[];
  managers: { membershipId: string; userId: string; name: string; role: string; roleLabel?: string }[];
  customRoles?: { id: string; key: string; label: string; description: string; baseRole: string | null; tier: number; permissions: string[] }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Profile
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>(assignableRoles(actorRole)[0] ?? "PROJECT_MANAGER");
  const [employeeCode, setEmployeeCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [joiningDate, setJoiningDate] = useTodayDateState();

  // Step 2: Scope — pre-selected by role; company-wide roles choose it explicitly
  const [scopeDraft, setScopeDraft] = useState<MemberScopeDraft>({ scopeType: null, entries: [] });
  const [reportsTo, setReportsTo] = useState<string>(""); // membershipId of the manager

  // Step 3: Permissions (optional — skip if empty)
  // We don't load the permissions editor here; the user can do it later.
  // This step is just a confirmation + info screen.

  const assignable = assignableRoles(actorRole);
  // Include custom roles the actor can assign (based on tier)
  const actorTierNum = (ROLES as Record<string, { tier: number }>)[actorRole]?.tier ?? 5;
  const assignableCustom = (customRoles ?? []).filter((cr) => actorTierNum < cr.tier);
  const allAssignable = [
    ...assignable.map((r) => ({ key: r, label: ROLES[r]?.label ?? r })),
    ...assignableCustom.map((cr) => ({ key: cr.key, label: cr.label })),
  ];
  // Built-in roles above the actor's grant power — shown disabled so the
  // gap is explainable instead of silently absent. DEVELOPER is excluded
  // entirely — reserved internal hat, not a real option.
  const lockedBuiltin = ROLE_LIST.filter((rl) => rl.key !== "DEVELOPER" && !allAssignable.some((a) => a.key === rl.key));
  // The scope the person is added with: pre-selected by role, changed in step 2.
  const scopeRole = isCustomRole(role) ? (customRoles?.find((cr) => cr.key === role)?.baseRole ?? null) : role;
  const scope = draftForRole(scopeRole, scopeDraft);
  const payload = scopePayload(scope);

  const canProceedStep1 = name.trim() && (email.trim() || phone.trim()) && role;
  const canProceedStep2 = payload !== null;

  async function handleCreate() {
    if (!canProceedStep1 || !payload) return;
    setSaving(true);
    try {
      // Step 1: Create the user
      const createRes = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          role,
          employeeCode: employeeCode.trim() || undefined,
          designation: designation.trim() || undefined,
          department: department.trim() || undefined,
          joiningDate: joiningDate || undefined,
          mustChangePassword: true,
          scopeType: payload.scopeType,
          scopeEntries: payload.scopeEntries,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? "Failed to create user");
      const userId = createData.id ?? createData.user?.id;
      if (!userId) throw new Error("User created but ID not returned");

      // The scope came with the create; the reporting line is a second call.
      if (reportsTo) {
        const reportsRes = await fetch(`/api/users/${userId}/scope`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            scopeType: payload.scopeType,
            scopeEntries: payload.scopeEntries,
            reportsToUserCompanyId: reportsTo,
          }),
        });
        if (!reportsRes.ok) {
          const reportsData = await reportsRes.json();
          toast.warning("User created, but the reporting line failed", {
            description: reportsData.error ?? "Set manually later.",
          });
        }
      }

      toast.success("User created successfully", {
        description: `${name.trim()} added as ${role}${payload.scopeType !== "COMPANY" ? ` (${payload.scopeType}-scoped)` : ""}.` + (createData.welcomeSent ? " Login details sent to them automatically." : "") + (createData.tempPassword ? ` Temporary password: ${createData.tempPassword} — they will be asked to change it on first login.` : " They will be asked to change their password on first login."),
      });
      router.refresh();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    { num: 1, label: "Profile", icon: UserPlus },
    { num: 2, label: "Access Scope", icon: Shield },
    { num: 3, label: "Review", icon: Check },
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Create New User"
      description="Add a team member with profile, access scope, and permissions."
      className="max-w-lg"
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        {steps.map((s, i) => {
          const active = step === s.num;
          const done = step > s.num;
          return (
            <div key={s.num} className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-1.5 ${active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`grid place-items-center size-6 rounded-full text-caption font-bold ${
                  active ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {done ? <Check className="size-3" /> : s.num}
                </div>
                <span className="text-caption font-medium hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px ${done ? "bg-primary/30" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Profile */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rajesh Kumar" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input aria-label="Mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input aria-label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
            </div>
          </div>
          <p className="text-caption text-muted-foreground">Either email or phone is required for login.</p>
          <div className="space-y-1.5">
            <Label>Role *</Label>
            <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              {allAssignable.map((r) => {
                const def = ROLE_LIST.find((rl) => rl.key === r.key);
                return <option key={r.key} value={r.key}>{def?.label ?? r.label}</option>;
              })}
              {lockedBuiltin.map((rl) => (
                <option key={rl.key} value={rl.key} disabled>
                  {rl.label} — above your authority
                </option>
              ))}
            </Select>
            <p className="text-caption text-muted-foreground">
              {ROLE_LIST.find((r) => r.key === role)?.description ?? (customRoles ?? []).find((cr) => cr.key === role)?.description ?? "Custom role"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Employee Code</Label>
              <Input aria-label="Mployee Code" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="e.g. SRG-FIN-0001" />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input aria-label="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Site Engineer" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Org Unit</Label>
              <Input aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Construction" />
            </div>
            <div className="space-y-1.5">
              <Label>Joining Date</Label>
              <Input aria-label="Joining Date" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => setStep(2)} disabled={!canProceedStep1}>
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Scope */}
      {step === 2 && (
        <div className="space-y-3">
          <MemberScopeFields scopeRole={scopeRole} value={scope} onChange={setScopeDraft} projects={projects} departments={departments} />

          {/* Reports To selector */}
          {managers.length > 0 && (
            <div className="space-y-2">
              <Label>Reports To (optional)</Label>
              <Select aria-label="Reports To (optional)" value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
                <option value="">No manager — top of chain</option>
                {managers.map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.name} ({m.roleLabel ?? m.role})
                  </option>
                ))}
              </Select>
              <p className="text-[10px] text-muted-foreground">
                The manager who approves this user&apos;s work and appears in the org hierarchy.
              </p>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              <ChevronLeft className="size-3.5" /> Back
            </Button>
            <Button size="sm" onClick={() => setStep(3)} disabled={!canProceedStep2}>
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              <span className="font-medium text-foreground">{name.trim() || "—"}</span>
              <Badge variant="outline" className="ml-auto">{role}</Badge>
            </div>
            <div className="text-caption text-muted-foreground space-y-0.5">
              <p>{email.trim() || "No email"} · {phone.trim() || "No phone"}</p>
              {employeeCode.trim() && <p>Code: {employeeCode.trim()}</p>}
              {designation.trim() && <p>Designation: {designation.trim()}</p>}
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <span className="font-medium text-foreground">Access Scope</span>
            </div>
            <p className="text-caption text-muted-foreground">
              {payload?.scopeType === "COMPANY" ? "Company-wide (sees everything)" :
                payload?.scopeType === "DEPARTMENT" ? `${payload.scopeEntries.length} department(s)` :
                `${payload?.scopeEntries.length ?? 0} project(s)`}
            </p>
            {reportsTo && (
              <p className="text-caption text-muted-foreground flex items-center gap-1">
                <Network className="size-3" /> Reports to: {managers.find((m) => m.membershipId === reportsTo)?.name ?? "—"}
              </p>
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" />
              <span className="font-medium text-foreground">Module Permissions</span>
            </div>
            <p className="text-caption text-muted-foreground">
              Default permissions from the {role} role. You can customize module-level permissions after creation using the Lock button.
            </p>
          </div>

          <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="text-caption text-foreground">
              <span className="font-semibold">Temporary password:</span> auto-generated (shown after creation)
              <br />The user will be asked to set their own password on first login.
            </p>
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>
              <ChevronLeft className="size-3.5" /> Back
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              Create User
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}