import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createEmployee, generateOfferLetter, generateEmploymentAgreement, generateEmployeeIdCard, generateAppointmentLetter, setSalaryComponents, autoCompleteOnboarding } from "@nirman/services";
import { apiHandler, getCompany, json, employeeSchema, requirePermission, toNum, assertScopeAllows, getCompanyGroupIds, scopeWhere } from "@/lib/server";
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
      ...await scopeWhere("Employee"),
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
  // Scope validation: department/project must be within the viewer's scope
  try {
    await assertScopeAllows({
      departmentId: parsed.data.departmentId ?? null,
      projectId: parsed.data.activeProjectId ?? null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  if (parsed.data.joinDate) {
    const d = new Date(parsed.data.joinDate);
    if (isNaN(d.getTime())) {
      return json({ error: "Invalid join date format" }, { status: 400 });
    }
  }

  // ── Resolve target companies ──
  // If companyIds is provided, validate each is in the user's company group
  // (parent + children) and the user has HR_MANAGE in that company.
  // Otherwise, default to the active company only.
  const groupIds = await getCompanyGroupIds();
  const requestedCompanyIds = parsed.data.companyIds?.filter((id) => groupIds.includes(id)) ?? [];
  const targetCompanyIds = requestedCompanyIds.length > 0 ? requestedCompanyIds : [company.id];

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

  // ── Create the employee in each target company ──
  // The first created employee is the "primary" one we return for onboarding
  // redirect. All employees share the same personal data; per-company fields
  // (department, project, crew) are only set for the active company since
  // those IDs are company-specific.
  const createdIds: { id: string; companyId: string }[] = [];
  let primaryCreated: { id: string; name: string; trade: string | null } | null = null;
  const autoGenResults: { offerLetter?: string; agreement?: string; idCard?: string; appointmentLetter?: string } = {};

  for (const targetCompanyId of targetCompanyIds) {
    // Department/project/crew IDs are company-specific — only apply to the
    // active company where the form was filled. Other companies get the
    // personal data only; HR in those companies can assign dept/project later.
    const isPrimary = targetCompanyId === company.id;
    const created = await createEmployee({
      companyId: targetCompanyId,
      name: parsed.data.name,
      trade: parsed.data.trade ?? undefined,
      phone: parsed.data.phone ?? undefined,
      email: parsed.data.email ?? undefined,
      dailyRate: isPrimary ? (parsed.data.dailyRate ?? 0) : 0,
      wageType: isPrimary ? (parsed.data.wageType ?? "DAILY") : "DAILY",
      monthlySalary: isPrimary ? (parsed.data.monthlySalary ?? null) : null,
      designation: parsed.data.designation ?? undefined,
      departmentId: isPrimary ? (parsed.data.departmentId || undefined) : undefined,
      joinDate: parsed.data.joinDate ? new Date(parsed.data.joinDate) : undefined,
      crewId: isPrimary ? (parsed.data.crewId || undefined) : undefined,
      activeProjectId: isPrimary ? (parsed.data.activeProjectId || undefined) : undefined,
      active: parsed.data.active ?? true,
      reportingLocationId: isPrimary ? (parsed.data.reportingLocationId || undefined) : undefined,
      hierarchyLevel: parsed.data.hierarchyLevel ?? undefined,
      userId: user.id,
      // Employment terms (dossier) — accepted at creation time
      employmentType: parsed.data.employmentType ?? undefined,
      noticePeriodDays: parsed.data.noticePeriodDays ?? undefined,
      contractStartDate: parsed.data.contractStartDate ? new Date(parsed.data.contractStartDate) : undefined,
      contractEndDate: parsed.data.contractEndDate ? new Date(parsed.data.contractEndDate) : undefined,
      // Dossier fields — collected during hiring
      payDay: parsed.data.payDay ?? undefined,
      bankAccountHolder: parsed.data.bankAccountHolder ?? undefined,
      bankAccountNumber: parsed.data.bankAccountNumber ?? undefined,
      bankIfsc: parsed.data.bankIfsc ?? undefined,
      bankName: parsed.data.bankName ?? undefined,
      bankBranch: parsed.data.bankBranch ?? undefined,
      panNumber: parsed.data.panNumber ?? undefined,
      aadhaarNumber: parsed.data.aadhaarNumber ?? undefined,
      pfNumber: parsed.data.pfNumber ?? undefined,
      esiNumber: parsed.data.esiNumber ?? undefined,
      uan: parsed.data.uan ?? undefined,
      emergencyContactName: parsed.data.emergencyContactName ?? undefined,
      emergencyContactPhone: parsed.data.emergencyContactPhone ?? undefined,
      emergencyContactRelation: parsed.data.emergencyContactRelation ?? undefined,
      permanentAddress: parsed.data.permanentAddress ?? undefined,
      currentAddress: parsed.data.currentAddress ?? undefined,
      // Identity / personal (for ID card & compliance)
      dateOfBirth: parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : undefined,
      bloodGroup: parsed.data.bloodGroup ?? undefined,
      photoUrl: parsed.data.photoUrl ?? undefined,
    });
    createdIds.push({ id: created.id, companyId: targetCompanyId });
    if (isPrimary) {
      primaryCreated = { id: created.id, name: created.name, trade: created.trade };
    }

    // ── Save salary components BEFORE auto-generating documents ──
    // (only for the primary company — other companies set salary during
    // their own onboarding)
    if (isPrimary && parsed.data.salaryComponents && parsed.data.salaryComponents.length > 0) {
      try {
        await setSalaryComponents(
          created.id,
          targetCompanyId,
          user.id,
          parsed.data.salaryComponents.map((c) => ({
            employeeId: created.id,
            type: c.type as never,
            amount: c.amount,
            frequency: c.frequency ?? "MONTHLY",
            isDeduction: c.isDeduction ?? false,
            isPercentage: c.isPercentage ?? false,
            percentageOfBasic: c.percentageOfBasic ?? null,
          })),
          { changedBy: user.id, changeReason: "Joining" },
        );
      } catch { /* non-fatal — documents will still generate without CTC table */ }
    }

    // ── Auto-generate offer letter, employment agreement, and ID card ──
    // (only for the primary company to avoid duplicate document generation)
    if (isPrimary) {
      try {
        const offer = await generateOfferLetter(created.id, targetCompanyId, user.id);
        autoGenResults.offerLetter = offer.offerLetterUrl;
      } catch { /* prerequisites not met — skip */ }
      try {
        const agreement = await generateEmploymentAgreement(created.id, targetCompanyId, user.id);
        autoGenResults.agreement = agreement.agreementUrl;
      } catch { /* prerequisites not met — skip */ }
      try {
        const idCard = await generateEmployeeIdCard(created.id, targetCompanyId, user.id);
        autoGenResults.idCard = idCard.idCardUrl;
      } catch { /* skip */ }
      try {
        const appt = await generateAppointmentLetter(created.id, targetCompanyId, user.id);
        autoGenResults.appointmentLetter = appt.appointmentLetterUrl;
      } catch { /* prerequisites not met — skip */ }
    }

    // ── Auto-complete onboarding if all steps are already done ──
    await autoCompleteOnboarding(created.id, targetCompanyId).catch(() => {});
  }

  // Fallback if primary wasn't created (shouldn't happen, but be safe)
  if (!primaryCreated) {
    const first = createdIds[0];
    if (first) {
      const emp = await prisma.employee.findUnique({ where: { id: first.id }, select: { name: true, trade: true } });
      primaryCreated = { id: first.id, name: emp?.name ?? "", trade: emp?.trade ?? null };
    }
  }

  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");
    revalidatePath("/m/hr?tab=employees");
  revalidatePath("/m/hr/onboarding");
  return json(
    {
      ok: true,
      id: primaryCreated?.id,
      name: primaryCreated?.name,
      trade: primaryCreated?.trade,
      companyIds: createdIds.map((c) => c.companyId),
      autoGenerated: autoGenResults,
      ...(dedupSuggestion ? { dedupSuggestion } : {}),
    },
    { status: 201 },
  );
});
