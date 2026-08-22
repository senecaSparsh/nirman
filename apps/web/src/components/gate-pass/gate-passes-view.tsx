"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  ShieldCheck,
  Truck,
  Clock,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GatePassFormDialog } from "./gate-pass-form-dialog";
import { GatePassDetailDialog } from "./gate-pass-detail-dialog";

export type GatePassRow = {
  id: string;
  gatePassNumber: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "EXITED" | "CANCELLED";
  category: "MATERIAL_ISSUE" | "STOCK_TRANSFER" | "MATERIAL_SALE" | "SUPPLIER_RETURN" | "MANUAL";
  refType: string | null;
  refId: string | null;
  locationId: string;
  locationName: string;
  locationType: string;
  projectId: string | null;
  projectName: string | null;
  vehicleNumber: string | null;
  vehicleType: string | null;
  driverName: string | null;
  driverPhone: string | null;
  transporterName: string | null;
  destination: string | null;
  purpose: string | null;
  notes: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  exitedAt: string | null;
  rejectionReason: string | null;
  approvalNotes: string | null;
  createdByName: string | null;
  submittedByName: string | null;
  approvedByName: string | null;
  rejectedByName: string | null;
  exitedByName: string | null;
  lineCount: number;
  lines: {
    id: string;
    materialId: string | null;
    materialCode: string | null;
    materialName: string | null;
    unit: string | null;
    qty: number;
    description: string | null;
  }[];
};

type Permissions = {
  canCreate: boolean;
  canApprove: boolean;
  canExit: boolean;
  canManage: boolean;
};

const STATUS_CONFIG: Record<GatePassRow["status"], { label: string; color: string; dot: string }> = {
  DRAFT: { label: "Draft", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  PENDING: { label: "Pending", color: "text-warning", dot: "bg-warning" },
  APPROVED: { label: "Approved", color: "text-success", dot: "bg-success" },
  REJECTED: { label: "Rejected", color: "text-danger", dot: "bg-danger" },
  EXITED: { label: "Exited", color: "text-info", dot: "bg-info" },
  CANCELLED: { label: "Cancelled", color: "text-muted-foreground", dot: "bg-muted-foreground" },
};

const CATEGORY_LABELS: Record<GatePassRow["category"], string> = {
  MATERIAL_ISSUE: "Material Issue",
  STOCK_TRANSFER: "Stock Transfer",
  MATERIAL_SALE: "Material Sale",
  SUPPLIER_RETURN: "Supplier Return",
  MANUAL: "Manual",
};

export function GatePassesView({
  gatePasses,
  locations,
  materials,
  projects,
  permissions,
}: {
  gatePasses: GatePassRow[];
  locations: { id: string; name: string; type: string }[];
  materials: { id: string; code: string; name: string; unit: string }[];
  projects: { id: string; name: string; type: string; status: string }[];
  permissions: Permissions;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const selected = useMemo(
    () => gatePasses.find((g) => g.id === selectedId) ?? null,
    [gatePasses, selectedId],
  );

  const handleAction = useCallback(
    async (id: string, action: string, body?: Record<string, unknown>) => {
      setActionLoading(true);
      try {
        const res = await fetch(`/api/gate-passes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Action failed");
        const actionLabels: Record<string, string> = {
          submit: "submitted", approve: "approved", reject: "rejected",
          resubmit: "resubmitted", confirmExit: "exit confirmed", cancel: "cancelled",
        };
        toast.success(`Gate pass ${actionLabels[action] ?? action}ed`);
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      } finally {
        setActionLoading(false);
      }
    },
    [router],
  );

  const columns: Column<GatePassRow>[] = [
    {
      key: "gatePassNumber",
      label: "GP Number",
      sortable: true,
      render: (r) => <span className="font-mono text-caption font-medium">{r.gatePassNumber}</span>,
    },
    {
      key: "category",
      label: "Category",
      sortable: true,
      render: (r) => <span className="text-caption">{CATEGORY_LABELS[r.category]}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => {
        const cfg = STATUS_CONFIG[r.status];
        return (
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
        );
      },
    },
    {
      key: "locationName",
      label: "Gate / Location",
      sortable: true,
      render: (r) => (
        <div>
          <div className="text-body">{r.locationName}</div>
          <div className="text-caption text-muted-foreground">
            {r.locationType === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}
          </div>
        </div>
      ),
    },
    {
      key: "lineCount",
      label: "Items",
      align: "right",
      sortable: true,
      render: (r) => <span className="tnum text-body">{r.lineCount}</span>,
    },
    {
      key: "vehicleNumber",
      label: "Vehicle",
      sortable: true,
      render: (r) => (
        <div className="text-caption">
          {r.vehicleNumber ? (
            <>
              <div className="font-medium">{r.vehicleNumber}</div>
              {r.driverName && <div className="text-muted-foreground">{r.driverName}</div>}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      key: "destination",
      label: "Destination",
      sortable: true,
      render: (r) => <span className="text-caption">{r.destination ?? "—"}</span>,
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      render: (r) => <span className="tnum text-caption text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>,
    },
  ];

  const pendingApproval = gatePasses.filter((g) => g.status === "PENDING");
  const pendingExit = gatePasses.filter((g) => g.status === "APPROVED");
  const rejected = gatePasses.filter((g) => g.status === "REJECTED");

  return (
    <div className="space-y-4">
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all" count={gatePasses.length}>All Gate Passes</TabsTrigger>
          <TabsTrigger value="pending" count={pendingApproval.length}>Pending Approval</TabsTrigger>
          <TabsTrigger value="exit" count={pendingExit.length}>Pending Exit</TabsTrigger>
          <TabsTrigger value="rejected" count={rejected.length}>Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {gatePasses.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title="No gate passes yet"
              description="Generate a gate pass when items need to leave the gate. Items cannot exit until an authorized person approves."
              action={permissions.canCreate ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> New Gate Pass
                </Button>
              ) : undefined}
            />
          ) : (
            <GatePassDataTable
              rows={gatePasses}
              columns={columns}
              onRowClick={(r) => setSelectedId(r.id)}
              toolbarTrailing={
                permissions.canCreate ? (
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> New Gate Pass
                  </Button>
                ) : undefined
              }
            />
          )}
        </TabsContent>

        <TabsContent value="pending">
          {pendingApproval.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-5 w-5" />}
              title="No pending approvals"
              description="Gate passes awaiting your approval will appear here."
            />
          ) : (
            <GatePassDataTable
              rows={pendingApproval}
              columns={columns}
              onRowClick={(r) => setSelectedId(r.id)}
            />
          )}
        </TabsContent>

        <TabsContent value="exit">
          {pendingExit.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-5 w-5" />}
              title="No items pending exit"
              description="Approved gate passes ready for physical release will appear here. Confirm exit when items leave the gate."
            />
          ) : (
            <GatePassDataTable
              rows={pendingExit}
              columns={columns}
              onRowClick={(r) => setSelectedId(r.id)}
            />
          )}
        </TabsContent>

        <TabsContent value="rejected">
          {rejected.length === 0 ? (
            <EmptyState
              icon={<XCircle className="h-5 w-5" />}
              title="No rejected gate passes"
              description="Rejected gate passes will appear here. Fix the issue and resubmit, or cancel."
            />
          ) : (
            <GatePassDataTable
              rows={rejected}
              columns={columns}
              onRowClick={(r) => setSelectedId(r.id)}
            />
          )}
        </TabsContent>
      </Tabs>

      {permissions.canCreate && (
        <GatePassFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          locations={locations}
          materials={materials}
          projects={projects}
        />
      )}

      {selected && (
        <GatePassDetailDialog
          gatePass={selected}
          onClose={() => setSelectedId(null)}
          permissions={permissions}
          onAction={handleAction}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}

function GatePassDataTable({
  rows,
  columns,
  onRowClick,
  toolbarTrailing,
}: {
  rows: GatePassRow[];
  columns: Column<GatePassRow>[];
  onRowClick: (r: GatePassRow) => void;
  toolbarTrailing?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <DataTable
        data={rows}
        columns={columns}
        onRowClick={onRowClick}
        searchable
        searchPlaceholder="Search by GP number, vehicle, destination…"
        pageSize={50}
        toolbarTrailing={toolbarTrailing}
      />
    </div>
  );
}
