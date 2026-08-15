import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { FileText, Plus } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileRateContractsList } from "./MobileRateContractsList";
import { MobileRateContractsFab } from "./MobileRateContractsFab";

/**
 * /m/rate-contracts — mobile rate contract management.
 * Pre-negotiated framework agreements with suppliers at fixed rates.
 */
export default function MobileRateContractsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileRateContractsContent />
    </Suspense>
  );
}

async function MobileRateContractsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  const [contracts, suppliers, materials] = await Promise.all([
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

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <MobileStatCard label="Active" value={String(active)} icon={FileText} tone="go" />
        <MobileStatCard label="Total" value={String(contracts.length)} icon={FileText} />
        <MobileStatCard label="Expired" value={String(expired)} icon={FileText} tone={expired > 0 ? "stop" : "neutral"} />
      </div>

      <MobileRateContractsList items={serialized} />

      {contracts.length === 0 && (
        <MobileEmptyState
          icon={FileText}
          title="No rate contracts"
          hint={
            canManage
              ? suppliers.length === 0
                ? "Add suppliers first, then create rate contracts for materials"
                : materials.length === 0
                  ? "Add materials first, then create rate contracts with suppliers"
                  : "Tap + to create a rate contract with a supplier"
              : "Rate contracts will appear here"
          }
          action={
            canManage ? (
              suppliers.length === 0 ? (
                <MobileCta href="/m/suppliers/new" icon={Plus} variant="primary">Add Supplier</MobileCta>
              ) : materials.length === 0 ? (
                <MobileCta href="/m/materials/new" icon={Plus} variant="primary">Add Material</MobileCta>
              ) : undefined
            ) : undefined
          }
        />
      )}

      {canManage && suppliers.length > 0 && materials.length > 0 && (
        <MobileRateContractsFab
          suppliers={suppliers}
          materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit }))}
        />
      )}
    </div>
  );
}
