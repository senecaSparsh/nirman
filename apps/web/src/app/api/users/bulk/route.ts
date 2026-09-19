import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@nirman/db";
import { apiHandler, canManageRole, getActingRole, getCompany, json, requirePermission } from "@/lib/server";
import { defaultScopeType } from "@nirman/services";
import { PERM, ALL_ROLES, type Role } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";

/**
 * Generate a random temporary password for bulk import.
 * All bulk-imported users get the same temp password (simpler for
 * the admin to communicate) but it's random per import, not hardcoded.
 */
function generateTempPassword(minLength: number = 8): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(Math.max(minLength, 8));
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

/**
 * POST /api/users/bulk — create multiple team members at once.
 *
 * Body: { users: [{ name, email, role, phone?, employeeCode?, designation?, department?, joiningDate? }] }
 *
 * Each user is created independently — if one fails, the rest still succeed.
 * Returns a per-user result array: { row, success, error?, userId? }
 *
 * Hierarchical RBAC: the actor can only assign roles at or below their tier.
 * Users that already exist (by email) are added as members instead of duplicated.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const actorRole = await getActingRole();
  // Department name → id map for auto-scoping DEPARTMENT-default roles.
  const deptByName = new Map(
    (await prisma.department.findMany({ where: { companyId: company.id }, select: { id: true, name: true } }))
      .map((d) => [d.name.trim().toLowerCase(), d.id]),
  );

  /**
   * Resolve the membership's scopeType the same way assignScopedMembership
   * does — custom roles resolve via their baseRole (scratch → SUPERVISOR →
   * PROJECT). Bulk rows carry no scope entries beyond an optional
   * department name, so scoped roles land fail-closed (see nothing until an
   * admin assigns scope explicitly).
   */
  async function bulkScopeType(role: string): Promise<"COMPANY" | "DEPARTMENT" | "PROJECT"> {
    let r = role;
    if (r.startsWith("CUSTOM_")) {
      const cr = await prisma.customRole
        .findFirst({ where: { companyId: company.id, key: r }, select: { baseRole: true } })
        .catch(() => null);
      r = cr?.baseRole ?? "SUPERVISOR";
    }
    return defaultScopeType(r);
  }

  /** Persist membership + optional auto-derived department scope row. */
  async function createMembership(userId: string, role: string, secondaryRoles: string[], departmentName?: string) {
    const scopeType = await bulkScopeType(role);
    const membership = await prisma.userCompany.create({
      data: { userId, companyId: company.id, role: role as Role, secondaryRoles, scopeType },
    });
    if (scopeType === "DEPARTMENT" && departmentName) {
      const deptId = deptByName.get(departmentName.trim().toLowerCase());
      if (deptId) {
        await prisma.userScope.create({
          data: { userCompanyId: membership.id, scopeKind: "DEPARTMENT", departmentId: deptId },
        });
      }
    }
  }
  const minLength = company.passwordMinLength ?? 8;
  const defaultPassword = generateTempPassword(minLength);

  const body = await req.json();
  const { users } = body as {
    users?: Array<{
      name?: string;
      email?: string;
      role?: string;
      secondaryRoles?: string[];
      phone?: string;
      employeeCode?: string;
      designation?: string;
      department?: string;
      joiningDate?: string;
    }>;
  };

  if (!Array.isArray(users) || users.length === 0) {
    return json({ error: "No users provided" }, { status: 400 });
  }

  if (users.length > 500) {
    return json({ error: "Maximum 500 users per bulk import" }, { status: 400 });
  }

  const hashed = await hashPassword(defaultPassword);
  const results: Array<{ row: number; name: string; success: boolean; error?: string; userId?: string; added?: boolean }> = [];

  for (let i = 0; i < users.length; i++) {
    const row = users[i];
    if (!row) continue;
    const rowNum = i + 1;

    // Validate name
    if (!row.name?.trim()) {
      results.push({ row: rowNum, name: row.name || "(empty)", success: false, error: "Name is required" });
      continue;
    }

    // Validate email
    const normalizedEmail = row.email?.trim().toLowerCase() || null;
    if (!normalizedEmail && !row.phone?.trim()) {
      results.push({ row: rowNum, name: row.name, success: false, error: "Email or phone required" });
      continue;
    }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      results.push({ row: rowNum, name: row.name, success: false, error: "Invalid email format" });
      continue;
    }

    // Validate role — built-in key or a CUSTOM_* key that exists in this
    // company (canManageRole resolves the custom role's stored tier).
    const role = row.role?.trim().toUpperCase() || "SUPERVISOR";
    if (!ALL_ROLES.includes(role as Role) && !role.startsWith("CUSTOM_")) {
      results.push({ row: rowNum, name: row.name, success: false, error: `Invalid role: ${role}` });
      continue;
    }

    // Check hierarchy — same rule as the single-user path: the actor's
    // worn hat must sit above the target role (custom roles included).
    if (!(await canManageRole(actorRole, role, company.id))) {
      results.push({ row: rowNum, name: row.name, success: false, error: `You cannot assign the ${role} role` });
      continue;
    }

    // Multi-role: validate each additional hat — built-in or custom, each
    // must independently pass the tier check.
    const extraRoles = [...new Set((row.secondaryRoles ?? []).map((r) => r?.trim().toUpperCase()).filter((r): r is string => !!r))].filter((r) => r !== role).slice(0, 8);
    const badExtra = extraRoles.find((sr) => !ALL_ROLES.includes(sr as Role) && !sr.startsWith("CUSTOM_"));
    if (badExtra) {
      results.push({ row: rowNum, name: row.name, success: false, error: `Invalid role: ${badExtra}` });
      continue;
    }
    let unassignableExtra: string | null = null;
    for (const sr of extraRoles) {
      if (!(await canManageRole(actorRole, sr, company.id))) {
        unassignableExtra = sr;
        break;
      }
    }
    if (unassignableExtra) {
      results.push({ row: rowNum, name: row.name, success: false, error: `You cannot assign the ${unassignableExtra} role` });
      continue;
    }

    const normalizedPhone = row.phone?.trim() ? normalizePhone(row.phone) : null;

    try {
      // Check if user already exists
      let existing = null as null | { id: string; name: string; isHidden: boolean };
      if (normalizedEmail) {
        existing = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, name: true, isHidden: true },
        });
      }
      if (!existing && normalizedPhone) {
        existing = await prisma.user.findFirst({
          where: { phoneNormalized: normalizedPhone, active: true },
          select: { id: true, name: true, isHidden: true },
        });
      }

      if (existing?.isHidden) {
        // Never auto-add a ghost account to a company or echo its identity —
        // generic failure preserves the hidden invariant.
        results.push({ row: rowNum, name: row.name, success: false, error: "A user with these credentials already exists" });
        continue;
      }

      if (existing) {
        // Check if already a member
        const existingMembership = await prisma.userCompany.findFirst({
          where: { userId: existing.id, companyId: company.id },
          select: { id: true },
        });
        if (existingMembership) {
          results.push({ row: rowNum, name: row.name, success: false, error: "Already a member of this company", userId: existing.id });
          continue;
        }
        // Add as member — explicit scopeType so the membership shape
        // matches the single-user path (assignScopedMembership).
        await createMembership(existing.id, role, extraRoles, row.department);
        results.push({ row: rowNum, name: row.name, success: true, userId: existing.id, added: true });
        continue;
      }

      // Create new user
      const finalEmail = normalizedEmail ?? `phone+${normalizedPhone}@nirman.internal`;

      const user = await prisma.user.create({
        data: {
          email: finalEmail,
          name: row.name.trim(),
          role: role as Role,
          phone: row.phone?.trim() || null,
          phoneNormalized: normalizedPhone,
          companyId: company.id,
          emailVerified: true,
          employeeCode: row.employeeCode?.trim() || null,
          designation: row.designation?.trim() || null,
          department: row.department?.trim() || null,
          joiningDate: row.joiningDate ? new Date(row.joiningDate) : null,
          mustChangePassword: true, // force password change on first login
        },
        select: { id: true, name: true },
      });

      await createMembership(user.id, role, extraRoles, row.department);

      await prisma.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hashed,
        },
      });

      results.push({ row: rowNum, name: row.name, success: true, userId: user.id, added: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Database error";
      results.push({ row: rowNum, name: row.name, success: false, error: message });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  return json({
    total: results.length,
    succeeded,
    failed,
    results,
    defaultPassword,
  });
});
