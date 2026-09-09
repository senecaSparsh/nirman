import { prisma } from "@nirman/db";
import { toNum, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobilePipelineStepper, type MobilePipelineStep } from "@/components/mobile/v2/primitives";
import { MobileSaleDetailClient } from "./MobileSaleDetailClient";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

export default function MobileSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} skeletonSections={6}>
      {async ({ id, company, role }) => {
        const sale = await prisma.assetSale.findFirst({
          where: {...await scopeWhere("AssetSale"),  id, companyId: company.id },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            project: { select: { id: true, name: true } },
            builtUnit: { select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, projectId: true } },
            payments: {
              orderBy: { paymentDate: "desc" },
              select: {
                id: true, amount: true, paymentDate: true,
                mode: true, reference: true, status: true,
                chequeStatus: true,
                chequeNo: true, chequeBank: true, chequeDate: true,
                chequePhotoUrl: true,
              },
            },
            expenses: { orderBy: { sortOrder: "asc" } },
            terms: { orderBy: { sortOrder: "asc" } },
            broker: { select: { id: true, name: true, phone: true, agency: true } },
            paymentSchedule: { include: { items: { orderBy: { installmentNo: "asc" } } } },
          },
        });

        // AssetSale has no landParcel relation (only landParcelId) — fetch separately.
        const landParcel = sale?.landParcelId
          ? await prisma.landParcel.findFirst({
              where: {...await scopeWhere("LandParcel"),  id: sale.landParcelId, deletedAt: null },
              select: { id: true, number: true, area: true, areaUnit: true },
            })
          : null;

        if (!sale) {
          return (
            <MobileSaleDetailClient
              notFound
              saleId={id}
              saleNumber=""
              assetType="BUILT_UNIT"
              status="ACTIVE"
              saleStage="PENDING"
              paymentStatus="PENDING"
              saleDate=""
              salePrice={0}
              gstRate={0}
              gstAmount={0}
              costBasis={0}
              profit={0}
              depositAmount={null}
              depositDate={null}
              finalSaleDate={null}
              paymentMode={null}
              notes={null}
              totalPaid={0}
              saleDeedNo={null}
              atsNo={null}
              atsDate={null}
              expectedRegistryDate={null}
              allotmentLetterNo={null}
              allotmentDate={null}
              bbaNo={null}
              bbaDate={null}
              tdsAmount={null}
              tdsCertificateNo={null}
              homeLoanBank={null}
              homeLoanAmount={null}
              customer={null}
              project={null}
              asset={null}
              payments={[]}
              canManage={false}
              dealSource={null}
              brokerName={null}
              brokerPhone={null}
              brokerAgency={null}
              commissionAmount={null}
              commissionStatus={null}
              dealMaturityMonths={null}
              paymentCycle={null}
              expenses={[]}
              terms={[]}
              paymentSchedule={null}
              atsDocumentUrl={null}
              atsDocumentName={null}
              bbaDocumentUrl={null}
              bbaDocumentName={null}
              registryDocumentUrl={null}
              registryDocumentName={null}
              allotmentDocumentUrl={null}
              allotmentDocumentName={null}
              draftDocumentUrl={null}
              draftDocumentName={null}
              draftNotes={null}
              draftDate={null}
            />
          );
        }

        const canManage = hasPermission(role, PERM.SALES_MANAGE);
        // Only count CLEARED payments — exclude PENDING and BOUNCED cheques
        const totalPaid = sale.payments
          .filter((p) => p.status !== "BOUNCED" && p.chequeStatus !== "BOUNCED" && p.chequeStatus !== "PENDING")
          .reduce((sum, p) => sum + toNum(p.amount), 0);

        const asset = sale.assetType === "LAND"
          ? landParcel
            ? {
                type: "LAND" as const,
                id: landParcel.id,
                label: `Parcel ${landParcel.number}`,
                area: toNum(landParcel.area),
                areaUnit: landParcel.areaUnit,
              }
            : null
          : sale.builtUnit
            ? {
                type: "BUILT_UNIT" as const,
                id: sale.builtUnit.id,
                label: sale.builtUnit.unitNumber,
                unitType: sale.builtUnit.unitType,
                area: toNum(sale.builtUnit.area),
                areaUnit: sale.builtUnit.areaUnit,
              }
            : null;

        // Lifecycle pipeline: PENDING → DEPOSIT_RECEIVED → COMPLETED (or CANCELLED)
        const saleCancelled = sale.status === "CANCELLED";
        const salePipelineSteps: MobilePipelineStep[] = saleCancelled
          ? [
              { label: "Pending", state: "done" },
              { label: "Deposit", state: "skipped" },
              { label: "Completed", state: "skipped" },
              { label: "Cancelled", state: "current" },
            ]
          : [
              { label: "Pending", state: sale.saleStage === "PENDING" ? "current" : "done" },
              { label: "Deposit", state: sale.saleStage === "DEPOSIT_RECEIVED" ? "current" : sale.saleStage === "COMPLETED" ? "done" : "pending" },
              { label: "Completed", state: sale.saleStage === "COMPLETED" ? "current" : "pending" },
            ];

        return (
          <PageContextProvider value={{
            entityType: "sale",
            status: sale.status,
            label: sale.saleNumber,
            subtitle: sale.customer?.name,
            recordId: sale.id,
          }}>
          <>
            <div className="mb-3 rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <MobilePipelineStepper steps={salePipelineSteps} />
            </div>
            <MobileSaleDetailClient
              saleId={sale.id}
            saleNumber={sale.saleNumber}
            assetType={sale.assetType}
            status={sale.status}
            saleStage={sale.saleStage}
            paymentStatus={sale.paymentStatus}
            saleDate={sale.saleDate.toISOString()}
            salePrice={toNum(sale.salePrice)}
            gstRate={toNum(sale.gstRate)}
            gstAmount={toNum(sale.gstAmount)}
            costBasis={toNum(sale.costBasis)}
            profit={toNum(sale.profit)}
            depositAmount={sale.depositAmount ? toNum(sale.depositAmount) : null}
            depositDate={sale.depositDate ? sale.depositDate.toISOString() : null}
            finalSaleDate={sale.finalSaleDate ? sale.finalSaleDate.toISOString() : null}
            paymentMode={sale.paymentMode}
            notes={sale.notes}
            totalPaid={totalPaid}
            // Sale deed / ATS
            saleDeedNo={sale.saleDeedNo}
            atsNo={sale.atsNo}
            atsDate={sale.atsDate ? sale.atsDate.toISOString() : null}
            expectedRegistryDate={sale.expectedRegistryDate ? sale.expectedRegistryDate.toISOString() : null}
            // Compliance documents
            allotmentLetterNo={sale.allotmentLetterNo}
            allotmentDate={sale.allotmentDate ? sale.allotmentDate.toISOString() : null}
            bbaNo={sale.bbaNo}
            bbaDate={sale.bbaDate ? sale.bbaDate.toISOString() : null}
            tdsAmount={sale.tdsAmount ? toNum(sale.tdsAmount) : null}
            tdsCertificateNo={sale.tdsCertificateNo}
            // Home loan
            homeLoanBank={sale.homeLoanBank}
            homeLoanAmount={sale.homeLoanAmount ? toNum(sale.homeLoanAmount) : null}
            customer={sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null}
            project={sale.project ? { id: sale.project.id, name: sale.project.name } : null}
            asset={asset}
            payments={sale.payments.map((p) => ({
              id: p.id,
              amount: toNum(p.amount),
              paymentDate: p.paymentDate.toISOString(),
              mode: p.mode,
              reference: p.reference,
              status: p.status,
              chequeStatus: p.chequeStatus,
              chequeNo: p.chequeNo,
              chequeBank: p.chequeBank,
              chequeDate: p.chequeDate ? p.chequeDate.toISOString() : null,
              chequePhotoUrl: p.chequePhotoUrl,
            }))}
            canManage={canManage}
            // New sales-module fields
            dealSource={sale.dealSource}
            brokerName={sale.broker?.name ?? null}
            brokerPhone={sale.broker?.phone ?? null}
            brokerAgency={sale.broker?.agency ?? null}
            commissionAmount={sale.commissionAmount ? toNum(sale.commissionAmount) : null}
            commissionStatus={sale.commissionPaid ? "PAID" : "PENDING"}
            dealMaturityMonths={sale.dealMaturityMonths}
            paymentCycle={sale.paymentCycle}
            expenses={sale.expenses.map((e) => ({
              id: e.id,
              head: e.head,
              amount: toNum(e.amount),
              borneBy: e.borneBy,
              isIncluded: e.isIncluded,
            }))}
            terms={sale.terms.map((t) => ({
              id: t.id,
              description: t.description,
              extraAmount: t.extraAmount ? toNum(t.extraAmount) : null,
              isIncluded: t.isIncluded,
            }))}
            paymentSchedule={sale.paymentSchedule
              ? {
                  type: sale.paymentSchedule.type,
                  items: sale.paymentSchedule.items.map((it) => ({
                    id: it.id,
                    installmentNo: it.installmentNo,
                    description: it.description,
                    percentage: toNum(it.percentage),
                    amount: toNum(it.amount),
                    dueDate: it.dueDate ? it.dueDate.toISOString() : null,
                    paidAmount: toNum(it.paidAmount),
                    status: it.status,
                    wbsNodeId: it.wbsNodeId,
                  })),
                }
              : null}
            // Document URLs
            atsDocumentUrl={sale.atsDocumentUrl}
            atsDocumentName={sale.atsDocumentName}
            bbaDocumentUrl={sale.bbaDocumentUrl}
            bbaDocumentName={sale.bbaDocumentName}
            registryDocumentUrl={sale.registryDocumentUrl}
            registryDocumentName={sale.registryDocumentName}
            allotmentDocumentUrl={sale.allotmentDocumentUrl}
            allotmentDocumentName={sale.allotmentDocumentName}
            draftDocumentUrl={sale.draftDocumentUrl}
            draftDocumentName={sale.draftDocumentName}
            draftNotes={sale.draftNotes}
            draftDate={sale.draftDate ? sale.draftDate.toISOString() : null}
          />
          </>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
