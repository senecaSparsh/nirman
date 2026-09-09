import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { EmptyState } from "@/components/empty-state";
import { RefreshButton } from "@/components/refresh-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Hammer } from "lucide-react";

export const metadata = { title: "Renovations" };

const TYPE_LABELS: Record<string, string> = {
  RENOVATION: "Renovation",
  ADDITION: "Addition",
  VALUE_ADD: "Value Add",
  REPAIR: "Repair",
};

export default function RenovationsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading renovations…" variant="list" />}>
        <RenovationsContent />
      </Suspense>
    </div>
  );
}

async function RenovationsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROJECTS_VIEW)) {
    return <NoAccess what="renovations" />;
  }

  // NOTE: RenovationProject has no `deletedAt` column (unlike Project) —
  // renovations are lifecycle-tracked via `status` (PLANNED → IN_PROGRESS →
  // COMPLETED / CANCELLED), not soft-deleted. The API route follows the same
  // pattern, so we scope by companyId only.
  const renovations = await prisma.renovationProject.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      project: { select: { id: true, name: true } },
      builtUnit: { select: { id: true, unitNumber: true, unitType: true } },
      landParcel: { select: { id: true, number: true } },
      _count: { select: { costs: true } },
    },
  });

  const rows = renovations.map((r) => ({
    id: r.id,
    renovationNumber: r.renovationNumber,
    title: r.title,
    type: r.type,
    status: r.status,
    description: r.description,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    builtUnitNumber: r.builtUnit?.unitNumber ?? null,
    builtUnitType: r.builtUnit?.unitType ?? null,
    landParcelNumber: r.landParcel?.number ?? null,
    budget: toNum(r.budget),
    actualCost: toNum(r.actualCost),
    originalValuation: toNum(r.originalValuation),
    newValuation: r.newValuation ? toNum(r.newValuation) : null,
    startDate: r.startDate?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    costCount: r._count.costs,
  }));

  const plannedCount = rows.filter((r) => r.status === "PLANNED").length;
  const inProgressCount = rows.filter((r) => r.status === "IN_PROGRESS").length;
  const completedCount = rows.filter((r) => r.status === "COMPLETED").length;

  return (
    <>
      <PageHeader
        title="Renovations"
        description="Value-add and renovation projects on existing built units and land parcels — budget, actual cost, and valuation uplift tracked per renovation."
        stats={[
          { label: "Total", value: rows.length, hint: "All renovations in the company, including completed and cancelled." },
          { label: "Planned", value: plannedCount, hint: "Renovations in PLANNED status — not yet started." },
          { label: "In progress", value: inProgressCount, hint: "Renovations currently underway." },
          { label: "Completed", value: completedCount, hint: "Renovations marked as COMPLETED." },
        ]}
        action={<RefreshButton />}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Hammer className="h-7 w-7" />}
          title="No renovations yet"
          description="Renovations track enhancement work on existing built units or land parcels — structural upgrades, additions, value-adds, and repairs. Costs are capitalised into the asset's cost basis on completion."
          hint="Create one from a project or built unit detail page."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {/* Header row */}
          <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1fr_1fr_1fr] gap-3 border-b border-border bg-subtle px-4 py-2 text-label font-medium text-muted-foreground md:grid">
            <div>Renovation</div>
            <div>Project</div>
            <div>Type</div>
            <div>Status</div>
            <div className="text-right">Budget</div>
            <div>Start date</div>
            <div>End date</div>
          </div>
          <div className="divide-y divide-border/60">
            {rows.map((r) => (
              <details key={r.id} className="group">
                <summary className="grid cursor-pointer grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1fr_1fr_1fr] items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle md:grid-cols-[1.5fr_1fr_0.8fr_0.8fr_1fr_1fr_1fr]">
                  {/* Renovation (number + title) */}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{r.title}</p>
                    <p className="truncate text-caption text-muted-foreground">{r.renovationNumber}</p>
                  </div>
                  {/* Project */}
                  <div className="min-w-0">
                    {r.projectName ? (
                      <Link
                        href={`/projects/${r.projectId}`}
                        className="truncate text-[13px] text-foreground transition-colors hover:text-brand-strong hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.projectName}
                      </Link>
                    ) : (
                      <span className="text-caption text-faint">—</span>
                    )}
                  </div>
                  {/* Type */}
                  <div className="hidden text-caption text-muted-foreground md:block">
                    {TYPE_LABELS[r.type] ?? r.type}
                  </div>
                  {/* Status */}
                  <div>
                    <StatusBadge status={r.status} size="sm" />
                  </div>
                  {/* Budget */}
                  <div className="text-right text-[13px] font-medium tnum text-foreground">
                    {formatCurrency(r.budget)}
                  </div>
                  {/* Start date */}
                  <div className="text-caption tnum text-muted-foreground">
                    {formatDate(r.startDate)}
                  </div>
                  {/* End date */}
                  <div className="text-caption tnum text-muted-foreground">
                    {formatDate(r.completedAt)}
                  </div>
                </summary>

                {/* Expandable details — shown when the [id] detail page
                    doesn't exist yet. Native <details> keeps this a pure
                    server component (no client JS / state needed). */}
                <div className="border-t border-border/60 bg-subtle/50 px-4 py-3">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-caption sm:grid-cols-3 lg:grid-cols-4">
                    <div>
                      <dt className="text-faint">Asset</dt>
                      <dd className="text-muted-foreground">
                        {r.builtUnitNumber
                          ? `Unit ${r.builtUnitNumber}${r.builtUnitType ? ` · ${r.builtUnitType}` : ""}`
                          : r.landParcelNumber
                            ? `Parcel ${r.landParcelNumber}`
                            : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-faint">Actual cost</dt>
                      <dd className="tnum text-muted-foreground">{formatCurrency(r.actualCost)}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Original valuation</dt>
                      <dd className="tnum text-muted-foreground">{formatCurrency(r.originalValuation)}</dd>
                    </div>
                    <div>
                      <dt className="text-faint">New valuation</dt>
                      <dd className="tnum text-muted-foreground">
                        {r.newValuation != null ? formatCurrency(r.newValuation) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-faint">Cost entries</dt>
                      <dd className="tnum text-muted-foreground">{r.costCount}</dd>
                    </div>
                    {r.description && (
                      <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                        <dt className="text-faint">Description</dt>
                        <dd className="leading-relaxed text-muted-foreground">{r.description}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
