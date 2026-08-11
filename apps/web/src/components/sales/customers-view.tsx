"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Users, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { GenericCsvImportDialog } from "@/components/csv-import-dialog";
import { CustomerFormDialog } from "./customer-form-dialog";
import type { CustomerRow } from "@/lib/types";

export function CustomersView({
  customers,
  permissions,
}: {
  customers: CustomerRow[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canDelete?: boolean };
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const router = useRouter();

  function openNew() { setEditing(null); setFormOpen(true); }
  function openEdit(c: CustomerRow) { setEditing(c); setFormOpen(true); }

  const canEdit = permissions?.canEdit ?? false;
  const canDelete = permissions?.canDelete ?? false;
  const canCreate = permissions?.canCreate ?? false;

  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      label: "Customer",
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-caption font-semibold text-background">
            {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{c.name}</div>
            {c.gstin && (
              <div className="truncate font-mono text-micro text-muted-foreground">{c.gstin}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      sortable: true,
      render: (c) =>
        c.phone ? (
          <span className="text-muted-foreground">{c.phone}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (c) =>
        c.email ? (
          <span className="truncate text-muted-foreground">{c.email}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
    {
      key: "activeSales",
      label: "Active Sales",
      align: "right",
      sortable: true,
      render: (c) => (
        <span className={`tnum font-medium ${c.activeSales > 0 ? "text-foreground" : "text-muted-foreground"}`}>
          {c.activeSales}
        </span>
      ),
    },
    ...(canEdit || canDelete
      ? [
          {
            key: "actions" as const,
            label: "" as const,
            align: "right" as const,
            render: (c: CustomerRow) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {canEdit && (
                  <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => openEdit(c)}>
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete"
                    onClick={() => setDeleting(c)}
                    disabled={c.activeSales > 0}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      {customers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No customers"
          description="Add customers to start recording asset sales. Each customer links to their bookings, payment plans, and contact details."
          action={canCreate ? (
            <Button onClick={openNew} size="sm">
              <Plus className="size-4" /> New Customer
            </Button>
          ) : undefined}
        />
      ) : (
        /*
         * A customer directory is a payables/receivables comparison, not
         * a set of profile cards. Cards hid the only number anyone opens
         * this tab for — how many active sales each customer has — one
         * click deep and one customer at a time. As rows, "who has the
         * most active bookings" is a sort, not twenty clicks.
         */
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={customers}
            columns={columns}
            storageKey="customers"
            searchable
            searchPlaceholder="Search name, GSTIN, phone, email…"
            hideable
            initialSort={{ key: "activeSales", direction: "desc" }}
            showTotals
            sumColumns={["activeSales"]}
            totalFormat={(key, sum) => sum.toLocaleString("en-IN")}
            rowTone={(c) => (c.activeSales > 0 ? "success" : null)}
            onAddRow={canCreate ? openNew : undefined}
            addRowLabel="New Customer"
            toolbarTrailing={
              canCreate ? (
                <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> CSV Import
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} />
      {deleting && (
        <DeleteConfirmDialog
          open={deleting !== null}
          onOpenChange={(o) => !o && setDeleting(null)}
          endpoint={`/api/customers/${deleting.id}`}
          title="Delete customer"
          description={`Delete "${deleting.name}"? Customers with active sales cannot be deleted.`}
          successMessage="Customer deleted"
        />
      )}

      <GenericCsvImportDialog
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        endpoint="/api/customers"
        entityName="Customer"
        templateHeaders="name,phone,email,gstin,address"
        templateSample="Rajesh Kumar,9876543210,rajesh@example.com,27ABCDE1234F1Z5,45 MG Road Pune"
        fieldMap={{
          name: "name",
          phone: "phone",
          email: "email",
          gstin: "gstin",
          address: "address",
        }}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
