"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
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

  function openNew() { setEditing(null); setFormOpen(true); }
  function openEdit(c: CustomerRow) { setEditing(c); setFormOpen(true); }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Buyers of land parcels and built units, with contact details and purchase history."
      />

      <div className="flex items-center justify-between">
        <span className="text-caption text-muted-foreground">{customers.length} customer{customers.length !== 1 ? "s" : ""}</span>
        {(permissions?.canCreate ?? true) && (
          <Button onClick={openNew}><Plus className="h-4 w-4" /> New Customer</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title="No customers" description="Add customers to start recording asset sales." />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Phone</TH>
                  <TH>Email</TH>
                  <TH>GSTIN</TH>
                  <TH className="text-right">Active Sales</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {customers.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-muted-foreground">{c.phone ?? "—"}</TD>
                    <TD className="text-muted-foreground">{c.email ?? "—"}</TD>
                    <TD className="font-mono text-caption text-muted-foreground">{c.gstin ?? "—"}</TD>
                    <TD className="tnum text-right">{c.activeSales}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {(permissions?.canEdit ?? true) && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        )}
                        {(permissions?.canDelete ?? true) && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} disabled={c.activeSales > 0}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
