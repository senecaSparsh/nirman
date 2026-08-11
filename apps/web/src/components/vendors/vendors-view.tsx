"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Plus, Pencil, Trash2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { VendorRatingsView } from "@/components/vendor-ratings/vendor-ratings-view";
import { DataTable } from "@/components/ui/data-table";
import { GenericCsvImportDialog } from "@/components/csv-import-dialog";
import { DateCell, IdentityCell, MoneyCell, QtyCell } from "@/components/ui/cells";
import { statusColor } from "@/components/page";
import { useTabParam } from "@/lib/use-tab-param";
import { formatCurrency, formatDate } from "@/lib/utils";

export type VendorRow = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  balanceOwed: number;
  leadTimeDays: number | null;
  totalPOs: number;
  openPOs: number;
  totalSpent: number;
  recentPOs: {
    id: string;
    poNumber: string;
    status: string;
    orderDate: string;
    total: number;
    gst: number;
  }[];
};

export function VendorsView({
  vendors,
  permissions,
}: {
  vendors: VendorRow[];
  permissions?: { canManage?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? false;
  const [tab, setTab] = useTabParam(["directory", "ratings"] as const, "directory");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VendorRow | null>(null);
  const [delTarget, setDelTarget] = useState<VendorRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const [fName, setFName] = useState("");
  const [fGstin, setFGstin] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fLeadTime, setFLeadTime] = useState("");

  function openCreate() {
    setEditTarget(null);
    setFName(""); setFGstin(""); setFPhone(""); setFEmail(""); setFAddress(""); setFLeadTime("");
    setFormOpen(true);
  }

  function openEdit(v: VendorRow) {
    setEditTarget(v);
    setFName(v.name); setFGstin(v.gstin ?? ""); setFPhone(v.phone ?? ""); setFEmail(v.email ?? ""); setFAddress(v.address ?? ""); setFLeadTime(v.leadTimeDays != null ? String(v.leadTimeDays) : "");
    setFormOpen(true);
  }

  async function submit() {
    if (!fName.trim()) return toast.error("Name is required");
    setSubmitting(true);
    try {
      const payload = {
        name: fName,
        gstin: fGstin || null,
        phone: fPhone || null,
        email: fEmail || null,
        address: fAddress || null,
        leadTimeDays: fLeadTime ? Number(fLeadTime) : null,
      };
      const res = editTarget
        ? await fetch(`/api/suppliers/${editTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save vendor");
      toast.success(editTarget ? "Vendor updated" : "Vendor created");
      setFormOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  const totalBalance = vendors.reduce((s, v) => s + v.balanceOwed, 0);
  const totalSpent = vendors.reduce((s, v) => s + v.totalSpent, 0);
  const withDues = vendors.filter((v) => v.balanceOwed > 0).length;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="directory">
            <span className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Directory
            </span>
          </TabsTrigger>
          <TabsTrigger value="ratings">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Ratings
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="space-y-4">
          {vendors.length === 0 ? (
            <EmptyState
              icon={<Truck />}
              title="No vendors yet"
              description="The vendor directory is where a purchase order gets its supplier, its GSTIN and its lead time. Add one and every PO, receipt and payable lands against it."
              action={
                canManage ? (
                  <Button onClick={openCreate}>
                    <Plus className="size-4" /> Add vendor
                  </Button>
                ) : undefined
              }
              contactHint="Ask a purchase manager to add the first vendor."
            />
          ) : (
            /*
             * A vendor directory is a payables comparison, not a set of
             * profiles. Expandable cards hid the only two numbers anyone
             * opens this page for — what we owe and how much we buy — one
             * click deep and one vendor at a time. As rows they are columns
             * you can sort, total and export, so "who do we owe the most"
             * is the first row rather than twenty clicks.
             */
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                data={vendors}
                storageKey="vendors"
                searchable
                searchPlaceholder="Search name, GSTIN, phone, email…"
                hideable
                freezeFirstColumn
                exportFileName="vendors"
                columnDividers
                toolbarTrailing={
                  canManage ? (
                    <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> CSV Import
                    </Button>
                  ) : undefined
                }
                initialSort={{ key: "balanceOwed", direction: "desc" }}
                onAddRow={canManage ? openCreate : undefined}
                addRowLabel="Add vendor"
                /* The full purchase history, rate contracts and returns live
                   on the supplier cockpit — a superset of the old inline
                   expansion, so the row leads there instead of unfolding. */
                onRowClick={(v) => router.push(`/suppliers/${v.id}`)}
                showTotals
                sumColumns={["openPOs", "totalPOs", "totalSpent", "balanceOwed"]}
                totalFormat={(key, sum) =>
                  key === "openPOs" || key === "totalPOs"
                    ? sum.toLocaleString("en-IN")
                    : formatCurrency(sum)
                }
                rowTone={(v) => (v.balanceOwed > 0 ? "warning" : null)}
                rowActions={
                  canManage
                    ? (v) => (
                        <>
                          <Button variant="ghost" size="icon-sm" title="Edit vendor" onClick={() => openEdit(v)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Delete vendor"
                            className="hover:text-danger"
                            onClick={() => setDelTarget(v)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )
                    : undefined
                }
                columns={[
                  {
                    key: "name",
                    label: "Vendor",
                    sortable: true,
                    width: "260px",
                    render: (v) => (
                      <IdentityCell
                        name={v.name}
                        sub={v.gstin ? `GSTIN ${v.gstin}` : (v.address ?? "No GSTIN on file")}
                        /* Amber = we still owe them, green = settled. Same
                           status map as every pill in the app. */
                        dot={statusColor(v.balanceOwed > 0 ? "PENDING" : "PAID")}
                      />
                    ),
                  },
                  {
                    key: "phone",
                    label: "Contact",
                    sortable: true,
                    sortValue: (v) => v.phone ?? v.email ?? "",
                    render: (v) =>
                      v.phone || v.email ? (
                        <IdentityCell name={v.phone ?? v.email} sub={v.phone ? v.email : undefined} />
                      ) : (
                        <span className="text-faint">No contact</span>
                      ),
                    exportValue: (v) => v.phone ?? "",
                  },
                  {
                    key: "email",
                    label: "Email",
                    sortable: true,
                    defaultHidden: true,
                    render: (v) => v.email ?? <span className="text-faint">—</span>,
                    exportValue: (v) => v.email ?? "",
                  },
                  {
                    key: "gstin",
                    label: "GSTIN",
                    sortable: true,
                    defaultHidden: true,
                    render: (v) =>
                      v.gstin ? (
                        <span className="font-mono text-caption">{v.gstin}</span>
                      ) : (
                        <span className="text-faint">—</span>
                      ),
                    exportValue: (v) => v.gstin ?? "",
                  },
                  {
                    key: "address",
                    label: "Address",
                    defaultHidden: true,
                    render: (v) => v.address ?? <span className="text-faint">—</span>,
                    exportValue: (v) => v.address ?? "",
                  },
                  {
                    key: "openPOs",
                    label: "Open POs",
                    align: "right",
                    sortable: true,
                    hint: "Purchase orders still in draft, approved, ordered or part-received.",
                    render: (v) =>
                      v.openPOs > 0 ? (
                        <QtyCell value={v.openPOs} tone="warning" />
                      ) : (
                        <span className="text-faint">—</span>
                      ),
                    exportValue: (v) => v.openPOs,
                  },
                  {
                    key: "totalPOs",
                    label: "Total POs",
                    align: "right",
                    sortable: true,
                    render: (v) => (v.totalPOs > 0 ? v.totalPOs : <span className="text-faint">—</span>),
                    exportValue: (v) => v.totalPOs,
                  },
                  {
                    key: "lastOrder",
                    label: "Last order",
                    sortable: true,
                    hint: "Date of the most recent purchase order. A long gap is worth knowing before you renegotiate.",
                    sortValue: (v) => v.recentPOs[0]?.orderDate ?? "",
                    render: (v) =>
                      v.recentPOs[0] ? (
                        <DateCell
                          date={v.recentPOs[0].orderDate}
                          formatted={formatDate(v.recentPOs[0].orderDate)}
                        />
                      ) : (
                        <span className="text-faint">Never ordered</span>
                      ),
                    exportValue: (v) => (v.recentPOs[0] ? formatDate(v.recentPOs[0].orderDate) : ""),
                  },
                  {
                    key: "leadTimeDays",
                    label: "Lead time",
                    align: "right",
                    sortable: true,
                    hint: "Agreed days from order to delivery — the number a requisition's urgency is judged against.",
                    render: (v) =>
                      v.leadTimeDays != null ? (
                        <QtyCell value={v.leadTimeDays} unit="days" />
                      ) : (
                        <span className="text-faint">—</span>
                      ),
                    exportValue: (v) => v.leadTimeDays ?? "",
                  },
                  {
                    key: "totalSpent",
                    label: "Spent",
                    align: "right",
                    sortable: true,
                    hint: "Value of this vendor's ten most recent purchase orders.",
                    render: (v) => (
                      <MoneyCell value={v.totalSpent} formatted={formatCurrency(v.totalSpent)} neutral />
                    ),
                    exportValue: (v) => v.totalSpent,
                  },
                  {
                    key: "balanceOwed",
                    label: "Owed",
                    align: "right",
                    sortable: true,
                    bar: true,
                    hint: "Unpaid balance against received goods. This is money leaving the company.",
                    render: (v) =>
                      v.balanceOwed > 0 ? (
                        /* A payable is a negative for us, so the sign fed to
                           MoneyCell is flipped to get the danger tone, while
                           the printed figure stays the amount a clerk pays. */
                        <MoneyCell
                          value={-v.balanceOwed}
                          formatted={formatCurrency(v.balanceOwed)}
                          sub="unpaid"
                        />
                      ) : (
                        <span className="text-caption text-muted-foreground">Settled</span>
                      ),
                    exportValue: (v) => v.balanceOwed,
                  },
                ]}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="ratings">
          <VendorRatingsView />
        </TabsContent>
      </Tabs>

      {/* Create/Edit dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editTarget ? "Edit Vendor" : "Add Vendor"}
        description="Supplier directory entry — name, GSTIN, contact, and lead time."
      >
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Supplier / vendor name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>GSTIN</Label>
              <Input value={fGstin} onChange={(e) => setFGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <Label>Lead time (days)</Label>
              <Input type="number" value={fLeadTime} onChange={(e) => setFLeadTime(e.target.value)} placeholder="7" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Textarea value={fAddress} onChange={(e) => setFAddress(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Saving…" : editTarget ? "Save Changes" : "Add Vendor"}
            </Button>
          </div>
        </div>
      </Dialog>

      {delTarget && (
        <DeleteConfirmDialog
          open={delTarget !== null}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/suppliers/${delTarget.id}`}
          title="Delete vendor"
          description={`Delete "${delTarget.name}"? Suppliers with open purchase orders cannot be deleted.`}
          successMessage="Vendor deleted"
          onSuccess={() => { setDelTarget(null); }}
        />
      )}

      <GenericCsvImportDialog
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        endpoint="/api/suppliers"
        entityName="Supplier"
        templateHeaders="name,gstin,phone,email,address,leadTimeDays"
        templateSample="ABC Cement Pvt Ltd,27ABCDE1234F1Z5,9876543210,orders@abccement.com,123 Industrial Area Mumbai,7"
        fieldMap={{
          name: "name",
          gstin: "gstin",
          phone: "phone",
          email: "email",
          address: "address",
          leadTimeDays: "leadTimeDays",
        }}
        numericFields={["leadTimeDays"]}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
