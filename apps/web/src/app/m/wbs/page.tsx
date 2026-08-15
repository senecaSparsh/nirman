import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getWbsTree } from "@nirman/services";
import { ListTree, ChevronRight, Calendar, ChevronLeft } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate, formatNumber } from "@/lib/utils";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileWbsProjectSelector } from "./MobileWbsProjectSelector";

/**
 * /m/wbs — mobile Work Breakdown Structure tree.
 *
 * Shows the WBS tree for a selected project. A project selector
 * at the top switches via `?project=ID` search param.
 */
export default function MobileWbsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileWbsContent searchParams={searchParams} />
    </Suspense>
  );
}

type WbsTreeNode = Awaited<ReturnType<typeof getWbsTree>>[number] & {
  children: WbsTreeNode[];
};

async function MobileWbsContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canView = hasPermission(role, PERM.ASSETS_VIEW);
  const { project: projectId } = await searchParams;

  // Fetch projects for the selector (PLANNED or ACTIVE only)
  const projects = await prisma.project.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      status: { in: ["PLANNED", "ACTIVE"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!canView) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <Link
            href="/m/home"
            className="flex items-center gap-1 text-[0.875rem] font-semibold"
            style={{ color: "var(--color-ink-700)" }}
          >
            <ChevronLeft className="size-5" />
          </Link>
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>
          Work Breakdown Structure
        </p>
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to view WBS.
        </p>
      </div>
    );
  }

  const selectedProject = projectId
    ? await prisma.project.findFirst({
        where: {
          id: projectId,
          companyId: company.id,
          deletedAt: null,
        },
        select: { id: true, name: true },
      })
    : null;

  // Fetch the WBS tree for the selected project
  const tree: WbsTreeNode[] = selectedProject
    ? ((await getWbsTree(selectedProject.id)) as WbsTreeNode[])
    : [];

  // Flatten tree to compute summary stats
  const allNodes = flattenTree(tree);
  const totalNodes = allNodes.length;
  const completedNodes = allNodes.filter((n) => toNum(n.progressPct) >= 100).length;
  const inProgressNodes = allNodes.filter(
    (n) => toNum(n.progressPct) > 0 && toNum(n.progressPct) < 100,
  ).length;

  return (
    <div>
      {/* ── Back ── */}
      <div className="mb-2">
        <Link
          href="/m/home"
          className="flex items-center gap-1 text-[0.875rem] font-semibold"
          style={{ color: "var(--color-ink-700)" }}
        >
          <ChevronLeft className="size-5" />
        </Link>
      </div>

      {/* ── Project selector ── */}
      <Suspense fallback={null}>
        <MobileWbsProjectSelector
          projects={projects}
          selectedId={selectedProject?.id}
        />
      </Suspense>

      {/* ── No project selected ── */}
      {!selectedProject ? (
        <MobileEmptyState
          icon={ListTree}
          title="Select a project"
          hint="Choose a project above to view its Work Breakdown Structure tree."
        />
      ) : tree.length === 0 ? (
        <MobileEmptyState
          icon={ListTree}
          title="No WBS nodes yet"
          hint={`The WBS tree for ${selectedProject.name} is empty. Nodes show here once they are created.`}
        />
      ) : (
        <>
          {/* ── Summary stats ── */}
          <MobileSectionTitle>Summary</MobileSectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <MobileStatCard
              label="Total"
              value={formatNumber(totalNodes, 0)}
              tone="neutral"
              icon={ListTree}
            />
            <MobileStatCard
              label="Completed"
              value={formatNumber(completedNodes, 0)}
              tone="go"
            />
            <MobileStatCard
              label="In Progress"
              value={formatNumber(inProgressNodes, 0)}
              tone="signal"
            />
          </div>

          {/* ── WBS tree ── */}
          <MobileSectionTitle>WBS Tree</MobileSectionTitle>
          <div className="space-y-1.5">
            {tree.map((node) => (
              <WbsNodeRow key={node.id} node={node} depth={0} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── WBS node row (recursive) ─── */

function WbsNodeRow({ node, depth }: { node: WbsTreeNode; depth: number }) {
  const progress = toNum(node.progressPct);
  const hasChildren = node.children.length > 0;

  const progressColor =
    progress >= 100
      ? "var(--color-go)"
      : progress > 0
        ? "var(--color-signal)"
        : "var(--color-concrete)";

  return (
    <div>
      <div
        className="rounded-[0.5rem] border p-2.5"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
          marginLeft: `${depth * 0.75}rem`,
        }}
      >
        {/* Row 1: code + name + chevron */}
        <div className="flex items-center gap-1.5 mb-1">
          {hasChildren ? (
            <ChevronRight
              className="size-3 shrink-0"
              style={{ color: "var(--color-ink-500)" }}
            />
          ) : (
            <span
              className="size-1.5 rounded-full shrink-0"
              style={{ backgroundColor: progressColor }}
            />
          )}
          <span
            className="text-[0.5625rem] font-semibold tabular-nums shrink-0"
            style={{ color: "var(--color-ink-500)" }}
          >
            {node.code}
          </span>
          <p
            className="text-[0.75rem] font-semibold truncate flex-1"
            style={{ color: "var(--color-ink-950)" }}
          >
            {node.name}
          </p>
          <span
            className="text-[0.6875rem] font-bold tabular-nums shrink-0"
            style={{ color: progressColor }}
          >
            {formatNumber(progress, 0)}%
          </span>
        </div>

        {/* Row 2: dates */}
        {(node.plannedStart || node.plannedEnd) ? (
          <div
            className="flex items-center gap-1 mb-1.5"
            style={{ marginLeft: "1.125rem" }}
          >
            <Calendar
              className="size-2.5 shrink-0"
              style={{ color: "var(--color-ink-500)" }}
            />
            <span
              className="text-[0.5625rem] tabular-nums"
              style={{ color: "var(--color-ink-500)" }}
            >
              {formatDate(node.plannedStart)} — {formatDate(node.plannedEnd)}
            </span>
          </div>
        ) : null}

        {/* Row 3: progress bar */}
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{
            backgroundColor: "var(--color-concrete)",
            marginLeft: "1.125rem",
          }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(progress, 100)}%`,
              backgroundColor: progressColor,
            }}
          />
        </div>
      </div>

      {/* Children */}
      {hasChildren ? (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <WbsNodeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Helpers ─── */

function flattenTree(nodes: WbsTreeNode[]): WbsTreeNode[] {
  const result: WbsTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}
