import { prisma } from "@nirman/db";
import { toNum, scopeWhere, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileMaterialSalesList } from "./MobileMaterialSalesList";
import { MobileMaterialSalesFab } from "./MobileMaterialSalesFab";
import { DepartmentActivityFeed } from "@/components/department-activity-feed";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/material-sales — mobile material/scrap sales. Shows recent sales with
 * their profit and payment status. The scrap → cost recovery flow is a key
 * business workflow per the SRS.
 */
export default function MobileMaterialSalesPage() {
  return (
    <MobileListPage managePerm={PERM.SALE_CREATE}>
      {async ({ company, canManage }) => {
        // Scope-aware action permissions (for FAB gating)
        const actions = await getActionPermissions();
        const BATCH_SIZE = 60;
        const sales = await prisma.materialSale.findMany({
          where: {...await scopeWhere("MaterialSale"),  companyId: company.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE + 1,
          select: {
            id: true,
            saleNumber: true,
            saleDate: true,
            createdAt: true,
            subtotal: true,
            totalAmount: true,
            totalCost: true,
            grossProfit: true,
            scrapSubtotal: true,
            status: true,
            paymentStatus: true,
            customer: { select: { name: true } },
            project: { select: { name: true } },
            lines: { select: { id: true } },
            payments: { select: { amount: true } },
          },
        });

        const hasMore = sales.length > BATCH_SIZE;
        const batch = hasMore ? sales.slice(0, BATCH_SIZE) : sales;
        const pendingSaleCount = batch.filter((s) => s.status === "PENDING").length;
        const lastItem = batch[batch.length - 1];
        const nextCursor = hasMore && lastItem
          ? `${lastItem.createdAt.toISOString()}|${lastItem.id}`
          : null;

        const active = batch.filter((s) => s.status === "ACTIVE");
        const pendingPayment = active.filter((s) => s.paymentStatus === "PENDING");
        const totalRevenue = active.reduce((s, sale) => s + toNum(sale.totalAmount), 0);
        const totalProfit = active.reduce(
          (s, sale) => s + toNum(sale.grossProfit),
          0,
        );

        const serialized = batch.map((s) => ({
          id: s.id,
          saleNumber: s.saleNumber,
          status: s.status,
          paymentStatus: s.paymentStatus,
          saleDate: s.saleDate.toISOString(),
          totalAmount: toNum(s.totalAmount),
          totalPaid: s.payments.reduce((sum, p) => sum + toNum(p.amount), 0),
          grossProfit: toNum(s.grossProfit),
          scrapSubtotal: toNum(s.scrapSubtotal),
          customerName: s.customer?.name ?? null,
          projectName: s.project?.name ?? null,
          lineCount: s.lines.length,
        }));

        const csvColumns: MobileColumnSpec[] = [
          { key: "saleNumber", label: "Sale #" },
          { key: "customerName", label: "Customer" },
          { key: "projectName", label: "Project" },
          { key: "status", label: "Status" },
          { key: "paymentStatus", label: "Payment" },
          { key: "totalAmount", label: "Amount", format: "currency" },
          { key: "grossProfit", label: "Profit", format: "currency" },
          { key: "saleDate", label: "Date", format: "date" },
        ];

        return (
          <div>
            <DepartmentActivityFeed department="sales" />
            <MobileMaterialSalesList
              items={serialized}
              totalRevenue={totalRevenue}
              totalProfit={totalProfit}
              pendingCount={pendingPayment.length}
              pendingSaleCount={pendingSaleCount}
              canCreate={actions.canCreateMaterialSale ?? canManage}
              loadMoreUrl="/api/mobile/list/sales"
              nextCursor={nextCursor}
              exportTitle="Material Sales"
              exportRows={serialized as unknown as Record<string, unknown>[]}
              exportColumns={csvColumns}
              exportSummary={`${serialized.length} sales`}
            />
            {actions.canCreateMaterialSale && (
              <MobileMaterialSalesFab />
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
