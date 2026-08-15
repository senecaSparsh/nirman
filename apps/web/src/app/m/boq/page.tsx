import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getBoqTree } from "@nirman/services";
import { FileText, ListTree, Layers, Package } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
  Badge,
} from "@/components/mobile/v2/primitives";
import { MobileBoqProjectSelector, type BoqProjectOption } from "./MobileBoqProjectSelector";
import { MobileBoqFab } from "./MobileNewBoqItemDialog";

/** Mobile BOQ (Bill of Quantities) page — shows the BOQ tree for a selected project. */
export default function MobileBoqPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <MobileBoqContent searchParams={searchParams} />
    </Suspense>
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

// ── Page content ────────────────────────────────────────────────────────────

async function MobileBoqContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.ASSETS_VIEW)) notFound();
  const company = await getCompany();

  const params = await searchParams;
  const projectId = params.project;

  // Fetch active/planned projects for the selector.
  const projects: BoqProjectOption[] = await prisma.project.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      status: { in: ["PLANNED", "ACTIVE"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : undefined;

  // No project selected — show selector + empty state.
  if (!projectId || !selectedProject) {
    return (
      <div>
        <MobileBoqProjectSelector projects={projects} selectedId={projectId} />
        <MobileEmptyState
          icon={ListTree}
          title="Select a project"
          hint="Choose a project above to view its Bill of Quantities"
        />
      </div>
    );
  }

  // Fetch the BOQ tree for the selected project.
  const [boqResult, materials, canManage] = await Promise.all([
    getBoqTree(projectId),
    hasPermission(role, PERM.ASSETS_MANAGE)
      ? prisma.material.findMany({
          where: { deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, unit: true },
        })
      : [],
    Promise.resolve(hasPermission(role, PERM.ASSETS_MANAGE)),
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
      <MobileBoqProjectSelector projects={projects} selectedId={projectId} />

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard
          label="Line Items"
          value={formatNumber(lineItemCount, 0)}
          hint="billable lines"
          icon={Package}
        />
        <MobileStatCard
          label="Est. Amount"
          value={formatCurrency(totalAmount)}
          hint="total budget"
          icon={FileText}
          tone="signal"
        />
      </div>

      {/* ── BOQ tree ── */}
      <MobileSectionTitle right={<Badge tone="steel">{rows.length} nodes</Badge>}>
        BOQ Tree
      </MobileSectionTitle>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={ListTree}
          title="No BOQ items"
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
      {canManage && (
        <MobileBoqFab
          projectId={projectId}
          parentItems={parentItems}
          materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit }))}
        />
      )}
    </div>
  );
}

// ── Single row card ─────────────────────────────────────────────────────────

function BoqRowCard({ row }: { row: BoqRow }) {
  const isLineItem = row.type === "LINE_ITEM";
  const indent = row.level * 12; // 12px per nesting level

  const typeTone: "neutral" | "signal" | "go" =
    row.type === "SECTION" ? "neutral" : row.type === "SUBSECTION" ? "signal" : "go";

  return (
    <div
      className="rounded-[0.5rem] border p-2.5"
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
              className="text-[0.5625rem] font-bold tabular-nums shrink-0"
              style={{ color: "var(--color-ink-500)" }}
            >
              {row.serialNo}
            </span>
            <Badge tone={typeTone}>{row.type.replace("_", " ")}</Badge>
          </div>
          <p
            className="text-[0.75rem] font-semibold leading-tight"
            style={{ color: "var(--color-ink-950)" }}
          >
            {row.description}
          </p>

          {isLineItem && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
              {row.unit && (
                <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  Unit: <span className="font-semibold" style={{ color: "var(--color-ink-950)" }}>{row.unit}</span>
                </span>
              )}
              {row.estimatedQty != null && (
                <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  Qty: <span className="font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatNumber(row.estimatedQty, 3)}</span>
                </span>
              )}
              {row.rate != null && (
                <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                  Rate: <span className="font-semibold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(row.rate)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {isLineItem && row.estimatedAmount != null && (
          <div className="shrink-0 text-right">
            <p
              className="text-[0.6875rem] font-bold tabular-nums leading-tight"
              style={{ color: "var(--color-ink-950)" }}
            >
              {formatCurrency(row.estimatedAmount)}
            </p>
            <p className="text-[0.4375rem] mt-0.5" style={{ color: "var(--color-ink-300)" }}>
              amount
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
