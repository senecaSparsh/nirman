import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createEmployee } from "@nirman/services";
import { apiHandler, getCompany, json, employeeSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { normalizePhone } from "@/lib/phone-otp";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const crewId = url.searchParams.get("crewId");
  const activeOnly = url.searchParams.get("active") === "true";

  const employees = await prisma.employee.findMany({
    take: 200,
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(activeOnly ? { active: true } : {}),
      ...(crewId ? { crewId } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      crew: { select: { id: true, name: true } },
      activeProject: { select: { id: true, name: true } },
      reportingLocation: { select: { id: true, name: true } },
      _count: { select: { attendances: true, payrollLines: true } },
    },
  });
  return json(
    employees.map((e) => ({
      id: e.id,
      name: e.name,
      trade: e.trade,
      phone: e.phone,
      email: e.email,
      dailyRate: toNum(e.dailyRate),
      wageType: e.wageType,
      monthlySalary: e.monthlySalary ? toNum(e.monthlySalary) : null,
      designation: e.designation,
      joinDate: e.joinDate,
      crewId: e.crewId,
      crewName: e.crew?.name ?? null,
      activeProjectId: e.activeProjectId,
      activeProjectName: e.activeProject?.name ?? null,
      active: e.active,
      reportingLocationId: e.reportingLocationId,
      reportingLocationName: e.reportingLocation?.name ?? null,
      hierarchyLevel: e.hierarchyLevel,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = employeeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (parsed.data.joinDate) {
    const d = new Date(parsed.data.joinDate);
    if (isNaN(d.getTime())) {
      return json({ error: "Invalid join date format" }, { status: 400 });
    }
  }
  // ── Dedup detection: if the phone/email matches an existing User in
  //    this company who isn't yet linked to an Employee, flag it so the UI
  //    can offer to link instead of creating a duplicate. ──
  let dedupSuggestion: { userId: string; userName: string; userEmail: string } | null = null;
  if (parsed.data.phone) {
    const normalizedPhone = normalizePhone(parsed.data.phone);
    const existingUser = await prisma.user.findFirst({
      where: { phoneNormalized: normalizedPhone, active: true },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        memberships: { where: { companyId: company.id }, select: { id: true } },
        employees: { where: { companyId: company.id, deletedAt: null }, select: { id: true } },
      },
    });
    // Suggest link only if the user is a member of this company AND not
    // already linked to an employee in this company
    if (existingUser && existingUser.memberships.length > 0 && existingUser.employees.length === 0) {
      dedupSuggestion = {
        userId: existingUser.id,
        userName: existingUser.name,
        userEmail: existingUser.email,
      };
    }
  }
  if (!dedupSuggestion && parsed.data.email) {
    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        memberships: { where: { companyId: company.id }, select: { id: true } },
        employees: { where: { companyId: company.id, deletedAt: null }, select: { id: true } },
      },
    });
    if (existingUser && existingUser.active && existingUser.memberships.length > 0 && existingUser.employees.length === 0) {
      dedupSuggestion = {
        userId: existingUser.id,
        userName: existingUser.name,
        userEmail: existingUser.email,
      };
    }
  }

  const created = await createEmployee({
    companyId: company.id,
    name: parsed.data.name,
    trade: parsed.data.trade ?? undefined,
    phone: parsed.data.phone ?? undefined,
    email: parsed.data.email ?? undefined,
    dailyRate: parsed.data.dailyRate ?? 0,
    wageType: parsed.data.wageType ?? "DAILY",
    monthlySalary: parsed.data.monthlySalary ?? null,
    designation: parsed.data.designation ?? undefined,
    joinDate: parsed.data.joinDate ? new Date(parsed.data.joinDate) : undefined,
    crewId: parsed.data.crewId || undefined,
    activeProjectId: parsed.data.activeProjectId || undefined,
    active: parsed.data.active ?? true,
    reportingLocationId: parsed.data.reportingLocationId || undefined,
    hierarchyLevel: parsed.data.hierarchyLevel ?? undefined,
    userId: user.id,
    // Employment terms (dossier) — accepted at creation time
    employmentType: parsed.data.employmentType ?? undefined,
    noticePeriodDays: parsed.data.noticePeriodDays ?? undefined,
    contractStartDate: parsed.data.contractStartDate ? new Date(parsed.data.contractStartDate) : undefined,
    contractEndDate: parsed.data.contractEndDate ? new Date(parsed.data.contractEndDate) : undefined,
  });
  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");
  return json(
    {
      ok: true,
      id: created.id,
      name: created.name,
      trade: created.trade,
      ...(dedupSuggestion ? { dedupSuggestion } : {}),
    },
    { status: 201 },
  );
});
