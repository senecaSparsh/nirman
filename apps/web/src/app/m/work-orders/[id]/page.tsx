import { prisma } from "@nirman/db";
import { toNum, scopeWhere, getCurrentUser } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileStatusBadge,
  SectionHead,
  MobilePipelineStepper,
  type MobilePipelineStep,
} from "@/components/mobile/v2/primitives";
import {
  DetailHeroCard,
  DetailStatGrid,
  DetailKeyValueCard,
  DetailLinkRow,
} from "@/components/mobile/v2/detail-primitives";
import { FileText, Wrench, IndianRupee, TrendingUp, Building } from "lucide-react";
import { MobileWorkOrderActions } from "./MobileWorkOrderActions";
import { MobileRaBillActions } from "./MobileRaBillActions";
import { MobileCreateRaBillButton } from "./MobileCreateRaBillButton";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

export const metadata = { title: "Work Order — Nirman" };

export default function MobileWorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} perm={PERM.WO_MANAGE} what="work order details" permission={PERM.WO_MANAGE} managePerm={PERM.WO_MANAGE} skeletonSections={5}>
      {async ({ id, company, role, canManage }) => {
        const wo = await prisma.subcontractorWorkOrder.findFirst({
          where: {...await scopeWhere("SubcontractorWorkOrder"),  id, companyId: company.id },
          include: {
            subcontractor: { select: { id: true, name: true, trade: true, phone: true } },
            project: { select: { id: true, name: true } },
            phase: { select: { id: true, name: true } },
            lines: {
              include: {
                boqItem: { select: { id: true, description: true, unit: true } },
              },
              orderBy: { agreedRate: "asc" },
            },
            raBills: {
              orderBy: { billDate: "desc" },
              take: 10,
              select: {
                id: true,
                raBillNumber: true,
                billDate: true,
                status: true,
                grossAmount: true,
                netPayable: true,
                cumulativeGross: true,
                createdById: true,
                submittedById: true,
              },
            },
          },
        });

        if (!wo) {
          return (
            <MobileEmptyState
              icon={Wrench}
              title="Work order not found"
              hint="This work order may have been deleted or doesn't exist."
            />
          );
        }

        const canPay = hasPermission(role, PERM.RA_PAY);
        const canSubmitRaBill = hasPermission(role, PERM.RA_SUBMIT);
        const canApproveRaBill = hasPermission(role, PERM.RA_APPROVE);
        const currentUser = await getCurrentUser();
        const currentUserId = currentUser?.id ?? "";
        const totalWorkDone = toNum(wo.totalWorkDone);
        const totalPaid = toNum(wo.totalPaid);
        const retentionBalance = toNum(wo.retentionBalance);
        const advanceAmount = toNum(wo.advanceAmount);

        // Lifecycle pipeline: DRAFT → ISSUED → ACTIVE → COMPLETED → CLOSED (or CANCELLED)
        const statusOrder: Record<string, number> = { DRAFT: 0, ISSUED: 1, ACTIVE: 2, COMPLETED: 3, CLOSED: 4 };
        const currentIdx = statusOrder[wo.status] ?? 0;
        const isCancelled = wo.status === "CANCELLED";
        function stepState(idx: number): MobilePipelineStep["state"] {
          if (isCancelled) return idx === 0 ? "done" : "skipped";
          if (idx < currentIdx) return "done";
          if (idx === currentIdx) return "current";
          return "pending";
        }
        const woPipelineSteps: MobilePipelineStep[] = [
          { label: "Draft", state: stepState(0) },
          { label: "Issued", state: stepState(1) },
          { label: "Active", state: stepState(2) },
          { label: "Completed", state: stepState(3) },
          { label: "Closed", state: stepState(4) },
        ];

        const dateEntries: { label: string; value: string }[] = [
          { label: "Issued", value: formatDate(wo.issueDate) },
          ...(wo.startDate ? [{ label: "Start", value: formatDate(wo.startDate) }] : []),
          ...(wo.endDate ? [{ label: "End", value: formatDate(wo.endDate) }] : []),
        ];

        return (
          <PageContextProvider value={{
            entityType: "workOrder",
            status: wo.status,
            label: wo.workOrderNumber,
            subtitle: wo.subcontractor.name,
            recordId: wo.id,
          }}>
          <div className="flex flex-col gap-4 pb-20">
            {/* ── Header card ── */}
            <DetailHeroCard
              icon={Wrench}
              title={wo.workTitle}
              subtitle={`${wo.subcontractor.name}${wo.subcontractor.trade ? ` · ${wo.subcontractor.trade}` : ""} · ${wo.project.name}`}
              status={wo.status}
            >
              <p className="text-m-label font-bold tabular-nums mt-2" style={{ color: "var(--color-ink-500)" }}>
                {wo.workOrderNumber}
              </p>
              {wo.description && (
                <p className="text-m-label leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
                  {wo.description}
                </p>
              )}
            </DetailHeroCard>

            {/* ── Lifecycle pipeline ── */}
            <div className="rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <MobilePipelineStepper steps={woPipelineSteps} />
            </div>

            {/* ── Financial summary ── */}
            <div>
              <SectionHead title="Financial Summary" />
              <DetailStatGrid
                cols={4}
                stats={[
                  { label: "Work Done", value: formatCurrencyCompact(totalWorkDone), tone: "go", icon: TrendingUp },
                  { label: "Total Paid", value: formatCurrencyCompact(totalPaid), icon: IndianRupee },
                  { label: "Retention Held", value: formatCurrencyCompact(retentionBalance), tone: "signal", icon: IndianRupee },
                  { label: "Advance", value: formatCurrencyCompact(advanceAmount), icon: IndianRupee },
                ]}
              />
            </div>

            {/* ── Terms ── */}
            <DetailKeyValueCard
              title="Terms"
              entries={[
                { label: "Retention %", value: `${toNum(wo.retentionPct)}%` },
                { label: "TDS %", value: `${toNum(wo.tdsPct)}%` },
                { label: "TDS Category", value: wo.tdsCategory.replace(/_/g, " ") },
                { label: "Advance Recovery", value: `${toNum(wo.advanceRecoveryPct)}%` },
                { label: "Defect Liability", value: `${wo.defectLiabilityMonths} months` },
              ]}
            />

            {/* ── Dates ── */}
            <DetailKeyValueCard
              title="Timeline"
              entries={dateEntries}
            />

            {/* ── Scope (work order lines) ── */}
            <div>
              <SectionHead title={`Scope (${wo.lines.length} items)`} />
              <div
                className="rounded-[0.5rem] border overflow-hidden"
                style={{ borderColor: "var(--color-line)" }}
              >
                {wo.lines.length === 0 ? (
                  <MobileEmptyState icon={Wrench} title="No scope items" size="compact" />
                ) : (
                  wo.lines.map((line, i) => (
                    <div
                      key={line.id}
                      className="p-2.5"
                      style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                    >
                      <p className="text-m-label font-semibold leading-snug mb-1" style={{ color: "var(--color-ink-950)" }}>
                        {line.boqItem.description}
                      </p>
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Rate</p>
                          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                            {formatCurrency(toNum(line.agreedRate))}/{line.boqItem.unit}
                          </p>
                        </div>
                        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                        <div>
                          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Cumulative</p>
                          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                            {formatNumber(toNum(line.cumulativeQty), 2)} {line.boqItem.unit}
                          </p>
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Amount</p>
                          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                            {formatCurrency(toNum(line.cumulativeAmount))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── RA Bills ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionHead title={`RA Bills (${wo.raBills.length})`} />
                {canSubmitRaBill && (
                  <MobileCreateRaBillButton workOrderId={wo.id} workOrderNumber={wo.workOrderNumber} />
                )}
              </div>
              {wo.raBills.length === 0 ? (
                <MobileEmptyState icon={FileText} title={canSubmitRaBill ? "No RA bills yet — tap Create RA Bill above" : "No RA bills yet"} size="compact" />
              ) : (
                <div className="flex flex-col gap-2">
                  {wo.raBills.map((bill) => (
                    <div
                      key={bill.id}
                      className="rounded-[0.5rem] border p-2.5 text-m-body"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                          {bill.raBillNumber}
                        </p>
                        <MobileStatusBadge status={bill.status} />
                      </div>
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Gross</p>
                          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                            {formatCurrency(toNum(bill.grossAmount))}
                          </p>
                        </div>
                        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                        <div>
                          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Net</p>
                          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
                            {formatCurrency(toNum(bill.netPayable))}
                          </p>
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Date</p>
                          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                            {formatDate(bill.billDate)}
                          </p>
                        </div>
                      </div>
                      <MobileRaBillActions
                        billId={bill.id}
                        billNumber={bill.raBillNumber}
                        status={bill.status}
                        netPayable={toNum(bill.netPayable)}
                        canSubmit={canSubmitRaBill}
                        canApprove={canApproveRaBill}
                        canPay={canPay}
                        isCreator={bill.createdById === currentUserId}
                        isSubmitter={bill.submittedById === currentUserId}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Subcontractor link ── */}
            <DetailLinkRow
              href={`/m/suppliers/${wo.subcontractor.id}`}
              icon={Building}
              label={wo.subcontractor.name}
            />

            {/* ── Workflow actions ── */}
            <MobileWorkOrderActions
              workOrderId={wo.id}
              status={wo.status as "DRAFT" | "ISSUED" | "ACTIVE" | "COMPLETED" | "CLOSED"}
              canManage={canManage}
              canPay={canPay}
              advanceBalance={advanceAmount}
            />
          </div>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
