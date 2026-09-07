import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { Package } from "lucide-react";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobilePageHeader,
  MobileStatusBadge,
  MobileRow,
  MobileEmptyState,
  Card,
} from "@/components/mobile/v2/primitives";
import { formatCurrency } from "@/lib/utils";

/**
 * /m/material-issues — mobile list of stock issues (material consumption
 * to projects/departments). Each issue shows the issue number, target
 * (project or department), date, status, and total value.
 */
export default function MobileMaterialIssuesPage() {
  return (
    <MobileListPage perm={PERM.INVENTORY_VIEW} what="material issues" permission="inventory.view">
      {async ({ company }) => {
        const BATCH_SIZE = 60;
        const issues = await prisma.materialIssue.findMany({
          where: {
            fromLocation: { companyId: company.id, deletedAt: null },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE + 1,
          include: {
            project: { select: { name: true } },
            department: { select: { name: true } },
            subcontractor: { select: { name: true } },
            lines: { select: { qty: true, unitCost: true } },
          },
        });

        const hasMore = issues.length > BATCH_SIZE;
        const batch = hasMore ? issues.slice(0, BATCH_SIZE) : issues;

        const totalValue = batch
          .filter((i) => i.status === "COMPLETED")
          .reduce(
            (sum, i) =>
              sum +
              i.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
            0,
          );

        const pendingCount = batch.filter((i) => i.status === "PENDING").length;

        return (
          <div>
            <MobilePageHeader
              title="Material Issues"
              subtitle="Stock issued to projects & departments"
            />

            {batch.length > 0 && (
              <div className="px-4 mb-3">
                <Card className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                      Total issued value
                    </p>
                    <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                      {formatCurrency(totalValue)}
                    </p>
                  </div>
                  {pendingCount > 0 && (
                    <div className="text-right">
                      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                        Pending
                      </p>
                      <p className="text-m-section font-bold" style={{ color: "var(--color-signal-dark)" }}>
                        {pendingCount}
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {batch.length === 0 ? (
              <MobileEmptyState
                icon={Package}
                title="No material issues yet"
                description="Stock issued to projects or departments will appear here."
              />
            ) : (
              <div className="flex flex-col gap-2 px-4">
                {batch.map((issue) => {
                  const target =
                    issue.project?.name ??
                    issue.department?.name ??
                    issue.subcontractor?.name ??
                    "—";
                  const lineValue = issue.lines.reduce(
                    (s, l) => s + toNum(l.qty) * toNum(l.unitCost),
                    0,
                  );
                  const meta = `${issue.issueDate.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })} · ${issue.lines.length} item${issue.lines.length === 1 ? "" : "s"} · ${formatCurrency(lineValue)}`;
                  return (
                    <MobileRow
                      key={issue.id}
                      href={`/m/material-issues/${issue.id}`}
                      icon={Package}
                      title={issue.issueNumber ?? "Issue"}
                      subtitle={target}
                      meta={meta}
                      badge={
                        <MobileStatusBadge status={issue.status} label={issue.status} />
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
