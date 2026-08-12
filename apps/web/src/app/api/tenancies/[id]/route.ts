import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { activateTenancy, terminateTenancy, updateTenancy } from "@nirman/services";
import { apiHandler, getCompany, json, editTenancySchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

// POST /api/tenancies/[id] — activate or terminate a tenancy
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const action = body?.action;
  try {
    if (action === "activate") {
      const t = await activateTenancy(id, company.id, user.id);
      revalidatePath("/m/rentals");
      return json({ ok: true, id: t.id, status: t.status });
    } else if (action === "terminate") {
      const t = await terminateTenancy(id, company.id, user.id);
      revalidatePath("/m/rentals");
      return json({ ok: true, id: t.id, status: t.status });
    }
    return json({ error: "Unknown action. Use 'activate' or 'terminate'." }, { status: 400 });
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
      notes: parsed.data.notes ?? null,
      customerId: parsed.data.customerId ?? null,
      userId: user.id,
    });
    revalidatePath("/m/rentals");
    return json({ ok: true, id: t.id, status: t.status });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to edit tenancy") }, { status: 400 });
  }
});
