import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { updateEmployee, softDelete, updateEmployeeDossier, type EmployeeDossierInput, logAction, autoCompleteOnboarding } from "@nirman/services";
import { apiHandler, getCompany, json, employeeSchema, requirePermission, assertScopeAllows, canManageSpecificEmployee, assertCanManageEmployee, getCurrentUser, scopeWhere, getEmployeeAccessScope, isTopLevelViewer } from "@/lib/server";
import { pickEmployeeRoster, redactEmployeeRow } from "@/lib/employee-visibility";
import { PERM } from "@/lib/roles";

/** GET /api/employees/[id] — fetch a single employee by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;
  // Compensation + dossier fields (wages, bank, PAN/Aadhaar/PF/ESI/UAN,
  // addresses, employment terms, signing tokens) follow the same field-
  // visibility policy as the profile pages: payroll.manage|hr.manage only.
  // hr.view-only callers (site engineers, supervisors, QAQC) get the roster
  // subset — who the person is and where they work, plus the safety fields
  // field staff legitimately need (emergency contact, blood group, photo).
  const scope = await getEmployeeAccessScope();
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    include: {
      crew: { select: { id: true, name: true } },
      activeProject: { select: { id: true, name: true } },
      reportingLocation: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });
  // Full tier — redactEmployeeRow is a passthrough when all flags are true
  // (they share one gate today; if the tiers ever split this stays correct).
  if (scope.canSeePayroll) return json(redactEmployeeRow(employee, scope));
  // Roster tier — deny-by-default allowlist from lib/employee-visibility.ts
  // (new schema columns can't leak here), plus the relation summaries.
  return json({
    ...pickEmployeeRoster(employee),
    crew: employee.crew,
    activeProject: employee.activeProject,
    reportingLocation: employee.reportingLocation,
    user: employee.user,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = employeeSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Scope validation: if the viewer is changing department/project, the
  // new target must be within their scope.
  if (parsed.data.departmentId !== undefined || parsed.data.activeProjectId !== undefined) {
    try {
      await assertScopeAllows({
        departmentId: parsed.data.departmentId ?? null,
        projectId: parsed.data.activeProjectId ?? null,
      });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
    }
  }
  if (parsed.data.joinDate) {
    const d = new Date(parsed.data.joinDate);
    if (isNaN(d.getTime())) {
      return json({ error: "Invalid join date format" }, { status: 400 });
    }
  }
  // Fetch the current employee. The H1 wall (inside scopeWhere) hides
  // owner/admin records from non-top viewers — the row reads as "not found".
  const existing = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true, userId: true, reportsToEmployeeId: true, hierarchyLevel: true, user: { select: { role: true } } },
  });
  if (!existing) return json({ error: "Employee not found" }, { status: 404 });

  // H1 wall on writes: only top-level viewers may set hierarchyLevel 1 —
  // otherwise anyone could promote a record into the protected tier.
  if (parsed.data.hierarchyLevel === 1 && !(await isTopLevelViewer())) {
    return json({ error: "Only the owner or admin can assign hierarchy level 1." }, { status: 403 });
  }

  // ── Hierarchy check: viewer must be above this employee ──
  const currentUser = await getCurrentUser();
  if (currentUser) {
    const canEdit = await canManageSpecificEmployee(
      { userId: existing.userId, user: existing.user ? { role: existing.user.role } : null, hierarchyLevel: existing.hierarchyLevel },
      currentUser.id,
    );
    if (!canEdit) return json({ error: "You cannot edit this employee (hierarchy or role restriction)" }, { status: 403 });
  }
  const updated = await updateEmployee({
    employeeId: id,
    companyId: company.id,
    name: parsed.data.name,
    trade: parsed.data.trade,
    phone: parsed.data.phone,
    email: parsed.data.email,
    // Wage fields pass through verbatim: `undefined` (key absent from the
    // body) means "don't touch", `null` means an explicit clear. Collapsing
    // either direction corrupts data — e.g. absent→null would wipe
    // monthlySalary on every unrelated PATCH (dossier saves, checklist
    // toggles, reports-to, re-activate), and null→undefined would make
    // clearing the rate a silent no-op.
    dailyRate: parsed.data.dailyRate,
    wageType: parsed.data.wageType,
    monthlySalary: parsed.data.monthlySalary,
    designation: parsed.data.designation,
    departmentId: parsed.data.departmentId,
    joinDate: parsed.data.joinDate !== undefined ? (parsed.data.joinDate ? new Date(parsed.data.joinDate) : null) : undefined,
    crewId: parsed.data.crewId,
    activeProjectId: parsed.data.activeProjectId,
    active: parsed.data.active,
    reportingLocationId: parsed.data.reportingLocationId,
    hierarchyLevel: parsed.data.hierarchyLevel,
    reportsToEmployeeId: parsed.data.reportsToEmployeeId,
    userId: user.id,
    // Identity / personal (for ID card & compliance)
    dateOfBirth: parsed.data.dateOfBirth !== undefined ? (parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null) : undefined,
    bloodGroup: parsed.data.bloodGroup,
  });

  // ── Dossier fields (employment terms, bank, tax, emergency, address) ──
  const dossierFields: EmployeeDossierInput = {};
  const dossierKeys: (keyof EmployeeDossierInput)[] = [
    "employmentType", "probationEndDate", "confirmationDate", "noticePeriodDays",
    "contractStartDate", "contractEndDate", "payDay",
    "bankAccountHolder", "bankAccountNumber", "bankIfsc", "bankName", "bankBranch",
    "panNumber", "aadhaarNumber", "pfNumber", "esiNumber", "uan",
    "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation",
    "permanentAddress", "currentAddress",
    "dateOfBirth", "bloodGroup", "photoUrl",
    "documentsSubmitted", "backgroundVerified",
  ];
  let hasDossier = false;
  for (const key of dossierKeys) {
    if (key in body) {
      (dossierFields as Record<string, unknown>)[key] = body[key];
      hasDossier = true;
    }
  }
  if (hasDossier) {
    await updateEmployeeDossier(id, company.id, user.id, dossierFields);
  }

  // ── Reporting line audit (Employee → Employee) ──
  // Self-report and cycle validation happen inside updateEmployee's
  // transaction (before the write) — reaching this point means it passed.
  if (parsed.data.reportsToEmployeeId !== undefined) {
    const newManagerId = parsed.data.reportsToEmployeeId || null;
    await logAction(prisma, {
      userId: user.id,
      action: "EMPLOYEE_REPORTS_TO_UPDATE",
      entityType: "Employee",
      entityId: id,
      before: { reportsToEmployeeId: existing.reportsToEmployeeId },
      after: { reportsToEmployeeId: newManagerId },
    });
  }

  // ── Auto-complete onboarding if all steps are now done ──
  // (e.g. HR just filled the last dossier field or toggled the checklist)
  await autoCompleteOnboarding(id, company.id).catch(() => {});

  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");
  revalidatePath(`/hr/employees/${id}`);
  revalidatePath(`/m/hr/employees/${id}`);
  revalidatePath("/m/hr/onboarding");
  revalidatePath(`/m/hr/onboarding/${id}`);
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const existing = await prisma.employee.findFirst({ where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") }, select: { id: true } });
  if (!existing) return json({ error: "Employee not found" }, { status: 404 });
  // ── Hierarchy check: viewer must be above this employee ──
  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }
  try {
    await softDelete("Employee", id);
    revalidatePath("/hr/employees");
    revalidatePath("/m/hr/employees");
    revalidatePath("/m/hr/employees");
    revalidatePath(`/m/hr/onboarding/${id}`);
    revalidatePath("/m/hr/onboarding");
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete employee") }, { status: 400 });
  }
});
