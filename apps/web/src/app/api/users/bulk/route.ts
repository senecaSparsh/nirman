import { NextRequest } from "next/server";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM, ALL_ROLES, canAssignRole, type Role } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";

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
  const session = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const actorRole = session.role;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const minLength = company.passwordMinLength ?? 8;
  const defaultPassword = "nirman123";

  const body = await req.json();
  const { users } = body as {
    users?: Array<{
      name?: string;
      email?: string;
      role?: string;
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

    // Validate role
    const role = row.role?.trim().toUpperCase() || "SUPERVISOR";
    if (!ALL_ROLES.includes(role as Role)) {
      results.push({ row: rowNum, name: row.name, success: false, error: `Invalid role: ${role}` });
      continue;
    }

    // Check hierarchy
    if (!canAssignRole(actorRole, role)) {
      results.push({ row: rowNum, name: row.name, success: false, error: `You cannot assign the ${role} role` });
      continue;
    }

    const normalizedPhone = row.phone?.trim() ? normalizePhone(row.phone) : null;

    try {
      // Check if user already exists
      let existing = null as null | { id: string; name: string };
      if (normalizedEmail) {
        existing = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, name: true },
        });
      }
      if (!existing && normalizedPhone) {
        existing = await prisma.user.findFirst({
          where: { phoneNormalized: normalizedPhone, active: true },
          select: { id: true, name: true },
        });
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
        // Add as member
        await prisma.userCompany.create({
          data: { userId: existing.id, companyId: company.id, role: role as Role },
        });
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
          mustChangePassword: false, // admin manages passwords
        },
        select: { id: true, name: true },
      });

      await prisma.userCompany.create({
        data: { userId: user.id, companyId: company.id, role: role as Role },
      });

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
