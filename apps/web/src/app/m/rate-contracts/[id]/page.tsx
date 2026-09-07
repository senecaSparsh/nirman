import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import Link from "next/link";
import {formatCurrencyCompact, formatDate, formatNumber} from "@/lib/utils";
import {
  MobileEmptyState,
  SectionHead,
  MobilePipelineStepper,
  type MobilePipelineStep,
} from "@/components/mobile/v2/primitives";
import {
  DetailHeroCard,
  DetailStatGrid,
  DetailKeyValueCard,
} from "@/components/mobile/v2/detail-primitives";
import { FileText, IndianRupee, Package, TrendingUp, type LucideIcon } from "lucide-react";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileRateContractCancelBtn } from "./MobileRateContractCancelBtn";

export const metadata = { title: "Rate Contract — Nirman" };

export default function MobileRateContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} perm={PERM.PROCUREMENT_VIEW} what="rate contract details" permission={PERM.PROCUREMENT_VIEW} managePerm={PERM.PROCUREMENT_MANAGE} skeletonSections={4}>
      {async ({ id, company, canManage }) => {
        const rc = await prisma.rateContract.findFirst({
          where: { id, companyId: company.id },
          include: {
            supplier: { select: { id: true, name: true, phone: true, gstin: true } },
            material: { select: { id: true, name: true, unit: true, code: true } },
            createdBy: { select: { id: true, name: true } },
          },
        });

        if (!rc) {
          return (
            <MobileEmptyState
              icon={FileText}
              title="Rate contract not found"
              hint="This rate contract may have been deleted or doesn't exist."
            />
          );
        }

        const agreedRate = toNum(rc.agreedRate);
        const minQty = rc.minQty ? toNum(rc.minQty) : null;
        const maxQty = rc.maxQty ? toNum(rc.maxQty) : null;
        const totalReleasedQty = toNum(rc.totalReleasedQty);
        const now = new Date();
        const isActive = new Date(rc.validFrom) <= now && new Date(rc.validTo) >= now;
        const isExpired = new Date(rc.validTo) < now;
        const statusLabel = rc.status === "CANCELLED" ? "CANCELLED" : isActive ? "ACTIVE" : isExpired ? "EXPIRED" : "PENDING";

        // Lifecycle pipeline: Pending → Active → Expired/Cancelled
        const rcPipelineSteps: MobilePipelineStep[] = rc.status === "CANCELLED"
          ? [
              { label: "Pending", state: "skipped" },
              { label: "Active", state: "skipped" },
              { label: "Cancelled", state: "current" },
            ]
          : [
              { label: "Pending", state: statusLabel === "PENDING" ? "current" : "done" },
              { label: "Active", state: statusLabel === "ACTIVE" ? "current" : statusLabel === "EXPIRED" ? "done" : "pending" },
              { label: "Expired", state: statusLabel === "EXPIRED" ? "current" : "pending" },
            ];

        // Build financial stat grid entries (conditional on non-null min/max qty)
        const finStats: { label: string; value: string; tone?: "default" | "go" | "stop" | "signal"; icon?: LucideIcon }[] = [
          { label: "Agreed Rate", value: `${formatCurrencyCompact(agreedRate)}/${rc.material.unit}`, tone: "go", icon: IndianRupee },
          { label: "Released Qty", value: formatNumber(totalReleasedQty, 3), icon: TrendingUp },
        ];
        if (minQty != null) {
          finStats.push({ label: "Min Order Qty", value: formatNumber(minQty, 3), icon: Package });
        }
        if (maxQty != null) {
          finStats.push({ label: "Max Qty", value: formatNumber(maxQty, 3), tone: "signal", icon: Package });
        }

        // Build supplier detail entries (conditional on optional phone/gstin)
        const supplierEntries: { label: string; value: string }[] = [
          { label: "Name", value: rc.supplier.name },
        ];
        if (rc.supplier.phone) {
          supplierEntries.push({ label: "Phone", value: rc.supplier.phone });
        }
        if (rc.supplier.gstin) {
          supplierEntries.push({ label: "GSTIN", value: rc.supplier.gstin });
        }

        return (
          <PageContextProvider value={{
            entityType: "rate-contract",
            status: rc.status,
            label: rc.contractNumber,
            subtitle: rc.supplier.name,
            recordId: rc.id,
          }}>
          <div className="flex flex-col gap-4 pb-6">
            {/* Header card */}
            <DetailHeroCard
              icon={FileText}
              title={rc.material.name}
              subtitle={`${rc.contractNumber} · ${rc.supplier.name}${rc.material.code ? ` · ${rc.material.code}` : ""}`}
              status={statusLabel}
            >
              {rc.notes && (
                <p className="text-m-label leading-relaxed mt-2" style={{ color: "var(--color-ink-700)" }}>
                  {rc.notes}
                </p>
              )}
            </DetailHeroCard>

            {/* Lifecycle pipeline */}
            <div className="rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <MobilePipelineStepper steps={rcPipelineSteps} />
            </div>

            {/* Financial summary */}
            <div>
              <SectionHead title="Financial Summary" />
              <DetailStatGrid cols={4} stats={finStats} />
            </div>

            {/* Validity */}
            <div>
              <SectionHead title="Validity Period" />
              <DetailKeyValueCard entries={[
                { label: "Valid From", value: formatDate(rc.validFrom) },
                { label: "Valid To", value: formatDate(rc.validTo) },
                { label: "Status", value: statusLabel },
              ]} />
            </div>

            {/* Supplier details */}
            <div>
              <SectionHead title="Supplier" />
              <DetailKeyValueCard entries={supplierEntries} />
            </div>

            {/* Supplier link */}
            <Link
              href={`/m/suppliers/${rc.supplier.id}`}
              className="rounded-[0.5rem] border p-2.5 text-m-body press flex items-center gap-2"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>View Supplier</p>
                <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>{rc.supplier.name}</p>
              </div>
            </Link>

            {/* Cancel action — only for active/pending contracts, RBAC-gated */}
            {canManage && rc.status !== "CANCELLED" && !isExpired ? (
              <MobileRateContractCancelBtn contractId={rc.id} contractNumber={rc.contractNumber} />
            ) : null}
          </div>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
