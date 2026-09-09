import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { SaleDetailPageClient } from "./sale-detail-client";
import type { AssetSaleRow } from "@/lib/types";

export const metadata = { title: "Sale Detail" };

/**
 * /sales/[id] — desktop sale detail. Deep links from the command palette,
 * the sales list (`/sales?sale=<id>` opens a dialog, but direct navigation
 * to `/sales/<id>` lands here), and the mobile `/m/sales/[id]` page.
 * Mirrors the `SaleDetailDialog` (deposit / complete / cancel / payment /
 * print) by reusing it as an always-open dialog.
 */
export default function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading label="Loading sale…" variant="board" />}>
      <SaleDetailContent params={params} />
    </Suspense>
  );
}

async function SaleDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.SALES_VIEW)) {
    return <NoAccess what="sales" />;
  }

  const { id } = await params;

  const sale = await prisma.assetSale.findFirst({
    where: { id, companyId: company.id },
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

  if (!sale) notFound();

  // AssetSale has no landParcel / builtUnit relation (only the id columns) —
  // fetch the asset record separately so we can label it.
  const [parcel, unit] = await Promise.all([
    sale.landParcelId
      ? prisma.landParcel.findFirst({
          where: { id: sale.landParcelId, deletedAt: null },
          select: { id: true, number: true, area: true, areaUnit: true },
        })
      : null,
    sale.builtUnitId
      ? prisma.builtUnit.findFirst({
          where: { id: sale.builtUnitId, deletedAt: null },
          select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true },
        })
      : null,
  ]);

  const totalPaid = sale.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
  const canManage = hasPermission(role, PERM.SALES_MANAGE);

  const row: AssetSaleRow = {
    id: sale.id,
    saleNumber: sale.saleNumber,
    assetType: sale.assetType,
    landParcelId: sale.landParcelId,
    landParcelNumber: parcel?.number ?? null,
    builtUnitId: sale.builtUnitId,
    builtUnitNumber: unit?.unitNumber ?? null,
    builtUnitType: unit?.unitType ?? null,
    assetArea: parcel ? toNum(parcel.area) : unit ? toNum(unit.area) : null,
    assetAreaUnit: parcel?.areaUnit ?? unit?.areaUnit ?? null,
    customerId: sale.customerId,
    customerName: sale.customer.name,
    customerPhone: sale.customer.phone,
    projectId: sale.projectId,
    projectName: sale.project?.name ?? null,
    salePrice: toNum(sale.salePrice),
    gstRate: toNum(sale.gstRate),
    gstAmount: toNum(sale.gstAmount),
    costBasis: toNum(sale.costBasis),
    profit: toNum(sale.profit),
    saleDate: sale.saleDate.toISOString(),
    status: sale.status,
    saleStage: sale.saleStage,
    depositAmount: sale.depositAmount ? toNum(sale.depositAmount) : null,
    depositDate: sale.depositDate ? sale.depositDate.toISOString() : null,
    finalSaleDate: sale.finalSaleDate ? sale.finalSaleDate.toISOString() : null,
    saleDeedNo: sale.saleDeedNo,
    expectedRegistryDate: sale.expectedRegistryDate ? sale.expectedRegistryDate.toISOString() : null,
    atsNo: sale.atsNo,
    atsDate: sale.atsDate ? sale.atsDate.toISOString() : null,
    allowRegistryBeforeFullPayment: sale.allowRegistryBeforeFullPayment,
    allotmentLetterNo: sale.allotmentLetterNo,
    allotmentDate: sale.allotmentDate ? sale.allotmentDate.toISOString() : null,
    bbaNo: sale.bbaNo,
    bbaDate: sale.bbaDate ? sale.bbaDate.toISOString() : null,
    tdsAmount: sale.tdsAmount ? toNum(sale.tdsAmount) : null,
    tdsCertificateNo: sale.tdsCertificateNo,
    homeLoanBank: sale.homeLoanBank,
    homeLoanAmount: sale.homeLoanAmount ? toNum(sale.homeLoanAmount) : null,
    homeLoanSanctionNo: sale.homeLoanSanctionNo,
    homeLoanSanctionDate: sale.homeLoanSanctionDate ? sale.homeLoanSanctionDate.toISOString() : null,
    dealMaturityMonths: sale.dealMaturityMonths,
    dealMaturityDate: sale.dealMaturityDate ? sale.dealMaturityDate.toISOString() : null,
    paymentCycle: sale.paymentCycle,
    dealSource: sale.dealSource,
    brokerId: sale.brokerId,
    brokerName: sale.brokerName,
    brokerPhone: sale.brokerPhone,
    brokerAgency: sale.broker?.agency ?? null,
    commissionAmount: sale.commissionAmount ? toNum(sale.commissionAmount) : null,
    commissionIsPartOfDeal: sale.commissionIsPartOfDeal,
    commissionPaid: sale.commissionPaid,
    commissionPaidDate: sale.commissionPaidDate ? sale.commissionPaidDate.toISOString() : null,
    expenses: sale.expenses.map((e) => ({
      id: e.id,
      head: e.head,
      label: e.label,
      amount: toNum(e.amount),
      borneBy: e.borneBy,
      isIncluded: e.isIncluded,
    })),
    terms: sale.terms.map((t) => ({
      id: t.id,
      description: t.description,
      extraAmount: t.extraAmount ? toNum(t.extraAmount) : null,
      isIncluded: t.isIncluded,
    })),
    paymentSchedule: sale.paymentSchedule
      ? {
          type: sale.paymentSchedule.type,
          totalAmount: toNum(sale.paymentSchedule.totalAmount),
          items: sale.paymentSchedule.items.map((item) => ({
            id: item.id,
            installmentNo: item.installmentNo,
            description: item.description,
            percentage: toNum(item.percentage),
            amount: toNum(item.amount),
            dueDate: item.dueDate ? item.dueDate.toISOString() : null,
            status: item.status,
            paidAmount: toNum(item.paidAmount),
            wbsNodeId: item.wbsNodeId,
          })),
        }
      : null,
    paymentStatus: sale.paymentStatus,
    paymentMode: sale.paymentMode,
    notes: sale.notes,
    totalPaid,
    balanceDue: toNum(sale.salePrice) + toNum(sale.gstAmount) - totalPaid,
    paymentCount: sale.payments.length,
    atsDocumentUrl: sale.atsDocumentUrl,
    atsDocumentName: sale.atsDocumentName,
    bbaDocumentUrl: sale.bbaDocumentUrl,
    bbaDocumentName: sale.bbaDocumentName,
    registryDocumentUrl: sale.registryDocumentUrl,
    registryDocumentName: sale.registryDocumentName,
    allotmentDocumentUrl: sale.allotmentDocumentUrl,
    allotmentDocumentName: sale.allotmentDocumentName,
    draftDocumentUrl: sale.draftDocumentUrl,
    draftDocumentName: sale.draftDocumentName,
    draftNotes: sale.draftNotes,
    draftDate: sale.draftDate ? sale.draftDate.toISOString() : null,
    irn: sale.irn,
    irnAckNo: sale.irnAckNo,
    irnAckDate: sale.irnAckDate ? sale.irnAckDate.toISOString() : null,
    irnQrCode: sale.irnQrCode,
    irnStatus: sale.irnStatus,
    irnError: sale.irnError,
    irnGeneratedAt: sale.irnGeneratedAt ? sale.irnGeneratedAt.toISOString() : null,
    irnCancelledAt: sale.irnCancelledAt ? sale.irnCancelledAt.toISOString() : null,
  };

  const assetLabel =
    row.assetType === "LAND"
      ? `Plot ${row.landParcelNumber ?? "—"}`
      : `Unit ${row.builtUnitNumber ?? "—"}${row.builtUnitType ? ` (${row.builtUnitType.replace("_", " ")})` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.saleNumber}
        description={`${assetLabel} · ${sale.customer.name}`}
        stats={[
          { label: "Status", value: sale.status },
          { label: "Stage", value: sale.saleStage.replace("_", " ") },
          { label: "Sale Price", value: formatCurrency(toNum(sale.salePrice)) },
          { label: "Balance Due", value: formatCurrency(row.balanceDue), tone: row.balanceDue > 0 ? "warning" : "success" },
        ]}
        secondaryActions={
          <Link
            href="/sales"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> All Sales
          </Link>
        }
      />
      <SaleDetailPageClient
        sale={row}
        permissions={{ canCreateSale: canManage, canManage }}
      />
    </div>
  );
}
