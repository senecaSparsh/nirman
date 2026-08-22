import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ShieldCheck, Truck, Clock, CheckCircle, XCircle, Plus } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSectionTitle, MobileEmptyState, MobileStatCard } from "@/components/mobile/v2/primitives";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileGatePassList, MobileGatePassFormDialog } from "./MobileGatePassList";

export const metadata = { title: "Gate Pass · Nirman" };

export default function MobileGatePassPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileGatePassContent />
    </Suspense>
  );
}

async function MobileGatePassContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canExit = hasPermission(role, PERM.GATE_PASS_EXIT);
  const canApprove = hasPermission(role, PERM.GATE_PASS_APPROVE);
  const canCreate = hasPermission(role, PERM.GATE_PASS_CREATE);
  const canManage = hasPermission(role, PERM.GATE_PASS_MANAGE);

  const [gatePasses, locations, projects] = await Promise.all([
    prisma.gatePass.findMany({
      where: { companyId: company.id, status: { in: ["DRAFT", "PENDING", "APPROVED", "EXITED", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        lines: true,
        location: { select: { name: true } },
        approvedBy: { select: { name: true } },
        rejectedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
        exitedBy: { select: { name: true } },
        submittedBy: { select: { name: true } },
      },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const pending = gatePasses.filter((g) => g.status === "PENDING");
  const approved = gatePasses.filter((g) => g.status === "APPROVED");
  const exited = gatePasses.filter((g) => g.status === "EXITED");
  const rejected = gatePasses.filter((g) => g.status === "REJECTED");

  const rows = gatePasses.map((gp) => ({
    id: gp.id,
    gatePassNumber: gp.gatePassNumber,
    status: gp.status,
    category: gp.category,
    locationName: gp.location.name,
    vehicleNumber: gp.vehicleNumber,
    vehicleType: gp.vehicleType,
    driverName: gp.driverName,
    driverPhone: gp.driverPhone,
    transporterName: gp.transporterName,
    destination: gp.destination,
    purpose: gp.purpose,
    notes: gp.notes,
    approvalNotes: gp.approvalNotes,
    exitNotes: gp.exitNotes,
    createdAt: gp.createdAt.toISOString(),
    submittedAt: gp.submittedAt?.toISOString() ?? null,
    approvedAt: gp.approvedAt?.toISOString() ?? null,
    exitedAt: gp.exitedAt?.toISOString() ?? null,
    approvedByName: gp.approvedBy?.name ?? null,
    createdByName: gp.createdBy?.name ?? null,
    submittedByName: gp.submittedBy?.name ?? null,
    rejectedByName: gp.rejectedBy?.name ?? null,
    exitedByName: gp.exitedBy?.name ?? null,
    rejectionReason: gp.rejectionReason,
    lineCount: gp.lines.length,
    lines: gp.lines.map((l) => ({
      id: l.id,
      materialCode: l.materialCode,
      materialName: l.materialName,
      unit: l.unit,
      qty: toNum(l.qty),
      description: l.description,
    })),
  }));

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center justify-between">
        <MobileSectionTitle>Gate Pass</MobileSectionTitle>
        {canCreate && (
          <MobileGatePassFormDialog locations={locations} projects={projects} />
        )}
      </div>
      <p className="text-meta text-muted-foreground -mt-2">Items cannot leave the gate until approved</p>

      <div className="grid grid-cols-4 gap-2">
        <MobileStatCard
          icon={Clock}
          label="Pending"
          value={String(pending.length)}
          tone="signal"
        />
        <MobileStatCard
          icon={CheckCircle}
          label="Approved"
          value={String(approved.length)}
          tone="go"
        />
        <MobileStatCard
          icon={Truck}
          label="Exited"
          value={String(exited.length)}
          tone="neutral"
        />
        <MobileStatCard
          icon={XCircle}
          label="Rejected"
          value={String(rejected.length)}
          tone="stop"
        />
      </div>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={ShieldCheck}
          title="No gate passes"
          hint="Gate passes for items leaving the gate will appear here."
        />
      ) : (
        <MobileGatePassList
          gatePasses={rows}
          canApprove={canApprove}
          canExit={canExit}
          canCreate={canCreate}
          canManage={canManage}
        />
      )}
    </div>
  );
}
