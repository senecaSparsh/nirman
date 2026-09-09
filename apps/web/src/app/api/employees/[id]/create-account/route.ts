import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { hashPassword } from "better-auth/crypto";
import {
  createEmployeeAccount,
  HrError,
  type ModulePermission,
  type ScopeEntry,
} from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee } from "@/lib/server";
import { PERM, ALL_ROLES, canAssignRole, type Role } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";

/**
 * POST /api/employees/[id]/create-account — create a login account for an
 * employee and link it. This is the atomic onboarding transaction that
 * connects Employee (HR) ↔ User (auth) ↔ CompanyPhone (call tracking).
 *
 * Body: {
 *   phone: string,              // the login phone (gets OTP)
 *   email?: string,             // optional email
 *   role: string,               // RBAC role (must be assignable by actor)
 *   permissions?: string[],     // module permissions to grant
 *   scopeType?: "COMPANY" | "DEPARTMENT" | "PROJECT",
 *   scopes?: { scopeKind, departmentId?, projectId? }[],
 *   reportsToUserCompanyId?: string,
 *   companyPhoneId?: string,    // existing company number to assign
 *   newPhoneNumber?: string,    // OR a brand-new number to add + assign
 *   newPhoneLabel?: string,
 *   newPhoneDepartment?: string,
 *   newPhoneMonthlyCost?: number,
 *   newPhoneProvider?: string,
 *   employeeCode?: string,
 *   designation?: string,
 *   department?: string,
 *   joiningDate?: string,
 *   mustChangePassword?: boolean,
 * }
 *
 * Requires HR_MANAGE (the actor is creating an employee account from the HR
 * module). The role assignment is validated via canAssignRole.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Hierarchy + scope check
  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  const body = await req.json();
  const {
    phone,
    email,
    role,
    permissions,
    scopeType,
    scopes,
    reportsToUserCompanyId,
    companyPhoneId,
    newPhoneNumber,
    newPhoneLabel,
    newPhoneDepartment,
    newPhoneMonthlyCost,
    newPhoneProvider,
    employeeCode,
    designation,
    department,
    joiningDate,
    mustChangePassword,
  } = body as {
    phone?: string;
    email?: string;
    role?: string;
    permissions?: string[];
    scopeType?: "COMPANY" | "DEPARTMENT" | "PROJECT";
    scopes?: ScopeEntry[];
    reportsToUserCompanyId?: string;
    companyPhoneId?: string;
    newPhoneNumber?: string;
    newPhoneLabel?: string;
    newPhoneDepartment?: string;
    newPhoneMonthlyCost?: number;
    newPhoneProvider?: string;
    employeeCode?: string;
    designation?: string;
    department?: string;
    joiningDate?: string;
    mustChangePassword?: boolean;
  };

  // ── Validate ──
  if (!phone?.trim()) {
    return json({ error: "Phone number is required for the login account." }, { status: 400 });
  }
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length < 10) {
    return json({ error: "A valid phone number is required." }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!role || !ALL_ROLES.includes(role as Role)) {
    return json({ error: `Role must be one of: ${ALL_ROLES.join(", ")}` }, { status: 400 });
  }
  if (!canAssignRole(session.role, role)) {
    return json(
      { error: `You cannot assign the ${role} role — it is at or above your tier.` },
      { status: 403 },
    );
  }
  if (!companyPhoneId && !newPhoneNumber) {
    return json(
      { error: "Either an existing company phone number or a new phone number is required." },
      { status: 400 },
    );
  }

  // ── Hash a random placeholder password (OTP is primary, password is optional later) ──
  const hashedPassword = await hashPassword(randomBytes(32).toString("hex"));

  const modulePerms: ModulePermission[] | undefined =
    permissions?.map((p) => ({ permission: p }));

  try {
    const result = await createEmployeeAccount({
      employeeId: id,
      companyId: company.id,
      actorUserId: session.id,
      phone: phone.trim(),
      email: email?.trim() || null,
      role: role as Role,
      permissions: modulePerms,
      scopeType: scopeType ?? null,
      scopes,
      reportsToUserCompanyId: reportsToUserCompanyId ?? null,
      companyPhoneId: companyPhoneId || null,
      newPhoneNumber: newPhoneNumber?.trim() || null,
      newPhoneLabel: newPhoneLabel || null,
      newPhoneDepartment: newPhoneDepartment || null,
      newPhoneMonthlyCost: newPhoneMonthlyCost ?? null,
      newPhoneProvider: newPhoneProvider || null,
      hashedPassword,
      mustChangePassword: mustChangePassword !== false,
      employeeCode: employeeCode || null,
      designation: designation || null,
      department: department || null,
      joiningDate: joiningDate || null,
    });

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);
    revalidatePath("/hr/employees");
    revalidatePath("/m/hr/employees");
    revalidatePath("/m/hr?tab=employees");
    revalidatePath("/settings/people");

    return json(
      {
        ok: true,
        ...result,
        message: `Account created and linked. The employee can log in with phone ${phone} via OTP.`,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
