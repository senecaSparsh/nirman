import Link from "next/link";
import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileStatusBadge,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { DetailHeroCard, DetailStatGrid, DetailKeyValueCard } from "@/components/mobile/v2/detail-primitives";
import { ListTree, Package, IndianRupee, BookOpen, type LucideIcon } from "lucide-react";
import { MobileBoqActions } from "./MobileBoqActions";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { MobileDetailPage } from "@/components/mobile/v2/detail-page";

export const metadata = { title: "BOQ Item — Nirman" };

export default function MobileBoqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <MobileDetailPage
      params={params}
      perm={PERM.BOQ_VIEW}
      what="BOQ item details"
      permission={PERM.BOQ_VIEW}
      managePerm={PERM.BOQ_MANAGE}
      skeletonSections={5}
    >
      {async ({ id, company, canManage }) => {
        const item = await prisma.boqItem.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      parent: { select: { id: true, serialNo: true, description: true } },
      children: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, serialNo: true, description: true, type: true, unit: true, estimatedQty: true, rate: true, estimatedAmount: true },
      },
      material: { select: { id: true, name: true, unit: true, code: true } },
      mbEntries: {
        orderBy: { measureDate: "desc" },
        take: 10,
        select: {
          id: true,
          mbNumber: true,
          measureDate: true,
          measuredQty: true,
          cumulativeQty: true,
          status: true,
        },
      },
    },
  });

  if (!item) {
    return (
      <MobileEmptyState
        icon={ListTree}
        title="BOQ item not found"
        hint="This BOQ item may have been deleted or doesn't exist."
      />
    );
  }

  const estimatedQty = item.estimatedQty ? toNum(item.estimatedQty) : null;
  const rate = item.rate ? toNum(item.rate) : null;
  const estimatedAmount = item.estimatedAmount ? toNum(item.estimatedAmount) : null;
  const isLineItem = item.type === "LINE_ITEM";

  // Compute actual qty from MB entries
  const actualQty = item.mbEntries
    .filter((e) => e.status === "APPROVED")
    .reduce((s, e) => s + toNum(e.measuredQty), 0);
  const variance = estimatedQty != null ? actualQty - estimatedQty : null;
  const variancePct = estimatedQty != null && estimatedQty > 0 ? (variance! / estimatedQty) * 100 : null;

  // Build stat grid entries (conditional on non-null values)
  const estStats: { label: string; value: string; tone?: "default" | "go" | "stop" | "signal"; icon?: LucideIcon }[] = [];
  if (estimatedQty != null) {
    estStats.push({ label: "Est. Qty", value: `${formatNumber(estimatedQty, 3)} ${item.unit ?? ""}`, tone: "go", icon: Package });
  }
  if (rate != null) {
    estStats.push({ label: "Rate", value: formatCurrencyCompact(rate), icon: IndianRupee });
  }
  if (estimatedAmount != null) {
    estStats.push({ label: "Est. Amount", value: formatCurrencyCompact(estimatedAmount), tone: "signal", icon: IndianRupee });
  }

  // Build variance entries (conditional on non-null values)
  const varianceEntries: { label: string; value: string }[] = [
    { label: "Actual Qty (approved)", value: `${formatNumber(actualQty, 3)} ${item.unit ?? ""}` },
  ];
  if (estimatedQty != null) {
    varianceEntries.push({ label: "Estimated Qty", value: `${formatNumber(estimatedQty, 3)} ${item.unit ?? ""}` });
  }
  if (variance != null) {
    varianceEntries.push({ label: "Variance", value: `${variance >= 0 ? "+" : ""}${formatNumber(variance, 3)} ${item.unit ?? ""}` });
  }
  if (variancePct != null) {
    varianceEntries.push({ label: "Variance %", value: `${variancePct >= 0 ? "+" : ""}${formatNumber(variancePct, 1)}%` });
  }

  return (
    <PageContextProvider value={{
      entityType: "boqItem",
      label: item.serialNo,
      subtitle: item.project.name,
      recordId: item.id,
    }}>
    <div className="flex flex-col gap-4 pb-20">
      {/* Header card */}
      <DetailHeroCard
        icon={ListTree}
        title={item.description}
        subtitle={`${item.serialNo} · ${item.project.name}${item.phase ? ` · ${item.phase.name}` : ""}`}
        status={item.type.replace(/_/g, " ")}
      >
        {item.notes && (
          <p className="text-m-label leading-relaxed mt-2" style={{ color: "var(--color-ink-700)" }}>
            {item.notes}
          </p>
        )}
      </DetailHeroCard>

      {/* Financial summary (only for line items) */}
      {isLineItem && (
        <div>
          <SectionHead title="Estimated Values" />
          <DetailStatGrid cols={3} stats={estStats} />
        </div>
      )}

      {/* Actual vs Estimated (only for line items with MB entries) */}
      {isLineItem && (
        <div>
          <SectionHead title="Actual vs Estimated" />
          <DetailKeyValueCard entries={varianceEntries} />
        </div>
      )}

      {/* Sub-items (children) */}
      {item.children.length > 0 && (
        <div>
          <SectionHead title={`Sub-items (${item.children.length})`} />
          <div
            className="rounded-[0.5rem] border overflow-hidden"
            style={{ borderColor: "var(--color-line)" }}
          >
            {item.children.map((child, i) => (
              <Link
                key={child.id}
                href={`/m/boq/${child.id}`}
                className="block p-2.5 text-m-body press"
                style={i > 0 ? { borderTop: "1px solid var(--color-line)" } : undefined}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                    {child.serialNo}
                  </span>
                  <span className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-400)" }}>
                    {child.type.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-m-label font-semibold leading-snug" style={{ color: "var(--color-ink-950)" }}>
                  {child.description}
                </p>
                {child.type === "LINE_ITEM" && child.estimatedAmount && (
                  <p className="text-m-caption font-bold tabular-nums mt-0.5" style={{ color: "var(--color-ink-700)" }}>
                    {formatCurrency(toNum(child.estimatedAmount))}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* MB Entries */}
      {isLineItem && (
        <div>
          <SectionHead title={`MB Entries (${item.mbEntries.length})`} />
          {item.mbEntries.length === 0 ? (
            <MobileEmptyState
              icon={BookOpen}
              title="No measurement entries yet"
              size="compact"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {item.mbEntries.map((mb) => (
                <Link
                  key={mb.id}
                  href={`/m/measurement-book/${mb.id}`}
                  className="rounded-[0.5rem] border p-2.5 text-m-body press"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                      {mb.mbNumber}
                    </p>
                    <MobileStatusBadge status={mb.status} />
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Measured</p>
                      <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                        {formatNumber(toNum(mb.measuredQty), 3)} {item.unit ?? ""}
                      </p>
                    </div>
                    <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
                    <div>
                      <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Cumulative</p>
                      <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                        {formatNumber(toNum(mb.cumulativeQty), 3)} {item.unit ?? ""}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Date</p>
                      <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-700)" }}>
                        {formatDate(mb.measureDate)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Project link */}
      <Link
        href={`/m/projects/${item.project.id}`}
        className="rounded-[0.5rem] border p-2.5 text-m-body press flex items-center gap-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Project</p>
          <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>{item.project.name}</p>
        </div>
      </Link>

      {/* Edit/Delete action bar */}
      {canManage && (
        <MobileBoqActions
          itemId={item.id}
          itemDescription={item.description}
          isLineItem={isLineItem}
          initial={{
            serialNo: item.serialNo,
            description: item.description,
            unit: item.unit,
            estimatedQty: estimatedQty,
            rate: rate,
            notes: item.notes,
          }}
        />
      )}
    </div>
    </PageContextProvider>
  );
      }}
    </MobileDetailPage>
  );
}
