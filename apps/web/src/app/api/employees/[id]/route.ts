import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { updateEmployee, softDelete, updateEmployeeDossier, type EmployeeDossierInput, logAction, autoCompleteOnboarding } from "@nirman/services";
import { apiHandler, getCompany, json, employeeSchema, requirePermission, assertScopeAllows, canManageSpecificEmployee, assertCanManageEmployee, getCurrentUser, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/employees/[id] — fetch a single employee by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;
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
  return json(employee);
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
  // Fetch the current employee.
  const existing = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true, userId: true, reportsToEmployeeId: true, hierarchyLevel: true, user: { select: { role: true } } },
  });
  if (!existing) return json({ error: "Employee not found" }, { status: 404 });

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
    dailyRate: parsed.data.dailyRate ?? undefined,
    wageType: parsed.data.wageType,
    monthlySalary: parsed.data.monthlySalary ?? null,
    designation: parsed.data.designation,
    departmentId: parsed.data.departmentId ?? undefined,
    joinDate: parsed.data.joinDate !== undefined ? (parsed.data.joinDate ? new Date(parsed.data.joinDate) : null) : undefined,
    crewId: parsed.data.crewId,
    activeProjectId: parsed.data.activeProjectId,
    active: parsed.data.active,
    reportingLocationId: parsed.data.reportingLocationId,
    hierarchyLevel: parsed.data.hierarchyLevel ?? undefined,
    reportsToEmployeeId: parsed.data.reportsToEmployeeId ?? undefined,
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

  // ── Reporting line cycle check (Employee → Employee) ──
  // The reportsToEmployeeId is set via updateEmployee above. Here we just
  // validate no cycle was created by walking up the chain.
  if (parsed.data.reportsToEmployeeId !== undefined) {
    const newManagerId = parsed.data.reportsToEmployeeId || null;
    if (newManagerId) {
      if (newManagerId === id) {
        return json({ error: "Cannot report to yourself" }, { status: 400 });
      }
      // Walk up the chain to detect cycles
      let current: string | null = newManagerId;
      const visited = new Set<string>([id]);
      while (current) {
        if (visited.has(current)) {
          return json({ error: "That reporting line would create a cycle" }, { status: 400 });
        }
        visited.add(current);
        const up: { reportsToEmployeeId: string | null } | null = await prisma.employee.findUnique({
          where: { id: current },
          select: { reportsToEmployeeId: true },
        });
        current = up?.reportsToEmployeeId ?? null;
      }
    }
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
    revalidatePath("/m/hr?tab=employees");
  revalidatePath(`/hr/employees/${id}`);
  revalidatePath(`/m/hr/employees/${id}`);
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
    revalidatePath("/m/hr?tab=employees");
    revalidatePath(`/m/hr/onboarding/${id}`);
    revalidatePath("/m/hr/onboarding");
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete employee") }, { status: 400 });
  }
});
