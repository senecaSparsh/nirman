import { prisma } from "@nirman/db";
import { toNum, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { FileText } from "lucide-react";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileRateContractsList } from "./MobileRateContractsList";
import { MobileRateContractsFab } from "./MobileRateContractsFab";
import { MobileRateContractsEmptyState } from "./MobileRateContractsEmptyState";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/rate-contracts — mobile rate contract management.
 * Pre-negotiated framework agreements with suppliers at fixed rates.
 */
export default function MobileRateContractsPage() {
  return (
    <MobileListPage managePerm={PERM.PROCUREMENT_MANAGE}>
      {async ({ company, canManage }) => {
        const actions = await getActionPermissions();
        const canCreate = actions?.canCreateRateContract ?? canManage;
        const [contracts, suppliers, materials, categories] = await Promise.all([
          prisma.rateContract.findMany({
            where: { companyId: company.id },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              supplier: { select: { id: true, name: true } },
              material: { select: { id: true, name: true, unit: true } },
            },
          }),
          canManage
            ? prisma.supplier.findMany({
                where: { companyId: company.id, deletedAt: null },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
              })
            : [],
          canManage
            ? prisma.material.findMany({
                where: { deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
                orderBy: { name: "asc" },
                select: { id: true, name: true, unit: true },
              })
            : [],
          canManage
            ? prisma.materialCategory.findMany({
                orderBy: { name: "asc" },
                select: { id: true, name: true, unit: true, hsnCode: true, gstRate: true },
              }).then((rows) => rows.map((c) => ({ ...c, gstRate: c.gstRate ? c.gstRate.toNumber() : null })))
            : [],
        ]);

        const now = new Date();
        const active = contracts.filter(
          (c) => new Date(c.validFrom) <= now && new Date(c.validTo) >= now,
        ).length;
        const expired = contracts.filter((c) => new Date(c.validTo) < now).length;

        const serialized = contracts.map((c) => ({
          id: c.id,
          supplierName: c.supplier.name,
          materialName: c.material.name,
          materialUnit: c.material.unit,
          agreedRate: toNum(c.agreedRate),
          validFrom: c.validFrom.toISOString(),
          validTo: c.validTo.toISOString(),
          minQty: c.minQty ? toNum(c.minQty) : null,
          maxQty: c.maxQty ? toNum(c.maxQty) : null,
          notes: c.notes,
          isExpired: new Date(c.validTo) < now,
          isActive: new Date(c.validFrom) <= now && new Date(c.validTo) >= now,
        }));

        const csvColumns: MobileColumnSpec[] = [
          { key: "supplierName", label: "Supplier" },
          { key: "materialName", label: "Material" },
          { key: "agreedRate", label: "Rate", format: "currency" },
          { key: "validFrom", label: "Valid From", format: "date" },
          { key: "validTo", label: "Valid To", format: "date" },
          { key: "isActive", label: "Status" },
        ];

        return (
          <div>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              <MobileStatCard label="Active" value={String(active)} icon={FileText} tone="go" />
              <MobileStatCard label="Total" value={String(contracts.length)} icon={FileText} />
              <MobileStatCard label="Expired" value={String(expired)} icon={FileText} tone={expired > 0 ? "stop" : "neutral"} />
            </div>

            <MobileRateContractsList
              items={serialized}
              exportTitle="Rate Contracts"
              exportRows={serialized as unknown as Record<string, unknown>[]}
              exportColumns={csvColumns}
              exportSummary={`${contracts.length} contracts · ${active} active`}
            />

            {contracts.length === 0 && (
              <MobileRateContractsEmptyState
                hasSuppliers={suppliers.length > 0}
                hasMaterials={materials.length > 0}
                canManage={canCreate}
                categories={categories}
              />
            )}

            {canCreate && suppliers.length > 0 && materials.length > 0 && (
              <MobileRateContractsFab
                suppliers={suppliers}
                materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit }))}
              />
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
