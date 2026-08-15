import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Undo2, Plus } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { hasPermission, PERM } from "@/lib/roles";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileSupplierReturnsList } from "./MobileSupplierReturnsList";

/**
 * /m/supplier-returns — mobile purchase returns list. Procurement and
 * managers need to track returns sent back to suppliers and their
 * credit note status.
 */
export default function MobileSupplierReturnsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSupplierReturnsContent />
    </Suspense>
  );
}

async function MobileSupplierReturnsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  const returns = await prisma.supplierReturn.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      supplier: { select: { name: true } },
      lines: { select: { qty: true, unitCost: true } },
    },
  });

  const draft = returns.filter((r) => r.status === "DRAFT");
  const submitted = returns.filter((r) => r.status === "SUBMITTED");

  const totalValue = returns
    .filter((r) => r.status !== "CANCELLED")
    .reduce((s, r) => s + r.lines.reduce((ls, l) => ls + toNum(l.qty) * toNum(l.unitCost), 0), 0);

  // Serialize for client component
  const serialized = returns.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    status: r.status,
    returnDate: r.returnDate.toISOString(),
    creditNoteNo: r.creditNoteNo,
    supplierName: r.supplier.name,
    totalValue: r.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
  }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard
          label="Return Value"
          value={formatCurrency(totalValue)}
          icon={Undo2}
          tone="signal"
        />
        <MobileStatCard
          label="Pending"
          value={String(draft.length + submitted.length)}
          icon={Undo2}
          tone={draft.length + submitted.length > 0 ? "signal" : "neutral"}
        />
      </div>

      <MobileSupplierReturnsList items={serialized} />

      {returns.length === 0 && (
        <>
          <MobileSectionTitle>Recent</MobileSectionTitle>
          <MobileEmptyState
            icon={Undo2}
            title="No purchase returns"
            hint="Tap 'New Return' to send defective or excess stock back to a supplier"
          />
        </>
      )}

      {canCreate && (
        <div className="mb-4">
          <MobileCta href="/m/supplier-returns/new" icon={Plus} variant="secondary">
            New Return
          </MobileCta>
        </div>
      )}
    </div>
  );
}
