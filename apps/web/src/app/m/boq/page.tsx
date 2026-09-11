import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getBoqTree } from "@nirman/services";
import {FileText, ListTree, Package} from "lucide-react";
import { toNum, getActionPermissions } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrencyCompact, formatNumber } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  Badge,
} from "@/components/mobile/v2/primitives";
import { MobileProjectScopedPage } from "@/components/mobile/v2/project-scoped-page";
import { MobileBoqProjectSelector, type BoqProjectOption } from "./MobileBoqProjectSelector";
import { MobileBoqFab } from "./MobileNewBoqItemDialog";

/** Mobile BOQ (Bill of Quantities) page — shows the BOQ tree for a selected project. */
export default function MobileBoqPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <MobileProjectScopedPage searchParams={searchParams}>
      {async ({ company, role, projectId }) => {
        if (!hasPermission(role, PERM.BOQ_VIEW)) notFound();

        // Fetch active/planned projects for the selector.
        const [projects, canCreateProject] = await Promise.all([
          prisma.project.findMany({
            where: {
              companyId: company.id,
              deletedAt: null,
              status: { in: ["PLANNED", "ACTIVE"] },
            },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          }) as Promise<BoqProjectOption[]>,
          Promise.resolve(hasPermission(role, PERM.PROJECTS_MANAGE)),
        ]);

        const selectedProject = projectId
          ? projects.find((p) => p.id === projectId)
          : undefined;

        // No project selected — show selector + empty state.
        if (!projectId || !selectedProject) {
          return (
            <div>
              <MobileBoqProjectSelector projects={projects} selectedId={projectId ?? undefined} canCreate={canCreateProject} />
              <MobileEmptyState
                icon={ListTree}
                title="Select a project"
                hint="Choose a project above to view its Bill of Quantities"
              />
            </div>
          );
        }

        // Fetch the BOQ tree for the selected project.
        const actions = await getActionPermissions();
        const canCreateBoq = actions?.canCreateBoq ?? hasPermission(role, PERM.BOQ_MANAGE);
        const [boqResult, materials, canManage] = await Promise.all([
          getBoqTree(projectId),
          canCreateBoq
            ? prisma.material.findMany({
                where: { companyId: company.id, deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
                orderBy: { name: "asc" },
                select: { id: true, name: true, unit: true },
              })
            : [],
          Promise.resolve(hasPermission(role, PERM.BOQ_MANAGE)),
        ]);

        const { tree, totalEstimatedAmount } = boqResult;

        const rows: BoqRow[] = [];
        flattenTree(tree as unknown as BoqTreeNode[], 0, rows);

        const lineItemCount = rows.filter((r) => r.type === "LINE_ITEM").length;
        const totalAmount = toNum(totalEstimatedAmount);

        // Parent items for the create dialog (sections + subsections only)
        const parentItems = rows
          .filter((r) => r.type === "SECTION" || r.type === "SUBSECTION")
          .map((r) => ({ id: r.id, serialNo: r.serialNo, description: r.description, type: r.type }));

        return (
          <div>
            {/* ── Project selector ── */}
            <MobileBoqProjectSelector projects={projects} selectedId={projectId ?? undefined} canCreate={canCreateProject} />

            {/* ── Summary stats ── */}
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              <MobileStatCard
                label="Line Items"
                value={formatNumber(lineItemCount, 0)}
                hint="billable lines"
                icon={Package}
              />
              <MobileStatCard
                label="Est. Amount"
                value={formatCurrencyCompact(totalAmount)}
                hint="total budget"
                icon={FileText}
                tone="signal"
              />
            </div>

            {/* ── BOQ tree ── */}
            <MobileSectionTitle right={<Badge tone="steel">{rows.length} nodes</Badge>}>
              Bill of Quantities Tree
            </MobileSectionTitle>

            {rows.length === 0 ? (
              <MobileEmptyState
                icon={ListTree}
                title="No Bill of Quantities items"
                hint={canManage ? "Tap + to add the first section or line item" : "This project doesn't have a Bill of Quantities yet"}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                {rows.map((row) => (
                  <BoqRowCard key={row.id} row={row} />
                ))}
              </div>
            )}

            {/* ── FAB for adding BOQ items ── */}
            {canCreateBoq && (
              <MobileBoqFab
                projectId={projectId}
                parentItems={parentItems}
                materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit }))}
              />
            )}
          </div>
        );
      }}
    </MobileProjectScopedPage>
  );
}

// ── Flattened row type ──────────────────────────────────────────────────────

type BoqRow = {
  id: string;
  serialNo: string;
  description: string;
  type: "SECTION" | "SUBSECTION" | "LINE_ITEM";
  level: number;
  unit: string | null;
  estimatedQty: number | null;
  rate: number | null;
  estimatedAmount: number | null;
};

// ── Tree flattening ─────────────────────────────────────────────────────────

type BoqTreeNode = {
  id: string;
  serialNo: string;
  description: string;
  type: "SECTION" | "SUBSECTION" | "LINE_ITEM";
  unit: string | null;
  estimatedQty: { toNumber: () => number } | null;
  rate: { toNumber: () => number } | null;
  estimatedAmount: { toNumber: () => number } | null;
  children: BoqTreeNode[];
};

function flattenTree(
  nodes: BoqTreeNode[],
  level: number,
  out: BoqRow[],
): void {
  for (const node of nodes) {
    out.push({
      id: node.id,
      serialNo: node.serialNo,
      description: node.description,
      type: node.type,
      level,
      unit: node.unit,
      estimatedQty: node.estimatedQty != null ? toNum(node.estimatedQty) : null,
      rate: node.rate != null ? toNum(node.rate) : null,
      estimatedAmount: node.estimatedAmount != null ? toNum(node.estimatedAmount) : null,
    });
    if (node.children && node.children.length > 0) {
      flattenTree(node.children, level + 1, out);
    }
  }
}

// ── Single row card ─────────────────────────────────────────────────────────

function BoqRowCard({ row }: { row: BoqRow }) {
  const isLineItem = row.type === "LINE_ITEM";
  const indent = row.level * 12; // 12px per nesting level

  const typeTone: "neutral" | "signal" | "go" =
    row.type === "SECTION" ? "neutral" : row.type === "SUBSECTION" ? "signal" : "go";

  return (
    <Link
      href={`/m/boq/${row.id}`}
      className="rounded-[0.5rem] border p-2.5 text-m-body press block"
      style={{
        backgroundColor: "var(--color-paper)",
        borderColor: "var(--color-line)",
        marginLeft: indent,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="text-m-caption font-bold tabular-nums shrink-0"
              style={{ color: "var(--color-ink-500)" }}
            >
              {row.serialNo}
            </span>
            <Badge tone={typeTone}>{row.type.replace("_", " ")}</Badge>
          </div>
          <p
            className="text-m-section font-semibold leading-tight"
            style={{ color: "var(--color-ink-950)" }}
          >
            {row.description}
          </p>

          {isLineItem && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
              {row.unit && (
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Unit: <span className="font-semibold" style={{ color: "var(--color-ink-950)" }}>{row.unit}</span>
                </span>
              )}
              {row.estimatedQty != null && (
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Qty: <span className="font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatNumber(row.estimatedQty, 3)}</span>
                </span>
              )}
              {row.rate != null && (
                <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  Rate: <span className="font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrencyCompact(row.rate)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {isLineItem && row.estimatedAmount != null && (
          <div className="shrink-0 text-right">
            <p
              className="text-m-body font-bold tabular-nums leading-tight"
              style={{ color: "var(--color-ink-950)" }}
            >
              {formatCurrencyCompact(row.estimatedAmount)}
            </p>
            <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-300)" }}>
              amount
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
