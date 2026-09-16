import { prisma } from "@nirman/db";
import { getProjectMaterialReconciliation } from "@nirman/services";
import { Package, AlertTriangle, Plus } from "lucide-react";
import { PERM } from "@/lib/roles";
import { formatNumber } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileSectionTitle,
  MobileCta} from "@/components/mobile/v2/primitives";
import { MobileProjectScopedPage } from "@/components/mobile/v2/project-scoped-page";
import { MobileMaterialReconProjectSelector } from "./MobileMaterialReconProjectSelector";
import { MobileReconList, type ReconItem } from "./MobileReconList";

/**
 * /m/material-reconciliation — mobile material reconciliation page.
 *
 * For a selected project, shows required (BOQ) vs issued vs consumed vs stock,
 * with variance and wastage flags. Tolerance-based colour coding:
 * green = within tolerance, red = over tolerance.
 */
export default function MobileMaterialReconciliationPage({
  searchParams}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <MobileProjectScopedPage searchParams={searchParams}>
      {async ({ company, projectId, perms }) => {
        const canView = perms.includes(PERM.PROJECT_CONTROL_VIEW);
        const canCreateProject = perms.includes(PERM.PROJECTS_MANAGE);

        const projects = await prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true }});

        if (!projectId) {
          return (
            <div>
              <MobileMaterialReconProjectSelector projects={projects} selectedId={null} canCreate={canCreateProject} />
              <MobileEmptyState
                icon={Package}
                title="Select a project"
                hint="Choose a project to view material reconciliation — required vs issued vs consumed vs stock"
              />
            </div>
          );
        }

        // Default tolerance = 5%
        const reconciliation = await getProjectMaterialReconciliation(projectId, 5);

        const totalRequired = reconciliation.totalRequired.toNumber();
        const totalIssued = reconciliation.totalIssued.toNumber();
        const totalConsumed = reconciliation.totalConsumed.toNumber();
        const overToleranceCount = reconciliation.overToleranceCount;

        // Serialize Decimal fields for rendering
        const items = reconciliation.items.map((i) => ({
          materialId: i.materialId,
          materialName: i.materialName,
          unit: i.unit,
          requiredQty: i.requiredQty.toNumber(),
          issuedQty: i.issuedQty.toNumber(),
          consumedQty: i.consumedQty.toNumber(),
          currentStock: i.currentStock.toNumber(),
          issueVariance: i.issueVariance.toNumber(),
          consumptionVariance: i.consumptionVariance.toNumber(),
          stockVariance: i.stockVariance.toNumber(),
          wastagePct: i.wastagePct.toNumber(),
          tolerancePct: i.tolerancePct.toNumber(),
          isOverTolerance: i.isOverTolerance,
          alertLevel: i.alertLevel}));

        return (
          <div>
            <MobileMaterialReconProjectSelector projects={projects} selectedId={projectId} canCreate={canCreateProject} />

            {/* ── Summary stats ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <MobileStatCard
                label="Required"
                value={formatNumber(totalRequired, 2)}
                icon={Package}
                tone="neutral"
              />
              <MobileStatCard
                label="Issued"
                value={formatNumber(totalIssued, 2)}
                icon={Package}
                tone="signal"
              />
              <MobileStatCard
                label="Consumed"
                value={formatNumber(totalConsumed, 2)}
                icon={Package}
                tone="go"
              />
            </div>

            {overToleranceCount > 0 && (
              <div
                className="flex items-center gap-2 rounded-[0.5rem] border p-2.5 mb-4"
                style={{
                  borderColor: "var(--color-stop)",
                  backgroundColor: "var(--color-stop-wash)"}}
              >
                <AlertTriangle className="size-4 shrink-0" style={{ color: "var(--color-stop)" }} />
                <p className="text-m-body font-semibold" style={{ color: "var(--color-stop)" }}>
                  {overToleranceCount} material{overToleranceCount !== 1 ? "s" : ""} over tolerance
                </p>
              </div>
            )}

            {/* ── Material reconciliation list ────────────────────────── */}
            <MobileSectionTitle>
              Materials
              <span
                className="text-m-caption font-semibold"
                style={{ color: "var(--color-ink-500)" }}
              >
                {items.length} item{items.length !== 1 ? "s" : ""}
              </span>
            </MobileSectionTitle>

            {items.length === 0 ? (
              <MobileEmptyState
                icon={Package}
                title="No reconciliation data"
                hint="This project has no Bill of Quantities line items to reconcile yet."
                action={
                  <MobileCta href={`/m/boq${projectId ? `?project=${projectId}` : ""}`} icon={Plus} variant="primary">
                    Go to Bill of Quantities
                  </MobileCta>
                }
              />
            ) : (
              <MobileReconList
                items={items as ReconItem[]}
                overToleranceCount={overToleranceCount}
              />
            )}

            {!canView && (
              <p
                className="text-m-caption text-center mt-4"
                style={{ color: "var(--color-ink-500)" }}
              >
                View-only access — contact an admin for manage permissions.
              </p>
            )}
          </div>
        );
      }}
    </MobileProjectScopedPage>
  );
}
