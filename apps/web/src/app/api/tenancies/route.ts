import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { TenancyStatus } from "@nirman/db";
import { createTenancy } from "@nirman/services";
import { apiHandler, getCompany, json, tenancySchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const tenancies = await prisma.tenancy.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status: status as TenancyStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      project: { select: { id: true, name: true } },
      payments: { orderBy: { paymentDate: "desc" } },
    },
  });

  return json(
    tenancies.map((t) => {
      const totalReceived = t.payments.reduce((s, p) => s + toNum(p.amount), 0);
      return {
        id: t.id,
        assetType: t.assetType,
        landParcelId: t.landParcelId,
        builtUnitId: t.builtUnitId,
        customerId: t.customerId,
        customerName: t.customer?.name ?? null,
        customerPhone: t.customer?.phone ?? null,
        projectId: t.projectId,
        projectName: t.project?.name ?? null,
        tenantName: t.tenantName,
        tenantPhone: t.tenantPhone,
        tenantEmail: t.tenantEmail,
        startDate: t.startDate.toISOString(),
        endDate: t.endDate.toISOString(),
        monthlyRent: toNum(t.monthlyRent),
        securityDeposit: toNum(t.securityDeposit),
        rentAgreementNo: t.rentAgreementNo,
        status: t.status,
        notes: t.notes,
        totalReceived,
        paymentCount: t.payments.length,
        payments: t.payments.map((p) => ({
          id: p.id,
          amount: toNum(p.amount),
          paymentDate: p.paymentDate.toISOString(),
          dueDate: p.dueDate.toISOString(),
          mode: p.mode,
          reference: p.reference,
          status: p.status,
        })),
      };
    }),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = tenancySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const tenancy = await createTenancy({
      companyId: company.id,
      assetType: parsed.data.assetType,
      landParcelId: parsed.data.landParcelId ?? undefined,
      builtUnitId: parsed.data.builtUnitId ?? undefined,
      customerId: parsed.data.customerId ?? undefined,
      projectId: parsed.data.projectId ?? undefined,
      tenantName: parsed.data.tenantName,
      tenantPhone: parsed.data.tenantPhone ?? undefined,
      tenantEmail: parsed.data.tenantEmail ?? undefined,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      monthlyRent: parsed.data.monthlyRent,
      securityDeposit: parsed.data.securityDeposit ?? 0,
      rentAgreementNo: parsed.data.rentAgreementNo ?? undefined,
      notes: parsed.data.notes ?? undefined,
      userId: user.id,
    });
    return json({ ok: true, id: tenancy.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create tenancy") }, { status: 400 });
  }
});
