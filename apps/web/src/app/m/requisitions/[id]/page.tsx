import Link from "next/link";
import { prisma } from "@nirman/db";
import { getUserPermissions, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber, formatDate, formatCurrency } from "@/lib/utils";
import { FileText } from "lucide-react";
import { MobileEmptyState, MobilePipelineStepper, type MobilePipelineStep, ActionBar } from "@/components/mobile/v2/primitives";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { NextActionCardView } from "@/components/mobile/v2/guidance";
import { resolveNextAction } from "@/lib/flow-map";
import { MobileRequisitionActions } from "@/components/mobile/mobile-requisition-actions";
import { MobileQuotePanel } from "./MobileQuotePanel";
import { RecordRecentItem } from "@/components/mobile/v2/record-recent-item";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";
import { DetailHeroCard, DetailPrintButton, DetailTimeline, type TimelineStepData } from "@/components/mobile/v2/detail-primitives";

/**
 * /m/requisitions/[id] — requisition detail as a workflow document.
 *
 * Distinct from other detail pages: no KPI grid, no icon boxes.
 * Instead: hero card → pipeline stepper → vertical workflow timeline →
 * line items table → notes block → sticky bottom action bar.
 */
export default function MobileRequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage params={params} managePerm={PERM.PROCUREMENT_MANAGE} skeletonSections={6}>
      {async ({ id, company, role, canManage }) => {
        const overrides = await getUserPermissions();

        const req = await prisma.materialRequisition.findFirst({
          where: { id, project: { companyId: company.id } },
          include: {
            project: { select: { id: true, name: true } },
            phase: { select: { name: true } },
            requestedBy: { select: { name: true } },
            approvedBy: { select: { name: true } },
            rejectedBy: { select: { name: true } },
            vendorQuotes: {
              select: {
                id: true,
                status: true,
                isCheapest: true,
                landedTotal: true,
                supplier: { select: { id: true, name: true } },
                selectedAt: true,
                selectionReason: true,
                lines: { select: { materialId: true, unitPrice: true, unitLandedCost: true } },
              },
            },
            lines: {
              include: {
                material: { select: { id: true, code: true, name: true, unit: true, currentCost: true } },
                preferredSupplier: { select: { id: true, name: true } },
              },
              orderBy: { material: { name: "asc" } },
            },
          },
        });

        if (!req) {
          return (
            <div>
              <div className="mb-4">
              </div>
              <MobileEmptyState icon={FileText} title="Indent not found" />
            </div>
          );
        }

        const canApprove = hasPermission(role, PERM.REQUISITION_APPROVE);

        const [suppliers, locations] = await Promise.all([
          prisma.supplier.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          prisma.stockLocation.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true, type: true, projectId: true },
            orderBy: { name: "asc" },
          }),
        ]);

        const lines = req.lines.map((l) => ({
          id: l.id,
          materialId: l.material.id,
          materialName: l.material.name,
          materialCode: l.material.code,
          unit: l.material.unit,
          qtyRequested: toNum(l.qtyRequested),
          notes: l.notes,
          currentStock: l.currentStock != null ? toNum(l.currentStock) : null,
          lastRate: l.lastRate != null ? toNum(l.lastRate) : null,
          suggestedCost: toNum(l.material.currentCost),
          preferredSupplierId: l.preferredSupplierId,
        }));

        const reqPayload = {
          id: req.id,
          reqNumber: req.reqNumber,
          status: req.status,
          projectName: req.project?.name ?? null,
          projectId: req.project?.id ?? null,
          phaseName: req.phase?.name ?? null,
          requestDate: req.requestDate.toISOString(),
          neededByDate: req.neededByDate?.toISOString() ?? null,
          notes: req.notes,
          rejectReason: req.rejectReason,
          convertedPoId: req.convertedPoId,
        };

        // Timeline data
        const totalItems = lines.reduce((s, l) => s + l.qtyRequested, 0);
        const quoteCount = req.vendorQuotes.length;
        const quotesMet = quoteCount >= req.minQuotesRequired || req.quotesWaived;

        // ── Winning quote (SELECTED status) — passed to ConvertForm for display ──
        const winningQuote = req.vendorQuotes.find((q) => q.status === "SELECTED");
        const winningQuoteData = winningQuote
          ? {
              id: winningQuote.id,
              supplierName: winningQuote.supplier.name,
              supplierId: winningQuote.supplier.id,
              landedTotal: toNum(winningQuote.landedTotal),
              selectedAt: winningQuote.selectedAt?.toISOString() ?? null,
              selectionReason: winningQuote.selectionReason,
              isCheapest: winningQuote.isCheapest,
              lineCosts: Object.fromEntries(
                winningQuote.lines.map((l) => [l.materialId, toNum(l.unitPrice)]),
              ),
            }
          : null;

        // Needed-by urgency
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let neededText = "";
        let neededUrgent = false;
        if (req.neededByDate) {
          const needed = new Date(req.neededByDate); needed.setHours(0, 0, 0, 0);
          const diff = Math.round((needed.getTime() - today.getTime()) / 86400000);
          if (diff < 0) { neededText = `${Math.abs(diff)}d overdue`; neededUrgent = true; }
          else if (diff === 0) { neededText = "today"; neededUrgent = true; }
          else if (diff <= 3) { neededText = `${diff}d left`; neededUrgent = true; }
          else { neededText = formatDate(req.neededByDate); }
        }

        // Pipeline position: Indent → Quote → PO → GRN → Issue
        const pipelineSteps: MobilePipelineStep[] = [
          { label: "Indent", state: "current" },
          { label: "Quote", state: quoteCount > 0 ? "done" : "pending" },
          {
            label: "PO",
            state: req.convertedPoId ? "done" : "pending",
            href: req.convertedPoId ? `/m/procurement/${req.convertedPoId}` : undefined,
          },
          { label: "GRN", state: "pending" },
          { label: "Issue", state: "pending" },
        ];

        const nextAction = resolveNextAction("requisition", req.status, role, overrides);

        // Permissions to announce to the NavSheet's Next Step resolver
        const canActions: string[] = [];
        if (canApprove) canActions.push(PERM.REQUISITION_APPROVE);
        if (canManage) canActions.push(PERM.PROCUREMENT_MANAGE);

        // ── Workflow timeline steps ──
        const timelineSteps: TimelineStepData[] = [
          {
            label: "Created",
            date: formatDate(req.createdAt),
            detail: req.requestedBy?.name ?? "—",
            state: "done",
            color: "var(--color-go)",
          },
        ];

        if (req.status !== "DRAFT") {
          timelineSteps.push({
            label: "Submitted",
            date: formatDate(req.requestDate),
            state: "done",
            color: "var(--color-go)",
          });
        } else {
          timelineSteps.push({
            label: "Draft — not submitted",
            detail: "Awaiting submission",
            state: "current",
          });
        }

        if (req.status === "SUBMITTED") {
          timelineSteps.push({
            label: "Awaiting approval",
            detail: canApprove ? "Your action needed" : "Pending approver review",
            state: "current",
          });
        } else if (req.status === "APPROVED" || req.status === "CONVERTED") {
          timelineSteps.push({
            label: "Approved",
            date: req.approvedAt ? formatDate(req.approvedAt) : "—",
            detail: req.approvedBy?.name ?? "—",
            state: "done",
            color: "var(--color-go)",
          });
        } else if (req.status === "REJECTED") {
          timelineSteps.push({
            label: "Rejected",
            date: req.rejectedAt ? formatDate(req.rejectedAt) : "—",
            detail: req.rejectReason ?? req.rejectedBy?.name ?? "—",
            state: "done",
            color: "var(--color-stop)",
          });
        }

        if (req.status === "APPROVED") {
          timelineSteps.push({
            label: quotesMet ? "Ready to convert" : "Needs quotes",
            detail: quotesMet
              ? "Convert to purchase order"
              : `${quoteCount}/${req.minQuotesRequired} vendor quotes`,
            state: "current",
          });
        }

        if (req.status === "CONVERTED" && req.convertedPoId) {
          timelineSteps.push({
            label: "Converted to PO",
            detail: "View purchase order →",
            state: "done",
            color: "var(--color-go)",
          });
        }

        return (
          <PageContextProvider value={{
            entityType: "requisition",
            flowId: "requisition",
            status: req.status,
            label: req.reqNumber,
            subtitle: req.project?.name,
            recordId: req.id,
            canActions,
          }}>
          <div className="pb-20">
            <RecordRecentItem type="requisition" id={req.id} label={req.reqNumber} sublabel={req.project?.name} href={`/m/requisitions/${req.id}`} />

            {/* ── Next action — the one thing to do, doable on this page ── */}
            {nextAction ? (
              <NextActionCardView
                label={nextAction.label}
                reason={nextAction.reason}
                tone={nextAction.tone ?? "signal"}
                hash={nextAction.action.type === "anchor" ? nextAction.action.hash : undefined}
                href={nextAction.action.type === "navigate" ? nextAction.action.href.replace("{id}", req.id) : undefined}
              />
            ) : null}

            {/* ── Hero card — req number + status + print + project link + needed-by ── */}
            <DetailHeroCard
              title={req.reqNumber}
              titleMono
              status={req.status}
              action={<DetailPrintButton href={`/print/requisition/${req.id}`} />}
            >
              <div className="flex items-center gap-3 text-m-body mt-2" style={{ color: "var(--color-ink-500)" }}>
                <Link
                  href={`/m/projects/${req.project?.id ?? ""}`}
                  className="font-semibold hover:underline"
                  style={{ color: "var(--color-ink-700)" }}
                >
                  {req.project?.name ?? "No project"}
                </Link>
                {neededText ? (
                  <span
                    className="font-bold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: neededUrgent ? "var(--color-stop)" : "var(--color-concrete)",
                      color: neededUrgent ? "var(--color-paper)" : "var(--color-ink-500)",
                    }}
                  >
                    {neededText}
                  </span>
                ) : null}
              </div>
            </DetailHeroCard>

            {/* Pipeline position — where this indent sits in the macro flow */}
            <div className="mb-4 rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <MobilePipelineStepper steps={pipelineSteps} />
            </div>

            {/* ── Workflow timeline ── */}
            <DetailTimeline steps={timelineSteps} title="Workflow" />

            {/* ── Line items table ── */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-m-caption font-bold uppercase tracking-wider" style={{ color: "var(--color-steel)" }}>
                  Items
                </p>
                <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
                  {lines.length} lines · {formatNumber(totalItems, 0)} units
                </span>
              </div>
              <div
                className="rounded-[0.625rem] border overflow-hidden"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                {lines.map((l, i) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 px-2.5 py-2"
                    style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {l.materialName}
                      </p>
                      <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                        {l.materialCode}
                        {l.currentStock != null ? ` · stock ${formatNumber(l.currentStock, 0)}` : ""}
                        {l.lastRate != null ? ` · last ${formatCurrency(l.lastRate)}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                        {formatNumber(l.qtyRequested, 0)}
                      </p>
                      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                        {l.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Vendor quotes + comparative statement (mobile) ──
                Shown when the requisition is APPROVED (quotes collection phase)
                or when quotes already exist. Inline — no redirection. */}
            {req.status === "APPROVED" || quoteCount > 0 ? (
              <MobileQuotePanel
                requisitionId={req.id}
                reqNumber={req.reqNumber}
                requisitionLines={lines.map((l) => ({
                  materialId: l.materialId,
                  materialCode: l.materialCode,
                  materialName: l.materialName,
                  unit: l.unit,
                  qtyRequested: l.qtyRequested,
                }))}
                suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                canApprove={canApprove}
                canCreate={canManage}
              />
            ) : null}

            {/* ── Notes block ── */}
            {req.notes ? (
              <div className="mb-5">
                <p className="text-m-caption font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-steel)" }}>
                  Notes
                </p>
                <div
                  className="rounded-[0.625rem] border-l-2 p-3 text-m-section italic"
                  style={{
                    borderColor: "var(--color-steel)",
                    backgroundColor: "var(--color-paper)",
                    color: "var(--color-ink-700)",
                  }}
                >
                  {req.notes}
                </div>
              </div>
            ) : null}

            <AttachmentList entityType="MaterialRequisition" entityId={req.id} />

            {/* ── Sticky bottom action bar ── */}
            <ActionBar>
                <MobileRequisitionActions
                  requisition={reqPayload}
                  lines={lines}
                  suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                  locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type, projectId: l.projectId }))}
                  canApprove={canApprove}
                  canManage={canManage}
                  quoteCount={quoteCount}
                  minQuotesRequired={req.minQuotesRequired}
                  quotesWaived={req.quotesWaived}
                  winningQuote={winningQuoteData}
                />
            </ActionBar>
          </div>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
