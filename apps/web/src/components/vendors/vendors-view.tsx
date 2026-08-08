"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck, Plus, Pencil, Trash2, ChevronDown, ChevronRight, ShieldCheck, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { VendorRatingsView } from "@/components/vendor-ratings/vendor-ratings-view";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill, MetricGrid, Metric } from "@/components/page";
import { formatCurrency, formatDate } from "@/lib/utils";

/** Column definitions for the recent purchase orders DataTable. */
const vendorPOColumns: Column<VendorRow["recentPOs"][number]>[] = [
  {
    key: "poNumber",
    label: "PO No.",
    sortable: true,
    render: (p) => <span className="font-mono text-caption font-medium text-foreground">{p.poNumber}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (p) => <StatusPill status={p.status} />,
  },
  {
    key: "orderDate",
    label: "Date",
    sortable: true,
    sortValue: (p) => new Date(p.orderDate),
    render: (p) => <span className="tnum text-muted-foreground">{formatDate(p.orderDate)}</span>,
  },
  {
    key: "total",
    label: "Total",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum font-medium text-foreground">{formatCurrency(p.total)}</span>,
  },
];

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
  const canManage = permissions?.canManage ?? true;
  const [tab, setTab] = useState("directory");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VendorRow | null>(null);
  const [delTarget, setDelTarget] = useState<VendorRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fName, setFName] = useState("");
  const [fGstin, setFGstin] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fLeadTime, setFLeadTime] = useState("");
  const [query, setQuery] = useState("");

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

  const filteredVendors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      (v.gstin ?? "").toLowerCase().includes(q) ||
      (v.phone ?? "").includes(q) ||
      (v.email ?? "").toLowerCase().includes(q),
    );
  }, [vendors, query]);

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
          <MetricGrid cols={3}>
            <Metric label="Total Suppliers" value={vendors.length} icon={<Truck />} />
            <Metric label="With Dues" value={withDues} tone={withDues > 0 ? "warning" : "muted"} />
            <Metric label="Total Owed" value={formatCurrency(totalBalance)} tone={totalBalance > 0 ? "danger" : "muted"} sub={`${formatCurrency(totalSpent)} spent`} />
          </MetricGrid>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suppliers…" className="pl-8" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
              {canManage && vendors.length > 0 && (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Vendor
                </Button>
              )}
            </div>
          </div>

          {/* List */}
          {filteredVendors.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-5 w-5" />}
              title={vendors.length === 0 ? "No vendors" : "No vendors match the search"}
              description="Add suppliers to track purchase orders, GSTINs, and outstanding balances."
              action={canManage ? <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" /> Add Vendor</Button> : undefined}
            />
          ) : (
            <div className="space-y-2">
              {filteredVendors.map((v) => (
            <div key={v.id} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/20"
              >
                {expanded === v.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{v.name}</span>
                    {v.gstin && <Badge variant="outline">GSTIN: {v.gstin}</Badge>}
                    {v.openPOs > 0 && <Badge variant="warning">{v.openPOs} open PO{v.openPOs !== 1 ? "s" : ""}</Badge>}
                  </div>
                  <div className="text-meta text-muted-foreground">
                    {v.phone ?? "No phone"} · {v.totalPOs} PO{v.totalPOs !== 1 ? "s" : ""}
                    {v.leadTimeDays != null && ` · ${v.leadTimeDays}d lead time`}
                  </div>
                </div>
                <div className="text-right">
                  {v.balanceOwed > 0 ? (
                    <>
                      <div className="text-body font-medium text-danger">{formatCurrency(v.balanceOwed)}</div>
                      <div className="text-caption text-muted-foreground">owed</div>
                    </>
                  ) : (
                    <div className="text-body text-muted-foreground">Settled</div>
                  )}
                </div>
              </button>

              {expanded === v.id && (
                <div className="border-t border-border p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-meta sm:grid-cols-4">
                    <div><div className="text-muted-foreground">Email</div><div className="text-foreground">{v.email ?? "—"}</div></div>
                    <div><div className="text-muted-foreground">Phone</div><div className="text-foreground">{v.phone ?? "—"}</div></div>
                    <div><div className="text-muted-foreground">Address</div><div className="text-foreground">{v.address ?? "—"}</div></div>
                    <div><div className="text-muted-foreground">Recent spend</div><div className="text-foreground">{formatCurrency(v.totalSpent)}</div></div>
                  </div>

                  {/* Recent POs */}
                  <div className="space-y-2">
                    <div className="text-caption font-medium text-muted-foreground">Recent purchase orders</div>
                    {v.recentPOs.length === 0 ? (
                      <div className="rounded-lg border border-border px-3 py-3 text-meta text-muted-foreground">No purchase orders yet.</div>
                    ) : (
                      <div className="rounded-lg border border-border overflow-hidden">
                        <DataTable data={v.recentPOs} columns={vendorPOColumns} getRowId={(p) => p.id} />
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/suppliers/${v.id}`}>View Details</Link>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(v)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDelTarget(v)} title="Delete vendor">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {!canManage && (
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/suppliers/${v.id}`}>View Details</Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
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
    </div>
  );
}
