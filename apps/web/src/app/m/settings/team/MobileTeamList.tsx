"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Phone, ChevronDown, Check, Loader2,
  UserCog, Crown, CircleDot, UserPlus, X, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { ROLES, type Role } from "@/lib/roles";
import { haptic } from "@/lib/haptic";

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
}

interface AssignableRole {
  key: Role;
  label: string;
}

const ROLE_META: Record<Role, { color: string; label: string; icon: typeof Crown }> = {
  OWNER: { color: "var(--color-ink-950)", label: "Owner", icon: Crown },
  ADMIN: { color: "var(--color-steel)", label: "Admin", icon: Shield },
  MANAGER: { color: "var(--color-go)", label: "Manager", icon: UserCog },
  SUPERVISOR: { color: "var(--color-signal)", label: "Supervisor", icon: CircleDot },
  SALES: { color: "var(--color-signal)", label: "Sales", icon: CircleDot },
  ACCOUNTANT: { color: "var(--color-signal)", label: "Accountant", icon: CircleDot },
};

export function MobileTeamList({
  team,
  canManage,
  currentUserId: _currentUserId,
  currentRole: _currentRole,
  roleCounts,
  assignableRoles,
}: {
  team: TeamMember[];
  canManage: boolean;
  currentUserId: string;
  currentRole: string;
  roleCounts: Record<string, number>;
  assignableRoles: AssignableRole[];
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const filtered = search.trim()
    ? team.filter((m) => {
        const q = search.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      })
    : team;

  // Sort: by role tier (OWNER first), then by name
  const sorted = [...filtered].sort((a, b) => {
    const tier = (r: Role) => ROLES[r].key === "OWNER" ? 0 : ROLES[r].key === "ADMIN" ? 1 : ROLES[r].key === "MANAGER" ? 2 : 3;
    return tier(a.role) - tier(b.role) || a.name.localeCompare(b.name);
  });

  const activeCount = team.filter((m) => m.active).length;
  const inactiveCount = team.length - activeCount;

  return (
    <div className="pb-6">
      {/* ── Summary banner ── */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="grid place-items-center size-8 rounded-full shrink-0"
            style={{ backgroundColor: "var(--color-concrete)" }}
          >
            <Shield className="size-4" style={{ color: "var(--color-ink-600)" }} />
          </div>
          <div>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              {team.length} {team.length === 1 ? "member" : "members"}
            </p>
            <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
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
                className="flex items-center gap-1 h-5 px-1.5 rounded-full text-[0.4375rem] font-bold"
                style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 8%, transparent)` }}
              >
                {meta.label}
                <span className="tabular-nums" style={{ opacity: 0.6 }}>{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Permission notice for non-managers ── */}
      {!canManage && (
        <div
          className="rounded-[0.5rem] border p-2.5 mb-3 text-[0.5rem]"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-concrete)",
            color: "var(--color-ink-500)",
          }}
        >
          You have read-only access. Only owners and admins can change roles or deactivate members.
        </div>
      )}

      {/* ── Add member button (managers only) ── */}
      {canManage && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center justify-center gap-1.5 w-full rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press mb-3"
          style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
        >
          <UserPlus className="size-3.5" />
          Add Team Member
        </button>
      )}

      {/* ── Add member form dialog ── */}
      {showAddForm && (
        <AddMemberDialog
          assignableRoles={assignableRoles}
          onClose={() => setShowAddForm(false)}
          onAdded={() => {
            setShowAddForm(false);
            router.refresh();
          }}
        />
      )}

      {/* ── Search ── */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full h-9 rounded-[0.5rem] border px-3 text-[0.6875rem] mb-3 outline-none"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
          color: "var(--color-ink-950)",
        }}
      />

      {/* ── Team list ── */}
      <div className="flex flex-col gap-2">
        {sorted.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            canManage={canManage && !member.isSelf}
            canEditProfile={member.isSelf || (canManage && !member.isSelf)}
            expanded={expandedId === member.id}
            onToggle={() => setExpandedId(expandedId === member.id ? null : member.id)}
            assignableRoles={assignableRoles}
            onChanged={() => {
              setExpandedId(null);
              router.refresh();
            }}
          />
        ))}
      </div>

      {sorted.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-[0.625rem] border py-12 text-center"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <Shield className="size-6 mb-2" style={{ color: "var(--color-ink-300)" }} />
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>No members found</p>
        </div>
      )}

      {/* ── Role reference ── */}
      <p
        className="text-[0.5rem] font-bold uppercase tracking-wide mb-2 mt-5 px-1"
        style={{ color: "var(--color-ink-500)" }}
      >
        Role Permissions
      </p>
      <div className="flex flex-col gap-1.5">
        {(Object.values(ROLES) as typeof ROLES[Role][]).map((r) => {
          const meta = ROLE_META[r.key];
          const Icon = meta.icon;
          const count = roleCounts[r.key] ?? 0;
          return (
            <div
              key={r.key}
              className="rounded-[0.5rem] border p-2.5"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="size-3 shrink-0" style={{ color: meta.color }} />
                <p className="text-[0.6875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
                  {meta.label}
                </p>
                {count > 0 && (
                  <span
                    className="text-[0.4375rem] font-bold tabular-nums ml-auto"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {count} {count === 1 ? "person" : "people"}
                  </span>
                )}
              </div>
              <p className="text-[0.5rem] leading-relaxed" style={{ color: "var(--color-ink-500)" }}>
                {r.description}
              </p>
              <p className="text-[0.4375rem] mt-1" style={{ color: "var(--color-ink-400)" }}>
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
  onChanged,
}: {
  member: TeamMember;
  canManage: boolean;
  canEditProfile: boolean;
  expanded: boolean;
  onToggle: () => void;
  assignableRoles: AssignableRole[];
  onChanged: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
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
    setChanging(true);
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !member.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update status");
      toast.success(`${member.name} ${member.active ? "deactivated" : "activated"}`);
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
        className="w-full text-left p-2.5 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="grid place-items-center size-7 rounded-full shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}
          >
            <Icon className="size-3" style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                {member.name}
              </p>
              {member.isSelf && (
                <span
                  className="text-[0.4375rem] font-bold px-1 py-0.5 rounded"
                  style={{ color: "var(--color-ink-500)", backgroundColor: "var(--color-concrete)" }}
                >
                  You
                </span>
              )}
            </div>
            <p className="text-[0.5rem] truncate" style={{ color: "var(--color-ink-500)" }}>
              {member.email}
            </p>
          </div>
          <span
            className="text-[0.4375rem] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0"
            style={{ color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
          >
            {meta.label}
          </span>
        </div>

        {/* Contact + reports to */}
        <div className="flex items-center gap-3 text-[0.4375rem]" style={{ color: "var(--color-ink-500)" }}>
          {member.phone && (
            <a
              href={`tel:${member.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0.5 press"
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
            <span className="text-[0.4375rem] font-semibold" style={{ color: "var(--color-ink-400)" }}>
              {expanded ? "Tap to close" : canManage ? "Tap to manage" : "Tap to edit"}
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
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
        >
          {/* Edit profile button */}
          {canEditProfile && (
            <button
              onClick={() => setShowEdit(true)}
              className="flex w-full items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-[0.5625rem] font-bold press mb-2"
              style={{
                color: "var(--color-ink-950)",
                backgroundColor: "var(--color-concrete)",
              }}
            >
              <Pencil className="size-3" />
              Edit Profile
            </button>
          )}

          {/* Role change */}
          {canManage && (
            <>
              <p
                className="text-[0.4375rem] font-bold uppercase tracking-wide mb-1.5"
                style={{ color: "var(--color-ink-500)" }}
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
                      className="flex items-center gap-1 h-6 px-2 rounded-[0.25rem] text-[0.4375rem] font-semibold press disabled:opacity-40"
                      style={{
                        color: isCurrent ? "var(--color-paper)" : rMeta.color,
                        backgroundColor: isCurrent ? rMeta.color : `color-mix(in srgb, ${rMeta.color} 8%, transparent)`,
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
                className="flex w-full items-center justify-center gap-1.5 h-8 rounded-[0.375rem] text-[0.5625rem] font-bold press disabled:opacity-50"
                style={{
                  color: member.active ? "var(--color-stop)" : "var(--color-go)",
                  backgroundColor: `color-mix(in srgb, ${member.active ? "var(--color-stop)" : "var(--color-go)"} 8%, transparent)`,
                }}
              >
                {changing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
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
    </div>
  );
}

/* ─── Add Member Dialog ─── */
function AddMemberDialog({
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
  const [role, setRole] = useState<Role>(assignableRoles[0]?.key ?? "MANAGER");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!email.trim()) { toast.error("Email is required"); return; }

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[85vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            Add Team Member
          </p>
          <button
            onClick={onClose}
            className="grid place-items-center size-7 rounded-[0.375rem] press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
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
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Email <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@company.com"
              autoComplete="email"
              enterKeyHint="next"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Phone (optional)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              autoComplete="tel"
              enterKeyHint="next"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Role */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Role <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {assignableRoles.map((r) => {
                const meta = ROLE_META[r.key];
                const isCurrent = r.key === role;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => { setRole(r.key); haptic(10); }}
                    className="flex items-center gap-1 h-8 px-2.5 rounded-[0.375rem] text-[0.5625rem] font-semibold press"
                    style={{
                      color: isCurrent ? "#fff" : meta.color,
                      backgroundColor: isCurrent ? meta.color : `color-mix(in srgb, ${meta.color} 8%, transparent)`,
                      border: isCurrent ? "none" : `1px solid color-mix(in srgb, ${meta.color} 20%, transparent)`,
                    }}
                  >
                    {isCurrent && <Check className="size-3" />}
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Password (optional)
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Default: nirman123"
              enterKeyHint="done"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
            <p className="text-[0.4375rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
              Leave blank to use the default password. The member can change it after signing in.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-1.5 w-full h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 mt-1"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
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
      </div>
    </div>
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[34rem] rounded-t-[1rem] border-t p-4 pb-safe max-h-[85vh] overflow-y-auto"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className="grid place-items-center size-7 rounded-[0.375rem]"
              style={{ backgroundColor: "var(--color-concrete)" }}
            >
              <Pencil className="size-3.5" style={{ color: "var(--color-ink-600)" }} />
            </span>
            <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              Edit Profile
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center size-7 rounded-[0.375rem] press"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Email (read-only) */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Email
            </label>
            <input
              type="email"
              value={member.email}
              disabled
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none opacity-60"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}
            />
            <p className="text-[0.4375rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
              Email cannot be changed.
            </p>
          </div>

          {/* Name */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
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
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Phone (optional)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              autoComplete="tel"
              enterKeyHint="done"
              className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          {/* Submit */}
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-[0.5rem] border text-[0.75rem] font-bold press"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-ink-500)",
                backgroundColor: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] h-11 rounded-[0.5rem] text-[0.75rem] font-bold press disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
