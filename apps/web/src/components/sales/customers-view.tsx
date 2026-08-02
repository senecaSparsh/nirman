"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Users, Phone, Mail, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
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

  // Derive initials for avatar
  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-caption text-muted-foreground">{customers.length} customers</span>
        {(permissions?.canCreate ?? true) && (
          <Button onClick={openNew}><Plus className="h-4 w-4" /> New Customer</Button>
        )}
      </div>

      {customers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No customers"
          description="Add customers to start recording asset sales."
          action={(permissions?.canCreate ?? true) ? (
            <Button onClick={openNew} size="sm"><Plus className="h-4 w-4" /> New Customer</Button>
          ) : undefined}
        />
      ) : (
        /* ── Contact card grid — each customer as a visual card ──
           Not a table. You see the customer as a person/entity with
           an avatar, contact info, and active sales count. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {customers.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              {/* Header: avatar + name */}
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-caption font-semibold text-background">
                  {initials(c.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-body font-semibold text-foreground">{c.name}</div>
                  {c.gstin && (
                    <div className="truncate font-mono text-micro text-muted-foreground">{c.gstin}</div>
                  )}
                </div>
              </div>

              {/* Contact info */}
              <div className="mt-3 space-y-1">
                {c.phone && (
                  <div className="flex items-center gap-2 text-caption text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2 text-caption text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {!c.phone && !c.email && (
                  <div className="text-caption text-muted-foreground/50">No contact info</div>
                )}
              </div>

              {/* Footer: active sales + actions */}
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-caption text-muted-foreground">Active sales</span>
                  <span className={`text-body font-semibold tnum ${c.activeSales > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {c.activeSales}
                  </span>
                </div>
                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {(permissions?.canEdit ?? true) && (
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {(permissions?.canDelete ?? true) && (
                    <button
                      onClick={() => setDeleting(c)}
                      disabled={c.activeSales > 0}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger disabled:opacity-30"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
    </div>
  );
}
