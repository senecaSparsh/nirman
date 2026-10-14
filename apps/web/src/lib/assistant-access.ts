import { holdsPermission, isCustomRole, normalizeRole, ROLES, type Role } from "@/lib/roles";

export type AssistantCaps = {
  role: Role;
  rawRole: string;
  label: string;
  can: (permission: string) => boolean;
};

export function assistantCaps(input: { rawRole?: string | null; label?: string; permissions: string[] }): AssistantCaps {
  const rawRole = input.rawRole ?? "SUPERVISOR";
  const role = normalizeRole(rawRole);
  const fallbackLabel = isCustomRole(rawRole) ? "Custom role" : (ROLES[role]?.label ?? rawRole);
  return {
    role,
    rawRole,
    label: input.label ?? fallbackLabel,
    can: (permission) => holdsPermission(rawRole, permission, input.permissions),
  };
}
