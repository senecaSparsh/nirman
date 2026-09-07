import { prisma } from "@nirman/db";
import { toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import {ShieldCheck, Truck, Clock, CheckCircle, XCircle} from "lucide-react";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileSectionTitle, MobileEmptyState, MobileStatCard } from "@/components/mobile/v2/primitives";
import { MobileGatePassList, MobileGatePassFormDialog } from "./MobileGatePassList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

export const metadata = { title: "Gate Pass · Nirman" };

export default function MobileGatePassPage() {
  return (
    <MobileListPage>
      {async ({ company, role }) => {
        const canExit = hasPermission(role, PERM.GATE_PASS_EXIT);
        const canApprove = hasPermission(role, PERM.GATE_PASS_APPROVE);
        const canCreate = hasPermission(role, PERM.GATE_PASS_CREATE);
        const canManage = hasPermission(role, PERM.GATE_PASS_MANAGE);

        const BATCH_SIZE = 40;
        const [gatePasses, locations, projects] = await Promise.all([
          prisma.gatePass.findMany({
            where: { companyId: company.id, status: { in: ["DRAFT", "PENDING", "APPROVED", "EXITED", "REJECTED"] } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: BATCH_SIZE + 1,
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

        const hasMore = gatePasses.length > BATCH_SIZE;
        const batch = hasMore ? gatePasses.slice(0, BATCH_SIZE) : gatePasses;
        const last = batch[batch.length - 1];
        const nextCursor = hasMore && last
          ? `${last.createdAt.toISOString()}|${last.id}`
          : null;

        const pending = batch.filter((g) => g.status === "PENDING");
        const approved = batch.filter((g) => g.status === "APPROVED");
        const exited = batch.filter((g) => g.status === "EXITED");
        const rejected = batch.filter((g) => g.status === "REJECTED");

        const rows = batch.map((gp) => ({
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
            <MobileSectionTitle>Gate Pass</MobileSectionTitle>
            <p className="text-m-caption -mt-2" style={{ color: "var(--color-ink-500)" }}>Items cannot leave the gate until approved</p>

            {canCreate && (
              <MobileGatePassFormDialog locations={locations} projects={projects} />
            )}

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
                loadMoreUrl="/api/mobile/list/gate-passes"
                initialCursor={nextCursor}
                exportTitle="Gate Passes"
                exportRows={rows as unknown as Record<string, unknown>[]}
                exportColumns={[
                  { key: "gatePassNumber", label: "GP Number" },
                  { key: "status", label: "Status" },
                  { key: "category", label: "Category" },
                  { key: "locationName", label: "Location" },
                  { key: "vehicleNumber", label: "Vehicle" },
                  { key: "destination", label: "Destination" },
                  { key: "createdAt", label: "Created", format: "date" },
                ] as MobileColumnSpec[]}
                exportSummary={`${rows.length} gate passes · ${pending.length} pending`}
              />
            )}
          </div>
        );
      }}
    </MobileListPage>
  );
}
