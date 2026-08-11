import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Truck, Phone, Mail, BadgeCheck, MapPin, IndianRupee, Wallet, FileText, Banknote } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

export default function MobileSupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSupplierDetailContent params={params} />
    </Suspense>
  );
}

async function MobileSupplierDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, deletedAt: null },
    include: {
      purchaseOrders: {
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, poNumber: true, status: true, total: true, createdAt: true },
      },
      supplierPayments: {
        where: { companyId: company.id },
        orderBy: { paymentDate: "desc" },
        take: 10,
        select: { id: true, paymentNumber: true, amount: true, netPaidAmount: true, paymentDate: true, paymentMode: true },
      },
    },
  });

  if (!supplier) {
    return (
      <div>
        <MobileDetailHeader title="Supplier" backHref="/m/suppliers" />
        <MobileEmptyState icon={Truck} title="Supplier not found" />
      </div>
    );
  }

  const totalPoValue = supplier.purchaseOrders.reduce((s, po) => s + toNum(po.total), 0);
  const totalPaid = supplier.supplierPayments.reduce((s, p) => s + toNum(p.amount), 0);

  return (
    <div>
      <MobileDetailHeader
        title={supplier.name}
        subtitle={supplier.phone ?? "no phone"}
        backHref="/m/suppliers"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Contact</MobileSectionTitle>
      <div>
        {supplier.phone && <MobileInfoRow icon={Phone} title="Phone" value={supplier.phone} />}
        {supplier.email && <MobileInfoRow icon={Mail} title="Email" value={supplier.email} />}
        {supplier.gstin && <MobileInfoRow icon={BadgeCheck} title="GSTIN" value={supplier.gstin} />}
        {supplier.address && <MobileInfoRow icon={MapPin} title="Address" value={supplier.address} />}
      </div>

      <MobileSectionTitle>Financials</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Balance Owed"
          value={formatCurrency(toNum(supplier.balanceOwed))}
          icon={Wallet}
          tone={toNum(supplier.balanceOwed) > 0 ? "warning" : "default"}
        />
        <MobileStatCard
          label="Total POs"
          value={String(supplier.purchaseOrders.length)}
          icon={FileText}
        />
        <MobileStatCard
          label="PO Value"
          value={formatCurrency(totalPoValue)}
          icon={IndianRupee}
        />
        <MobileStatCard
          label="Total Paid"
          value={formatCurrency(totalPaid)}
          icon={Banknote}
          tone="success"
        />
      </div>

      {supplier.purchaseOrders.length > 0 && (
        <>
          <MobileSectionTitle>Recent POs</MobileSectionTitle>
          <div>
            {supplier.purchaseOrders.map((po) => (
              <MobileRow
                key={po.id}
                href={`/m/procurement/${po.id}`}
                icon={FileText}
                title={po.poNumber}
                subtitle={`${formatDate(po.createdAt)} · ${formatCurrency(toNum(po.total))}`}
                meta={po.status}
              />
            ))}
          </div>
        </>
      )}

      {supplier.supplierPayments.length > 0 && (
        <>
          <MobileSectionTitle>Recent Payments</MobileSectionTitle>
          <div>
            {supplier.supplierPayments.map((p) => (
              <MobileRow
                key={p.id}
                icon={Banknote}
                title={p.paymentNumber}
                subtitle={`${formatDate(p.paymentDate)} · ${p.paymentMode}`}
                meta={formatCurrency(toNum(p.amount))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
