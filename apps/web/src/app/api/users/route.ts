import { NextRequest } from "next/server";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM, ALL_ROLES, canAssignRole, type Role } from "@/lib/roles";

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
  const { name, email, role, phone, password, employeeCode, designation, department, joiningDate } = body as {
    name?: string;
    email?: string;
    role?: string;
    phone?: string;
    password?: string;
    employeeCode?: string;
    designation?: string;
    department?: string;
    joiningDate?: string;
  };

  // ── Validate inputs ──
  if (!name || typeof name !== "string" || !name.trim()) {
    return json({ error: "Name is required" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!role || !ALL_ROLES.includes(role as Role)) {
    return json({ error: `Role must be one of: ${ALL_ROLES.join(", ")}` }, { status: 400 });
  }
  // Enforce hierarchical RBAC: actor must be able to assign this role
  if (!canAssignRole(actorRole, role)) {
    return json(
      { error: `You cannot assign the ${role} role — it is at or above your tier.` },
      { status: 403 },
    );
  }

  const defaultPassword = password?.trim() || "nirman123";
  if (defaultPassword.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const hashed = await hashPassword(defaultPassword);
  const normalizedEmail = email.trim().toLowerCase();

  // ── Check if user already exists ──
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, name: true, role: true, active: true },
  });

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
      message: `${existing.name} added to ${company.name} as ${role}.`,
    });
  }

  // ── Create new user + membership + account in one transaction ──
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        name: name.trim(),
        role: role as Role,
        phone: phone?.trim() || null,
        companyId: company.id,
        emailVerified: true,
        employeeCode: employeeCode?.trim() || null,
        designation: designation?.trim() || null,
        department: department?.trim() || null,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
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

  return json({
    id: result.id,
    name: result.name,
    email: result.email,
    role: result.role,
    message: `${result.name} added. They can sign in with ${result.email} and the password you set.`,
  }, { status: 201 });
});
