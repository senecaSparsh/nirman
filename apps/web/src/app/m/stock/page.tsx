import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { prisma } from "@nirman/db";
import { toNum, getCompanyGroupIds, scopeWhere } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileHubPage } from "@/components/mobile/v2/hub-page";
import { MobileLocationDetail } from "./MobileLocationDetail";
import { MobileStockHubTabs } from "./MobileStockHubTabs";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

export default function MobileStockPage({
  searchParams,
}: {
  searchParams: Promise<{ materialId?: string; locationId?: string; tab?: string }>;
}) {
  return (
    <MobileHubPage skeleton={<MobileSkeletonList rows={8} />} perm={PERM.INVENTORY_VIEW} what="stock" permission="inventory.view">
      {async ({ company, role }) => {
        const canManage = hasPermission(role, PERM.INVENTORY_MANAGE);
        const canTransfer = hasPermission(role, PERM.STOCK_TRANSFER);
        const { materialId, locationId } = await searchParams;

        // ── Location detail view: when locationId is set (and no materialId) ──
        // Different mental model: "what's at this location?" not "company ledger filtered"
        // SECURITY: All queries must be scoped to the current company to prevent
        // cross-tenant data exposure when a user guesses another company's locationId.
        if (locationId && !materialId) {
          // Company group includes parent + siblings + children — needed because
          // inter-company transfers cross company boundaries but stay in the group.
          const companyGroupIds = await getCompanyGroupIds(company);
          const [location, locationItems, movements, inTransitIncoming, inTransitOutgoing, categories] = await Promise.all([
            prisma.stockLocation.findUnique({
              where: { id: locationId, companyId: company.id, deletedAt: null },
              select: { id: true, name: true, type: true },
            }),
            prisma.stockLocationItem.findMany({
              where: { locationId, location: { companyId: company.id }, qty: { not: 0 } },
              include: { material: { select: { id: true, name: true, code: true, unit: true } } },
              orderBy: { material: { name: "asc" } },
            }),
            // Movements are already company-scoped: the location check above
            // (line 30) ensures locationId belongs to company.id, so any
            // movement from/to that location is inherently within the company.
            prisma.stockMovement.findMany({
              where: {...await scopeWhere("StockMovement"), 
                OR: [{ fromLocationId: locationId }, { toLocationId: locationId }],
              },
              orderBy: { timestamp: "desc" },
              take: 50,
              include: {
                material: { select: { id: true, name: true, unit: true } },
                fromLocation: { select: { id: true, name: true } },
                toLocation: { select: { id: true, name: true } },
              },
            }),
            // In-transit transfers incoming to this location (cross-company within group)
            prisma.stockTransfer.findMany({
              where: { toLocationId: locationId, status: "IN_TRANSIT", fromLocation: { companyId: { in: companyGroupIds } } },
              include: {
                fromLocation: { select: { name: true } },
                lines: { include: { material: { select: { name: true, unit: true } } } },
              },
              orderBy: { dispatchedAt: "desc" },
            }),
            // In-transit transfers outgoing from this location (cross-company within group)
            prisma.stockTransfer.findMany({
              where: { fromLocationId: locationId, status: "IN_TRANSIT", toLocation: { companyId: { in: companyGroupIds } } },
              include: {
                toLocation: { select: { name: true } },
                lines: { include: { material: { select: { name: true, unit: true } } } },
              },
              orderBy: { dispatchedAt: "desc" },
            }),
            // Material categories for inline material creation (global table, not company-scoped)
            prisma.materialCategory.findMany({
              where: { deletedAt: null },
              select: { id: true, name: true, unit: true },
              orderBy: { name: "asc" },
            }),
          ]);

          if (!location) {
            return (
              <MobileEmptyState title="Location not found" />
            );
          }

          const totalValue = locationItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);

          return (
            <MobileLocationDetail
              locationId={location.id}
              locationName={location.name}
              locationType={location.type as string}
              canManage={canManage}
              categories={categories}
              items={locationItems.map((i) => ({
                materialId: i.material.id,
                materialName: i.material.name,
                materialCode: i.material.code,
                unit: i.material.unit,
                qty: toNum(i.qty),
                mac: toNum(i.movingAvgCost),
              }))}
              movements={movements.map((m) => ({
                id: m.id,
                movementType: m.movementType,
                materialId: m.material.id,
                materialName: m.material.name,
                materialUnit: m.material.unit,
                qty: toNum(m.qty),
                fromLocationName: m.fromLocation?.name ?? null,
                toLocationName: m.toLocation?.name ?? null,
                timestamp: m.timestamp.toISOString(),
              }))}
              totalValue={totalValue}
              inTransitIncoming={inTransitIncoming.map((t) => ({
                id: t.id,
                fromLocationName: t.fromLocation.name,
                dispatchedAt: t.dispatchedAt?.toISOString() ?? null,
                vehicleNumber: t.vehicleNumber,
                lines: t.lines.map((l) => ({
                  materialName: l.material.name,
                  qty: toNum(l.qty),
                  unit: l.material.unit,
                })),
              }))}
              inTransitOutgoing={inTransitOutgoing.map((t) => ({
                id: t.id,
                toLocationName: t.toLocation.name,
                dispatchedAt: t.dispatchedAt?.toISOString() ?? null,
                vehicleNumber: t.vehicleNumber,
                lines: t.lines.map((l) => ({
                  materialName: l.material.name,
                  qty: toNum(l.qty),
                  unit: l.material.unit,
                })),
              }))}
            />
          );
        }

        // ── Fetch data for all hub tabs in parallel ──
        const BATCH_SIZE = 60;
        const [
          locations,
          movements,
          filterMaterial,
          materialStockItems,
          ledgerCategories,
          transfers,
          counts,
          scraps,
        ] = await Promise.all([
          // ── Ledger: locations ──
          prisma.stockLocation.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: {
              id: true,
              name: true,
              type: true,
              stockItems: { select: { qty: true, movingAvgCost: true } },
            },
            orderBy: { name: "asc" },
          }),
          // ── Ledger: movements ──
          prisma.stockMovement.findMany({
            where: {...await scopeWhere("StockMovement"), 
              ...(materialId ? { materialId } : {}),
              OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }],
            },
            orderBy: { timestamp: "desc" },
            take: 80,
            include: {
              material: { select: { id: true, name: true, unit: true } },
              fromLocation: { select: { id: true, name: true } },
              toLocation: { select: { id: true, name: true } },
            },
          }),
          // ── Ledger: filter material ──
          materialId
            ? prisma.material.findUnique({
                where: { id: materialId },
                select: { id: true, name: true, unit: true, code: true },
              })
            : null,
          // ── Ledger: material stock items ──
          materialId
            ? prisma.stockLocationItem.findMany({
                where: { materialId, qty: { not: 0 } },
                include: { location: { select: { id: true, name: true } } },
                orderBy: { location: { name: "asc" } },
              })
            : [],
          // ── Ledger: categories ──
          prisma.materialCategory.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, unit: true },
            orderBy: { name: "asc" },
          }),
          // ── Transfers tab ──
          prisma.stockTransfer.findMany({
            where: {
              OR: [
                { fromLocation: { companyId: company.id, deletedAt: null } },
                { toLocation: { companyId: company.id, deletedAt: null } },
              ],
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: BATCH_SIZE + 1,
            include: {
              fromLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { name: true } } } },
              toLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { name: true } } } },
              lines: { include: { material: { select: { name: true, unit: true } } } },
            },
          }),
          // ── Counts tab ──
          prisma.stockCount.findMany({
            where: { location: { companyId: company.id, deletedAt: null } },
            orderBy: { createdAt: "desc" },
            take: 80,
            include: {
              location: { select: { id: true, name: true, type: true } },
              lines: { select: { variance: true, materialId: true } },
            },
          }),
          // ── Scrap tab ──
          prisma.scrapGeneration.findMany({
            where: { companyId: company.id },
            orderBy: { createdAt: "desc" },
            take: 80,
            select: {
              id: true,
              scrapNumber: true,
              generationDate: true,
              notes: true,
              toLocation: { select: { name: true } },
              project: { select: { name: true } },
              dprAutoScrap: { select: { id: true } },
              lines: {
                select: {
                  qty: true,
                  unitCost: true,
                  material: { select: { name: true, unit: true } },
                },
              },
            },
          }),
        ]);

        // ── Ledger serialization ──
        const totalInventoryValue = locations.reduce(
          (s, l) => s + l.stockItems.reduce((ls, i) => ls + toNum(i.qty) * toNum(i.movingAvgCost), 0),
          0,
        );

        const serializedLocations = locations.map((l) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          itemCount: l.stockItems.length,
          totalQty: l.stockItems.reduce((s, i) => s + toNum(i.qty), 0),
          totalValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
        }));

        const serializedMovements = movements.map((m) => ({
          id: m.id,
          movementType: m.movementType,
          materialId: m.material.id,
          materialName: m.material.name,
          materialUnit: m.material.unit,
          qty: toNum(m.qty),
          fromLocationId: m.fromLocation?.id ?? null,
          fromLocationName: m.fromLocation?.name ?? null,
          toLocationId: m.toLocation?.id ?? null,
          toLocationName: m.toLocation?.name ?? null,
          timestamp: m.timestamp.toISOString(),
        }));

        const serializedMaterialStock = materialStockItems.map((i) => ({
          locationId: i.location.id,
          locationName: i.location.name,
          qty: toNum(i.qty),
          unit: filterMaterial?.unit ?? "",
        }));

        const ledgerCsvColumns: MobileColumnSpec[] = [
          { key: "materialName", label: "Material" },
          { key: "materialUnit", label: "Unit" },
          { key: "qty", label: "Quantity" },
          { key: "fromLocationName", label: "From Location" },
          { key: "toLocationName", label: "To Location" },
          { key: "movementType", label: "Type" },
          { key: "timestamp", label: "Date", format: "date" },
        ];

        // ── Transfers serialization ──
        const hasMore = transfers.length > BATCH_SIZE;
        const batch = hasMore ? transfers.slice(0, BATCH_SIZE) : transfers;
        const inTransitCount = batch.filter((t) => t.status === "IN_TRANSIT").length;
        const lastItem = batch[batch.length - 1];
        const nextCursor = hasMore && lastItem
          ? `${lastItem.createdAt.toISOString()}|${lastItem.id}`
          : null;

        const transferItems = batch.map((t) => ({
          id: t.id,
          fromLocationName: t.fromLocation.name,
          fromLocationType: t.fromLocation.type,
          fromCompanyName: t.fromLocation.company?.name ?? null,
          fromCompanyId: t.fromLocation.companyId,
          toLocationName: t.toLocation.name,
          toLocationType: t.toLocation.type,
          toCompanyName: t.toLocation.company?.name ?? null,
          toCompanyId: t.toLocation.companyId,
          status: t.status,
          transferDate: t.transferDate.toISOString(),
          createdAt: t.createdAt.toISOString(),
          notes: t.notes,
          lineCount: t.lines.length,
          totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
          materials: t.lines.map((l) => l.material.name),
          materialsList: t.lines.map((l) => l.material.name).join("; "),
          isInterCompany: t.isInterCompany,
          transferPriceTotal: t.transferPriceTotal ? toNum(t.transferPriceTotal) : null,
        }));

        const transfersCsvColumns: MobileColumnSpec[] = [
          { key: "fromLocationName", label: "From Location" },
          { key: "toLocationName", label: "To Location" },
          { key: "status", label: "Status" },
          { key: "transferDate", label: "Date", format: "date" },
          { key: "totalQty", label: "Total Qty" },
          { key: "lineCount", label: "Lines" },
          { key: "materialsList", label: "Materials" },
        ];

        // ── Counts serialization ──
        const draft = counts.filter((c) => c.status === "DRAFT");
        const counted = counts.filter((c) => c.status === "COUNTED");
        const reconciled = counts.filter((c) => c.status === "RECONCILED");

        const countItems = counts.map((c) => {
          const totalVariance = c.lines.reduce((s, l) => s + toNum(l.variance), 0);
          const itemsWithVariance = c.lines.filter((l) => {
            const v = toNum(l.variance);
            return v > 0.001 || v < -0.001;
          }).length;
          return {
            id: c.id,
            status: c.status,
            countDate: c.countDate.toISOString(),
            createdAt: c.createdAt.toISOString(),
            locationId: c.location.id,
            locationName: c.location.name,
            locationType: c.location.type,
            lineCount: c.lines.length,
            totalVariance,
            itemsWithVariance,
          };
        });

        // ── Scrap serialization ──
        const scrapTotalValue = scraps.reduce(
          (s, sc) =>
            s + sc.lines.reduce((ls, l) => ls + toNum(l.qty) * toNum(l.unitCost), 0),
          0,
        );

        const scrapItems = scraps.map((sc) => ({
          id: sc.id,
          scrapNumber: sc.scrapNumber,
          generationDate: sc.generationDate.toISOString(),
          notes: sc.notes,
          toLocationName: sc.toLocation.name,
          projectName: sc.project?.name ?? null,
          isAuto: !!sc.dprAutoScrap,
          lineCount: sc.lines.length,
          totalValue: sc.lines.reduce(
            (s, l) => s + toNum(l.qty) * toNum(l.unitCost),
            0,
          ),
          materials: sc.lines.map((l) => l.material.name).slice(0, 2),
        }));

        const scrapCsvColumns: MobileColumnSpec[] = [
          { key: "scrapNumber", label: "Slip No" },
          { key: "toLocationName", label: "Location" },
          { key: "projectName", label: "Project" },
          { key: "generationDate", label: "Date", format: "date" },
          { key: "lineCount", label: "Items" },
          { key: "totalValue", label: "Value", format: "currency" },
        ];

        return (
          <MobileStockHubTabs
            ledgerLocations={serializedLocations}
            ledgerMovements={serializedMovements}
            ledgerTotalInventoryValue={totalInventoryValue}
            ledgerFilterMaterialName={filterMaterial?.name ?? null}
            ledgerMaterialStockItems={serializedMaterialStock}
            ledgerExportColumns={ledgerCsvColumns}
            ledgerCanManage={canManage}
            ledgerCategories={ledgerCategories.map((c) => ({ id: c.id, name: c.name, unit: c.unit }))}
            transfersItems={transferItems}
            transfersCanCreate={canTransfer}
            transfersCanTransfer={canTransfer}
            transfersInTransitCount={inTransitCount}
            transfersCurrentCompanyId={company.id}
            transfersLoadMoreUrl="/api/mobile/list/transfers"
            transfersNextCursor={nextCursor}
            transfersExportColumns={transfersCsvColumns}
            countsItems={countItems}
            countsSummary={{
              total: counts.length,
              draft: draft.length,
              counted: counted.length,
              reconciled: reconciled.length,
            }}
            countsCanCreate={canManage}
            scrapItems={scrapItems}
            scrapTotalValue={scrapTotalValue}
            scrapCanCreate={canManage}
            scrapExportColumns={scrapCsvColumns}
          />
        );
      }}
    </MobileHubPage>
  );
}
