import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileNoAccess,
  MobileEmptyState,
  MobileStatusBadge,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { ListTree, Package, IndianRupee, BookOpen } from "lucide-react";
import { MobileBoqActions } from "./MobileBoqActions";

export const metadata = { title: "BOQ Item — Nirman" };

export default function MobileBoqDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={5} />}>
      <MobileBoqDetailContent params={params} />
    </Suspense>
  );
}

async function MobileBoqDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.BOQ_VIEW)) {
    return <MobileNoAccess what="BOQ item details" permission={PERM.BOQ_VIEW} />;
  }

  const { id } = await params;

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

  const canManage = hasPermission(role, PERM.BOQ_MANAGE);

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Header card */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {item.serialNo}
          </p>
          <MobileStatusBadge status={item.type.replace(/_/g, " ")} />
        </div>
        <p className="text-m-section font-bold leading-tight mb-1.5" style={{ color: "var(--color-ink-950)" }}>
          {item.description}
        </p>
        <p className="text-m-label mb-2" style={{ color: "var(--color-ink-500)" }}>
          {item.project.name}
          {item.phase ? ` · ${item.phase.name}` : ""}
        </p>
        {item.notes && (
          <p className="text-m-label leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
            {item.notes}
          </p>
        )}
      </div>

      {/* Financial summary (only for line items) */}
      {isLineItem && (
        <div>
          <SectionHead title="Estimated Values" />
          <div className="grid grid-cols-3 gap-2">
            {estimatedQty != null && (
              <StatCard label="Est. Qty" value={`${formatNumber(estimatedQty, 3)} ${item.unit ?? ""}`} icon={Package} tone="go" />
            )}
            {rate != null && (
              <StatCard label="Rate" value={formatCurrencyCompact(rate)} icon={IndianRupee} />
            )}
            {estimatedAmount != null && (
              <StatCard label="Est. Amount" value={formatCurrencyCompact(estimatedAmount)} icon={IndianRupee} tone="signal" />
            )}
          </div>
        </div>
      )}

      {/* Actual vs Estimated (only for line items with MB entries) */}
      {isLineItem && (
        <div>
          <SectionHead title="Actual vs Estimated" />
          <div
            className="rounded-[0.5rem] border divide-y"
            style={{ borderColor: "var(--color-line)" }}
          >
            <DetailRow label="Actual Qty (approved)" value={`${formatNumber(actualQty, 3)} ${item.unit ?? ""}`} />
            {estimatedQty != null && (
              <DetailRow label="Estimated Qty" value={`${formatNumber(estimatedQty, 3)} ${item.unit ?? ""}`} />
            )}
            {variance != null && (
              <DetailRow
                label="Variance"
                value={`${variance >= 0 ? "+" : ""}${formatNumber(variance, 3)} ${item.unit ?? ""}`}
              />
            )}
            {variancePct != null && (
              <DetailRow
                label="Variance %"
                value={`${variancePct >= 0 ? "+" : ""}${formatNumber(variancePct, 1)}%`}
              />
            )}
          </div>
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
            <div
              className="rounded-[0.5rem] border p-3 text-center"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <BookOpen className="size-5 mx-auto mb-1.5" style={{ color: "var(--color-ink-300)" }} />
              <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>No measurement entries yet</p>
            </div>
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
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  tone?: "default" | "go" | "signal" | "stop";
}) {
  const toneColor = {
    default: "var(--color-ink-950)",
    go: "var(--color-go)",
    signal: "var(--color-signal-dark)",
    stop: "var(--color-stop)",
  }[tone];

  return (
    <div
      className="rounded-[0.5rem] border p-2 overflow-hidden min-w-0"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center gap-1 mb-1">
        {Icon && <Icon className="size-3" style={{ color: "var(--color-ink-400)" }} />}
        <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      </div>
      <p className="text-m-section font-bold tabular-nums truncate" style={{ color: toneColor }}>{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-2" style={{ backgroundColor: "var(--color-paper)" }}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="size-3" style={{ color: "var(--color-ink-400)" }} />}
        <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      </div>
      <p className="text-m-label font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{value}</p>
    </div>
  );
}
