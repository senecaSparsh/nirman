import { allowedScopeTypes, suggestedScopeType, type ScopeChoice } from "@/lib/roles";

export type ScopeEntry = { projectId?: string; departmentId?: string };
export type MemberScopeDraft = { scopeType: ScopeChoice | null; entries: ScopeEntry[] };

/**
 * The draft for a role. A choice the role may hold is kept; anything else
 * resets to the role's suggestion, which is null for company-wide roles so
 * the person has to choose it.
 */
export function draftForRole(scopeRole: string | null | undefined, previous?: MemberScopeDraft): MemberScopeDraft {
  if (previous?.scopeType && allowedScopeTypes(scopeRole).includes(previous.scopeType)) return previous;
  const suggested = suggestedScopeType(scopeRole);
  return { scopeType: suggested, entries: suggested && suggested !== "COMPANY" ? [{}] : [] };
}

/** The scope a membership is saved with, or null while the choice is still incomplete. */
export function scopePayload(draft: MemberScopeDraft): { scopeType: ScopeChoice; scopeEntries: ScopeEntry[] } | null {
  if (!draft.scopeType) return null;
  if (draft.scopeType === "COMPANY") return { scopeType: "COMPANY", scopeEntries: [] };
  const key = draft.scopeType === "PROJECT" ? "projectId" : "departmentId";
  const ids = [...new Set(draft.entries.map((e) => e[key]).filter((id): id is string => !!id))];
  if (!ids.length) return null;
  return { scopeType: draft.scopeType, scopeEntries: ids.map((id): ScopeEntry => ({ [key]: id })) };
}
