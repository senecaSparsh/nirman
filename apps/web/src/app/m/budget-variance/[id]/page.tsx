import { prisma } from "@nirman/db";
import { getBudgetVariance } from "@nirman/services";
import { TrendingUp, TrendingDown, AlertTriangle, FolderOpen } from "lucide-react";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact, formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import {
  DetailHeroCard,
  DetailStatGrid,
  DetailLinkRow,
} from "@/components/mobile/v2/detail-primitives";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";

export const metadata = { title: "Budget Variance — Nirman" };

export default function MobileBudgetVarianceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage
      params={params}
      perm={PERM.PROJECT_CONTROL_VIEW}
      what="budget variance analysis"
      permission={PERM.PROJECT_CONTROL_VIEW}
      skeletonSections={4}
    >
      {async ({ id, company }) => {
        const project = await prisma.project.findFirst({
          where: { id, companyId: company.id, deletedAt: null },
          select: { id: true, name: true, totalBudget: true },
        });

        if (!project) {
          return (
            <MobileEmptyState
              icon={TrendingUp}
              title="Project not found"
              hint="This project may have been deleted or doesn't exist."
            />
          );
        }

        let variance;
        try {
          variance = await getBudgetVariance(project.id);
        } catch {
          return (
            <MobileEmptyState
              icon={AlertTriangle}
              title="No variance data"
              hint="Add BOQ line items, record material issues, or log project costs to see budget variance."
            />
          );
        }

        const totalBudget = toNum(variance.totalBudget);
        const totalActual = toNum(variance.totalActual);
        const totalVariance = toNum(variance.totalVariance);
        const totalVariancePct = toNum(variance.totalVariancePct);
        const boqBudget = toNum(variance.boqBudget);
        const nonBoqBudget = toNum(variance.nonBoqBudget);

        const isOverBudget = totalVariance < 0;
        const varianceColor = isOverBudget ? "var(--color-stop)" : "var(--color-go)";
        const VarianceIcon = isOverBudget ? TrendingDown : TrendingUp;

        const items = variance.items.map((i) => ({
          id: i.id,
          serialNo: i.serialNo,
          description: i.description,
          category: i.category,
          source: i.source,
          budgetedAmount: toNum(i.budgetedAmount),
          actualAmount: toNum(i.actualAmount),
          variance: toNum(i.variance),
          variancePct: toNum(i.variancePct),
          status: i.status,
        }));

        return (
          <PageContextProvider value={{
            entityType: "budget-variance",
            label: project.name,
            recordId: project.id,
          }}>
          <div className="flex flex-col gap-4 pb-6">
            {/* Header card */}
            <DetailHeroCard
              title={project.name}
              subtitle="Budget Variance Analysis"
            >
              {/* Variance headline */}
              <div className="flex items-center gap-2 mb-2.5 mt-3">
                <span
                  className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
                  style={{ backgroundColor: "var(--color-concrete)" }}
                >
                  <VarianceIcon className="size-4" style={{ color: varianceColor }} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-m-caption uppercase tracking-wide font-semibold" style={{ color: "var(--color-ink-500)" }}>
                    Total Variance
                  </p>
                  <p className="text-m-section font-bold tabular-nums leading-none" style={{ color: varianceColor }}>
                    {totalVariance >= 0 ? "+" : ""}{formatCurrency(totalVariance)}
                  </p>
                </div>
                <span
                  className="text-m-caption font-semibold tabular-nums px-2 py-0.5 rounded-[0.375rem]"
                  style={{
                    backgroundColor: isOverBudget
                      ? "color-mix(in srgb, var(--color-stop) 12%, transparent)"
                      : "color-mix(in srgb, var(--color-go) 12%, transparent)",
                    color: varianceColor,
                  }}
                >
                  {isOverBudget ? "OVER" : "UNDER"} {formatNumber(Math.abs(totalVariancePct), 1)}%
                </span>
              </div>
              {/* Budget / Actual / split */}
              <DetailStatGrid
                cols={3}
                stats={[
                  { label: "Budget", value: formatCurrency(totalBudget) },
                  { label: "Actual", value: formatCurrency(totalActual) },
                  { label: "BOQ / Other", value: `${formatCurrencyCompact(boqBudget)} / ${formatCurrencyCompact(nonBoqBudget)}` },
                ]}
              />
            </DetailHeroCard>

            {/* Items breakdown */}
            <div>
              <SectionHead title={`Line Items (${items.length})`} />
              {items.length === 0 ? (
                <MobileEmptyState
                  icon={TrendingUp}
                  title="No variance data"
                  size="compact"
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((item) => {
                    const itemOver = item.variance < 0;
                    const itemColor = itemOver ? "var(--color-stop)" : "var(--color-go)";
                    const ItemIcon = itemOver ? TrendingDown : TrendingUp;
                    const statusLabel =
                      item.status === "OVER"
                        ? "Over"
                        : item.status === "UNDER"
                          ? "Under"
                          : item.status === "UNBUDGETED"
                            ? "Unbudgeted"
                            : "On Track";
                    const statusTone =
                      item.status === "OVER"
                        ? "var(--color-stop)"
                        : item.status === "UNDER"
                          ? "var(--color-go)"
                          : item.status === "UNBUDGETED"
                            ? "var(--color-signal-dark)"
                            : "var(--color-ink-500)";

                    return (
                      <div
                        key={item.id}
                        className="rounded-[0.5rem] border p-2.5"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                      >
                        <div className="flex items-start gap-2 mb-1.5">
                          <span
                            className="shrink-0 grid place-items-center w-6 h-6 rounded-[0.375rem] mt-0.5"
                            style={{ backgroundColor: "var(--color-concrete)" }}
                          >
                            <ItemIcon className="size-3" style={{ color: itemColor }} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-m-section font-semibold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
                              {item.description}
                            </p>
                            <p className="text-m-caption mt-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                              {item.category}
                              {item.serialNo !== "—" ? ` · ${item.serialNo}` : ""}
                            </p>
                          </div>
                          <span
                            className="shrink-0 text-m-caption font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[0.375rem]"
                            style={{
                              backgroundColor: "color-mix(in srgb, var(--color-concrete) 60%, transparent)",
                              color: statusTone,
                            }}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 pl-8">
                          <div className="flex flex-col min-w-0">
                            <span className="text-m-caption uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Budget</span>
                            <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                              {item.budgetedAmount > 0 ? formatCurrency(item.budgetedAmount) : "—"}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-m-caption uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Actual</span>
                            <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                              {formatCurrency(item.actualAmount)}
                            </span>
                          </div>
                          <div className="flex flex-col items-end min-w-0">
                            <span className="text-m-caption uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Variance</span>
                            <span className="text-m-body font-bold tabular-nums" style={{ color: itemColor }}>
                              {item.variance >= 0 ? "+" : ""}{formatCurrency(item.variance)}
                            </span>
                            <span className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                              {item.budgetedAmount > 0
                                ? `${item.variance >= 0 ? "+" : ""}${formatNumber(item.variancePct, 1)}%`
                                : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Project link */}
            <DetailLinkRow
              href={`/m/projects/${project.id}`}
              icon={FolderOpen}
              label={`View Project · ${project.name}`}
            />
          </div>
          </PageContextProvider>
        );
      }}
    </MobileDetailPage>
  );
}
