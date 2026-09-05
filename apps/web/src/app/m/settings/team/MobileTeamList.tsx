"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Phone,
  ChevronDown,
  Check,
  Loader2,
  UserCog,
  Crown,
  CircleDot,
  UserPlus,
  Pencil,
  Code,
  Lock,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { ROLES, roleTier, type Role } from "@/lib/roles";
import { haptic } from "@/lib/haptic";
import {
  MobileSearchHeader,
  MobileNoResults,
  MobileFab,
} from "@/components/mobile/v2/scaffold";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { Button } from "@/components/mobile/v2/primitives";
import { ScopeEditorDialog } from "@/components/settings/scope-editor-dialog";
import { PermissionsEditorDialog } from "@/components/settings/permissions-editor-dialog";
import { ResetPasswordDialog } from "@/components/settings/reset-password-dialog";
import { MobileDialog } from "@/components/mobile/v2/dialog";

interface TeamMember {
  id: string;
  membershipId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  isSelf: boolean;
  reportsToName: string | null;
  designation: string | null;
  department: string | null;
  employeeCode: string | null;
  joiningDate: string | null;
}

interface AssignableRole {
  key: Role;
  label: string;
}

const ROLE_META: Record<
  Role,
  { color: string; label: string; icon: typeof Crown }
> = {
  OWNER: { color: "var(--color-ink-500)", label: "Owner", icon: Crown },
  ADMIN: { color: "var(--color-ink-500)", label: "Admin", icon: Shield },
  DEVELOPER: { color: "var(--color-ink-500)", label: "Developer", icon: Code },
  PROJECT_DIRECTOR: {
    color: "var(--color-go)",
    label: "Project Director",
    icon: UserCog,
  },
  FINANCE_HEAD: {
    color: "var(--color-go)",
    label: "Finance Head",
    icon: UserCog,
  },
  PROJECT_MANAGER: {
    color: "var(--color-go)",
    label: "Project Manager",
    icon: UserCog,
  },
  PROCUREMENT_MANAGER: {
    color: "var(--color-signal)",
    label: "Procurement Manager",
    icon: CircleDot,
  },
  HR_MANAGER: {
    color: "var(--color-signal)",
    label: "HR Manager",
    icon: CircleDot,
  },
  SITE_ENGINEER: {
    color: "var(--color-signal)",
    label: "Site Engineer",
    icon: CircleDot,
  },
  STORE_KEEPER: {
    color: "var(--color-signal)",
    label: "Store Keeper",
    icon: CircleDot,
  },
  ACCOUNTANT: {
    color: "var(--color-signal)",
    label: "Accountant",
    icon: CircleDot,
  },
  SALES_MANAGER: {
    color: "var(--color-signal)",
    label: "Sales Manager",
    icon: CircleDot,
  },
  SUPERVISOR: {
    color: "var(--color-signal)",
    label: "Supervisor",
    icon: CircleDot,
  },
  QAQC_ENGINEER: {
    color: "var(--color-signal)",
    label: "QA/QC Engineer",
    icon: CircleDot,
  },
};

export function MobileTeamList({
  team,
  canManage,
  currentUserId: _currentUserId,
  currentRole: _currentRole,
  roleCounts,
  assignableRoles,
  projects,
  departments,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  team: TeamMember[];
  canManage: boolean;
  currentUserId: string;
  currentRole: string;
  roleCounts: Record<string, number>;
  assignableRoles: AssignableRole[];
  projects: { id: string; name: string }[];
  departments: { id: string; code: string; name: string; active: boolean }[];
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fab = useFabModal();

  const filtered = search.trim()
    ? team.filter((m) => {
        const q = search.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
        );
      })
    : team;

  // Sort: by role tier (OWNER first), then by name
  const sorted = [...filtered].sort((a, b) => {
    const tier = (r: Role) => roleTier(r);
    return tier(a.role) - tier(b.role) || a.name.localeCompare(b.name);
  });

  const activeCount = team.filter((m) => m.active).length;
  const inactiveCount = team.length - activeCount;

  return (
    <div className="pb-6">
      {/* ── Summary banner ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="flex items-center gap-1 mb-2">
          <div
            className="grid place-items-center size-8 rounded-full shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Shield
              className="size-4"
              style={{ color: "var(--color-ink-600)" }}
            />
          </div>
          <div>
            <p
              className="text-m-section font-bold"
              style={{ color: "var(--color-ink-950)" }}
            >
              {team.length} {team.length === 1 ? "member" : "members"}
            </p>
            <p
              className="text-m-caption"
              style={{ color: "var(--color-ink-700)" }}
            >
              {activeCount} active · {inactiveCount} inactive
            </p>
          </div>
        </div>
        {/* Role distribution pills */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(roleCounts).map(([roleKey, count]) => {
            const meta = ROLE_META[roleKey as Role];
            if (!meta || count === 0) return null;
            return (
              <span
                key={roleKey}
                className="flex items-center gap-1 h-5 px-1.5 rounded-full text-m-caption font-bold"
                style={{
                  color: meta.color,
                  backgroundColor: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
                }}
              >
                {meta.label}
                <span className="tabular-nums" style={{ opacity: 0.6 }}>
                  {count}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Permission notice for non-managers ── */}
      {!canManage && (
        <div
          className="rounded-[0.5rem] border p-2.5 mb-3 text-m-caption"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-concrete)",
            color: "var(--color-ink-700)",
          }}
        >
          You have read-only access. Only owners and admins can change roles or
          deactivate members.
        </div>
      )}

      {/* ── Add member FAB (managers only) ── */}
      {canManage && (
        <MobileFab onClick={fab.toggle} label="Add team member" icon={UserPlus} isOpen={fab.isOpen} />
      )}

      {/* ── Add member form dialog ── */}
      <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="Add Team Member">
        <AddMemberForm
          assignableRoles={assignableRoles}
          onClose={fab.close}
          onAdded={() => {
            fab.close();
            router.refresh();
          }}
        />
      </MobileFabModal>

      {/* ── Search ── */}
      <MobileSearchHeader
        query={search}
        onQueryChange={setSearch}
        placeholder="Search by name or email…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={!!search}
        onClear={() => setSearch("")}
      />

      {/* ── Team list ── */}
      {search && sorted.length > 0 && (
        <div className="flex items-center justify-end mb-1.5">
          <span
            className="text-m-label font-semibold"
            style={{ color: "var(--color-ink-700)" }}
          >
            {sorted.length} member{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {sorted.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            canManage={canManage && !member.isSelf}
            canEditProfile={member.isSelf || (canManage && !member.isSelf)}
            expanded={expandedId === member.id}
            onToggle={() =>
              setExpandedId(expandedId === member.id ? null : member.id)
            }
            assignableRoles={assignableRoles}
            projects={projects}
            departments={departments}
            onChanged={() => {
              setExpandedId(null);
              router.refresh();
            }}
          />
        ))}
      </div>

      {sorted.length === 0 && <MobileNoResults title="No members found" />}

      {/* ── Role reference ── */}
      <p
        className="text-m-section font-extrabold tracking-tight mb-2 mt-5 px-1"
        style={{ color: "var(--color-ink-700)" }}
      >
        Role Permissions
      </p>
      <div className="flex flex-col gap-3.5">
        {(Object.values(ROLES) as (typeof ROLES)[Role][]).map((r) => {
          const meta = ROLE_META[r.key];
          const Icon = meta.icon;
          const count = roleCounts[r.key] ?? 0;
          return (
            <div
              key={r.key}
              className="rounded-[0.5rem] border p-2.5"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper)",
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <Icon
                  className="size-3 shrink-0"
                  style={{ color: meta.color }}
                />
                <p
                  className="text-m-body font-bold"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  {meta.label}
                </p>
                {count > 0 && (
                  <span
                    className="text-m-caption font-bold tabular-nums ml-auto"
                    style={{ color: "var(--color-ink-700)" }}
                  >
                    {count} {count === 1 ? "person" : "people"}
                  </span>
                )}
              </div>
              <p
                className="text-m-caption leading-relaxed"
                style={{ color: "var(--color-ink-700)" }}
              >
                {r.description}
              </p>
              <p
                className="text-m-caption mt-1"
                style={{ color: "var(--color-ink-400)" }}
              >
                {r.permissions === "*"
                  ? "Full access — all permissions"
                  : `${r.permissions.length} permissions`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Member card ─── */
function MemberCard({
  member,
  canManage,
  canEditProfile,
  expanded,
  onToggle,
  assignableRoles,
  projects,
  departments,
  onChanged,
}: {
  member: TeamMember;
  canManage: boolean;
  canEditProfile: boolean;
  expanded: boolean;
  onToggle: () => void;
  assignableRoles: AssignableRole[];
  projects: { id: string; name: string }[];
  departments: { id: string; code: string; name: string; active: boolean }[];
  onChanged: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const meta = ROLE_META[member.role];
  const Icon = meta.icon;

  async function changeRole(newRole: Role) {
    if (newRole === member.role) return;
    setChanging(true);
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update role");
      toast.success(`${member.name} is now ${ROLES[newRole].label}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setChanging(false);
    }
  }

  async function toggleActive() {
    // Deactivation is destructive — show confirmation first
    if (member.active) {
      setConfirmDeactivate(true);
      return;
    }
    await doToggleActive();
  }

  async function doToggleActive() {
    setChanging(true);
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !member.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update status");
      toast.success(
        `${member.name} ${member.active ? "deactivated" : "activated"}`,
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setChanging(false);
    }
  }

  return (
    <div
      className="rounded-[0.5rem] border overflow-hidden"
      style={{
        borderColor: expanded ? meta.color : "var(--color-line)",
        backgroundColor: "var(--color-paper)",
        opacity: member.active ? 1 : 0.6,
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        disabled={changing}
        className="w-full text-left p-2.5 active:scale-[0.99] transition-transform press"
      >
        <div className="flex items-center gap-1 mb-1">
          <div
            className="grid place-items-center size-7 rounded-full shrink-0"
            style={{
              backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
            }}
          >
            <Icon className="size-3" style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p
                className="text-m-section font-bold truncate"
                style={{ color: "var(--color-ink-500)" }}
              >
                {member.name}
              </p>
              {member.isSelf && (
                <span
                  className="text-m-caption font-bold px-1 py-0.5 rounded"
                  style={{
                    color: "var(--color-ink-700)",
                    backgroundColor: "var(--color-concrete)",
                  }}
                >
                  You
                </span>
              )}
            </div>
            <p
              className="text-m-caption truncate"
              style={{ color: "var(--color-ink-700)" }}
            >
              {member.email}
            </p>
          </div>
          <span
            className="text-m-caption font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0"
            style={{
              color: meta.color,
              backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
            }}
          >
            {meta.label}
          </span>
        </div>

        {/* Designation + department + employee code */}
        {(member.designation || member.department || member.employeeCode) && (
          <div
            className="flex items-center gap-1 text-m-caption mt-1"
            style={{ color: "var(--color-ink-700)" }}
          >
            {member.employeeCode && (
              <span
                className="font-mono font-bold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {member.employeeCode}
              </span>
            )}
            {member.designation && <span>{member.designation}</span>}
            {member.department && (
              <span
                className="px-1 rounded"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                {member.department}
              </span>
            )}
          </div>
        )}

        {/* Contact + reports to */}
        <div
          className="flex items-center gap-1 text-m-caption mt-0.5"
          style={{ color: "var(--color-ink-700)" }}
        >
          {member.phone && (
            <a
              href={`tel:${member.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-m-body press"
            >
              <Phone className="size-2.5" />
              {member.phone}
            </a>
          )}
          {member.reportsToName && (
            <span>Reports to {member.reportsToName}</span>
          )}
          {!member.active && (
            <span style={{ color: "var(--color-stop)" }}>Inactive</span>
          )}
        </div>

        {(canManage || canEditProfile) && (
          <div className="flex items-center justify-between mt-1.5">
            <span
              className="text-m-caption font-semibold"
              style={{ color: "var(--color-ink-400)" }}
            >
              {expanded
                ? "Tap to close"
                : canManage
                  ? "Tap to manage"
                  : "Tap to edit"}
            </span>
            <ChevronDown
              className="size-3 transition-transform"
              style={{
                color: "var(--color-ink-300)",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </div>
        )}
      </button>

      {/* Expanded management panel */}
      {expanded && (canManage || canEditProfile) && (
        <div
          className="p-2.5 border-t"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper-2)",
          }}
        >
          {/* Edit profile button */}
          {canEditProfile && (
            <button
              onClick={() => setShowEdit(true)}
              className="flex w-full items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-m-caption font-bold text-m-body press mb-2"
              style={{
                color: "var(--color-ink-500)",
                backgroundColor: "var(--color-concrete)",
              }}
            >
              <Pencil className="size-3" />
              Edit Profile
            </button>
          )}

          {/* Set access scope button (managers only) */}
          {canManage && (
            <button
              onClick={() => setShowScope(true)}
              className="flex w-full items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-m-caption font-bold text-m-body press mb-2"
              style={{
                color: "var(--color-ink-500)",
                backgroundColor: "var(--color-concrete)",
              }}
            >
              <Shield className="size-3" />
              Set Access Scope
            </button>
          )}

          {/* Module permissions button (managers only) */}
          {canManage && (
            <button
              onClick={() => setShowPerms(true)}
              className="flex w-full items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-m-caption font-bold text-m-body press mb-2"
              style={{
                color: "var(--color-ink-500)",
                backgroundColor: "var(--color-concrete)",
              }}
            >
              <Lock className="size-3" />
              Module Permissions
            </button>
          )}

          {/* Reset password button (managers only) */}
          {canManage && (
            <button
              onClick={() => setShowResetPwd(true)}
              className="flex w-full items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-m-caption font-bold text-m-body press mb-2"
              style={{
                color: "var(--color-ink-500)",
                backgroundColor: "var(--color-concrete)",
              }}
            >
              <KeyRound className="size-3" />
              Reset Password
            </button>
          )}

          {/* Role change */}
          {canManage && (
            <>
              <p
                className="text-m-section font-extrabold tracking-tight mb-1.5"
                style={{ color: "var(--color-ink-700)" }}
              >
                Change Role
              </p>
              <div className="flex flex-wrap gap-1 mb-3">
                {assignableRoles.map((r) => {
                  const rMeta = ROLE_META[r.key];
                  const isCurrent = r.key === member.role;
                  return (
                    <button
                      key={r.key}
                      onClick={() => changeRole(r.key)}
                      disabled={changing || isCurrent}
                      className="flex items-center gap-1 h-6 px-2 rounded-[0.25rem] text-m-caption font-semibold text-m-body press disabled:opacity-40"
                      style={{
                        color: isCurrent ? "var(--color-paper)" : rMeta.color,
                        backgroundColor: isCurrent
                          ? rMeta.color
                          : `color-mix(in srgb, ${rMeta.color} 8%, transparent)`,
                      }}
                    >
                      {isCurrent && <Check className="size-2.5" />}
                      {r.label}
                    </button>
                  );
                })}
              </div>

              {/* Active toggle */}
              <button
                onClick={toggleActive}
                disabled={changing}
                className="flex w-full items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-m-caption font-bold text-m-body press disabled:opacity-50"
                style={{
                  color: member.active
                    ? "var(--color-stop)"
                    : "var(--color-go)",
                  backgroundColor: `color-mix(in srgb, ${member.active ? "var(--color-stop)" : "var(--color-go)"} 8%, transparent)`,
                }}
              >
                {changing ? <Loader2 className="size-3 animate-spin" /> : null}
                {member.active ? "Deactivate Member" : "Activate Member"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Edit profile dialog */}
      {showEdit && (
        <EditMemberDialog
          member={member}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            onChanged();
          }}
        />
      )}

      {/* Scope editor dialog */}
      {showScope && (
        <ScopeEditorDialog
          userId={member.id}
          userName={member.name}
          userRole={member.role}
          projects={projects}
          departments={departments}
          canEdit={true}
          onClose={() => setShowScope(false)}
          onSaved={() => {
            setShowScope(false);
            onChanged();
          }}
        />
      )}

      {/* Permissions editor dialog */}
      {showPerms && (
        <PermissionsEditorDialog
          userId={member.id}
          userName={member.name}
          userRole={member.role}
          canEdit={true}
          onClose={() => setShowPerms(false)}
          onSaved={() => {
            setShowPerms(false);
            onChanged();
          }}
        />
      )}

      {/* Reset password dialog */}
      {showResetPwd && (
        <ResetPasswordDialog
          userId={member.id}
          userName={member.name}
          onClose={() => setShowResetPwd(false)}
          onSaved={() => {
            setShowResetPwd(false);
            onChanged();
          }}
        />
      )}

      {/* Deactivation confirmation bottom sheet */}
      {confirmDeactivate && (
        <MobileDialog open={true} onClose={() => setConfirmDeactivate(false)} title={`Deactivate ${member.name}?`}>
            <p className="text-m-body mb-3" style={{ color: "var(--color-ink-700)" }}>
              This will log them out, clear pending approvals, cancel tasks, and remove project assignments. They can be reactivated later.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" size="md" fullWidth onClick={() => setConfirmDeactivate(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                fullWidth
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
    </div>
  );
}

/* ─── Add Member Form (rendered inside MobileFabModal) ─── */
function AddMemberForm({
  assignableRoles,
  onClose,
  onAdded,
}: {
  assignableRoles: AssignableRole[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>(
    assignableRoles[0]?.key ?? "PROJECT_MANAGER",
  );
  const [password, setPassword] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    setSubmitting(true);
    haptic(10);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          phone: phone.trim() || undefined,
          password: password.trim() || undefined,
          employeeCode: employeeCode.trim() || undefined,
          designation: designation.trim() || undefined,
          department: department.trim() || undefined,
          joiningDate: joiningDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add member");
      haptic([10, 40, 80]);
      toast.success(data.message ?? `${name.trim()} added successfully`);
      onAdded();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Name + Email */}
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <div>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Full Name <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rajesh Sharma"
            autoComplete="name"
            enterKeyHint="next"
            autoFocus
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
        </div>
        <div>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Email <span style={{ color: "var(--color-stop)" }}>*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@company.com"
            autoComplete="email"
            enterKeyHint="next"
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-950)",
            }}
          />
        </div>
      </div>

      {/* Phone + Employee Code */}
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <div>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 43210"
            autoComplete="tel"
            enterKeyHint="next"
            className="w-full h-7 px-1 text-m-caption tabular-nums outline-none border-b focus:border-b-2 transition-colors"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-500)",
            }}
          />
        </div>
        <div>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Employee Code
          </label>
          <input
            type="text"
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            placeholder="EMP-001"
            enterKeyHint="next"
            className="w-full h-7 px-1 text-m-caption font-mono outline-none border-b focus:border-b-2 transition-colors"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-500)",
            }}
          />
        </div>
      </div>

      {/* Designation + Department */}
      <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
        <div>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Designation
          </label>
          <input
            type="text"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Site Engineer"
            enterKeyHint="next"
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-500)",
            }}
          />
        </div>
        <div>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Department
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
              color: "var(--color-ink-500)",
            }}
          >
            <option value="">Select…</option>
            <option value="Construction">Construction</option>
            <option value="Procurement">Procurement</option>
            <option value="Finance">Finance</option>
            <option value="HR">HR</option>
            <option value="Sales">Sales</option>
            <option value="Administration">Administration</option>
            <option value="Quality">Quality</option>
            <option value="Stores">Stores</option>
          </select>
        </div>
      </div>

      {/* Joining Date */}
      <div>
        <label
          className="block text-m-caption font-bold mb-0"
          style={{ color: "var(--color-ink-700)" }}
        >
          Joining Date
        </label>
        <input
          type="date"
          value={joiningDate}
          onChange={(e) => setJoiningDate(e.target.value)}
          className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink-500)",
          }}
        />
      </div>

      {/* Role — grouped by category */}
      <div>
        <label
          className="block text-m-caption font-bold mb-0"
          style={{ color: "var(--color-ink-700)" }}
        >
          Role <span style={{ color: "var(--color-stop)" }}>*</span>
        </label>
        <div className="flex flex-col gap-3">
          {Object.entries(
            assignableRoles.reduce(
              (acc, r) => {
                const cat = ROLES[r.key].category;
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(r);
                return acc;
              },
              {} as Record<string, AssignableRole[]>,
            ),
          ).map(([category, roles]) => (
            <div key={category}>
              <p
                className="text-m-section font-extrabold tracking-tight mb-1"
                style={{ color: "var(--color-ink-400)" }}
              >
                {category}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => {
                  const meta = ROLE_META[r.key];
                  const isCurrent = r.key === role;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => {
                        setRole(r.key);
                        haptic(10);
                      }}
                      className="flex items-center gap-1 h-8 px-2.5 rounded-[0.375rem] text-m-caption font-semibold text-m-body press"
                      style={{
                        color: isCurrent ? "#fff" : meta.color,
                        backgroundColor: isCurrent
                          ? meta.color
                          : `color-mix(in srgb, ${meta.color} 8%, transparent)`,
                        border: isCurrent
                          ? "none"
                          : `1px solid color-mix(in srgb, ${meta.color} 20%, transparent)`,
                      }}
                    >
                      {isCurrent && <Check className="size-3" />}
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Password */}
      <div>
        <label
          className="block text-m-caption font-bold mb-0"
          style={{ color: "var(--color-ink-700)" }}
        >
          Password (optional)
        </label>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Default: nirman123"
          enterKeyHint="done"
          className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
            color: "var(--color-ink-500)",
          }}
        />
        <p
          className="text-m-caption mt-1"
          style={{ color: "var(--color-ink-700)" }}
        >
          Leave blank to use the default password — member can change it after signing in.
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-1.5 w-full h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 mt-1"
        style={{
          backgroundColor: "var(--color-ink-950)",
          color: "var(--color-paper)",
        }}
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <UserPlus className="size-4" />
            Add Member
          </>
        )}
      </button>
    </form>
  );
}

/* ─── Edit Member Dialog ─── */
function EditMemberDialog({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [employeeCode, setEmployeeCode] = useState(member.employeeCode ?? "");
  const [designation, setDesignation] = useState(member.designation ?? "");
  const [department, setDepartment] = useState(member.department ?? "");
  const [joiningDate, setJoiningDate] = useState(
    member.joiningDate ? member.joiningDate.split("T")[0] : "",
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          employeeCode: employeeCode.trim() || null,
          designation: designation.trim() || null,
          department: department.trim() || null,
          joiningDate: joiningDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update profile");
      haptic([10, 40, 80]);
      toast.success("Profile updated");
      onSaved();
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog open={true} onClose={onClose} title="Edit Profile">

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Email (read-only) */}
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Email
            </label>
            <input
              type="email"
              value={member.email}
              disabled
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors opacity-60"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-concrete)",
                color: "var(--color-ink-700)",
              }}
            />
            <p
              className="text-m-caption mt-1"
              style={{ color: "var(--color-ink-700)" }}
            >
              Email cannot be changed.
            </p>
          </div>

          {/* Name */}
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Full Name <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rajesh Sharma"
              autoComplete="name"
              enterKeyHint="next"
              autoFocus
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Phone */}
          <div>
            <label
              className="block text-m-caption font-bold mb-0"
              style={{ color: "var(--color-ink-700)" }}
            >
              Phone (optional)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              autoComplete="tel"
              enterKeyHint="done"
              className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "transparent",
                color: "var(--color-ink-950)",
              }}
            />
          </div>

          {/* Employee Code + Designation */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Employee Code
              </label>
              <input
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="EMP-001"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors font-mono"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Designation
              </label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Site Engineer"
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
          </div>

          {/* Department + Joining Date */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Department
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              >
                <option value="">Select…</option>
                <option value="Construction">Construction</option>
                <option value="Procurement">Procurement</option>
                <option value="Finance">Finance</option>
                <option value="HR">HR</option>
                <option value="Sales">Sales</option>
                <option value="Administration">Administration</option>
                <option value="Quality">Quality</option>
                <option value="Stores">Stores</option>
              </select>
            </div>
            <div>
              <label
                className="block text-m-caption font-bold mb-0"
                style={{ color: "var(--color-ink-700)" }}
              >
                Joining Date
              </label>
              <input
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "transparent",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-1 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-[0.5rem] border text-m-section font-bold text-m-body press"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-700)",
                backgroundColor: "var(--color-paper)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] h-11 rounded-[0.5rem] text-m-section font-bold text-m-body press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
    </MobileDialog>
  );
}
