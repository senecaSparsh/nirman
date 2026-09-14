import { prisma } from "@nirman/db";
import { toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { Package, Plus } from "lucide-react";
import Link from "next/link";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobileEmptyState,
  Card,
} from "@/components/mobile/v2/primitives";
import { formatCurrency } from "@/lib/utils";
import { MobileMaterialIssuesList, type MaterialIssueListItem } from "./MobileMaterialIssuesList";

/**
 * /m/material-issues — mobile list of stock issues (material consumption
 * to projects/departments). Each issue shows the issue number, target
 * (project or department), date, status, and total value.
 */
export default function MobileMaterialIssuesPage() {
  return (
    <MobileListPage perm={PERM.INVENTORY_VIEW} managePerm={PERM.STOCK_ISSUE} what="material issues" permission="inventory.view">
      {async ({ company, canManage }) => {
        const BATCH_SIZE = 40;
        const issues = await prisma.materialIssue.findMany({
          where: {...await scopeWhere("MaterialIssue"), 
            fromLocation: { companyId: company.id, deletedAt: null },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: BATCH_SIZE + 1,
          include: {
            project: { select: { name: true } },
            department: { select: { name: true } },
            subcontractor: { select: { name: true } },
            issuedBy: { select: { name: true } },
            lines: { select: { qty: true, unitCost: true } },
          },
        });

        const hasMore = issues.length > BATCH_SIZE;
        const batch = hasMore ? issues.slice(0, BATCH_SIZE) : issues;
        const last = batch[batch.length - 1];
        const nextCursor = hasMore && last
          ? `${last.createdAt.toISOString()}|${last.id}`
          : null;

        const totalValue = batch
          .filter((i) => i.status === "COMPLETED")
          .reduce(
            (sum, i) =>
              sum +
              i.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
            0,
          );

        const pendingCount = batch.filter((i) => i.status === "PENDING").length;

        const serialized: MaterialIssueListItem[] = batch.map((i) => ({
          id: i.id,
          issueNumber: i.issueNumber ?? null,
          date: i.issueDate.toISOString(),
          status: i.status,
          projectName: i.project?.name ?? null,
          departmentName: i.department?.name ?? null,
          issuedByName: i.issuedBy?.name ?? null,
          lineCount: i.lines.length,
          totalValue: i.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
          createdAt: i.createdAt.toISOString(),
        }));

        return (
          <div>
            <p className="px-4 pt-3 pb-1 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Stock issued to projects &amp; departments
            </p>

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
                action={canManage ? (
                  <Link
                    href="/m/stock-out?mode=issue"
                    className="inline-flex items-center gap-1.5 rounded-[0.5rem] px-4 py-2.5 text-m-body font-bold press"
                    style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
                  >
                    <Plus className="size-4" />
                    Issue Materials
                  </Link>
                ) : undefined}
              />
            ) : (
              <MobileMaterialIssuesList
                initialItems={serialized}
                loadMoreUrl="/api/mobile/list/material-issues"
                initialCursor={nextCursor}
              />
            )}

            {canManage && batch.length > 0 ? (
              <Link
                href="/m/stock-out?mode=issue"
                className="fixed right-4 z-30 grid place-items-center size-12 rounded-full shadow-lg press"
                style={{
                  bottom: "calc(4.5rem + max(env(safe-area-inset-bottom), 0px))",
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
                aria-label="Issue materials"
              >
                <Plus className="size-5" />
              </Link>
            ) : null}
          </div>
        );
      }}
    </MobileListPage>
  );
}
