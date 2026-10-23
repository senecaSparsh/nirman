"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Handshake, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import type { BrokerRow } from "@/lib/types";

export function BrokersView({
  brokers,
  canCreate,
  canEdit,
  canDelete,
}: {
  brokers: BrokerRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BrokerRow | null>(null);
  const [deleting, setDeleting] = useState<BrokerRow | null>(null);

  const baseColumns: Column<BrokerRow>[] = [
    {
      key: "name",
      label: "Broker",
      sortable: true,
      render: (b) => (
        <div>
          <div className="font-medium text-foreground">{b.name}</div>
          {b.agency && <div className="text-caption text-muted-foreground">{b.agency}</div>}
        </div>
      ),
      exportValue: (b) => b.name,
    },
    {
      key: "phone",
      label: "Phone",
      sortable: true,
      render: (b) => b.phone ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Phone className="h-3 w-3" /> {b.phone}
        </span>
      ) : "—",
      exportValue: (b) => b.phone ?? "",
    },
    {
      key: "defaultCommissionPercent",
      label: "Default Commission",
      sortable: true,
      align: "right",
      render: (b) => b.defaultCommissionPercent != null ? (
        <span className="tnum text-muted-foreground">{formatNumber(b.defaultCommissionPercent, 2)}%</span>
      ) : "—",
      exportValue: (b) => b.defaultCommissionPercent ?? "",
    },
    {
      key: "dealCount",
      label: "Deals",
      sortable: true,
      align: "right",
      render: (b) => (
        <span className={cn("tnum", b.dealCount > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
          {b.dealCount}
        </span>
      ),
      exportValue: (b) => b.dealCount,
    },
    {
      key: "totalCommission",
      label: "Total Commission",
      sortable: true,
      align: "right",
      render: (b) => b.totalCommission > 0 ? (
        <span className="tnum font-medium">{formatCurrency(b.totalCommission)}</span>
      ) : "—",
      exportValue: (b) => b.totalCommission,
    },
    {
      key: "commissionPaid",
      label: "Paid",
      sortable: true,
      align: "right",
      render: (b) => {
        if (b.totalCommission <= 0) return <span className="text-muted-foreground">—</span>;
        const unpaid = b.totalCommission - b.commissionPaid;
        return (
          <div>
            <span className="tnum text-muted-foreground">{formatCurrency(b.commissionPaid)}</span>
            {unpaid > 0 && <div className="text-micro text-warning">{formatCurrency(unpaid)} unpaid</div>}
          </div>
        );
      },
      exportValue: (b) => b.commissionPaid,
    },
  ];

  const actionColumn: Column<BrokerRow> = {
    key: "actions",
    label: "",
    align: "right",
    render: (b) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {canEdit && (
          <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => { setEditing(b); setFormOpen(true); }}>
            <Pencil className="size-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => setDeleting(b)} className="hover:text-danger">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    ),
  };

  const columns = canEdit || canDelete ? [...baseColumns, actionColumn] : baseColumns;

  return (
    <div className="space-y-4">
      {brokers.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-6 w-6" />}
          title="No brokers yet"
          description="Add brokers/agents to track commissions and deal sources."
          action={canCreate ? (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add your first broker
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            columns={columns}
            data={brokers}
            getRowId={(b) => b.id}
            storageKey="brokers"
            searchable
            searchPlaceholder="Search broker, agency, phone…"
            hideable
            exportFileName="brokers"
            initialSort={{ key: "name", direction: "asc" }}
            showTotals
            sumColumns={["dealCount", "totalCommission", "commissionPaid"]}
            totalFormat={(key, sum) => key === "dealCount" ? sum.toLocaleString("en-IN") : formatCurrency(sum)}
            onAddRow={canCreate ? () => { setEditing(null); setFormOpen(true); } : undefined}
            addRowLabel="Add Broker"
            toolbarTrailing={
              canCreate ? (
                <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                  <Plus className="size-3.5" /> Add Broker
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <BrokerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        broker={editing}
        canEdit={canEdit}
      />

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        endpoint={deleting ? `/api/brokers/${deleting.id}` : ""}
        title="Delete broker"
        description={`Delete "${deleting?.name}"${deleting?.agency ? ` (${deleting.agency})` : ""}? This won't affect past sales that reference this broker.`}
        successMessage="Broker deleted"
      />
    </div>
  );
}

function BrokerFormDialog({
  open,
  onOpenChange,
  broker,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  broker: BrokerRow | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agency, setAgency] = useState("");
  const [defaultCommissionPercent, setDefaultCommissionPercent] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync form when dialog opens
  useEffect(() => {
    if (open) {
      setName(broker?.name ?? "");
      setPhone(broker?.phone ?? "");
      setAgency(broker?.agency ?? "");
      setDefaultCommissionPercent(broker?.defaultCommissionPercent != null ? String(broker.defaultCommissionPercent) : "");
      setNotes(broker?.notes ?? "");
    }
  }, [open, broker]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Broker name is required");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim() || null,
        agency: agency.trim() || null,
        defaultCommissionPercent: defaultCommissionPercent ? Number(defaultCommissionPercent) : null,
        notes: notes.trim() || null,
      };
      const url = broker ? `/api/brokers/${broker.id}` : "/api/brokers";
      const method = broker ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save broker");
      }
      toast.success(broker ? "Broker updated" : "Broker created");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save broker");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={broker ? "Edit Broker" : "Add Broker"}
      description={broker ? broker.name : "Add a real estate broker or agent."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required>
          <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rajesh Sharma" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input aria-label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
          </Field>
          <Field label="Agency">
            <Input aria-label="Sharma Properties" value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="Sharma Properties" />
          </Field>
        </div>
        <Field label="Default Commission %" hint="Auto-fills commission on new deals using this broker">
          <Input aria-label="Default Commission Percent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={defaultCommissionPercent}
            onChange={(e) => setDefaultCommissionPercent(e.target.value)}
            placeholder="e.g. 2.5"
          />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any notes about this broker…" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving || !canEdit}>{saving ? "Saving…" : broker ? "Update Broker" : "Create Broker"}</Button>
        </div>
      </form>
    </Dialog>
  );
}