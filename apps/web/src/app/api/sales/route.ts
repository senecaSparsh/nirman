import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import type { SaleStatus } from "@nirman/db";
import { sellAsset } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, sellAssetSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const sales = await prisma.assetSale.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status: status as SaleStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      project: { select: { id: true, name: true } },
      payments: { orderBy: { paymentDate: "asc" } },
      expenses: { orderBy: { sortOrder: "asc" } },
      terms: { orderBy: { sortOrder: "asc" } },
      broker: { select: { id: true, name: true, phone: true, agency: true } },
      paymentSchedule: { include: { items: { orderBy: { installmentNo: "asc" } } } },
    },
  });

  // Fetch land parcels and built units separately (no direct relation on AssetSale)
  const landParcelIds = sales.filter((s) => s.landParcelId).map((s) => s.landParcelId!);
  const builtUnitIds = sales.filter((s) => s.builtUnitId).map((s) => s.builtUnitId!);

  const [landParcels, builtUnits] = await Promise.all([
    landParcelIds.length > 0
      ? prisma.landParcel.findMany({ where: { id: { in: landParcelIds }, deletedAt: null }, select: { id: true, number: true, area: true, areaUnit: true } })
      : [],
    builtUnitIds.length > 0
      ? prisma.builtUnit.findMany({ where: { id: { in: builtUnitIds }, deletedAt: null }, select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true } })
      : [],
  ]);

  const parcelMap = new Map(landParcels.map((p) => [p.id, p]));
  const unitMap = new Map(builtUnits.map((u) => [u.id, u]));

  return json(
    sales.map((s) => {
      const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
      const parcel = s.landParcelId ? parcelMap.get(s.landParcelId) : null;
      const unit = s.builtUnitId ? unitMap.get(s.builtUnitId) : null;
      return {
        id: s.id,
        saleNumber: s.saleNumber,
        assetType: s.assetType,
        landParcelId: s.landParcelId,
        landParcelNumber: parcel?.number ?? null,
        builtUnitId: s.builtUnitId,
        builtUnitNumber: unit?.unitNumber ?? null,
        builtUnitType: unit?.unitType ?? null,
        assetArea: parcel ? toNum(parcel.area) : unit ? toNum(unit.area) : null,
        assetAreaUnit: parcel?.areaUnit ?? unit?.areaUnit ?? null,
        customerId: s.customerId,
        customerName: s.customer.name,
        customerPhone: s.customer.phone,
        projectId: s.projectId,
        projectName: s.project?.name ?? null,
        salePrice: toNum(s.salePrice),
        gstRate: toNum(s.gstRate),
        gstAmount: toNum(s.gstAmount),
        costBasis: toNum(s.costBasis),
        profit: toNum(s.profit),
        saleDate: s.saleDate.toISOString(),
        status: s.status,
        saleStage: s.saleStage,
        depositAmount: s.depositAmount ? toNum(s.depositAmount) : null,
        depositDate: s.depositDate ? s.depositDate.toISOString() : null,
        finalSaleDate: s.finalSaleDate ? s.finalSaleDate.toISOString() : null,
        saleDeedNo: s.saleDeedNo,
        expectedRegistryDate: s.expectedRegistryDate ? s.expectedRegistryDate.toISOString() : null,
        // Sale compliance documents
        allotmentLetterNo: s.allotmentLetterNo,
        allotmentDate: s.allotmentDate ? s.allotmentDate.toISOString() : null,
        bbaNo: s.bbaNo,
        bbaDate: s.bbaDate ? s.bbaDate.toISOString() : null,
        // TDS tracking
        tdsAmount: s.tdsAmount ? toNum(s.tdsAmount) : null,
        tdsCertificateNo: s.tdsCertificateNo,
        // Home loan tracking
        homeLoanBank: s.homeLoanBank,
        homeLoanAmount: s.homeLoanAmount ? toNum(s.homeLoanAmount) : null,
        homeLoanSanctionNo: s.homeLoanSanctionNo,
        homeLoanSanctionDate: s.homeLoanSanctionDate ? s.homeLoanSanctionDate.toISOString() : null,
        // Deal terms
        dealMaturityMonths: s.dealMaturityMonths,
        dealMaturityDate: s.dealMaturityDate ? s.dealMaturityDate.toISOString() : null,
        paymentCycle: s.paymentCycle,
        // Broker / deal source
        dealSource: s.dealSource,
        brokerId: s.brokerId,
        brokerName: s.brokerName,
        brokerPhone: s.brokerPhone,
        brokerAgency: s.broker?.agency ?? null,
        commissionAmount: s.commissionAmount ? toNum(s.commissionAmount) : null,
        commissionIsPartOfDeal: s.commissionIsPartOfDeal,
        commissionPaid: s.commissionPaid,
        commissionPaidDate: s.commissionPaidDate ? s.commissionPaidDate.toISOString() : null,
        // Sale expenses
        expenses: s.expenses.map((e) => ({
          id: e.id,
          head: e.head,
          label: e.label,
          amount: toNum(e.amount),
          borneBy: e.borneBy,
          isIncluded: e.isIncluded,
        })),
        // Sale terms
        terms: s.terms.map((t) => ({
          id: t.id,
          description: t.description,
          extraAmount: t.extraAmount ? toNum(t.extraAmount) : null,
          isIncluded: t.isIncluded,
        })),
        // Payment schedule
        paymentSchedule: s.paymentSchedule
          ? {
              type: s.paymentSchedule.type,
              totalAmount: toNum(s.paymentSchedule.totalAmount),
              items: s.paymentSchedule.items.map((item) => ({
                installmentNo: item.installmentNo,
                description: item.description,
                percentage: toNum(item.percentage),
                amount: toNum(item.amount),
                dueDate: item.dueDate ? item.dueDate.toISOString() : null,
                status: item.status,
                paidAmount: toNum(item.paidAmount),
              })),
            }
          : null,
        paymentStatus: s.paymentStatus,
        paymentMode: s.paymentMode,
        notes: s.notes,
        totalPaid,
        balanceDue: toNum(s.salePrice) + toNum(s.gstAmount) - totalPaid,
        paymentCount: s.payments.length,
      };
    }),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const body = await req.json();
  const parsed = sellAssetSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const company = await getCompany();
    const sale = await sellAsset({
      assetType: parsed.data.assetType,
      landParcelId: parsed.data.landParcelId ?? undefined,
      builtUnitId: parsed.data.builtUnitId ?? undefined,
      projectId: parsed.data.projectId ?? undefined,
      customerId: parsed.data.customerId,
      companyId: company.id,
      salePrice: parsed.data.salePrice,
      gstRate: parsed.data.gstRate ?? 0,
      paymentMode: parsed.data.paymentMode ?? undefined,
      notes: parsed.data.notes ?? undefined,
      initialPayment: parsed.data.initialPayment,
      initialPaymentMode: parsed.data.initialPaymentMode,
      saleDeedNo: parsed.data.saleDeedNo ?? undefined,
      expectedRegistryDate: parsed.data.expectedRegistryDate ?? undefined,
      // Sale compliance documents
      allotmentLetterNo: parsed.data.allotmentLetterNo ?? undefined,
      allotmentDate: parsed.data.allotmentDate ?? undefined,
      bbaNo: parsed.data.bbaNo ?? undefined,
      bbaDate: parsed.data.bbaDate ?? undefined,
      // TDS tracking
      tdsAmount: parsed.data.tdsAmount ?? undefined,
      tdsCertificateNo: parsed.data.tdsCertificateNo ?? undefined,
      // Home loan tracking
      homeLoanBank: parsed.data.homeLoanBank ?? undefined,
      homeLoanAmount: parsed.data.homeLoanAmount ?? undefined,
      homeLoanSanctionNo: parsed.data.homeLoanSanctionNo ?? undefined,
      homeLoanSanctionDate: parsed.data.homeLoanSanctionDate ?? undefined,
      // Deal terms
      dealMaturityMonths: parsed.data.dealMaturityMonths ?? undefined,
      paymentCycle: parsed.data.paymentCycle ?? undefined,
      // Sale expenses
      expenses: parsed.data.expenses ?? undefined,
      // Sale terms & conditions
      terms: parsed.data.terms ?? undefined,
      // Broker / deal source
      dealSource: parsed.data.dealSource ?? undefined,
      brokerId: parsed.data.brokerId ?? undefined,
      brokerName: parsed.data.brokerName ?? undefined,
      brokerPhone: parsed.data.brokerPhone ?? undefined,
      commissionAmount: parsed.data.commissionAmount ?? undefined,
      commissionIsPartOfDeal: parsed.data.commissionIsPartOfDeal ?? undefined,
      // Payment schedule
      paymentSchedule: parsed.data.paymentSchedule ?? undefined,
      // Audit logging
      userId: user.id,
    });

    revalidatePath("/m/sales");
    return json({ ok: true, saleId: sale.id, saleNumber: sale.saleNumber }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create sale") }, { status: 400 });
  }
});
