import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getBudgetVariance } from "@nirman/services";
import { TrendingUp, TrendingDown, AlertTriangle, Plus } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact, formatNumber } from "@/lib/utils";
import { MobileEmptyState, MobileCta } from "@/components/mobile/v2/primitives";
import { MobileBudgetVarianceProjectSelector } from "./MobileBudgetVarianceProjectSelector";

/**
 * /m/budget-variance — mobile budget vs actual cost variance.
 *
 * A project selector at the top switches the view via `?project=<id>`.
 * When a project is selected, `getBudgetVariance(projectId)` returns
 * BOQ + non-BOQ line items with budget/actual/variance figures.
 */
export default function MobileBudgetVariancePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileBudgetVarianceContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileBudgetVarianceContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();
  const { project: projectId } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId) ?? null
    : null;

  // Fetch variance only when a valid project is selected
  const variance = selectedProject ? await getBudgetVariance(selectedProject.id) : null;

  // Convert Decimal → number for rendering
  const totalBudget = variance?.totalBudget.toNumber() ?? 0;
  const totalActual = variance?.totalActual.toNumber() ?? 0;
  const totalVariance = variance?.totalVariance.toNumber() ?? 0;
  const totalVariancePct = variance?.totalVariancePct.toNumber() ?? 0;
  const boqBudget = variance?.boqBudget.toNumber() ?? 0;
  const nonBoqBudget = variance?.nonBoqBudget.toNumber() ?? 0;

  const isOverBudget = totalVariance < 0;
  const varianceColor = isOverBudget ? "var(--color-stop)" : "var(--color-go)";
  const VarianceIcon = isOverBudget ? TrendingDown : TrendingUp;

  const items = variance
    ? variance.items.map((i) => ({
        id: i.id,
        serialNo: i.serialNo,
        description: i.description,
        category: i.category,
        source: i.source,
        budgetedAmount: i.budgetedAmount.toNumber(),
        actualAmount: i.actualAmount.toNumber(),
        variance: i.variance.toNumber(),
        variancePct: i.variancePct.toNumber(),
        status: i.status,
      }))
    : [];

  return (
    <div>
      {/* ── Page title ── */}
      <h1
        className="text-[0.875rem] font-bold mb-2"
        style={{ color: "var(--color-ink-950)" }}
      >
        Budget Variance
      </h1>

      {/* ── Project selector ── */}
      <div className="mb-3">
        <MobileBudgetVarianceProjectSelector
          projects={projects}
          selectedId={selectedProject?.id}
        />
      </div>

      {/* ── No project selected ── */}
      {!selectedProject ? (
        <MobileEmptyState
          icon={TrendingUp}
          title="Select a project"
          hint="Choose a project above to view its budget vs actual cost variance."
        />
      ) : items.length === 0 ? (
        <MobileEmptyState
          icon={AlertTriangle}
          title="No variance data"
          hint="Add Bill of Quantities line items, record material issues, or log project costs to see budget variance."
          action={
            <MobileCta href={`/m/boq${selectedProject ? `?project=${selectedProject}` : ""}`} icon={Plus} variant="primary">
              Go to Bill of Quantities
            </MobileCta>
          }
        />
      ) : (
        <>
          {/* ── Summary card ── */}
          <div
            className="rounded-[0.625rem] border p-2.5 mb-3"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
            }}
          >
            {/* Variance headline */}
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
                style={{ backgroundColor: "var(--color-concrete)" }}
              >
                <VarianceIcon className="size-4" style={{ color: varianceColor }} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[0.4375rem] uppercase tracking-wide font-semibold"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  Total Variance
                </p>
                <p
                  className="text-[0.9375rem] font-bold tabular-nums leading-none"
                  style={{ color: varianceColor }}
                >
                  {totalVariance >= 0 ? "+" : ""}
                  {formatCurrency(totalVariance)}
                </p>
              </div>
              <span
                className="text-[0.5625rem] font-semibold tabular-nums px-2 py-0.5 rounded-[0.375rem]"
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
            <div className="flex items-center justify-between gap-2">
              <SummaryStat label="Budget" value={formatCurrency(totalBudget)} />
              <Divider />
              <SummaryStat label="Actual" value={formatCurrency(totalActual)} />
              <Divider />
              <SummaryStat
                label="Bill of Quantities / Other"
                value={`${formatCurrencyCompact(boqBudget)} / ${formatCurrencyCompact(nonBoqBudget)}`}
              />
            </div>
          </div>

          {/* ── Items list ── */}
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
                  className="rounded-[0.625rem] border p-2.5"
                  style={{
                    borderColor: "var(--color-line)",
                    backgroundColor: "var(--color-paper)",
                  }}
                >
                  {/* Row 1: icon + description + status */}
                  <div className="flex items-start gap-2 mb-1.5">
                    <span
                      className="shrink-0 grid place-items-center w-6 h-6 rounded-[0.375rem] mt-0.5"
                      style={{ backgroundColor: "var(--color-concrete)" }}
                    >
                      <ItemIcon className="size-3" style={{ color: itemColor }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[0.75rem] font-semibold leading-tight truncate"
                        style={{ color: "var(--color-ink-950)" }}
                      >
                        {item.description}
                      </p>
                      <p
                        className="text-[0.5625rem] mt-0.5 truncate"
                        style={{ color: "var(--color-ink-500)" }}
                      >
                        {item.category}
                        {item.serialNo !== "—" ? ` · ${item.serialNo}` : ""}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[0.5rem] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[0.375rem]"
                      style={{
                        backgroundColor: "color-mix(in srgb, var(--color-concrete) 60%, transparent)",
                        color: statusTone,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {/* Row 2: budget / actual / variance */}
                  <div className="flex items-center justify-between gap-2 pl-8">
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-[0.4375rem] uppercase tracking-wide"
                        style={{ color: "var(--color-ink-500)" }}
                      >
                        Budget
                      </span>
                      <span
                        className="text-[0.6875rem] font-bold tabular-nums"
                        style={{ color: "var(--color-ink-950)" }}
                      >
                        {item.budgetedAmount > 0 ? formatCurrency(item.budgetedAmount) : "—"}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-[0.4375rem] uppercase tracking-wide"
                        style={{ color: "var(--color-ink-500)" }}
                      >
                        Actual
                      </span>
                      <span
                        className="text-[0.6875rem] font-bold tabular-nums"
                        style={{ color: "var(--color-ink-950)" }}
                      >
                        {formatCurrency(item.actualAmount)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end min-w-0">
                      <span
                        className="text-[0.4375rem] uppercase tracking-wide"
                        style={{ color: "var(--color-ink-500)" }}
                      >
                        Variance
                      </span>
                      <span
                        className="text-[0.6875rem] font-bold tabular-nums"
                        style={{ color: itemColor }}
                      >
                        {item.variance >= 0 ? "+" : ""}
                        {formatCurrency(item.variance)}
                      </span>
                      <span
                        className="text-[0.5rem] tabular-nums"
                        style={{ color: "var(--color-ink-500)" }}
                      >
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
        </>
      )}
    </div>
  );
}

/* ─── Inline helpers ─── */

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <span
        className="text-[0.4375rem] uppercase tracking-wide"
        style={{ color: "var(--color-ink-500)" }}
      >
        {label}
      </span>
      <span
        className="text-[0.625rem] font-bold tabular-nums truncate"
        style={{ color: "var(--color-ink-950)" }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="w-px h-6 shrink-0" style={{ backgroundColor: "var(--color-line)" }} />;
}
