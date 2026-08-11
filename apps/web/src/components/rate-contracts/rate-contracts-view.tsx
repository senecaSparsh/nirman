"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import { FileText, Plus, XCircle } from "lucide-react";

type RateContract = {
  id: string;
  contractNumber: string;
  agreedRate: number;
  validFrom: string;
  validTo: string;
  minQty: number | null;
  maxQty: number | null;
  totalReleasedQty: number;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  notes: string | null;
  isExpired: boolean;
  supplier: { name: string; phone: string | null };
  material: { code: string; name: string; unit: string };
};

/** Column definitions for the rate contracts DataTable. */
const rcColumns: Column<RateContract>[] = [
  {
    key: "contractNumber",
    label: "Contract No.",
    sortable: true,
    render: (c) => <span className="font-mono text-caption font-semibold text-foreground">{c.contractNumber}</span>,
  },
  {
    key: "supplier",
    label: "Supplier",
    sortable: true,
    sortValue: (c) => c.supplier.name,
    render: (c) => <span className="font-medium">{c.supplier.name}</span>,
  },
  {
    key: "material",
    label: "Material",
    sortable: true,
    sortValue: (c) => c.material.name,
    render: (c) => (
      <div>
        <span className="text-caption text-muted-foreground">{c.material.code}</span>
        <div>{c.material.name}</div>
      </div>
    ),
  },
  {
    key: "agreedRate",
    label: "Agreed Rate",
    align: "right",
    sortable: true,
    render: (c) => <span className="tnum font-medium">{formatCurrency(c.agreedRate)}/{c.material.unit}</span>,
  },
  {
    key: "validFrom",
    label: "Valid Period",
    sortable: true,
    sortValue: (c) => new Date(c.validFrom),
    render: (c) => (
      <span className="text-caption text-muted-foreground">
        {formatDate(c.validFrom)} → {formatDate(c.validTo)}
      </span>
    ),
  },
  {
    key: "totalReleasedQty",
    label: "Released Qty",
    align: "right",
    sortable: true,
    render: (c) => <span className="tnum text-muted-foreground">{c.totalReleasedQty.toFixed(3)}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    sortValue: (c) => (c.status === "ACTIVE" && c.isExpired ? "EXPIRED" : c.status),
    render: (c) => (
      <StatusPill status={c.status === "ACTIVE" && c.isExpired ? "EXPIRED" : c.status} />
    ),
  },
];

/** Columns with cancel action appended. */
function rcColumnsWithActions(onCancel: (id: string) => void): Column<RateContract>[] {
  return [
    ...rcColumns,
    {
      key: "actions",
      label: "",
      align: "right",
      render: (c) => (
        <div onClick={(e) => e.stopPropagation()}>
          {c.status === "ACTIVE" && (
            <button onClick={() => onCancel(c.id)} className="text-muted-foreground hover:text-destructive" title="Cancel">
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];
}

export function RateContractsView({ canCreate }: { canCreate: boolean }) {
  const [contracts, setContracts] = useState<RateContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    loadContracts();
  }, []);

  function loadContracts() {
    setLoading(true);
    fetch("/api/rate-contracts")
      .then((r) => r.json())
      .then((data) => setContracts(data ?? []))
      .catch(() => toast.error("Failed to load rate contracts"))
      .finally(() => setLoading(false));
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: "Cancel this rate contract?",
      description: "This will mark the rate contract as cancelled. Existing POs linked to it will not be affected, but no new POs can be created against it.",
      confirmLabel: "Cancel Contract",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/rate-contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Rate contract cancelled");
      loadContracts();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (loading) return <PageLoading label="Loading rate contracts…" variant="default" />;

  return (
    <div className="space-y-4">
      {contracts.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No rate contracts"
          description="Create a framework agreement with a supplier for pre-negotiated rates. POs will auto-fill the agreed rate."
          action={canCreate ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Rate Contract
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={contracts}
            initialSort={{ key: "validFrom", direction: "desc" }}
            columns={canCreate ? rcColumnsWithActions(onCancel) : rcColumns}
            searchable
            searchPlaceholder="Search by contract no, supplier, material…"
            showTotals
            sumColumns={["totalReleasedQty"]}
            totalFormat={(_key, sum) => formatNumber(sum, 3)}
            hideable
            pageSize={50}
            onAddRow={canCreate ? () => setDialogOpen(true) : undefined}
            addRowLabel="New Rate Contract"
          />
        </div>
      )}

      <RateContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={loadContracts}
      />
      {confirmDialog}
    </div>
  );
}

function RateContractDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    supplierId: "",
    materialId: "",
    agreedRate: "",
    validFrom: "",
    validTo: "",
    minQty: "",
    maxQty: "",
    notes: "",
  });
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [materials, setMaterials] = useState<{ id: string; code: string; name: string; unit: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.suppliers ?? d ?? [])).catch(() => {});
    fetch("/api/materials").then((r) => r.json()).then((d) => setMaterials(d.materials ?? d ?? [])).catch(() => {});
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierId || !form.materialId || !form.agreedRate || !form.validFrom || !form.validTo) {
      toast.error("All required fields must be filled");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/rate-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: form.supplierId,
          materialId: form.materialId,
          agreedRate: parseFloat(form.agreedRate),
          validFrom: new Date(form.validFrom).toISOString(),
          validTo: new Date(form.validTo).toISOString(),
          minQty: form.minQty ? parseFloat(form.minQty) : undefined,
          maxQty: form.maxQty ? parseFloat(form.maxQty) : undefined,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Rate contract created");
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Rate Contract"
      description="Pre-negotiate a rate with a supplier for a material. POs will auto-fill this rate."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier" required>
            <Select value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)} required>
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Material" required>
            <Select value={form.materialId} onChange={(e) => set("materialId", e.target.value)} required>
              <option value="">— Select material —</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Agreed Rate (₹)" required>
            <Input type="number" step="0.01" value={form.agreedRate} onChange={(e) => set("agreedRate", e.target.value)} required />
          </Field>
          <Field label="Valid From" required>
            <Input type="date" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} required />
          </Field>
          <Field label="Valid To" required>
            <Input type="date" value={form.validTo} onChange={(e) => set("validTo", e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Min Qty per Release (optional)">
            <Input type="number" step="0.001" value={form.minQty} onChange={(e) => set("minQty", e.target.value)} />
          </Field>
          <Field label="Max Total Qty (optional)">
            <Input type="number" step="0.001" value={form.maxQty} onChange={(e) => set("maxQty", e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
