import { prisma } from "@nirman/db";
import { toNum, scopeWhere } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import {formatCurrencyCompact, formatDate, formatNumber} from "@/lib/utils";
import {
  MobileEmptyState,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { BookOpen, Package } from "lucide-react";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { MobileMbActions } from "./MobileMbActions";
import {
  DetailHeroCard,
  DetailKeyValueCard,
  DetailStatGrid,
  DetailLinkRow,
  DetailPrintButton,
} from "@/components/mobile/v2/detail-primitives";

export const metadata = { title: "Measurement Book Entry — Nirman" };

export default function MobileMbDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage
      params={params}
      perm={PERM.MB_VIEW}
      what="measurement book entry details"
      permission={PERM.MB_VIEW}
      skeletonSections={5}
    >
      {async ({ id, company, role }) => {
        const entry = await prisma.measurementBookEntry.findFirst({
          where: {...await scopeWhere("MeasurementBookEntry"),  id, project: { companyId: company.id } },
          include: {
            project: { select: { id: true, name: true } },
            phase: { select: { id: true, name: true } },
            boqItem: { select: { id: true, serialNo: true, description: true, unit: true, rate: true, estimatedQty: true } },
            wbsNode: { select: { id: true, code: true, name: true } },
            measuredBy: { select: { id: true, name: true } },
            verifiedBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
          },
        });

        if (!entry) {
          return (
            <MobileEmptyState
              icon={BookOpen}
              title="Measurement entry not found"
              hint="This measurement book entry may have been deleted or doesn't exist."
            />
          );
        }

        const measuredQty = toNum(entry.measuredQty);
        const cumulativeQty = toNum(entry.cumulativeQty);
        const rate = entry.boqItem.rate ? toNum(entry.boqItem.rate) : 0;
        const amount = measuredQty * rate;
        const estimatedQty = entry.boqItem.estimatedQty ? toNum(entry.boqItem.estimatedQty) : null;
        const variance = estimatedQty != null ? cumulativeQty - estimatedQty : null;
        const variancePct = estimatedQty != null && estimatedQty > 0 ? (variance! / estimatedQty) * 100 : null;

        const canVerify = hasPermission(role, PERM.MB_VERIFY);
        const canApprove = hasPermission(role, PERM.MB_APPROVE);

        const varianceEntries = [
          { label: "Estimated Qty", value: `${formatNumber(estimatedQty!, 3)} ${entry.boqItem.unit ?? ""}` },
          ...(variance != null
            ? [{ label: "Variance", value: `${variance >= 0 ? "+" : ""}${formatNumber(variance, 3)} ${entry.boqItem.unit ?? ""}` }]
            : []),
          ...(variancePct != null
            ? [{ label: "Variance %", value: `${variancePct >= 0 ? "+" : ""}${formatNumber(variancePct, 1)}%` }]
            : []),
        ];

        const detailsEntries = [
          { label: "Measure Date", value: formatDate(entry.measureDate) },
          ...(entry.locationRef ? [{ label: "Location", value: entry.locationRef }] : []),
          ...(entry.wbsNode ? [{ label: "WBS Node", value: `${entry.wbsNode.code} · ${entry.wbsNode.name}` }] : []),
          ...(entry.rejectReason ? [{ label: "Reject Reason", value: entry.rejectReason }] : []),
        ];

        const approvalEntries = [
          ...(entry.measuredBy ? [{ label: "Measured By", value: entry.measuredBy.name }] : []),
          ...(entry.verifiedBy ? [{ label: "Verified By", value: entry.verifiedBy.name }] : []),
          ...(entry.verifiedAt ? [{ label: "Verified At", value: formatDate(entry.verifiedAt) }] : []),
          ...(entry.approvedBy ? [{ label: "Approved By", value: entry.approvedBy.name }] : []),
          ...(entry.approvedAt ? [{ label: "Approved At", value: formatDate(entry.approvedAt) }] : []),
        ];

        return (
          <PageContextProvider value={{
            entityType: "measurement-book",
            status: entry.status,
            label: entry.mbNumber,
            subtitle: entry.project.name,
            recordId: entry.id,
          }}>
          <div className="flex flex-col gap-4 pb-20">
            {/* Header card */}
            <DetailHeroCard
              icon={BookOpen}
              title={entry.boqItem.description}
              subtitle={`BOQ ${entry.boqItem.serialNo} · ${entry.project.name}${entry.phase ? ` · ${entry.phase.name}` : ""}`}
              status={entry.status}
              action={<DetailPrintButton href={`/print/measurement-book/${entry.id}`} />}
            >
              <p className="text-m-label font-bold tabular-nums mt-2" style={{ color: "var(--color-ink-500)" }}>
                {entry.mbNumber}
              </p>
              {entry.description && (
                <p className="text-m-label leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
                  {entry.description}
                </p>
              )}
              <DetailLinkRow
                href={`/m/boq/${entry.boqItem.id}`}
                icon={Package}
                label={`BOQ Item · ${entry.boqItem.serialNo} · ${entry.boqItem.description}`}
              />
              <DetailLinkRow
                href={`/m/projects/${entry.project.id}`}
                icon={BookOpen}
                label={`Project · ${entry.project.name}`}
              />
            </DetailHeroCard>

            {/* Quantity summary */}
            <div>
              <SectionHead title="Quantity Summary" />
              <DetailStatGrid
                cols={4}
                stats={[
                  { label: "Measured Qty", value: `${formatNumber(measuredQty, 3)} ${entry.boqItem.unit ?? ""}`, tone: "go" },
                  { label: "Cumulative Qty", value: `${formatNumber(cumulativeQty, 3)} ${entry.boqItem.unit ?? ""}` },
                  { label: "Rate", value: formatCurrencyCompact(rate) },
                  { label: "Amount", value: formatCurrencyCompact(amount), tone: "signal" },
                ]}
              />
            </div>

            {/* Variance analysis */}
            {estimatedQty != null && (
              <DetailKeyValueCard title="Variance Analysis" entries={varianceEntries} />
            )}

            {/* Details */}
            <DetailKeyValueCard title="Details" entries={detailsEntries} />

            {/* Approval info */}
            {approvalEntries.length > 0 ? (
              <DetailKeyValueCard title="Approval" entries={approvalEntries} />
            ) : (
              <div>
                <SectionHead title="Approval" />
                <div
                  className="rounded-[0.5rem] border px-2.5 py-2 mb-3"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <p className="text-m-label text-center" style={{ color: "var(--color-ink-500)" }}>No approval activity yet</p>
                </div>
              </div>
            )}

            {/* Approval action bar */}
            <MobileMbActions
              mbId={entry.id}
              status={entry.status}
              canVerify={canVerify}
              canApprove={canApprove}
            />
          </div>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
