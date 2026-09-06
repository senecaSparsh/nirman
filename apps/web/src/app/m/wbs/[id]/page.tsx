import { Suspense } from "react";
import Link from "next/link";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileNoAccess,
  MobileEmptyState,
  MobileStatusBadge,
  SectionHead,
} from "@/components/mobile/v2/primitives";
import { ListTree, Calendar, BookOpen, ChevronRight } from "lucide-react";
import { MobileWbsActions } from "./MobileWbsActions";

export const metadata = { title: "WBS Node — Nirman" };

export default function MobileWbsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={5} />}>
      <MobileWbsDetailContent params={params} />
    </Suspense>
  );
}

async function MobileWbsDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.WBS_VIEW)) {
    return <MobileNoAccess what="WBS node details" permission={PERM.WBS_VIEW} />;
  }

  const { id } = await params;

  const node = await prisma.wbsNode.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      parent: { select: { id: true, code: true, name: true } },
      boqItem: { select: { id: true, serialNo: true, description: true, unit: true, estimatedAmount: true } },
      children: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          progressPct: true,
          plannedStart: true,
          plannedEnd: true,
        },
      },
      mbEntries: {
        orderBy: { measureDate: "desc" },
        take: 10,
        select: {
          id: true,
          mbNumber: true,
          measureDate: true,
          measuredQty: true,
          status: true,
        },
      },
    },
  });

  if (!node) {
    return (
      <MobileEmptyState
        icon={ListTree}
        title="WBS node not found"
        hint="This WBS node may have been deleted or doesn't exist."
      />
    );
  }

  const progress = toNum(node.progressPct);
  const progressColor =
    progress >= 100
      ? "var(--color-go)"
      : progress > 0
        ? "var(--color-signal)"
        : "var(--color-concrete)";

  const canManage = hasPermission(role, PERM.WBS_MANAGE);

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Header card */}
      <div
        className="rounded-[0.625rem] border p-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
            {node.code}
          </p>
          <MobileStatusBadge status={node.type.replace(/_/g, " ")} />
        </div>
        <p className="text-m-section font-bold leading-tight mb-1.5" style={{ color: "var(--color-ink-950)" }}>
          {node.name}
        </p>
        <p className="text-m-label mb-2" style={{ color: "var(--color-ink-500)" }}>
          {node.project.name}
          {node.phase ? ` · ${node.phase.name}` : ""}
        </p>
        {node.description && (
          <p className="text-m-label leading-relaxed mt-1.5" style={{ color: "var(--color-ink-700)" }}>
            {node.description}
          </p>
        )}
        {/* Progress bar */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Progress</p>
            <p className="text-m-label font-bold tabular-nums" style={{ color: progressColor }}>
              {formatNumber(progress, 0)}%
            </p>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-concrete)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: progressColor }}
            />
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div>
        <SectionHead title="Schedule" />
        <div
          className="rounded-[0.5rem] border divide-y"
          style={{ borderColor: "var(--color-line)" }}
        >
          {node.plannedStart && <DetailRow label="Planned Start" value={formatDate(node.plannedStart)} icon={Calendar} />}
          {node.plannedEnd && <DetailRow label="Planned End" value={formatDate(node.plannedEnd)} icon={Calendar} />}
          {node.actualStart && <DetailRow label="Actual Start" value={formatDate(node.actualStart)} icon={Calendar} />}
          {node.actualEnd && <DetailRow label="Actual End" value={formatDate(node.actualEnd)} icon={Calendar} />}
          <DetailRow label="Critical Path" value={node.isCritical ? "Yes" : "No"} />
          {node.totalFloat != null && <DetailRow label="Total Float" value={`${node.totalFloat} days`} />}
        </div>
      </div>

      {/* BOQ link */}
      {node.boqItem && (
        <div>
          <SectionHead title="Linked BOQ Item" />
          <Link
            href={`/m/boq/${node.boqItem.id}`}
            className="rounded-[0.5rem] border p-2.5 text-m-body press flex items-center gap-2"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                {node.boqItem.serialNo}
              </p>
              <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>
                {node.boqItem.description}
              </p>
              {node.boqItem.estimatedAmount && (
                <p className="text-m-caption font-bold tabular-nums mt-0.5" style={{ color: "var(--color-ink-700)" }}>
                  {formatCurrency(toNum(node.boqItem.estimatedAmount))}
                </p>
              )}
            </div>
            <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-400)" }} />
          </Link>
        </div>
      )}

      {/* Children */}
      {node.children.length > 0 && (
        <div>
          <SectionHead title={`Sub-tasks (${node.children.length})`} />
          <div className="flex flex-col gap-1.5">
            {node.children.map((child) => {
              const childProgress = toNum(child.progressPct);
              const childColor =
                childProgress >= 100
                  ? "var(--color-go)"
                  : childProgress > 0
                    ? "var(--color-signal)"
                    : "var(--color-concrete)";
              return (
                <Link
                  key={child.id}
                  href={`/m/wbs/${child.id}`}
                  className="rounded-[0.5rem] border p-2.5 text-m-body press"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: childColor }} />
                    <span className="text-m-caption font-semibold tabular-nums shrink-0" style={{ color: "var(--color-ink-500)" }}>
                      {child.code}
                    </span>
                    <p className="text-m-section font-semibold truncate flex-1" style={{ color: "var(--color-ink-950)" }}>
                      {child.name}
                    </p>
                    <span className="text-m-body font-bold tabular-nums shrink-0" style={{ color: childColor }}>
                      {formatNumber(childProgress, 0)}%
                    </span>
                  </div>
                  {(child.plannedStart || child.plannedEnd) && (
                    <div className="flex items-center gap-1" style={{ marginLeft: "1.125rem" }}>
                      <Calendar className="size-2.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                      <span className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                        {formatDate(child.plannedStart)} — {formatDate(child.plannedEnd)}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* MB Entries */}
      <div>
        <SectionHead title={`MB Entries (${node.mbEntries.length})`} />
        {node.mbEntries.length === 0 ? (
          <div
            className="rounded-[0.625rem] border p-3 text-center"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <BookOpen className="size-5 mx-auto mb-1.5" style={{ color: "var(--color-ink-300)" }} />
            <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>No measurement entries</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {node.mbEntries.map((mb) => (
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
                      {formatNumber(toNum(mb.measuredQty), 3)}
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

      {/* Project link */}
      <Link
        href={`/m/projects/${node.project.id}`}
        className="rounded-[0.5rem] border p-2.5 text-m-body press flex items-center gap-2"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Project</p>
          <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>{node.project.name}</p>
        </div>
      </Link>

      {/* Edit/Delete action bar */}
      {canManage && (
        <MobileWbsActions
          nodeId={node.id}
          nodeName={node.name}
          initial={{
            name: node.name,
            description: node.description,
            plannedStart: node.plannedStart?.toISOString() ?? null,
            plannedEnd: node.plannedEnd?.toISOString() ?? null,
            actualStart: node.actualStart?.toISOString() ?? null,
            actualEnd: node.actualEnd?.toISOString() ?? null,
            progressPct: node.progressPct != null ? toNum(node.progressPct) : null,
            isCritical: node.isCritical,
          }}
        />
      )}
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
