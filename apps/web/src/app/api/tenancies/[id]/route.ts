import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import {
  activateTenancy, terminateTenancy, updateTenancy,
  applyRentEscalation, changeTenant, generateRentSchedule,
  uploadRentAgreement, uploadDraft,
} from "@nirman/services";
import { apiHandler, getCompany, json, editTenancySchema, changeTenantSchema, rentScheduleSchema, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { prisma } from "@nirman/db";

// POST /api/tenancies/[id] — action dispatcher for tenancy lifecycle
//   body: { action: "activate" | "terminate" | "escalate" | "changeTenant" | "generateSchedule" | "uploadAgreement", ...payload }
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Scoped pre-fetch
  const existing = await prisma.tenancy.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("Tenancy") },
  });
  if (!existing) return json({ error: "Tenancy not found or out of scope" }, { status: 404 });

  const body = await req.json();
  const action = body?.action;
  try {
    if (action === "activate") {
      const t = await activateTenancy(id, company.id, user.id);
      revalidatePath("/rentals");
      revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
      return json({ ok: true, id: t.id, status: t.status });
    }
    if (action === "terminate") {
      const t = await terminateTenancy(id, company.id, user.id);
      revalidatePath("/rentals");
      revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
      return json({ ok: true, id: t.id, status: t.status });
    }
    if (action === "escalate") {
      const result = await applyRentEscalation({ tenancyId: id, companyId: company.id, userId: user.id });
      revalidatePath("/rentals");
      revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
      return json({ ok: true, oldRent: result.oldRent.toString(), newRent: result.newRent.toString() });
    }
    if (action === "changeTenant") {
      const parsed = changeTenantSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      const result = await changeTenant({
        tenancyId: id,
        companyId: company.id,
        newTenantName: parsed.data.newTenantName,
        newTenantPhone: parsed.data.newTenantPhone ?? undefined,
        newTenantEmail: parsed.data.newTenantEmail ?? undefined,
        newCustomerId: parsed.data.newCustomerId ?? undefined,
        newMonthlyRent: parsed.data.newMonthlyRent ?? undefined,
        newRentAgreementNo: parsed.data.newRentAgreementNo ?? undefined,
        newRentAgreementDocumentUrl: parsed.data.newRentAgreementDocumentUrl ?? undefined,
        newRentAgreementDocumentName: parsed.data.newRentAgreementDocumentName ?? undefined,
        newStartDate: parsed.data.newStartDate ?? undefined,
        newEndDate: parsed.data.newEndDate ?? undefined,
        newSecurityDeposit: parsed.data.newSecurityDeposit ?? undefined,
        notes: parsed.data.notes ?? undefined,
        userId: user.id,
      });
      revalidatePath("/rentals");
      revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
      return json({ ok: true, oldTenancyId: result.oldTenancyId, newTenancyId: result.newTenancy.id }, { status: 201 });
    }
    if (action === "generateSchedule") {
      const parsed = rentScheduleSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      const result = await generateRentSchedule({
        tenancyId: id,
        companyId: company.id,
        monthsAhead: parsed.data.monthsAhead,
        userId: user.id,
      });
      revalidatePath("/rentals");
      revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
      return json({ ok: true, ...result }, { status: 201 });
    }
    if (action === "uploadAgreement") {
      const documentUrl = body?.documentUrl as string;
      if (!documentUrl) return json({ error: "documentUrl is required" }, { status: 400 });
      const t = await uploadRentAgreement({
        tenancyId: id,
        companyId: company.id,
        documentUrl,
        documentName: body?.documentName,
        userId: user.id,
      });
      revalidatePath("/rentals");
      revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
      return json({ ok: true, id: t.id });
    }
    if (action === "uploadDraft") {
      const t = await uploadDraft({
        tenancyId: id,
        companyId: company.id,
        documentUrl: body?.documentUrl,
        documentName: body?.documentName,
        draftNotes: body?.draftNotes,
        draftDate: body?.draftDate,
        userId: user.id,
      });
      revalidatePath("/rentals");
      revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
      return json({ ok: true, id: t.id });
    }
    return json({ error: "Unknown action. Use activate, terminate, escalate, changeTenant, generateSchedule, uploadAgreement, or uploadDraft." }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to update tenancy") }, { status: 400 });
  }
});

// PATCH /api/tenancies/[id] — edit a PENDING tenancy's details
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = editTenancySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const t = await updateTenancy(id, {
      companyId: company.id,
      tenantName: parsed.data.tenantName,
      tenantPhone: parsed.data.tenantPhone ?? null,
      tenantEmail: parsed.data.tenantEmail ?? null,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      monthlyRent: parsed.data.monthlyRent,
      securityDeposit: parsed.data.securityDeposit ?? 0,
      rentAgreementNo: parsed.data.rentAgreementNo ?? null,
      rentAgreementDocumentUrl: parsed.data.rentAgreementDocumentUrl ?? null,
      rentAgreementDocumentName: parsed.data.rentAgreementDocumentName ?? null,
      notes: parsed.data.notes ?? null,
      customerId: parsed.data.customerId ?? null,
      escalationPercent: parsed.data.escalationPercent ?? null,
      rentFreeDays: parsed.data.rentFreeDays,
      draftDocumentUrl: parsed.data.draftDocumentUrl ?? null,
      draftDocumentName: parsed.data.draftDocumentName ?? null,
      draftNotes: parsed.data.draftNotes ?? null,
      draftDate: parsed.data.draftDate ?? null,
      userId: user.id,
    });
    revalidatePath("/rentals");
    revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
    return json({ ok: true, id: t.id, status: t.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to edit tenancy") }, { status: 400 });
  }
});
