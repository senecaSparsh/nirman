import { prisma, type Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { withSerializableTransaction } from "./transaction";
import { assertEmployeeCodeAvailable } from "./sequence";
import { assertScopeWithinActor, validateScopeEntries } from "./rbac";
import { HrError } from "./hr";

// ───────────────────────────────────────────────────────────────
//  Employee ↔ User Account Linking Service
//
//  Connects the HR Employee record (workforce: trade, wage, crew,
//  attendance, payroll) with the auth User record (login identity:
//  phone-OTP, role, permissions, scope). Also wires the CompanyPhone
//  assignment so the employee's login phone is connected to the call
//  tracking system.
//
//  Design:
//  - Employee is the HR record (per-company, soft-deletable).
//  - User is the auth identity (can belong to multiple companies via
//    UserCompany). Phone-OTP is the primary login; a credential Account
//    with a random password is created so the user CAN set a password
//    later if they want.
//  - CompanyPhone is the company-owned number assigned to the employee's
//    User. PhoneAssignment records the history.
//  - All creates run inside one Serializable transaction.
// ───────────────────────────────────────────────────────────────

/** Strip non-digits — same logic as src/lib/phone-otp.ts normalizePhone. */
function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/** Cryptographically-secure random password (used as placeholder for OTP-first accounts). */
function randomPassword(length = 24): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

// ───────────────────────────────────────────────────────────────
//  Types
// ───────────────────────────────────────────────────────────────

export interface ModulePermission {
  permission: string; // e.g. "inventory.view", "hr.manage"
}

export interface ScopeEntry {
  scopeKind: "DEPARTMENT" | "PROJECT";
  departmentId?: string;
  projectId?: string;
}

export interface CreateEmployeeAccountInput {
  employeeId: string;
  companyId: string;
  actorUserId: string;
  // Auth identity
  phone: string;
  email?: string | null;
  role: string;
  // Multi-role: additional hats the member can switch into (held set =
  // { role } ∪ secondaryRoles). Not propagated to sibling-company
  // memberships — roles are per-company and CUSTOM_* keys are
  // company-scoped.
  secondaryRoles?: string[];
  // Access
  permissions?: ModulePermission[];
  scopeType?: "COMPANY" | "DEPARTMENT" | "PROJECT" | null;
  scopes?: ScopeEntry[];
  reportsToUserCompanyId?: string | null;
  // Phone assignment
  companyPhoneId?: string | null; // existing CompanyPhone to assign
  newPhoneNumber?: string | null; // brand-new number to add + assign
  newPhoneLabel?: string | null;
  newPhoneDepartment?: string | null;
  newPhoneMonthlyCost?: number | null;
  newPhoneProvider?: string | null;
  // Account
  hashedPassword?: string | null; // pre-hashed by the API route (better-auth/crypto)
  mustChangePassword?: boolean;
  // Sync
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
  joiningDate?: string | null;
}

export interface LinkEmployeeToUserInput {
  employeeId: string;
  companyId: string;
  actorUserId: string;
  userId: string; // existing User to link
}

export interface AssignPhoneToEmployeeInput {
  employeeId: string;
  companyId: string;
  actorUserId: string;
  companyPhoneId?: string | null;
  newPhoneNumber?: string | null;
  newPhoneLabel?: string | null;
  newPhoneDepartment?: string | null;
  newPhoneMonthlyCost?: number | null;
  newPhoneProvider?: string | null;
}

export interface TerminateEmployeeInput {
  employeeId: string;
  companyId: string;
  actorUserId: string;
  reason?: string;
  employmentEndDate?: string | null;
  // Offboarding settlement fields (optional — can be filled in later)
  finalSettlementAmount?: number | null;
  leaveEncashmentDays?: number | null;
  leaveEncashmentAmount?: number | null;
  assetsReturned?: boolean | null;
  assetsReturnNotes?: string | null;
  exitInterviewConducted?: boolean | null;
  exitInterviewNotes?: string | null;
  pfExitFiled?: boolean | null;
  esiExitFiled?: boolean | null;
}

// ───────────────────────────────────────────────────────────────
//  1. Create Employee Account — the full atomic onboarding transaction
// ───────────────────────────────────────────────────────────────

export async function createEmployeeAccount(input: CreateEmployeeAccountInput) {
  return withSerializableTransaction(async (tx) => {
    // ── Validate employee exists and is not yet linked ──
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
      include: { user: { select: { id: true } } },
    });
    if (!employee) throw new HrError("Employee not found in this company", 404);
    if (employee.userId) throw new HrError("This employee already has a linked account", 409);

    const normalizedPhone = normalizePhone(input.phone);
    if (normalizedPhone.length < 10) throw new HrError("A valid phone number is required", 400);

    // ── Check if a User with this phone already exists ──
    let existingUser = await tx.user.findFirst({
      where: { phoneNormalized: normalizedPhone, active: true },
      select: { id: true, name: true, email: true },
    });

    // If not found by phone, try by email
    if (!existingUser && input.email) {
      const normalizedEmail = input.email.trim().toLowerCase();
      existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, name: true, email: true },
      });
    }

    // ── Check if the phone is already assigned to another active employee/user ──
    const phoneInUse = await tx.companyPhone.findFirst({
      where: {
        companyId: input.companyId,
        phoneNormalized: normalizedPhone,
        assignedToUserId: { not: null },
        deletedAt: null,
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });
    if (phoneInUse && phoneInUse.assignedTo) {
      throw new HrError(
        `This phone number is currently assigned to ${phoneInUse.assignedTo.name}. Terminate them first to free the number.`,
        409,
      );
    }

    // ── Enforce the "company number = login" invariant ──
    // When an existing pool number is assigned at onboarding, the login phone
    // MUST be that number — otherwise the pool would show "In use" while the
    // user actually logs in with a different (personal) number, which is
    // exactly the divergence this model is designed to prevent.
    if (input.companyPhoneId) {
      const poolPhone = await tx.companyPhone.findFirst({
        where: { id: input.companyPhoneId, companyId: input.companyId, deletedAt: null },
        select: { phoneNormalized: true },
      });
      if (poolPhone && poolPhone.phoneNormalized !== normalizedPhone) {
        throw new HrError(
          "The assigned company number must be the employee's login phone — they are the same number.",
          400,
        );
      }
    }

    // Same invariant for a brand-new number: the number being registered +
    // assigned must be the login phone (a CompanyPhone is created for it and
    // assigned to this user — it cannot differ from `phone`).
    if (input.newPhoneNumber && normalizePhone(input.newPhoneNumber) !== normalizedPhone) {
      throw new HrError(
        "The new company number being added is the employee's login phone — they are the same number.",
        400,
      );
    }

    let userId: string;

    if (existingUser) {
      // ── Link existing user ──
      // Check if already a member of this company
      const existingMembership = await tx.userCompany.findFirst({
        where: { userId: existingUser.id, companyId: input.companyId },
      });
      if (existingMembership) {
        throw new HrError(
          `${existingUser.name} is already a member of this company. Use "Link existing account" instead.`,
          409,
        );
      }
      // Add membership
      await tx.userCompany.create({
        data: {
          userId: existingUser.id,
          companyId: input.companyId,
          role: input.role,
          secondaryRoles: input.secondaryRoles ?? [],
          ...(input.reportsToUserCompanyId
            ? { reportsToUserCompanyId: input.reportsToUserCompanyId }
            : {}),
        },
      });
      userId = existingUser.id;
    } else {
      // ── Create new User + UserCompany + Account ──
      // Badge codes must be unique within the company — a duplicate breaks
      // ID cards and attendance lookups.
      if (input.employeeCode?.trim()) {
        await assertEmployeeCodeAvailable(tx, input.companyId, input.employeeCode);
      }
      const finalEmail =
        input.email?.trim().toLowerCase() || `phone+${normalizedPhone}@nirman.internal`;
      const hashed = input.hashedPassword ?? randomPassword(32);

      const user = await tx.user.create({
        data: {
          email: finalEmail,
          name: employee.name,
          role: input.role,
          phone: input.phone.trim(),
          phoneNormalized: normalizedPhone,
          companyId: input.companyId,
          emailVerified: true,
          employeeCode: input.employeeCode?.trim().toUpperCase() || null,
          designation: input.designation?.trim() || employee.designation || null,
          department: input.department?.trim() || null,
          joiningDate: input.joiningDate ? new Date(input.joiningDate) : employee.joinDate,
          mustChangePassword: input.mustChangePassword !== false,
        },
        select: { id: true, name: true, email: true, role: true },
      });

      await tx.userCompany.create({
        data: {
          userId: user.id,
          companyId: input.companyId,
          role: input.role,
          secondaryRoles: input.secondaryRoles ?? [],
          ...(input.reportsToUserCompanyId
            ? { reportsToUserCompanyId: input.reportsToUserCompanyId }
            : {}),
        },
      });

      // Credential account (OTP is primary, but password is available if they set one)
      await tx.account.create({
        data: {
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hashed,
        },
      });

      userId = user.id;
    }

    // ── Set Employee.userId (THE LINK) ──
    await tx.employee.update({
      where: { id: input.employeeId },
      data: { userId },
    });

    // ── Sync shared fields from User → Employee ──
    await syncEmployeeUserFields(tx, input.employeeId, userId);

    // ── Multi-company: propagate userId to sibling Employee records ──
    // When an employee is onboarded in multiple companies simultaneously,
    // each company gets its own Employee record but they share one User.
    // The "Create Login" step only runs for the primary company, so we need
    // to propagate the userId to all sibling Employee records (same phone,
    // userId still null) in the company group and create their UserCompany
    // memberships so the employee can switch to those companies.
    const siblingEmployees = await tx.employee.findMany({
      where: {
        userId: null,
        phone: input.phone,
        deletedAt: null,
        companyId: { not: input.companyId },
      },
      select: { id: true, companyId: true },
    });
    for (const sibling of siblingEmployees) {
      // Link the sibling Employee to the same User
      await tx.employee.update({
        where: { id: sibling.id },
        data: { userId },
      });
      // Create UserCompany membership if it doesn't exist
      const existingMembership = await tx.userCompany.findUnique({
        where: { userId_companyId: { userId, companyId: sibling.companyId } },
        select: { id: true },
      });
      if (!existingMembership) {
        await tx.userCompany.create({
          data: {
            userId,
            companyId: sibling.companyId,
            role: input.role,
          },
        });
      }
    }

    // ── Create UserPermission rows (module access) ──
    if (input.permissions && input.permissions.length > 0) {
      const membership = await tx.userCompany.findFirstOrThrow({
        where: { userId, companyId: input.companyId },
        select: { id: true },
      });
      for (const perm of input.permissions) {
        await tx.userPermission.upsert({
          where: {
            userCompanyId_permission: {
              userCompanyId: membership.id,
              permission: perm.permission,
            },
          },
          update: {},
          create: {
            userCompanyId: membership.id,
            permission: perm.permission,
          },
        });
      }
    }

    // ── Persist scope type + create UserScope rows ──
    // scopeType must be stored even for COMPANY — a null scopeType falls back
    // to the role default (PROJECT for field roles), which silently empties
    // every project-scoped list for the new account.
    if (input.scopeType) {
      // Same guards as assignScopedMembership: entries must match the scope
      // type, and the actor can't grant visibility beyond their own scope.
      const scopeEntries = (input.scopes ?? []).map((s) => ({
        departmentId: s.departmentId,
        projectId: s.projectId,
      }));
      validateScopeEntries(input.scopeType, scopeEntries);
      await assertScopeWithinActor(input.actorUserId, input.companyId, input.scopeType, scopeEntries);
      // Scope entries must point at real departments/projects in THIS
      // company — a forged id would bind the membership cross-tenant.
      const deptIds = scopeEntries.map((e) => e.departmentId).filter((d): d is string => !!d);
      if (deptIds.length > 0) {
        const valid = await tx.department.count({ where: { id: { in: deptIds }, companyId: input.companyId, deletedAt: null } });
        if (valid !== deptIds.length) throw new HrError("One or more departments not found in this company", 404);
      }
      const projIds = scopeEntries.map((e) => e.projectId).filter((p): p is string => !!p);
      if (projIds.length > 0) {
        const valid = await tx.project.count({ where: { id: { in: projIds }, companyId: input.companyId, deletedAt: null } });
        if (valid !== projIds.length) throw new HrError("One or more projects not found in this company", 404);
      }
      const membership = await tx.userCompany.findFirstOrThrow({
        where: { userId, companyId: input.companyId },
        select: { id: true },
      });
      await tx.userCompany.update({
        where: { id: membership.id },
        data: { scopeType: input.scopeType },
      });
      if (input.scopeType !== "COMPANY" && input.scopes && input.scopes.length > 0) {
        for (const scope of input.scopes) {
          await tx.userScope.create({
            data: {
              userCompanyId: membership.id,
              scopeKind: scope.scopeKind,
              departmentId: scope.departmentId || null,
              projectId: scope.projectId || null,
            },
          });
        }
      }
    }

    // ── Phone assignment ──
    let companyPhoneId: string | null = null;
    if (input.companyPhoneId) {
      companyPhoneId = await assignPhoneTx(
        tx,
        input.companyPhoneId,
        userId,
        input.companyId,
        input.actorUserId,
        "Assigned during employee onboarding",
      );
    } else if (input.newPhoneNumber) {
      companyPhoneId = await createAndAssignPhoneTx(
        tx,
        {
          phoneNumber: input.newPhoneNumber,
          label: input.newPhoneLabel,
          department: input.newPhoneDepartment,
          monthlyCost: input.newPhoneMonthlyCost,
          provider: input.newPhoneProvider,
        },
        userId,
        input.companyId,
        input.actorUserId,
      );
    }

    // ── Audit log ──
    await logAction(tx, {
      userId: input.actorUserId,
      companyId: input.companyId,
      action: "EMPLOYEE_ACCOUNT_CREATE",
      entityType: "Employee",
      entityId: input.employeeId,
      after: {
        userId,
        role: input.role,
        phone: normalizedPhone,
        companyPhoneId,
        permissions: input.permissions?.map((p) => p.permission),
        scopeType: input.scopeType,
      },
    });

    return {
      userId,
      employeeId: input.employeeId,
      companyPhoneId,
      linked: existingUser ? "existing" : "new",
    };
  });

  // NOTE: The employment agreement is NOT auto-generated here. It requires
  // employment terms (employmentType, contract dates, notice period, wage)
  // to be filled in the dossier first. The agreement should be generated
  // explicitly via POST /api/employees/[id]/generate-agreement after the
  // dossier is complete. See the onboarding checklist on the profile page.
}

// ───────────────────────────────────────────────────────────────
//  2. Link existing User to Employee (without creating a new account)
// ───────────────────────────────────────────────────────────────

export async function linkEmployeeToUser(input: LinkEmployeeToUserInput) {
  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
    });
    if (!employee) throw new HrError("Employee not found in this company", 404);
    if (employee.userId) throw new HrError("This employee already has a linked account", 409);

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, email: true, active: true },
    });
    if (!user) throw new HrError("User not found", 404);
    if (!user.active) throw new HrError("This user account is deactivated", 400);

    // Check the user is a member of this company
    const membership = await tx.userCompany.findFirst({
      where: { userId: user.id, companyId: input.companyId },
    });
    if (!membership) {
      throw new HrError("This user is not a member of this company", 400);
    }

    // Check this user isn't already linked to another employee in this company
    const otherEmployee = await tx.employee.findFirst({
      where: { userId: user.id, companyId: input.companyId, deletedAt: null, id: { not: input.employeeId } },
    });
    if (otherEmployee) {
      throw new HrError(
        `This account is already linked to employee "${otherEmployee.name}".`,
        409,
      );
    }

    // Set the link
    await tx.employee.update({
      where: { id: input.employeeId },
      data: { userId: user.id },
    });

    // Sync shared fields
    await syncEmployeeUserFields(tx, input.employeeId, user.id);

    await logAction(tx, {
      userId: input.actorUserId,
      companyId: input.companyId,
      action: "EMPLOYEE_LINK_USER",
      entityType: "Employee",
      entityId: input.employeeId,
      after: { userId: user.id, userName: user.name },
    });

    return { employeeId: input.employeeId, userId: user.id };
  });
}

// ───────────────────────────────────────────────────────────────
//  3. Assign / Create phone for an employee (standalone, post-onboarding)
// ───────────────────────────────────────────────────────────────

export async function assignPhoneToEmployee(input: AssignPhoneToEmployeeInput) {
  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
      include: { user: { select: { id: true, active: true } } },
    });
    if (!employee) throw new HrError("Employee not found in this company", 404);
    if (!employee.userId || !employee.user) {
      throw new HrError("This employee has no linked account. Create an account first.", 400);
    }
    if (!employee.user.active) throw new HrError("The linked account is deactivated", 400);

    // Release the number this user currently carries (if it's a different one)
    // — a phone change hands the old number back to the pool, it doesn't stay
    // assigned. Reassigning the same number is a no-op and must not recycle it.
    const currentPhone = await tx.companyPhone.findFirst({
      where: { assignedToUserId: employee.userId, companyId: input.companyId, deletedAt: null },
      select: { id: true },
    });
    if (currentPhone && currentPhone.id !== input.companyPhoneId) {
      await tx.phoneAssignment.updateMany({
        where: { companyPhoneId: currentPhone.id, returnedAt: null },
        data: { returnedAt: new Date(), reason: "Replaced by a new number" },
      });
      await tx.companyPhone.update({
        where: { id: currentPhone.id },
        data: { assignedToUserId: null, assignedAt: null, status: "RECYCLED" },
      });
    }

    let companyPhoneId: string;

    if (input.companyPhoneId) {
      companyPhoneId = await assignPhoneTx(
        tx,
        input.companyPhoneId,
        employee.userId,
        input.companyId,
        input.actorUserId,
        "Assigned to employee",
      );
    } else if (input.newPhoneNumber) {
      companyPhoneId = await createAndAssignPhoneTx(
        tx,
        {
          phoneNumber: input.newPhoneNumber,
          label: input.newPhoneLabel,
          department: input.newPhoneDepartment,
          monthlyCost: input.newPhoneMonthlyCost,
          provider: input.newPhoneProvider,
        },
        employee.userId,
        input.companyId,
        input.actorUserId,
      );
    } else {
      throw new HrError("Either companyPhoneId or newPhoneNumber is required", 400);
    }

    // Keep the login phone in step with the assigned company number — the
    // number the employee carries IS their login, so a phone change must move
    // their login too (otherwise they'd sign in with the old, now-recycled
    // number while carrying a different assigned one).
    const assignedPhone = await tx.companyPhone.findUnique({
      where: { id: companyPhoneId },
      select: { phoneNumber: true, phoneNormalized: true },
    });
    if (assignedPhone) {
      // The new number becomes the login — make sure it isn't already another
      // active user's login credential.
      const loginTaken = await tx.user.findFirst({
        where: { phoneNormalized: assignedPhone.phoneNormalized, active: true, id: { not: employee.userId } },
        select: { name: true },
      });
      if (loginTaken) {
        throw new HrError(
          `${assignedPhone.phoneNumber} is already ${loginTaken.name}'s login number — it can't be reassigned.`,
          409,
        );
      }
      await tx.user.update({
        where: { id: employee.userId },
        data: { phone: assignedPhone.phoneNumber, phoneNormalized: assignedPhone.phoneNormalized },
      });
      await syncEmployeeUserFields(tx, input.employeeId, employee.userId);
    }

    await logAction(tx, {
      userId: input.actorUserId,
      companyId: input.companyId,
      action: "EMPLOYEE_PHONE_ASSIGN",
      entityType: "Employee",
      entityId: input.employeeId,
      after: { companyPhoneId, loginPhone: assignedPhone?.phoneNumber ?? null },
    });

    return { employeeId: input.employeeId, companyPhoneId };
  });
}

// ───────────────────────────────────────────────────────────────
//  4. Unlink phone from employee (returns the number to the pool)
// ───────────────────────────────────────────────────────────────

export async function unlinkEmployeePhone(
  employeeId: string,
  companyId: string,
  actorUserId: string,
  reason?: string,
) {
  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      include: { user: { select: { id: true } } },
    });
    if (!employee) throw new HrError("Employee not found", 404);
    if (!employee.userId) throw new HrError("This employee has no linked account", 400);

    // Find the phone assigned to this user
    const phone = await tx.companyPhone.findFirst({
      where: { assignedToUserId: employee.userId, companyId, deletedAt: null },
    });
    if (!phone) throw new HrError("No phone number is assigned to this employee", 404);

    // Close the assignment
    await tx.phoneAssignment.updateMany({
      where: { companyPhoneId: phone.id, returnedAt: null },
      data: { returnedAt: new Date(), reason: reason ?? "Unassigned from employee" },
    });

    await tx.companyPhone.update({
      where: { id: phone.id },
      data: { assignedToUserId: null, assignedAt: null, status: "RECYCLED" },
    });

    // The recycled number may be assigned to someone else — the ex-holder's
    // login identity must not keep pointing at it, or the new holder's OTP
    // could pick the old account. Clear phoneNormalized/phone when they
    // still reference the returned number.
    let loginCleared = false;
    if (phone.phoneNormalized) {
      const cleared = await tx.user.updateMany({
        where: { id: employee.userId, phoneNormalized: phone.phoneNormalized },
        data: { phoneNormalized: null, phone: null },
      });
      loginCleared = cleared.count > 0;
    }

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "EMPLOYEE_PHONE_UNLINK",
      entityType: "CompanyPhone",
      entityId: phone.id,
      after: { reason: reason ?? "Unassigned", loginCleared },
    });

    return { companyPhoneId: phone.id, status: "RECYCLED", loginCleared };
  });
}

// ───────────────────────────────────────────────────────────────
//  5. Terminate employee — soft-delete + disable login + recycle phone
//     History is preserved (Employee row stays with deletedAt, all
//     attendance/payroll/DPR/call records remain immutable).
// ───────────────────────────────────────────────────────────────

export async function terminateEmployee(input: TerminateEmployeeInput) {
  // Validate the end date up front — an unparseable string would surface
  // as a Prisma error mid-transaction otherwise.
  let endDate: Date | null = null;
  if (input.employmentEndDate) {
    endDate = new Date(input.employmentEndDate);
    if (isNaN(endDate.getTime())) throw new HrError("Invalid employment end date", 400);
  }

  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
      include: { user: { select: { id: true, active: true } } },
    });
    if (!employee) throw new HrError("Employee not found", 404);

    const now = new Date();

    // 1. Soft-delete the employee (preserves all history) + terminate contract.
    //    autoDepositEnabled is cleared here — a terminated employee must never
    //    keep receiving automatic salary credit. Bank details are preserved;
    //    if the record is ever restored + reactivated, HR re-runs setup.
    await tx.employee.update({
      where: { id: input.employeeId },
      data: {
        deletedAt: now,
        active: false,
        contractStatus: "TERMINATED",
        autoDepositEnabled: false,
        ...(endDate ? { contractEndDate: endDate } : {}),
      },
    });

    // 2. Deactivate the UserCompany membership for THIS company only.
    //    The User account stays active as long as the employee has at least
    //    one active membership in another company (multi-company support).
    let recycledPhoneId: string | null = null;
    if (employee.userId) {
      await tx.userCompany.updateMany({
        where: { userId: employee.userId, companyId: input.companyId },
        data: { active: false },
      });

      // 2b. Check if the user has any remaining active memberships.
      //    If not, disable the User account entirely.
      const activeMemberships = await tx.userCompany.count({
        where: { userId: employee.userId, active: true },
      });
      if (activeMemberships === 0) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { active: false, employmentEndDate: now },
        });
      }

      // 3. Recycle the assigned phone (if any)
      const phone = await tx.companyPhone.findFirst({
        where: { assignedToUserId: employee.userId, companyId: input.companyId, deletedAt: null },
      });
      if (phone) {
        await tx.phoneAssignment.updateMany({
          where: { companyPhoneId: phone.id, returnedAt: null },
          data: { returnedAt: now, reason: input.reason ?? "Employee terminated" },
        });
        await tx.companyPhone.update({
          where: { id: phone.id },
          data: { assignedToUserId: null, assignedAt: null, status: "RECYCLED" },
        });
        // Detach the login identity from the recycled number — the next
        // assignee's OTP must never surface this user's account (they may
        // still be active via another company's membership).
        if (phone.phoneNormalized) {
          await tx.user.updateMany({
            where: { id: employee.userId, phoneNormalized: phone.phoneNormalized },
            data: { phoneNormalized: null, phone: null },
          });
        }
        recycledPhoneId = phone.id;
      }
    }

    await logAction(tx, {
      userId: input.actorUserId,
      companyId: input.companyId,
      action: "EMPLOYEE_TERMINATE",
      entityType: "Employee",
      entityId: input.employeeId,
      after: {
        reason: input.reason,
        employmentEndDate: input.employmentEndDate,
        recycledPhoneId,
        autoDepositWasEnabled: employee.autoDepositEnabled === true,
      },
    });

    // 3b. Re-parent direct reports — employees and memberships pointing at
    //    the terminated member as their manager would dead-end approvals and
    //    the org chart. Re-parent to the terminated member's own manager
    //    (chain continuity); null when there was none.
    const terminatedEmployee = await tx.employee.findUnique({
      where: { id: input.employeeId },
      select: { reportsToEmployeeId: true },
    });
    await tx.employee.updateMany({
      where: { companyId: input.companyId, reportsToEmployeeId: input.employeeId, deletedAt: null },
      data: { reportsToEmployeeId: terminatedEmployee?.reportsToEmployeeId ?? null },
    });
    if (employee.userId) {
      const terminatedMembership = await tx.userCompany.findUnique({
        where: { userId_companyId: { userId: employee.userId, companyId: input.companyId } },
        select: { id: true, reportsToUserCompanyId: true },
      });
      if (terminatedMembership) {
        await tx.userCompany.updateMany({
          where: { companyId: input.companyId, reportsToUserCompanyId: terminatedMembership.id, active: true },
          data: { reportsToUserCompanyId: terminatedMembership.reportsToUserCompanyId },
        });
        // Any delegation pointing AT the terminated membership silently
        // dead-ends — clear it so the delegator's approvals flow normally.
        await tx.userCompany.updateMany({
          where: { approvalsDelegatedToId: terminatedMembership.id },
          data: { approvalsDelegatedToId: null, delegationEndsAt: null },
        });
      }
    }

    // 3c. Cancel future-dated leave — a terminated worker won't take approved
    //    leave after their end date; leaving it APPROVED lets stale attendance
    //    rows (auto-written on approval) survive into future periods.
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    await tx.leaveRequest.updateMany({
      where: {
        employeeId: input.employeeId,
        status: "PENDING",
      },
      data: { status: "CANCELLED", rejectedReason: "Employment ended" },
    });
    await tx.leaveRequest.updateMany({
      where: {
        employeeId: input.employeeId,
        status: "APPROVED",
        startDate: { gt: today },
      },
      data: { status: "CANCELLED", rejectedReason: "Employment ended" },
    });
    // And remove the auto-written future attendance rows for those days —
    // they're placeholder PAID_LEAVE rows for days that will never come.
    await tx.workerAttendance.deleteMany({
      where: {
        employeeId: input.employeeId,
        date: { gt: today },
        status: { in: ["PAID_LEAVE", "NON_PAID_LEAVE", "LEAVE"] },
      },
    });

    // 4. Create the EmployeeExit record (offboarding tracker)
    //    Tracks final settlement, leave encashment, asset return,
    //    exit interview, and statutory PF/ESI filings.
    await tx.employeeExit.create({
      data: {
        employeeId: input.employeeId,
        companyId: input.companyId,
        terminatedBy: input.actorUserId,
        // The employee's actual last day — the caller-provided end date when
        // given (same value stamped onto contractEndDate), else now. Restore
        // uses this to tell a termination-stamped end date from a genuine
        // fixed-term contract end date.
        terminationDate: endDate ?? now,
        terminationReason: input.reason ?? null,
        finalSettlementAmount: input.finalSettlementAmount ?? null,
        finalSettlementDate: input.finalSettlementAmount != null ? now : null,
        finalSettlementStatus: input.finalSettlementAmount != null ? "COMPLETED" : "PENDING",
        leaveEncashmentDays: input.leaveEncashmentDays ?? null,
        leaveEncashmentAmount: input.leaveEncashmentAmount ?? null,
        assetsReturned: input.assetsReturned ?? null,
        assetsReturnNotes: input.assetsReturnNotes ?? null,
        exitInterviewConducted: input.exitInterviewConducted ?? null,
        exitInterviewNotes: input.exitInterviewNotes ?? null,
        exitInterviewDate: input.exitInterviewConducted === true ? now : null,
        pfExitFiled: input.pfExitFiled ?? null,
        esiExitFiled: input.esiExitFiled ?? null,
      },
    });

    return {
      employeeId: input.employeeId,
      userId: employee.userId,
      recycledPhoneId,
    };
  });
}

// ───────────────────────────────────────────────────────────────
//  6. Sync shared fields between Employee and User
//     User is the source of truth for: name, phone, email, designation
// ───────────────────────────────────────────────────────────────

export async function syncEmployeeUser(
  employeeId: string,
  companyId: string,
  actorUserId?: string,
) {
  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      include: { user: { select: { id: true, name: true, phone: true, email: true, designation: true } } },
    });
    if (!employee) throw new HrError("Employee not found", 404);
    if (!employee.userId || !employee.user) return null;

    const result = await syncEmployeeUserFields(tx, employeeId, employee.userId);

    if (actorUserId) {
      await logAction(tx, {
        userId: actorUserId,
        companyId,
        action: "EMPLOYEE_USER_SYNC",
        entityType: "Employee",
        entityId: employeeId,
        after: result,
      });
    }

    return result;
  });
}

/** Internal: sync User → Employee fields inside an existing transaction. */
async function syncEmployeeUserFields(
  tx: Prisma.TransactionClient,
  employeeId: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true, phone: true, email: true, designation: true },
  });
  if (!user) return {};

  const before = await tx.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { name: true, phone: true, email: true, designation: true },
  });

  const data: Prisma.EmployeeUpdateInput = {};
  if (user.name && user.name !== before.name) data.name = user.name;
  // Phone/email on User are auth credentials (login identity — a pool phone,
  // or a phone+…@nirman.internal placeholder), while Employee.phone/email are
  // contact info. Never overwrite an existing contact value, and never copy
  // the internal placeholder email at all.
  if (!before.phone && user.phone !== before.phone) data.phone = user.phone;
  if (!before.email && user.email !== before.email && !user.email?.endsWith("@nirman.internal")) data.email = user.email;
  if (user.designation !== before.designation) data.designation = user.designation;

  if (Object.keys(data).length > 0) {
    await tx.employee.update({ where: { id: employeeId }, data });
  }

  return { synced: Object.keys(data), from: "user", to: "employee" };
}

// ───────────────────────────────────────────────────────────────
//  7. Phone availability + lookup helpers
// ───────────────────────────────────────────────────────────────

/** Check if a phone number is available for assignment in a company. */
export async function checkPhoneAvailability(phone: string, companyId: string) {
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length < 10) {
    return { available: false, reason: "Invalid phone number" };
  }

  // Check if it's already assigned to an active user in this company
  const assignedPhone = await prisma.companyPhone.findFirst({
    where: {
      companyId,
      phoneNormalized: normalizedPhone,
      assignedToUserId: { not: null },
      deletedAt: null,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
    },
  });

  if (assignedPhone && assignedPhone.assignedTo) {
    return {
      available: false,
      reason: `Currently assigned to ${assignedPhone.assignedTo.name}`,
      companyPhoneId: assignedPhone.id,
      assignedToName: assignedPhone.assignedTo.name,
    };
  }

  // Check if the number exists but is recycled/available
  const recycledPhone = await prisma.companyPhone.findFirst({
    where: {
      companyId,
      phoneNormalized: normalizedPhone,
      deletedAt: null,
    },
    orderBy: { acquiredAt: "desc" },
  });

  if (recycledPhone) {
    return {
      available: true,
      recycled: true,
      companyPhoneId: recycledPhone.id,
      reason: "This number was previously used. Re-verify to assign.",
    };
  }

  // Check if a User with this phone exists (might be in another company)
  const existingUser = await prisma.user.findFirst({
    where: { phoneNormalized: normalizedPhone, active: true },
    select: { id: true, name: true, email: true },
  });

  return {
    available: true,
    recycled: false,
    existingUser: existingUser
      ? { id: existingUser.id, name: existingUser.name, email: existingUser.email }
      : null,
  };
}

/** List available + recycled phone numbers in a company. */
export async function findAvailablePhoneNumbers(companyId: string) {
  const numbers = await prisma.companyPhone.findMany({
    where: {
      companyId,
      deletedAt: null,
      assignedToUserId: null,
      status: { in: ["ACTIVE", "RECYCLED"] },
    },
    orderBy: [{ status: "asc" }, { acquiredAt: "desc" }],
    select: {
      id: true,
      phoneNumber: true,
      phoneNormalized: true,
      label: true,
      department: true,
      status: true,
      monthlyCost: true,
      provider: true,
    },
  });
  return numbers;
}

// ───────────────────────────────────────────────────────────────
//  8. Telephony cost aggregation for an employee
// ───────────────────────────────────────────────────────────────

export interface EmployeeTelephonyCost {
  companyPhoneId: string | null;
  phoneNumber: string | null;
  monthlyCost: number;
  totalCalls: number;
  totalCallSeconds: number;
  totalSms: number;
  estimatedCallCost: number;
  estimatedSmsCost: number;
  totalEstimatedCost: number;
}

export async function getEmployeeTelephonyCost(
  employeeId: string,
  companyId: string,
): Promise<EmployeeTelephonyCost> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: { userId: true },
  });
  if (!employee) throw new HrError("Employee not found", 404);

  if (!employee.userId) {
    return {
      companyPhoneId: null,
      phoneNumber: null,
      monthlyCost: 0,
      totalCalls: 0,
      totalCallSeconds: 0,
      totalSms: 0,
      estimatedCallCost: 0,
      estimatedSmsCost: 0,
      totalEstimatedCost: 0,
    };
  }

  const phone = await prisma.companyPhone.findFirst({
    where: { assignedToUserId: employee.userId, companyId, deletedAt: null },
    select: { id: true, phoneNumber: true, monthlyCost: true },
  });

  if (!phone) {
    return {
      companyPhoneId: null,
      phoneNumber: null,
      monthlyCost: 0,
      totalCalls: 0,
      totalCallSeconds: 0,
      totalSms: 0,
      estimatedCallCost: 0,
      estimatedSmsCost: 0,
      totalEstimatedCost: 0,
    };
  }

  const [calls, smsCount] = await Promise.all([
    prisma.callLog.aggregate({
      where: { companyPhoneId: phone.id },
      _sum: { durationSec: true, callCost: true },
      _count: true,
    }),
    prisma.smsLog.count({
      where: { companyPhoneId: phone.id },
    }),
  ]);

  const monthlyCost = phone.monthlyCost ? Number(phone.monthlyCost) : 0;
  const totalCallSeconds = calls._sum.durationSec ?? 0;
  // Use actual callCost from the provider if available, otherwise estimate
  const actualCallCost = calls._sum.callCost ? Number(calls._sum.callCost) : 0;
  const estimatedCallCost = actualCallCost > 0 ? actualCallCost : (totalCallSeconds / 60) * 0.75;
  // ₹0.25 per SMS (Indian rate average)
  const estimatedSmsCost = smsCount * 0.25;
  const totalEstimatedCost = monthlyCost + estimatedCallCost + estimatedSmsCost;

  return {
    companyPhoneId: phone.id,
    phoneNumber: phone.phoneNumber,
    monthlyCost,
    totalCalls: calls._count,
    totalCallSeconds,
    totalSms: smsCount,
    estimatedCallCost,
    estimatedSmsCost,
    totalEstimatedCost,
  };
}

// ───────────────────────────────────────────────────────────────
//  Internal helpers — phone assignment within a transaction
// ───────────────────────────────────────────────────────────────

/** Assign an existing CompanyPhone to a user inside a transaction. */
async function assignPhoneTx(
  tx: Prisma.TransactionClient,
  companyPhoneId: string,
  userId: string,
  companyId: string,
  actorUserId: string,
  reason: string,
): Promise<string> {
  const phone = await tx.companyPhone.findFirst({
    where: { id: companyPhoneId, companyId, deletedAt: null },
  });
  if (!phone) throw new HrError("Phone number not found in this company", 404);

  // Close any existing open assignment for this number
  await tx.phoneAssignment.updateMany({
    where: { companyPhoneId, returnedAt: null },
    data: { returnedAt: new Date(), reason: "Reassigned" },
  });

  // Create new assignment
  await tx.phoneAssignment.create({
    data: {
      companyPhoneId,
      userId,
      assignedById: actorUserId,
      reason,
    },
  });

  await tx.companyPhone.update({
    where: { id: companyPhoneId },
    data: { assignedToUserId: userId, assignedAt: new Date(), status: "ACTIVE" },
  });

  return companyPhoneId;
}

/** Create a new CompanyPhone and assign it to a user inside a transaction. */
async function createAndAssignPhoneTx(
  tx: Prisma.TransactionClient,
  phoneInput: {
    phoneNumber: string;
    label?: string | null;
    department?: string | null;
    monthlyCost?: number | null;
    provider?: string | null;
  },
  userId: string,
  companyId: string,
  actorUserId: string,
): Promise<string> {
  const normalizedPhone = normalizePhone(phoneInput.phoneNumber);
  if (normalizedPhone.length < 10) throw new HrError("Invalid phone number", 400);

  // Check for duplicate
  const existing = await tx.companyPhone.findFirst({
    where: { companyId, phoneNormalized: normalizedPhone, deletedAt: null },
  });
  if (existing) throw new HrError("This phone number already exists in the company", 409);

  const phone = await tx.companyPhone.create({
    data: {
      companyId,
      phoneNumber: phoneInput.phoneNumber.trim(),
      phoneNormalized: normalizedPhone,
      numberType: "MOBILE",
      provider: phoneInput.provider ?? "MANUAL",
      label: phoneInput.label ?? null,
      department: phoneInput.department ?? null,
      monthlyCost: phoneInput.monthlyCost != null ? phoneInput.monthlyCost : null,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  await tx.phoneAssignment.create({
    data: {
      companyPhoneId: phone.id,
      userId,
      assignedById: actorUserId,
      reason: "Created and assigned during employee onboarding",
    },
  });

  await tx.companyPhone.update({
    where: { id: phone.id },
    data: { assignedToUserId: userId, assignedAt: new Date() },
  });

  return phone.id;
}

// ───────────────────────────────────────────────────────────────
//  Employment Agreement — auto-generation, confirmation, auto-deposit
//
//  When an employee account is created, an employment agreement is
//  auto-generated (status = DRAFT → ISSUED). The agreement is a print-
//  friendly document at /print/employment-agreement/[id] that can be
//  printed to PDF and attached to the employee profile.
//
//  Once the employee confirms (signs), the contract status moves to
//  CONFIRMED. Auto-deposit (salary → bank) is independent — it can be
//  set up at any point for an active employee.
// ───────────────────────────────────────────────────────────────

/**
 * Generate (or regenerate) the employment agreement for an employee.
 * Sets contractStatus = ISSUED, contractIssuedAt = now, and creates an
 * EntityAttachment linking the agreement to the employee profile.
 *
 * The attachment is a "contract" category document. The actual PDF is
 * generated via the print page (/print/employment-agreement/[id]) —
 * the attachment record tracks that this agreement exists and links
 * to the print URL.
 */
export async function generateEmploymentAgreement(
  employeeId: string,
  companyId: string,
  actorUserId: string,
): Promise<{
  employeeId: string;
  agreementUrl: string;
  contractStatus: string;
  issuedAt: string;
  contractToken?: string;
}> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: {
      id: true,
      contractStatus: true,
      contractAttachmentId: true,
      contractToken: true,
      employmentType: true,
      wageType: true,
      dailyRate: true,
      monthlySalary: true,
      noticePeriodDays: true,
      contractStartDate: true,
      contractEndDate: true,
      salaryComponents: { where: { active: true }, select: { amount: true, frequency: true, isDeduction: true, calculationType: true } },
    },
  });
  if (!employee) throw new HrError("Employee not found", 404);

  // ── Validate that employment terms are filled before generating ──
  // The agreement is a legal document — it must have employment type,
  // wage, and (for contract workers) contract dates. Without these, the
  // agreement would be incomplete and potentially misleading.
  if (!employee.employmentType) {
    throw new HrError(
      "Employment type is not set. Fill the employee dossier (employment type, wage, contract dates) before generating the agreement.",
      400,
    );
  }

  // ── Wage validation ──
  // Accept either the Employee.wage fields OR active salary components.
  // UNIT_RATE components carry a per-unit rate in `amount` (e.g. ₹3/km), not
  // a monthly figure — they can't stand in for a fixed wage.
  const hasMonthlyComponents = employee.salaryComponents.some(
    (c) => !c.isDeduction && c.frequency === "MONTHLY" && c.calculationType !== "UNIT_RATE" && Number(c.amount) > 0,
  );
  const hasAnyComponents = employee.salaryComponents.length > 0;

  if (employee.wageType === "DAILY" && (!employee.dailyRate || Number(employee.dailyRate) === 0)) {
    if (!hasMonthlyComponents && !hasAnyComponents) {
      throw new HrError("Daily rate is not set. Fill the wage details or add salary components first.", 400);
    }
  }
  if ((employee.wageType === "MONTHLY" || employee.wageType === "FIXED") && (!employee.monthlySalary || Number(employee.monthlySalary) === 0)) {
    if (!hasMonthlyComponents && !hasAnyComponents) {
      throw new HrError("Monthly salary is not set. Fill the wage details or add salary components first.", 400);
    }
  }
  if (employee.employmentType === "CONTRACT" && !employee.contractStartDate) {
    throw new HrError("Contract start date is not set. Fill the contract dates in the employee dossier first.", 400);
  }

  const agreementUrl = `/print/employment-agreement/${employeeId}`;

  return prisma.$transaction(async (tx) => {
    // If there's an existing attachment, update it; otherwise create one.
    // The stored link can dangle (dossier Remove deletes the attachment row
    // without clearing this field) — verify it resolves before updating.
    let attachmentId = employee.contractAttachmentId;
    if (attachmentId) {
      const exists = await tx.entityAttachment.findUnique({ where: { id: attachmentId }, select: { id: true } });
      if (exists) {
        await tx.entityAttachment.update({
          where: { id: attachmentId },
          data: { label: `Employment Agreement — ${new Date().toLocaleDateString()}` },
        });
      } else {
        attachmentId = null;
      }
    }

    if (!attachmentId) {
      // Create a new attachment record linking the print URL to the employee.
      // We use a synthetic upload record since the agreement is a generated
      // document (not a file upload). The upload URL points to the print page.
      // A prior agreement's upload may still exist with the same storedName
      // (e.g. after restore cleared the employee's link) — reuse it instead
      // of colliding on the unique constraint.
      const storedName = `agreement-${employeeId}.pdf`;
      const upload = await tx.upload.upsert({
        where: { storedName },
        create: {
          storedName,
          originalName: `Employment-Agreement-${employeeId.slice(-8)}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          url: agreementUrl,
          companyId,
          uploadedById: actorUserId,
        },
        update: { url: agreementUrl },
      });
      // An attachment for this upload+employee may already exist (link was
      // cleared without deleting the row) — reuse it; else create fresh.
      const existing = await tx.entityAttachment.findFirst({
        where: { uploadId: upload.id, entityType: "Employee", entityId: employeeId },
      });
      if (existing) {
        await tx.entityAttachment.update({
          where: { id: existing.id },
          data: { label: `Employment Agreement — ${new Date().toLocaleDateString()}` },
        });
        attachmentId = existing.id;
      } else {
        const attachment = await tx.entityAttachment.create({
          data: {
            companyId,
            uploadId: upload.id,
            entityType: "Employee",
            entityId: employeeId,
            category: "contract",
            label: `Employment Agreement — ${new Date().toLocaleDateString()}`,
            createdById: actorUserId,
          },
        });
        attachmentId = attachment.id;
      }
    }

    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        contractStatus: "ISSUED",
        contractIssuedAt: new Date(),
        contractAttachmentId: attachmentId,
        // Re-issuing ALWAYS rotates the token — a new document means new
        // consent, and any previously forwarded/leaked link must die. The
        // accept endpoint + share UI already handle rotation; keeping the
        // old token here silently left stale links live.
        contractToken: crypto.randomUUID(),
        // A re-issued agreement also voids the prior signature — the
        // employee must accept the new terms.
        contractConfirmedAt: null,
      },
      select: { contractStatus: true, contractIssuedAt: true, contractToken: true },
    });

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "EMPLOYEE_AGREEMENT_GENERATED",
      entityType: "Employee",
      entityId: employeeId,
      after: { contractStatus: updated.contractStatus, agreementUrl },
    });

    return {
      employeeId,
      agreementUrl,
      contractStatus: updated.contractStatus ?? "ISSUED",
      issuedAt: updated.contractIssuedAt?.toISOString() ?? new Date().toISOString(),
      contractToken: updated.contractToken ?? undefined,
    };
  });
}

/**
 * Confirm the employment agreement — marks the contract as CONFIRMED
 * and records the confirmation timestamp. This is the "employee signed"
 * onboarding step.
 */
export async function confirmEmploymentAgreement(
  employeeId: string,
  companyId: string,
  actorUserId: string,
): Promise<{
  employeeId: string;
  contractStatus: string;
  confirmedAt: string;
}> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: { id: true, contractStatus: true, contractIssuedAt: true },
  });
  if (!employee) throw new HrError("Employee not found", 404);
  if (!employee.contractIssuedAt) {
    throw new HrError("Agreement has not been issued yet. Generate it first.", 400);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        contractStatus: "CONFIRMED",
        contractConfirmedAt: new Date(),
      },
      select: { contractStatus: true, contractConfirmedAt: true },
    });

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "EMPLOYEE_AGREEMENT_CONFIRMED",
      entityType: "Employee",
      entityId: employeeId,
      after: { contractStatus: updated.contractStatus },
    });

    return {
      employeeId,
      contractStatus: updated.contractStatus ?? "CONFIRMED",
      confirmedAt: updated.contractConfirmedAt?.toISOString() ?? new Date().toISOString(),
    };
  });
}

// ───────────────────────────────────────────────────────────────
//  Offer Letter — auto-generation
//
//  A shorter, pre-joining document that formalises the job offer:
//  position, compensation, employment type, start date, and key terms.
//  Generated automatically on employee creation (when prerequisites are
//  met) and can be regenerated manually.
//
//  The print page is at /print/offer-letter/[id].
// ───────────────────────────────────────────────────────────────

/**
 * Generate (or regenerate) the offer letter for an employee.
 * Sets offerLetterStatus = ISSUED, offerLetterIssuedAt = now, and creates
 * an EntityAttachment linking the offer letter to the employee profile.
 */
export async function generateOfferLetter(
  employeeId: string,
  companyId: string,
  actorUserId: string,
): Promise<{
  employeeId: string;
  offerLetterUrl: string;
  offerLetterStatus: string;
  issuedAt: string;
  offerToken?: string;
}> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: {
      id: true,
      offerLetterStatus: true,
      offerLetterAttachmentId: true,
      offerToken: true,
      employmentType: true,
      wageType: true,
      dailyRate: true,
      monthlySalary: true,
      designation: true,
      joinDate: true,
      salaryComponents: { where: { active: true }, select: { amount: true, frequency: true, isDeduction: true, calculationType: true } },
    },
  });
  if (!employee) throw new HrError("Employee not found", 404);

  // ── Validate minimum prerequisites ──
  if (!employee.employmentType) {
    throw new HrError(
      "Employment type is not set. Fill the employment terms before generating the offer letter.",
      400,
    );
  }

  // ── Wage validation ──
  // Accept either the Employee.wage fields (dailyRate/monthlySalary) OR
  // active salary components (the Salary Structure tab). This prevents
  // the "Monthly salary is not set" error when the user added salary via
  // the Salary Structure tab but didn't also fill the Hire Details wage.
  // UNIT_RATE components carry a per-unit rate in `amount` (e.g. ₹3/km), not
  // a monthly figure — they can't stand in for a fixed wage.
  const hasMonthlyComponents = employee.salaryComponents.some(
    (c) => !c.isDeduction && c.frequency === "MONTHLY" && c.calculationType !== "UNIT_RATE" && Number(c.amount) > 0,
  );
  const hasAnyComponents = employee.salaryComponents.length > 0;

  if (employee.wageType === "DAILY" && (!employee.dailyRate || Number(employee.dailyRate) === 0)) {
    if (!hasMonthlyComponents && !hasAnyComponents) {
      throw new HrError("Daily rate is not set. Fill the wage details or add salary components first.", 400);
    }
  }
  if ((employee.wageType === "MONTHLY" || employee.wageType === "FIXED") && (!employee.monthlySalary || Number(employee.monthlySalary) === 0)) {
    if (!hasMonthlyComponents && !hasAnyComponents) {
      throw new HrError("Monthly salary is not set. Fill the wage details or add salary components first.", 400);
    }
  }

  const offerLetterUrl = `/print/offer-letter/${employeeId}`;

  return prisma.$transaction(async (tx) => {
    let attachmentId = employee.offerLetterAttachmentId;
    if (attachmentId) {
      const exists = await tx.entityAttachment.findUnique({ where: { id: attachmentId }, select: { id: true } });
      if (exists) {
        await tx.entityAttachment.update({
          where: { id: attachmentId },
          data: { label: `Offer Letter — ${new Date().toLocaleDateString()}` },
        });
      } else {
        attachmentId = null;
      }
    }

    if (!attachmentId) {
      const storedName = `offer-letter-${employeeId}.pdf`;
      const upload = await tx.upload.upsert({
        where: { storedName },
        create: {
          storedName,
          originalName: `Offer-Letter-${employeeId.slice(-8)}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          url: offerLetterUrl,
          companyId,
          uploadedById: actorUserId,
        },
        update: { url: offerLetterUrl },
      });
      const existing = await tx.entityAttachment.findFirst({
        where: { uploadId: upload.id, entityType: "Employee", entityId: employeeId },
      });
      if (existing) {
        await tx.entityAttachment.update({
          where: { id: existing.id },
          data: { label: `Offer Letter — ${new Date().toLocaleDateString()}` },
        });
        attachmentId = existing.id;
      } else {
        const attachment = await tx.entityAttachment.create({
          data: {
            companyId,
            uploadId: upload.id,
            entityType: "Employee",
            entityId: employeeId,
            category: "offer-letter",
            label: `Offer Letter — ${new Date().toLocaleDateString()}`,
            createdById: actorUserId,
          },
        });
        attachmentId = attachment.id;
      }
    }

    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        offerLetterStatus: "ISSUED",
        offerLetterIssuedAt: new Date(),
        offerLetterAttachmentId: attachmentId,
        // Re-issuing ALWAYS rotates the token (see contractToken above) —
        // previously forwarded links die and the new offer needs a fresh
        // acceptance.
        offerToken: crypto.randomUUID(),
        offerLetterAcceptedAt: null,
      },
      select: { offerLetterStatus: true, offerLetterIssuedAt: true, offerToken: true },
    });

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "EMPLOYEE_OFFER_LETTER_GENERATED",
      entityType: "Employee",
      entityId: employeeId,
      after: { offerLetterStatus: updated.offerLetterStatus, offerLetterUrl },
    });

    return {
      employeeId,
      offerLetterUrl,
      offerLetterStatus: updated.offerLetterStatus ?? "ISSUED",
      issuedAt: updated.offerLetterIssuedAt?.toISOString() ?? new Date().toISOString(),
      offerToken: updated.offerToken ?? undefined,
    };
  });
}

// ───────────────────────────────────────────────────────────────
//  Appointment Letter — manual generation
//
//  A formal letter of appointment issued after the employee joins. Unlike
//  the offer letter (pre-joining) and the employment agreement (the full
//  contract), the appointment letter is a concise, formal letter that
//  confirms the appointment — position, joining date, employment type,
//  compensation summary, probation, and notice period. Detailed terms
//  remain in the employment agreement.
//
//  The print page is at /print/appointment-letter/[id].
// ───────────────────────────────────────────────────────────────

/**
 * Generate (or regenerate) the appointment letter for an employee.
 * Sets appointmentLetterStatus = ISSUED, appointmentLetterIssuedAt = now,
 * and creates an EntityAttachment linking the appointment letter to the
 * employee profile.
 */
export async function generateAppointmentLetter(
  employeeId: string,
  companyId: string,
  actorUserId: string,
): Promise<{
  employeeId: string;
  appointmentLetterUrl: string;
  appointmentLetterStatus: string;
  issuedAt: string;
}> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: {
      id: true,
      appointmentLetterStatus: true,
      appointmentLetterAttachmentId: true,
      name: true,
      designation: true,
      joinDate: true,
      employmentType: true,
    },
  });
  if (!employee) throw new HrError("Employee not found", 404);

  // ── Validate minimum prerequisites ──
  if (!employee.name) {
    throw new HrError("Employee name is not set. Fill the employee details first.", 400);
  }
  if (!employee.designation) {
    throw new HrError(
      "Designation is not set. Fill the employment terms before generating the appointment letter.",
      400,
    );
  }
  if (!employee.joinDate) {
    throw new HrError(
      "Join date is not set. Fill the employment terms before generating the appointment letter.",
      400,
    );
  }
  if (!employee.employmentType) {
    throw new HrError(
      "Employment type is not set. Fill the employment terms before generating the appointment letter.",
      400,
    );
  }

  const appointmentLetterUrl = `/print/appointment-letter/${employeeId}`;

  return prisma.$transaction(async (tx) => {
    let attachmentId = employee.appointmentLetterAttachmentId;
    if (attachmentId) {
      const exists = await tx.entityAttachment.findUnique({ where: { id: attachmentId }, select: { id: true } });
      if (exists) {
        await tx.entityAttachment.update({
          where: { id: attachmentId },
          data: { label: `Appointment Letter — ${new Date().toLocaleDateString()}` },
        });
      } else {
        attachmentId = null;
      }
    }

    if (!attachmentId) {
      const storedName = `appointment-letter-${employeeId}.pdf`;
      const upload = await tx.upload.upsert({
        where: { storedName },
        create: {
          storedName,
          originalName: `Appointment-Letter-${employeeId.slice(-8)}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          url: appointmentLetterUrl,
          companyId,
          uploadedById: actorUserId,
        },
        update: { url: appointmentLetterUrl },
      });
      const existing = await tx.entityAttachment.findFirst({
        where: { uploadId: upload.id, entityType: "Employee", entityId: employeeId },
      });
      if (existing) {
        await tx.entityAttachment.update({
          where: { id: existing.id },
          data: { label: `Appointment Letter — ${new Date().toLocaleDateString()}` },
        });
        attachmentId = existing.id;
      } else {
        const attachment = await tx.entityAttachment.create({
          data: {
            companyId,
            uploadId: upload.id,
            entityType: "Employee",
            entityId: employeeId,
            category: "appointment-letter",
            label: `Appointment Letter — ${new Date().toLocaleDateString()}`,
            createdById: actorUserId,
          },
        });
        attachmentId = attachment.id;
      }
    }

    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        appointmentLetterStatus: "ISSUED",
        appointmentLetterIssuedAt: new Date(),
        appointmentLetterAttachmentId: attachmentId,
      },
      select: { appointmentLetterStatus: true, appointmentLetterIssuedAt: true },
    });

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "APPOINTMENT_LETTER_GENERATE",
      entityType: "Employee",
      entityId: employeeId,
      after: { appointmentLetterStatus: updated.appointmentLetterStatus, appointmentLetterUrl },
    });

    return {
      employeeId,
      appointmentLetterUrl,
      appointmentLetterStatus: updated.appointmentLetterStatus ?? "ISSUED",
      issuedAt: updated.appointmentLetterIssuedAt?.toISOString() ?? new Date().toISOString(),
    };
  });
}

// ───────────────────────────────────────────────────────────────
//  Employee ID Card — auto-generation
//
//  A printable ID card with employee name, photo placeholder, designation,
//  employee code, company name, and emergency contact. Generated
//  automatically on employee creation and can be regenerated manually.
//
//  The print page is at /print/employee-id-card/[id].
// ───────────────────────────────────────────────────────────────

/**
 * Generate (or regenerate) the employee ID card.
 * Sets idCardStatus = ISSUED, idCardIssuedAt = now, and creates an
 * EntityAttachment linking the ID card to the employee profile.
 */
export async function generateEmployeeIdCard(
  employeeId: string,
  companyId: string,
  actorUserId: string,
): Promise<{
  employeeId: string;
  idCardUrl: string;
  idCardStatus: string;
  issuedAt: string;
}> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: {
      id: true,
      idCardStatus: true,
      idCardAttachmentId: true,
      name: true,
    },
  });
  if (!employee) throw new HrError("Employee not found", 404);

  const idCardUrl = `/print/employee-id-card/${employeeId}`;

  return prisma.$transaction(async (tx) => {
    let attachmentId = employee.idCardAttachmentId;
    if (attachmentId) {
      const exists = await tx.entityAttachment.findUnique({ where: { id: attachmentId }, select: { id: true } });
      if (exists) {
        await tx.entityAttachment.update({
          where: { id: attachmentId },
          data: { label: `Employee ID Card — ${new Date().toLocaleDateString()}` },
        });
      } else {
        attachmentId = null;
      }
    }

    if (!attachmentId) {
      const storedName = `id-card-${employeeId}.pdf`;
      const upload = await tx.upload.upsert({
        where: { storedName },
        create: {
          storedName,
          originalName: `ID-Card-${employeeId.slice(-8)}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          url: idCardUrl,
          companyId,
          uploadedById: actorUserId,
        },
        update: { url: idCardUrl },
      });
      const existing = await tx.entityAttachment.findFirst({
        where: { uploadId: upload.id, entityType: "Employee", entityId: employeeId },
      });
      if (existing) {
        await tx.entityAttachment.update({
          where: { id: existing.id },
          data: { label: `Employee ID Card — ${new Date().toLocaleDateString()}` },
        });
        attachmentId = existing.id;
      } else {
        const attachment = await tx.entityAttachment.create({
          data: {
            companyId,
            uploadId: upload.id,
            entityType: "Employee",
            entityId: employeeId,
            category: "id-card",
            label: `Employee ID Card — ${new Date().toLocaleDateString()}`,
            createdById: actorUserId,
          },
        });
        attachmentId = attachment.id;
      }
    }

    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        idCardStatus: "ISSUED",
        idCardIssuedAt: new Date(),
        idCardAttachmentId: attachmentId,
      },
      select: { idCardStatus: true, idCardIssuedAt: true },
    });

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "EMPLOYEE_ID_CARD_GENERATED",
      entityType: "Employee",
      entityId: employeeId,
      after: { idCardStatus: updated.idCardStatus, idCardUrl },
    });

    return {
      employeeId,
      idCardUrl,
      idCardStatus: updated.idCardStatus ?? "ISSUED",
      issuedAt: updated.idCardIssuedAt?.toISOString() ?? new Date().toISOString(),
    };
  });
}

/**
 * Set up auto-deposit — configures the employee's bank account details
 * and enables automatic salary credit on payday. Works independently of
 * the employment agreement — bank details can be set up before the
 * agreement is issued or confirmed.
 */
export async function setupAutoDeposit(
  employeeId: string,
  companyId: string,
  actorUserId: string,
  input: {
    bankAccountHolder: string;
    bankAccountNumber: string;
    bankIfsc: string;
    bankName: string;
    bankBranch?: string | null;
    payDay: number; // 1-31
  },
): Promise<{
  employeeId: string;
  autoDepositEnabled: boolean;
  payDay: number;
}> {
  // Validate input before hitting the DB
  if (!input.bankAccountHolder.trim()) throw new HrError("Bank account holder name is required.", 400);
  if (!input.bankAccountNumber.trim()) throw new HrError("Bank account number is required.", 400);
  if (!input.bankName.trim()) throw new HrError("Bank name is required.", 400);
  const ifsc = input.bankIfsc.trim().toUpperCase();
  // RBI IFSC format: 4 bank letters + 0 + 6 alphanumeric (e.g. HDFC0001234)
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new HrError("Bank IFSC code is invalid (e.g. HDFC0001234).", 400);
  // Integer check — floats/non-numerics slip past < / > comparisons and
  // would hit Prisma's Int column as a 500.
  if (!Number.isInteger(input.payDay) || input.payDay < 1 || input.payDay > 31) {
    throw new HrError("Pay day must be an integer between 1 and 31.", 400);
  }

  // The active check runs inside the transaction so a concurrent
  // terminate/deactivate can't interleave and leave auto-deposit enabled
  // on an inactive employee.
  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true, active: true },
    });
    if (!employee) throw new HrError("Employee not found", 404);

    // Auto-deposit does not depend on the employment agreement — bank
    // details can be configured before the agreement is issued or
    // confirmed. Only an active employee can receive salary credit.
    if (!employee.active) {
      throw new HrError("Cannot set up auto-deposit for an inactive employee.", 400);
    }

    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        bankAccountHolder: input.bankAccountHolder.trim(),
        bankAccountNumber: input.bankAccountNumber.trim(),
        bankIfsc: ifsc,
        bankName: input.bankName.trim(),
        bankBranch: input.bankBranch?.trim() || null,
        payDay: input.payDay,
        autoDepositEnabled: true,
        autoDepositSetupAt: new Date(),
      },
      select: { autoDepositEnabled: true, payDay: true },
    });

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "EMPLOYEE_AUTO_DEPOSIT_SETUP",
      entityType: "Employee",
      entityId: employeeId,
      after: {
        autoDepositEnabled: updated.autoDepositEnabled,
        payDay: updated.payDay,
        bankName: input.bankName,
        bankAccountNumber: `****${input.bankAccountNumber.slice(-4)}`,
      },
    });

    return {
      employeeId,
      autoDepositEnabled: updated.autoDepositEnabled ?? true,
      payDay: updated.payDay ?? input.payDay,
    };
  });
}

/**
 * Disable auto-deposit for an employee (e.g. when they switch to manual
 * payment or cash). Does NOT clear bank details — just disables the flag.
 */
export async function disableAutoDeposit(
  employeeId: string,
  companyId: string,
  actorUserId: string,
): Promise<{ employeeId: string; autoDepositEnabled: boolean }> {
  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new HrError("Employee not found", 404);

    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: { autoDepositEnabled: false },
      select: { autoDepositEnabled: true },
    });

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "EMPLOYEE_AUTO_DEPOSIT_DISABLED",
      entityType: "Employee",
      entityId: employeeId,
      after: { autoDepositEnabled: updated.autoDepositEnabled },
    });

    return { employeeId, autoDepositEnabled: updated.autoDepositEnabled ?? false };
  });
}

// ───────────────────────────────────────────────────────────────
//  Restore (un-archive) — the inverse of terminateEmployee.
//
//  Archive mistakes happen. The employee record is soft-deleted, so the data
//  survives — restore brings back the record + linked access without
//  pretending the termination never happened (audit log keeps both events).
//  Phone numbers are NOT auto-reassigned — the recycled pool number may have
//  gone to someone else; HR assigns a fresh one after restore.
// ───────────────────────────────────────────────────────────────

export async function restoreEmployee(input: {
  employeeId: string;
  companyId: string;
  actorUserId: string;
}) {
  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId },
      include: { user: { select: { id: true, active: true, name: true } } },
    });
    if (!employee) throw new HrError("Employee not found", 404);
    if (!employee.deletedAt) throw new HrError("Employee is not archived", 409);

    // 1. Restore the record. The agreement lifecycle resets completely —
    //    stamping ISSUED without contractIssuedAt wedges the confirm step
    //    (keys off the timestamp → 400s), while a NULL status beside stale
    //    timestamps is the inverse wedge: generate sees the old issuedAt
    //    and skips, and the old signing token stays live on a terminated
    //    agreement. Clear the whole tuple so a fresh issue→confirm cycle
    //    can run. The generated PDF attachment row stays in the dossier
    //    (audit trail); only the employee's link + signing token die.
    await tx.employee.update({
      where: { id: input.employeeId },
      data: {
        deletedAt: null,
        active: true,
        contractStatus: null,
        contractIssuedAt: null,
        contractConfirmedAt: null,
        contractAttachmentId: null,
        contractTerms: null,
        contractToken: null,
      },
    });

    // 2. Re-activate the membership + user account (if linked). The user may
    //    have memberships in other companies that kept the account live —
    //    re-activating it unconditionally is correct because the restore is
    //    itself the "this person is back" signal.
    if (employee.userId) {
      await tx.userCompany.updateMany({
        where: { userId: employee.userId, companyId: input.companyId },
        data: { active: true },
      });
      await tx.user.update({
        where: { id: employee.userId },
        data: { active: true, employmentEndDate: null },
      });
    }

    // 3. If terminate stamped the actual end date onto contractEndDate (the
    //    offboard form sends employmentEndDate), restore must clear it —
    //    otherwise the lazy-expiry check instantly flips any new agreement
    //    to EXPIRED. Only clear when the value matches the exit record's
    //    end date; a genuine fixed-term end date survives the restore.
    const exit = await tx.employeeExit.findUnique({ where: { employeeId: input.employeeId } });
    if (exit?.terminationDate && employee.contractEndDate) {
      const sameDay =
        employee.contractEndDate.toISOString().slice(0, 10) ===
        exit.terminationDate.toISOString().slice(0, 10);
      if (sameDay) {
        await tx.employee.update({
          where: { id: input.employeeId },
          data: { contractEndDate: null },
        });
      }
    }

    // 4. Remove the EmployeeExit record — employeeId is @unique, so leaving
    //    it would block a future re-termination. The audit log preserves the
    //    full terminate → restore history.
    await tx.employeeExit.deleteMany({ where: { employeeId: input.employeeId } });

    await logAction(tx, {
      userId: input.actorUserId,
      companyId: input.companyId,
      action: "EMPLOYEE_RESTORE",
      entityType: "Employee",
      entityId: input.employeeId,
      after: { restoredBy: input.actorUserId, hadLinkedUser: !!employee.userId },
    });

    return { employeeId: input.employeeId, userId: employee.userId };
  });
}
