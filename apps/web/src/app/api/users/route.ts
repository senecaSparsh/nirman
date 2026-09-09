import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM, ALL_ROLES, canAssignRole, isCustomRole, canAssignCustomRole, type Role } from "@/lib/roles";
import { withSerializableTransaction } from "@nirman/services";
import { normalizePhone } from "@/lib/phone-otp";

/**
 * GET /api/users — list users scoped to the active company (for task
 * assignment dropdowns). Returns id, name, email, role, active, designation, employeeCode.
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const users = await prisma.user.findMany({
    where: { memberships: { some: { companyId: company.id } }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, role: true, active: true, designation: true, employeeCode: true, department: true },
  });
  return json(users);
});

/**
 * POST /api/users — create a new team member and add them to the active
 * company.
 *
 * Body: { name, email, role, phone?, password? }
 *
 * Creates:
 *   1. A User row (with the given role + email)
 *   2. A UserCompany membership linking them to the active company
 *   3. A credential Account with the password (hashed) so they can sign in
 *
 * Hierarchical RBAC: the actor can only assign roles at or below their
 * own tier (enforced via canAssignRole). The last-OWNER guard is not
 * relevant here (we're adding, not demoting).
 *
 * If a user with the email already exists:
 *   - If they're already a member of this company → 409 conflict
 *   - If they're not a member → add them as a member (don't recreate the
 *     user or account; update their role if the actor is above them)
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const actorRole = session.role;

  const body = await req.json();
  const { name, email, role, phone, password, employeeCode, designation, department, joiningDate, employmentEndDate, mustChangePassword, employeeId } = body as {
    name?: string;
    email?: string;
    role?: string;
    phone?: string;
    password?: string;
    employeeCode?: string;
    designation?: string;
    department?: string;
    joiningDate?: string;
    employmentEndDate?: string;
    mustChangePassword?: boolean;
    employeeId?: string;
  };

  // ── Validate inputs ──
  if (!name || typeof name !== "string" || !name.trim()) {
    return json({ error: "Name is required" }, { status: 400 });
  }
  // Email is optional if phone is provided (phone-based login).
  // If email is provided, it must be valid. If neither email nor phone is
  // provided, we can't create a loginable account.
  const normalizedEmail = email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!normalizedEmail && !phone?.trim()) {
    return json({ error: "Either an email or a phone number is required for login." }, { status: 400 });
  }
  // Validate role — either a built-in role or a custom role in this company
  const roleIsCustom = isCustomRole(role);
  if (!role) {
    return json({ error: "Role is required" }, { status: 400 });
  }
  if (!roleIsCustom && !ALL_ROLES.includes(role as Role)) {
    return json({ error: `Role must be one of: ${ALL_ROLES.join(", ")}` }, { status: 400 });
  }
  // Enforce hierarchical RBAC: actor must be able to assign this role
  if (roleIsCustom) {
    // Look up the custom role's tier
    const customRole = await prisma.customRole.findFirst({
      where: { companyId: company.id, key: role },
      select: { tier: true },
    }).catch(() => null);
    if (!customRole) {
      return json({ error: "Custom role not found in this company" }, { status: 400 });
    }
    if (!canAssignCustomRole(actorRole, customRole.tier)) {
      return json(
        { error: `You cannot assign the ${role} role — it is at or above your tier.` },
        { status: 403 },
      );
    }
  } else if (!canAssignRole(actorRole, role)) {
    return json(
      { error: `You cannot assign the ${role} role — it is at or above your tier.` },
      { status: 403 },
    );
  }

  // ── Password policy ──
  const minLength = company.passwordMinLength ?? 8;
  const defaultPassword = password?.trim() || "nirman123";
  if (defaultPassword.length < minLength) {
    return json({ error: `Password must be at least ${minLength} characters` }, { status: 400 });
  }

  const hashed = await hashPassword(defaultPassword);
  const normalizedPhone = phone?.trim() ? normalizePhone(phone) : null;

  // ── Check if user already exists (by email OR by phone) ──
  // This implements the duplicate detection from the design doc:
  // if a user with the same phone (or email) already exists, offer to add
  // a UserCompany membership instead of creating a duplicate User.
  let existing = null as null | { id: string; name: string; role: string; active: boolean };

  if (normalizedEmail) {
    existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, role: true, active: true },
    });
  }

  // If not found by email, try by phone (Shape A: same person, different company)
  if (!existing && normalizedPhone) {
    existing = await prisma.user.findFirst({
      where: { phoneNormalized: normalizedPhone, active: true },
      select: { id: true, name: true, role: true, active: true },
    });
  }

  if (existing) {
    // Check if already a member of this company
    const existingMembership = await prisma.userCompany.findFirst({
      where: { userId: existing.id, companyId: company.id },
      select: { id: true, role: true },
    });
    if (existingMembership) {
      return json(
        { error: `${existing.name} is already a member of this company.` },
        { status: 409 },
      );
    }
    // Add as a member (don't recreate user/account)
    await prisma.userCompany.create({
      data: { userId: existing.id, companyId: company.id, role: role as Role },
    });
    return json({
      id: existing.id,
      name: existing.name,
      email: normalizedEmail,
      role,
      message: `${existing.name} added to ${company.name} as ${role}. Their existing login credentials remain unchanged.`,
    });
  }

  // ── Create new user + membership + account in one transaction ──
  // For phone-based accounts without an email, generate a placeholder email
  // (Better-Auth requires a unique email). The phone number is the real login ID.
  const finalEmail = normalizedEmail ?? `phone+${normalizedPhone}@nirman.internal`;

  const result = await withSerializableTransaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: finalEmail,
        name: name.trim(),
        role: role as Role,
        phone: phone?.trim() || null,
        phoneNormalized: normalizedPhone,
        companyId: company.id,
        emailVerified: true,
        employeeCode: employeeCode?.trim() || null,
        designation: designation?.trim() || null,
        department: department?.trim() || null,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        employmentEndDate: employmentEndDate ? new Date(employmentEndDate) : null,
        mustChangePassword: mustChangePassword !== false, // default true
      },
      select: { id: true, name: true, email: true, role: true },
    });

    await tx.userCompany.create({
      data: { userId: user.id, companyId: company.id, role: role as Role },
    });

    // Create credential account for sign-in
    await tx.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashed,
      },
    });

    return user;
  });

  // ── Dedup detection: if the new user's phone/email matches an existing
  //    unlinked Employee in this company, auto-link them so the Employee
  //    gets a login account without duplication. ──
  let autoLinkedEmployee: { id: string; name: string } | null = null;

  // Explicit employeeId takes priority (from the employee profile provision flow)
  if (employeeId) {
    const targetEmployee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
      select: { id: true, name: true, userId: true },
    });
    if (targetEmployee && !targetEmployee.userId) {
      await prisma.employee.update({
        where: { id: targetEmployee.id },
        data: { userId: result.id },
      });
      autoLinkedEmployee = { id: targetEmployee.id, name: targetEmployee.name };
    }
  }

  // Fall back to phone-based auto-linking if no explicit employeeId was provided
  if (!autoLinkedEmployee && normalizedPhone) {
    const matchingEmployee = await prisma.employee.findFirst({
      where: {
        companyId: company.id,
        deletedAt: null,
        userId: null,
        // Match by phone (last 10 digits, ignoring formatting)
        phone: { contains: normalizedPhone.slice(-4) },
        ...await scopeWhere("Employee"),
      },
      select: { id: true, name: true, phone: true },
    });
    if (matchingEmployee && matchingEmployee.phone) {
      const empDigits = matchingEmployee.phone.replace(/\D/g, "").slice(-10);
      if (empDigits === normalizedPhone.slice(-10)) {
        await prisma.employee.update({
          where: { id: matchingEmployee.id },
          data: { userId: result.id },
        });
        autoLinkedEmployee = { id: matchingEmployee.id, name: matchingEmployee.name };
      }
    }
  }

  const loginHint = normalizedPhone
    ? `phone number ${phone} and the password you set`
    : `email ${result.email} and the password you set`;

  // Revalidate employee pages if we linked to an employee
  if (autoLinkedEmployee) {
    revalidatePath(`/m/hr/employees/${autoLinkedEmployee.id}`);
  }
  revalidatePath("/m/hr/employees");

  return json({
    id: result.id,
    name: result.name,
    email: result.email,
    role: result.role,
    ...(autoLinkedEmployee ? { autoLinkedEmployee } : {}),
    message: `${result.name} added. They can sign in with ${loginHint}.${mustChangePassword !== false ? " They will be asked to set a new password on first login." : ""}${autoLinkedEmployee ? ` Auto-linked to employee record: ${autoLinkedEmployee.name}.` : ""}`,
  }, { status: 201 });
});
