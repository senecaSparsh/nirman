import { delegableApprovalPermissions, effectivePermissions, normalizeRole } from "@/lib/roles";

export type AccessSource =
  | { kind: "ROLE"; role: string; label: string }
  | { kind: "GRANT" }
  | { kind: "DELEGATION"; from: string; endsAt: string }
  | { kind: "PROJECT_HAT"; projectId: string; projectName: string; role: string };

export type SourcedPermissions = { source: AccessSource; permissions: string[] };

export type AccessExplanation = { global: boolean; projects: string[]; via: AccessSource[] };

export function explainPermission(permission: string, sources: SourcedPermissions[]): AccessExplanation {
  const hits = sources.filter((s) => s.permissions.includes(permission));
  return {
    global: hits.some((s) => s.source.kind !== "PROJECT_HAT"),
    projects: [...new Set(hits.flatMap((s) => (s.source.kind === "PROJECT_HAT" ? [s.source.projectId] : [])))],
    via: hits.map((s) => s.source),
  };
}

export function globalPermissions(sources: SourcedPermissions[]): string[] {
  return [...new Set(sources.filter((s) => s.source.kind !== "PROJECT_HAT").flatMap((s) => s.permissions))];
}

export function membershipSources(input: {
  role: string;
  label: string;
  rolePermissions: string[];
  grants: string[];
  delegations: { from: string; endsAt: string }[];
  projectHats: { projectId: string; projectName: string; role: string }[];
}): SourcedPermissions[] {
  const sources: SourcedPermissions[] = [
    { source: { kind: "ROLE", role: input.role, label: input.label }, permissions: input.rolePermissions },
  ];
  if (input.grants.length > 0) sources.push({ source: { kind: "GRANT" }, permissions: input.grants });
  for (const d of input.delegations) {
    sources.push({ source: { kind: "DELEGATION", from: d.from, endsAt: d.endsAt }, permissions: delegableApprovalPermissions() });
  }
  for (const h of input.projectHats) {
    sources.push({
      source: { kind: "PROJECT_HAT", projectId: h.projectId, projectName: h.projectName, role: h.role },
      permissions: effectivePermissions(normalizeRole(h.role), []),
    });
  }
  return sources;
}
