import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { updateEmployee, softDelete, updateEmployeeDossier, type EmployeeDossierInput } from "@nirman/services";
import { apiHandler, getCompany, json, employeeSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/employees/[id] — fetch a single employee by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
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
  if (parsed.data.joinDate) {
    const d = new Date(parsed.data.joinDate);
    if (isNaN(d.getTime())) {
      return json({ error: "Invalid join date format" }, { status: 400 });
    }
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
    joinDate: parsed.data.joinDate !== undefined ? (parsed.data.joinDate ? new Date(parsed.data.joinDate) : null) : undefined,
    crewId: parsed.data.crewId,
    activeProjectId: parsed.data.activeProjectId,
    active: parsed.data.active,
    reportingLocationId: parsed.data.reportingLocationId,
    hierarchyLevel: parsed.data.hierarchyLevel ?? undefined,
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
  const existing = await prisma.employee.findFirst({ where: { id, companyId: company.id, deletedAt: null }, select: { id: true } });
  if (!existing) return json({ error: "Employee not found" }, { status: 404 });
  try {
    await softDelete("Employee", id);
    revalidatePath("/hr/employees");
    revalidatePath("/m/hr/employees");
    revalidatePath("/m/hr?tab=employees");
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete employee") }, { status: 400 });
  }
});
