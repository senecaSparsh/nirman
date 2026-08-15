import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { BookOpen, Plus } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileMbProjectSelector } from "./MobileMbProjectSelector";

/**
 * /m/measurement-book — mobile measurement book entries.
 * Records of measured work executed against BOQ items (earned value basis).
 */
export default function MobileMeasurementBookPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileMbContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileMbContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canView = hasPermission(role, PERM.ASSETS_VIEW);
  const { project: projectId } = await searchParams;

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!projectId) {
    return (
      <div>
        <MobileMbProjectSelector projects={projects} selectedId={null} />
        <MobileEmptyState
          icon={BookOpen}
          title="Select a project"
          hint="Choose a project to view measurement book entries"
        />
      </div>
    );
  }

  const [entries, boqItems] = await Promise.all([
    prisma.measurementBookEntry.findMany({
      where: { projectId },
      orderBy: { measureDate: "desc" },
      take: 50,
      include: {
        boqItem: { select: { id: true, serialNo: true, description: true, unit: true, rate: true } },
        measuredBy: { select: { id: true, name: true } },
      },
    }),
    prisma.boqItem.findMany({
      where: { projectId, type: "LINE_ITEM" },
      orderBy: { serialNo: "asc" },
      select: { id: true, serialNo: true, description: true, unit: true, rate: true },
    }),
  ]);

  const totalMeasured = entries.reduce((s, e) => s + toNum(e.measuredQty), 0);
  const totalValue = entries.reduce((s, e) => {
    const rate = e.boqItem.rate ? toNum(e.boqItem.rate) : 0;
    return s + toNum(e.measuredQty) * rate;
  }, 0);

  const serialized = entries.map((e) => ({
    id: e.id,
    mbNumber: e.mbNumber,
    boqSerialNo: e.boqItem.serialNo,
    boqDescription: e.boqItem.description,
    unit: e.boqItem.unit ?? "",
    measuredQty: toNum(e.measuredQty),
    rate: e.boqItem.rate ? toNum(e.boqItem.rate) : 0,
    amount: toNum(e.measuredQty) * (e.boqItem.rate ? toNum(e.boqItem.rate) : 0),
    measureDate: e.measureDate.toISOString(),
    description: e.description,
    measuredByName: e.measuredBy?.name ?? "—",
    status: e.status,
  }));

  return (
    <div>
      <MobileMbProjectSelector projects={projects} selectedId={projectId} />

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Entries" value={String(entries.length)} icon={BookOpen} />
        <MobileStatCard label="Total Measured" value={formatNumber(totalMeasured, 2)} icon={BookOpen} tone="neutral" />
        <MobileStatCard label="Earned Value" value={formatCurrency(totalValue)} icon={BookOpen} tone="go" />
        <MobileStatCard label="BOQ Items" value={String(boqItems.length)} icon={BookOpen} />
      </div>

      {serialized.length === 0 ? (
        <MobileEmptyState
          icon={BookOpen}
          title="No measurement entries"
          hint={boqItems.length === 0
            ? "Add BOQ line items first, then measure work against them"
            : "Measurement book entries will appear here as work is measured"}
          action={boqItems.length === 0 ? (
            <MobileCta href={`/m/boq${projectId ? `?project=${projectId}` : ""}`} icon={Plus} variant="primary">
              Go to BOQ
            </MobileCta>
          ) : undefined}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {serialized.map((e) => (
            <MbEntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function MbEntryCard({ entry: e }: { entry: any }) {
  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {e.mbNumber}
        </p>
        <p className="text-[0.5625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
          {formatDate(e.measureDate)}
        </p>
      </div>
      <p className="text-[0.4375rem] font-bold tabular-nums mb-0.5" style={{ color: "var(--color-ink-500)" }}>
        BOQ {e.boqSerialNo}
      </p>
      <p className="text-[0.75rem] font-bold leading-tight mb-1.5" style={{ color: "var(--color-ink-950)" }}>
        {e.boqDescription}
      </p>
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Measured</p>
          <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatNumber(e.measuredQty, 2)} {e.unit}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div>
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Rate</p>
          <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
            {formatCurrency(e.rate)}
          </p>
        </div>
        <div className="w-px h-6" style={{ backgroundColor: "var(--color-line)" }} />
        <div className="ml-auto text-right">
          <p className="text-[0.375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Amount</p>
          <p className="text-[0.6875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrency(e.amount)}
          </p>
        </div>
      </div>
      {e.description && (
        <p className="text-[0.5rem] mt-1.5" style={{ color: "var(--color-ink-500)" }}>
          {e.description}
        </p>
      )}
    </div>
  );
}
