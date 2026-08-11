import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { KeyRound, Calendar, IndianRupee, User, Phone, FileText, Banknote } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

export default function MobileRentalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileRentalDetailContent params={params} />
    </Suspense>
  );
}

async function MobileRentalDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const { id } = await params;

  const tenancy = await prisma.tenancy.findFirst({
    where: { id, companyId: company.id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      project: { select: { id: true, name: true } },
      payments: { orderBy: { paymentDate: "desc" }, take: 10 },
    },
  });

  if (!tenancy) {
    return (
      <div>
        <MobileDetailHeader title="Tenancy" backHref="/m/rentals" />
        <MobileEmptyState icon={KeyRound} title="Tenancy not found" />
      </div>
    );
  }

  const totalReceived = tenancy.payments.reduce((s, p) => s + toNum(p.amount), 0);
  const assetLabel = tenancy.assetType === "LAND"
    ? `Parcel ${tenancy.landParcelId?.slice(0, 8) ?? "—"}`
    : `Unit ${tenancy.builtUnitId?.slice(0, 8) ?? "—"}`;

  return (
    <div>
      <MobileDetailHeader
        title={tenancy.tenantName}
        subtitle={assetLabel}
        backHref="/m/rentals"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Details</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={KeyRound} title="Status" value={tenancy.status} />
        <MobileInfoRow icon={FileText} title="Asset" value={assetLabel} />
        {tenancy.project && (
          <MobileInfoRow icon={FileText} title="Project" value={tenancy.project.name} />
        )}
        <MobileInfoRow icon={Calendar} title="Start Date" value={formatDate(tenancy.startDate)} />
        <MobileInfoRow icon={Calendar} title="End Date" value={formatDate(tenancy.endDate)} />
        {tenancy.rentAgreementNo && (
          <MobileInfoRow icon={FileText} title="Agreement No." value={tenancy.rentAgreementNo} />
        )}
      </div>

      {tenancy.customer && (
        <>
          <MobileSectionTitle>Customer</MobileSectionTitle>
          <div>
            <MobileInfoRow icon={User} title="Name" value={tenancy.customer.name} />
            {tenancy.customer.phone && (
              <MobileInfoRow icon={Phone} title="Phone" value={tenancy.customer.phone} />
            )}
          </div>
        </>
      )}

      <MobileSectionTitle>Financials</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Monthly Rent"
          value={formatCurrency(toNum(tenancy.monthlyRent))}
          icon={IndianRupee}
          tone="brand"
        />
        <MobileStatCard
          label="Security Deposit"
          value={formatCurrency(toNum(tenancy.securityDeposit))}
          icon={IndianRupee}
        />
        <MobileStatCard
          label="Total Received"
          value={formatCurrency(totalReceived)}
          icon={Banknote}
          tone="success"
        />
        <MobileStatCard
          label="Payments"
          value={String(tenancy.payments.length)}
          icon={Banknote}
        />
      </div>

      {tenancy.payments.length > 0 && (
        <>
          <MobileSectionTitle>Recent Payments</MobileSectionTitle>
          <div>
            {tenancy.payments.map((p) => (
              <MobileRow
                key={p.id}
                icon={Banknote}
                title={formatCurrency(toNum(p.amount))}
                subtitle={`${formatDate(p.paymentDate)} · ${p.status}`}
                badge={<MobileStatusBadge status={p.status} />}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
