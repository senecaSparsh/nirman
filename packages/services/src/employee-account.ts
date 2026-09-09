import { prisma, type Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { withSerializableTransaction } from "./transaction";
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
          ...(input.reportsToUserCompanyId
            ? { reportsToUserCompanyId: input.reportsToUserCompanyId }
            : {}),
        },
      });
      userId = existingUser.id;
    } else {
      // ── Create new User + UserCompany + Account ──
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
          employeeCode: input.employeeCode?.trim() || null,
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

    // ── Create UserScope rows (project/department scoping) ──
    if (input.scopeType && input.scopeType !== "COMPANY" && input.scopes && input.scopes.length > 0) {
      const membership = await tx.userCompany.findFirstOrThrow({
        where: { userId, companyId: input.companyId },
        select: { id: true },
      });
      await tx.userCompany.update({
        where: { id: membership.id },
        data: { scopeType: input.scopeType },
      });
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

    await logAction(tx, {
      userId: input.actorUserId,
      companyId: input.companyId,
      action: "EMPLOYEE_PHONE_ASSIGN",
      entityType: "Employee",
      entityId: input.employeeId,
      after: { companyPhoneId },
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

    await logAction(tx, {
      userId: actorUserId,
      companyId,
      action: "EMPLOYEE_PHONE_UNLINK",
      entityType: "CompanyPhone",
      entityId: phone.id,
      after: { reason: reason ?? "Unassigned" },
    });

    return { companyPhoneId: phone.id, status: "RECYCLED" };
  });
}

// ───────────────────────────────────────────────────────────────
//  5. Terminate employee — soft-delete + disable login + recycle phone
//     History is preserved (Employee row stays with deletedAt, all
//     attendance/payroll/DPR/call records remain immutable).
// ───────────────────────────────────────────────────────────────

export async function terminateEmployee(input: TerminateEmployeeInput) {
  return withSerializableTransaction(async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId, deletedAt: null },
      include: { user: { select: { id: true, active: true } } },
    });
    if (!employee) throw new HrError("Employee not found", 404);

    const now = new Date();

    // 1. Soft-delete the employee (preserves all history) + terminate contract
    await tx.employee.update({
      where: { id: input.employeeId },
      data: {
        deletedAt: now,
        active: false,
        contractStatus: "TERMINATED",
        ...(input.employmentEndDate ? { contractEndDate: new Date(input.employmentEndDate) } : {}),
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
        terminationDate: now,
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
  if (user.phone !== before.phone) data.phone = user.phone;
  if (user.email !== before.email) data.email = user.email;
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
//  CONFIRMED and auto-deposit (salary → bank) can be enabled.
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
      salaryComponents: { where: { active: true }, select: { amount: true, frequency: true, isDeduction: true } },
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
  const hasMonthlyComponents = employee.salaryComponents.some(
    (c) => !c.isDeduction && c.frequency === "MONTHLY" && Number(c.amount) > 0,
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
    // If there's an existing attachment, update it; otherwise create one
    let attachmentId = employee.contractAttachmentId;

    if (attachmentId) {
      // Update the existing attachment's timestamp
      await tx.entityAttachment.update({
        where: { id: attachmentId },
        data: { label: `Employment Agreement — ${new Date().toLocaleDateString()}` },
      });
    } else {
      // Create a new attachment record linking the print URL to the employee.
      // We use a synthetic upload record since the agreement is a generated
      // document (not a file upload). The upload URL points to the print page.
      const upload = await tx.upload.create({
        data: {
          storedName: `agreement-${employeeId}.pdf`,
          originalName: `Employment-Agreement-${employeeId.slice(-8)}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          url: agreementUrl,
          companyId,
          uploadedById: actorUserId,
        },
      });
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

    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        contractStatus: "ISSUED",
        contractIssuedAt: new Date(),
        contractAttachmentId: attachmentId,
        // Generate a shareable acceptance token if none exists
        contractToken: employee.contractToken ?? crypto.randomUUID(),
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
 * step that unlocks auto-deposit setup.
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
      salaryComponents: { where: { active: true }, select: { amount: true, frequency: true, isDeduction: true } },
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
  const hasMonthlyComponents = employee.salaryComponents.some(
    (c) => !c.isDeduction && c.frequency === "MONTHLY" && Number(c.amount) > 0,
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
      await tx.entityAttachment.update({
        where: { id: attachmentId },
        data: { label: `Offer Letter — ${new Date().toLocaleDateString()}` },
      });
    } else {
      const upload = await tx.upload.create({
        data: {
          storedName: `offer-letter-${employeeId}.pdf`,
          originalName: `Offer-Letter-${employeeId.slice(-8)}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          url: offerLetterUrl,
          companyId,
          uploadedById: actorUserId,
        },
      });
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

    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        offerLetterStatus: "ISSUED",
        offerLetterIssuedAt: new Date(),
        offerLetterAttachmentId: attachmentId,
        // Generate a shareable acceptance token if none exists
        offerToken: employee.offerToken ?? crypto.randomUUID(),
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
      await tx.entityAttachment.update({
        where: { id: attachmentId },
        data: { label: `Appointment Letter — ${new Date().toLocaleDateString()}` },
      });
    } else {
      const upload = await tx.upload.create({
        data: {
          storedName: `appointment-letter-${employeeId}.pdf`,
          originalName: `Appointment-Letter-${employeeId.slice(-8)}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          url: appointmentLetterUrl,
          companyId,
          uploadedById: actorUserId,
        },
      });
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
      await tx.entityAttachment.update({
        where: { id: attachmentId },
        data: { label: `Employee ID Card — ${new Date().toLocaleDateString()}` },
      });
    } else {
      const upload = await tx.upload.create({
        data: {
          storedName: `id-card-${employeeId}.pdf`,
          originalName: `ID-Card-${employeeId.slice(-8)}.pdf`,
          mimeType: "application/pdf",
          size: 0,
          url: idCardUrl,
          companyId,
          uploadedById: actorUserId,
        },
      });
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
 * and enables automatic salary credit on payday. Requires the agreement
 * to be CONFIRMED first (you shouldn't auto-deposit salary without a
 * signed contract).
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
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: { id: true, contractStatus: true, active: true },
  });
  if (!employee) throw new HrError("Employee not found", 404);

  // Bank details can be collected at any point, but auto-deposit
  // (automatic salary credit) should only be enabled after the
  // employment agreement is confirmed. This prevents salary payments
  // to employees who haven't signed their contract.
  if (!employee.active) {
    throw new HrError("Cannot set up auto-deposit for an inactive employee.", 400);
  }
  if (employee.contractStatus !== "CONFIRMED") {
    throw new HrError(
      "Cannot enable auto-deposit before the employment agreement is confirmed. Generate and confirm the agreement first.",
      400,
    );
  }

  // Validate
  if (!input.bankAccountHolder.trim()) throw new HrError("Bank account holder name is required.", 400);
  if (!input.bankAccountNumber.trim()) throw new HrError("Bank account number is required.", 400);
  if (!input.bankIfsc.trim()) throw new HrError("Bank IFSC code is required.", 400);
  if (!input.bankName.trim()) throw new HrError("Bank name is required.", 400);
  if (input.payDay < 1 || input.payDay > 31) throw new HrError("Pay day must be between 1 and 31.", 400);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.employee.update({
      where: { id: employeeId },
      data: {
        bankAccountHolder: input.bankAccountHolder.trim(),
        bankAccountNumber: input.bankAccountNumber.trim(),
        bankIfsc: input.bankIfsc.trim().toUpperCase(),
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
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) throw new HrError("Employee not found", 404);

  return prisma.$transaction(async (tx) => {
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
