import { prisma } from "@nirman/db";
import { toNum, getUserPermissions } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobilePipelineStepper, type MobilePipelineStep } from "@/components/mobile/v2/primitives";
import { MobileMaterialSaleDetailClient } from "./MobileMaterialSaleDetailClient";
import { resolveNextAction } from "@/lib/flow-map";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

export default function MobileMaterialSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} skeletonSections={6}>
      {async ({ id, company, role }) => {
        const overrides = await getUserPermissions();

        const sale = await prisma.materialSale.findFirst({
          where: { id, companyId: company.id },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            project: { select: { id: true, name: true } },
            lines: {
              include: {
                material: { select: { id: true, name: true, unit: true, code: true } },
                location: { select: { id: true, name: true } },
              },
              orderBy: { material: { name: "asc" } },
            },
            payments: {
              orderBy: { paymentDate: "desc" },
              select: {
                id: true, amount: true, paymentDate: true,
                paymentMode: true, referenceNo: true,
                chequeNo: true, chequeBank: true, chequePhotoUrl: true,
              },
            },
          },
        });

        if (!sale) {
          return (
            <MobileMaterialSaleDetailClient
              notFound
              saleId={id}
              saleNumber=""
              status="ACTIVE"
              paymentStatus="PENDING"
              saleDate=""
              subtotal={0}
              gstTotal={0}
              totalAmount={0}
              totalCost={0}
              grossProfit={0}
              scrapSubtotal={0}
              paymentMode={null}
              notes={null}
              vehicleNumber={null}
              vehicleType={null}
              driverName={null}
              driverPhone={null}
              customer={null}
              project={null}
              lines={[]}
              payments={[]}
              canManage={false}
              gatePass={null}
            />
          );
        }

        const canManage = hasPermission(role, PERM.SALES_MANAGE);

        // Fetch linked gate pass for PENDING sales
        const gatePass = sale.status === "PENDING"
          ? await prisma.gatePass.findFirst({
              where: { refType: "MaterialSale", refId: sale.id },
              select: { id: true, gatePassNumber: true, status: true },
            })
          : null;

        const nextAction = resolveNextAction("materialSale", sale.status, role, overrides);

        // Lifecycle pipeline: PENDING → ACTIVE → CANCELLED
        const msPipelineSteps: MobilePipelineStep[] = sale.status === "CANCELLED"
          ? [
              { label: "Pending", state: "done" },
              { label: "Active", state: "skipped" },
              { label: "Cancelled", state: "current" },
            ]
          : [
              { label: "Pending", state: sale.status === "PENDING" ? "current" : "done" },
              { label: "Active", state: sale.status === "ACTIVE" ? "current" : "pending" },
              { label: "Cancelled", state: "pending" },
            ];

        return (
          <PageContextProvider value={{
            entityType: "materialSale",
            flowId: "materialSale",
            status: sale.status,
            label: sale.saleNumber,
            recordId: sale.id,
            canActions: canManage ? [PERM.SALES_MANAGE] : [],
          }}>
          <>
            <div className="mb-3 rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <MobilePipelineStepper steps={msPipelineSteps} />
            </div>
            <MobileMaterialSaleDetailClient
              saleId={sale.id}
            saleNumber={sale.saleNumber}
            status={sale.status}
            paymentStatus={sale.paymentStatus}
            nextAction={nextAction ? { label: nextAction.label, reason: nextAction.reason, tone: nextAction.tone ?? "signal", hash: nextAction.action.type === "anchor" ? nextAction.action.hash : undefined, href: nextAction.action.type === "navigate" ? nextAction.action.href.replace("{id}", sale.id) : undefined } : null}
            saleDate={sale.saleDate.toISOString()}
            subtotal={toNum(sale.subtotal)}
            gstTotal={toNum(sale.gstTotal)}
            totalAmount={toNum(sale.totalAmount)}
            totalCost={toNum(sale.totalCost)}
            grossProfit={toNum(sale.grossProfit)}
            scrapSubtotal={toNum(sale.scrapSubtotal)}
            paymentMode={sale.paymentMode}
            notes={sale.notes}
            vehicleNumber={sale.vehicleNumber}
            vehicleType={sale.vehicleType}
            driverName={sale.driverName}
            driverPhone={sale.driverPhone}
            customer={sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null}
            project={sale.project ? { id: sale.project.id, name: sale.project.name } : null}
            gatePass={gatePass ? { id: gatePass.id, gatePassNumber: gatePass.gatePassNumber, status: gatePass.status } : null}
            lines={sale.lines.map((l) => ({
              id: l.id,
              materialId: l.material.id,
              materialName: l.material.name,
              materialCode: l.material.code,
              materialUnit: l.material.unit,
              locationId: l.location.id,
              locationName: l.location.name,
              qty: toNum(l.qty),
              unitPrice: toNum(l.unitPrice),
              unitCost: toNum(l.unitCost),
              gstRate: toNum(l.gstRate),
              gstAmount: toNum(l.gstAmount),
              lineTotal: toNum(l.lineTotal),
            }))}
            payments={sale.payments.map((p) => ({
              id: p.id,
              amount: toNum(p.amount),
              paymentDate: p.paymentDate.toISOString(),
              paymentMode: p.paymentMode,
              referenceNo: p.referenceNo,
              chequeNo: p.chequeNo,
              chequeBank: p.chequeBank,
              chequePhotoUrl: p.chequePhotoUrl,
            }))}
            canManage={canManage}
          />
          </>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
