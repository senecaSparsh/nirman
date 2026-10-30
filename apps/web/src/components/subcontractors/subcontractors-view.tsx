"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {Plus, Pencil, Trash2, HardHat, Phone} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { COMMON_TRADES, SuggestionList } from "@/components/suggestion-list";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { formatCurrency, cn } from "@/lib/utils";
import type { SubcontractorRow } from "@/lib/types";

export function SubcontractorsView({
  subcontractors,
  canCreate,
  canEdit,
  canDelete,
}: {
  subcontractors: SubcontractorRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubcontractorRow | null>(null);
  const [deleting, setDeleting] = useState<SubcontractorRow | null>(null);

  const baseColumns: Column<SubcontractorRow>[] = [
    {
      key: "name",
      label: "Contractor (Thekedar)",
      sortable: true,
      render: (s) => (
        <div>
          <div className="font-medium text-foreground">{s.name}</div>
          {s.trade && <div className="text-caption text-muted-foreground">{s.trade}</div>}
        </div>
      ),
      exportValue: (s) => s.name,
    },
    {
      key: "phone",
      label: "Phone",
      sortable: true,
      render: (s) => s.phone ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Phone className="h-3 w-3" /> {s.phone}
        </span>
      ) : "—",
      exportValue: (s) => s.phone ?? "",
    },
    {
      key: "gstin",
      label: "GSTIN",
      sortable: true,
      render: (s) => s.gstin ? <span className="font-mono text-caption text-muted-foreground">{s.gstin}</span> : "—",
      exportValue: (s) => s.gstin ?? "",
    },
    {
      key: "workOrderCount",
      label: "Work Orders",
      sortable: true,
      align: "right",
      render: (s) => {
        const count = s.workOrderCount ?? 0;
        const active = s.activeWorkOrderCount ?? 0;
        return (
          <span className={cn("tnum", count > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
            {count}
            {active > 0 && <span className="text-micro text-info"> ({active} active)</span>}
          </span>
        );
      },
      exportValue: (s) => s.workOrderCount ?? 0,
    },
    {
      key: "totalWorkDone",
      label: "Total Work Done",
      sortable: true,
      align: "right",
      render: (s) => (s.totalWorkDone ?? 0) > 0 ? (
        <span className="tnum font-medium">{formatCurrency(s.totalWorkDone ?? 0)}</span>
      ) : "—",
      exportValue: (s) => s.totalWorkDone ?? 0,
    },
    {
      key: "totalPaid",
      label: "Total Paid",
      sortable: true,
      align: "right",
      render: (s) => (s.totalPaid ?? 0) > 0 ? (
        <span className="tnum text-success">{formatCurrency(s.totalPaid ?? 0)}</span>
      ) : "—",
      exportValue: (s) => s.totalPaid ?? 0,
    },
    {
      key: "retentionBalance",
      label: "Retention Held",
      sortable: true,
      align: "right",
      render: (s) => (s.retentionBalance ?? 0) > 0 ? (
        <span className="tnum text-warning">{formatCurrency(s.retentionBalance ?? 0)}</span>
      ) : <span className="text-muted-foreground">—</span>,
      exportValue: (s) => s.retentionBalance ?? 0,
    },
  ];

  const actionColumn: Column<SubcontractorRow> = {
    key: "actions",
    label: "",
    align: "right",
    render: (s) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {canEdit && (
          <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => { setEditing(s); setFormOpen(true); }}>
            <Pencil className="size-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => setDeleting(s)} className="hover:text-danger">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    ),
  };

  const columns = canEdit || canDelete ? [...baseColumns, actionColumn] : baseColumns;

  return (
    <div className="space-y-4">
      {subcontractors.length === 0 ? (
        <EmptyState
          icon={<HardHat className="h-6 w-6" />}
          title="No contractors yet"
          description="Add your thekedars to issue work orders, track RA bills, and manage TDS/retention."
          action={canCreate ? (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add your first contractor
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            columns={columns}
            data={subcontractors}
            getRowId={(s) => s.id}
            storageKey="subcontractors"
            searchable
            searchPlaceholder="Search name, trade, phone, GSTIN…"
            hideable
            exportFileName="subcontractors"
            initialSort={{ key: "name", direction: "asc" }}
            showTotals
            sumColumns={["totalWorkDone", "totalPaid", "retentionBalance"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            onAddRow={canCreate ? () => { setEditing(null); setFormOpen(true); } : undefined}
            addRowLabel="Add Contractor"
            toolbarTrailing={
              canCreate ? (
                <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                  <Plus className="size-3.5" /> Add Contractor
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <SubcontractorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        subcontractor={editing}
        canEdit={canEdit}
      />

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        endpoint={deleting ? `/api/subcontractors/${deleting.id}` : ""}
        title="Delete subcontractor"
        description={`Delete "${deleting?.name}"${deleting?.trade ? ` (${deleting.trade})` : ""}? This won't affect past work orders or RA bills that reference this subcontractor.`}
        successMessage="Contractor deleted"
      />
    </div>
  );
}

function SubcontractorFormDialog({
  open,
  onOpenChange,
  subcontractor,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcontractor: SubcontractorRow | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [trade, setTrade] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(subcontractor?.name ?? "");
      setGstin(subcontractor?.gstin ?? "");
      setPan(subcontractor?.pan ?? "");
      setPhone(subcontractor?.phone ?? "");
      setEmail(subcontractor?.email ?? "");
      setAddress(subcontractor?.address ?? "");
      setTrade(subcontractor?.trade ?? "");
    }
  }, [open, subcontractor]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Contractor name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        gstin: gstin.trim() || null,
        pan: pan.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        trade: trade.trim() || null,
      };
      const url = subcontractor ? `/api/subcontractors/${subcontractor.id}` : "/api/subcontractors";
      const method = subcontractor ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save subcontractor");
      }
      toast.success(subcontractor ? "Contractor updated" : "Contractor created");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save subcontractor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={subcontractor ? "Edit Contractor" : "Add Contractor"}
      description={subcontractor ? subcontractor.name : "Add a subcontractor or contractor."}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required>
          <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sharma Construction" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Trade">
            <Input aria-label="Masonry, Plumbing, Electrical" list="suggest-trades" value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Masonry, Plumbing, Electrical…" />
            <SuggestionList id="suggest-trades" options={COMMON_TRADES} />
          </Field>
          <Field label="GSTIN">
            <Input aria-label="GSTIN" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className="font-mono" />
          </Field>
        </div>
        <Field label="PAN" hint="Needed for TDS filing — unregistered subs have no GSTIN to infer it from; absent PAN → 20% u/s 206AA.">
          <Input aria-label="PAN" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} className="font-mono" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input aria-label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
          </Field>
          <Field label="Email">
            <Input aria-label="Mail" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@firm.com" />
          </Field>
        </div>
        <Field label="Address">
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Office address…" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving || !canEdit}>{saving ? "Saving…" : subcontractor ? "Update Contractor" : "Create Contractor"}</Button>
        </div>
      </form>
    </Dialog>
  );
}