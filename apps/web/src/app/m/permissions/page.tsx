import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  Badge,
} from "@/components/mobile/v2/primitives";
import {
  MobilePermissionsList,
  type MobilePermissionRow,
} from "./MobilePermissionsList";
import { ShieldCheck, AlertTriangle, Clock, CheckCircle2, FileText } from "lucide-react";

export const metadata = { title: "Permissions & Legal — Nirman" };

/**
 * /m/permissions — mobile permissions & legal overview page.
 *
 * Shows ALL legal documents across every project and land parcel in the
 * company, with summary stats and filterable list. Mirrors the desktop
 * /permissions page but with mobile-optimized card layout.
 */
export default function MobilePermissionsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobilePermissionsContent />
    </Suspense>
  );
}

async function MobilePermissionsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return (
      <MobileEmptyState
        icon={ShieldCheck}
        title="No access"
        hint="You don't have permission to view permissions & legal documents"
      />
    );
  }

  const canManage = hasPermission(role, PERM.LEGAL_MANAGE);

  // Fetch all legal documents for this company, with project + land names
  const docs = await prisma.legalDocument.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, name: true } },
      landPurchase: { select: { id: true, sellerName: true, location: true } },
    },
  });

  const rows: MobilePermissionRow[] = docs.map((d) => ({
    id: d.id,
    landPurchaseId: d.landPurchaseId,
    projectId: d.projectId,
    type: d.type,
    title: d.title,
    authority: d.authority,
    status: d.status,
    appliesTo: d.appliesTo,
    docNumber: d.docNumber,
    obtained: d.obtained,
    issueDate: d.issueDate?.toISOString() ?? null,
    validTill: d.validTill?.toISOString() ?? null,
    documentUrl: d.documentUrl,
    notes: d.notes,
    projectName: d.project?.name ?? null,
    landSellerName: d.landPurchase?.sellerName ?? null,
    landLocation: d.landPurchase?.location ?? null,
  }));

  // Summary stats
  const total = rows.length;
  const approved = rows.filter((d) => d.status === "APPROVED" && d.obtained).length;
  const pending = rows.filter((d) => d.status === "PENDING").length;
  const expired = rows.filter((d) => d.status === "EXPIRED").length;

  return (
    <div>
      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard
          label="Total Docs"
          value={String(total)}
          hint="all legal documents"
          icon={FileText}
        />
        <MobileStatCard
          label="Approved"
          value={String(approved)}
          hint="obtained & valid"
          icon={CheckCircle2}
          tone="go"
        />
        <MobileStatCard
          label="Pending"
          value={String(pending)}
          hint="awaiting approval"
          icon={Clock}
          tone="signal"
        />
        <MobileStatCard
          label="Expired"
          value={String(expired)}
          hint="needs renewal"
          icon={AlertTriangle}
          tone="stop"
        />
      </div>

      {/* ── Filterable list ── */}
      <MobileSectionTitle right={<Badge tone="steel">{rows.length} docs</Badge>}>
        Permissions & Legal
      </MobileSectionTitle>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={ShieldCheck}
          title="No legal documents yet"
          hint="Legal documents track permissions, licenses, NOCs, sanctions, and certificates across your projects and land parcels"
        />
      ) : (
        <MobilePermissionsList docs={rows} canManage={canManage} />
      )}
    </div>
  );
}
