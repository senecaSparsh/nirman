"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { History, Loader2, ExternalLink, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { entityUrl } from "@/lib/entity-url";

type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  userName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
};

const ENTITY_TYPES = [
  "PurchaseOrder", "MaterialRequisition", "GoodsReceipt", "MaterialIssue",
  "StockTransfer", "AssetSale", "MaterialSale", "ProjectCost", "Expense",
  "Supplier", "Customer", "Material", "Project", "BuiltUnit", "LandPurchase",
  "DailyProgressReport", "PayrollPeriod", "StockCount", "Equipment",
  "SupplierReturn", "ScrapGeneration", "VendorQuote", "RaBill",
];

const ACTION_TYPES = [
  "CREATE", "UPDATE", "DELETE", "RESTORE",
  "APPROVE", "REJECT", "SUBMIT", "RESUBMIT",
  "ORDER", "RECEIVE", "CANCEL", "COMPLETE",
  "ASSIGN", "RETURN", "RETIRE", "CONFIRM", "RECONCILE",
  "CONVERT", "PARTITION", "VALUATION", "STATUS",
  "WAIVE_QUOTES", "SELECT_QUOTE",
];

export function AuditTrailView({ users }: { users: { id: string; name: string }[] }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    entityType: "",
    action: "",
    userId: "",
    startDate: "",
    endDate: "",
  });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ all: "true" });
      if (filters.entityType) params.set("entityType", filters.entityType);
      if (filters.action) params.set("action", filters.action);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);
      const res = await fetch(`/api/audit?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load audit trail");
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const columns: Column<AuditEntry>[] = [
    {
      key: "createdAt",
      label: "Time",
      sortable: true,
      sortValue: (e) => new Date(e.createdAt),
      render: (e) => (
        <div>
          <div className="tnum text-caption">{formatDate(e.createdAt)}</div>
          <div className="text-micro text-muted-foreground">{formatRelativeTime(new Date(e.createdAt))}</div>
        </div>
      ),
      exportValue: (e) => e.createdAt,
    },
    {
      key: "action",
      label: "Action",
      sortable: true,
      filterable: true,
      render: (e) => {
        const tone =
          e.action.includes("CREATE") ? "text-success" :
          e.action.includes("DELETE") || e.action.includes("CANCEL") || e.action.includes("REJECT") ? "text-danger" :
          e.action.includes("APPROVE") || e.action.includes("COMPLETE") ? "text-info" :
          "text-muted-foreground";
        return <span className={`text-caption font-mono font-medium ${tone}`}>{e.action}</span>;
      },
      filterValue: (e) => e.action,
      exportValue: (e) => e.action,
    },
    {
      key: "entityType",
      label: "Entity",
      sortable: true,
      filterable: true,
      render: (e) => {
        const url = entityUrl(e.entityType, e.entityId);
        return url ? (
          <Link
            href={url}
            className="inline-flex items-center gap-1 text-brand hover:underline"
          >
            {e.entityType}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="text-muted-foreground">{e.entityType}</span>
        );
      },
      filterValue: (e) => e.entityType,
      exportValue: (e) => e.entityType,
    },
    {
      key: "userName",
      label: "User",
      sortable: true,
      render: (e) => <span className="text-body">{e.userName ?? "System"}</span>,
      exportValue: (e) => e.userName ?? "System",
    },
    {
      key: "changes",
      label: "Changes",
      render: (e) => <AuditDiff before={e.before} after={e.after} />,
      exportValue: (e) => {
        const parts: string[] = [];
        if (e.before) parts.push(`Before: ${JSON.stringify(e.before)}`);
        if (e.after) parts.push(`After: ${JSON.stringify(e.after)}`);
        return parts.join(" | ") || "—";
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-body font-medium">Filters</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-caption">Entity Type</Label>
              <Select
                value={filters.entityType}
                onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
              >
                <option value="">All entities</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-caption">Action</Label>
              <Select
                value={filters.action}
                onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              >
                <option value="">All actions</option>
                {ACTION_TYPES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-caption">User</Label>
              <Select
                value={filters.userId}
                onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
              >
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-caption">Start Date</Label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-caption">End Date</Label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={fetchEntries} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply Filters"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit log table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="No audit entries"
              description="No activity matches your filters. Try adjusting the date range or entity type."
            />
          ) : (
            <DataTable
              columns={columns}
              data={entries}
              pageSize={25}
              exportFileName="audit-trail"
              searchable
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditDiff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before && !after) return <span className="text-muted-foreground">—</span>;
  if (!before && after) {
    const keys = Object.keys(after).slice(0, 4);
    return (
      <div className="space-y-0.5">
        <span className="text-success text-caption font-medium">created</span>
        {keys.map((k) => (
          <div key={k} className="text-micro text-muted-foreground">
            <span className="font-medium text-foreground">{k}:</span> {String(after[k]).slice(0, 50)}
          </div>
        ))}
        {Object.keys(after).length > 4 && (
          <div className="text-micro text-muted-foreground/60">+{Object.keys(after).length - 4} more</div>
        )}
      </div>
    );
  }
  if (before && !after) {
    return <span className="text-danger text-caption font-medium">deleted</span>;
  }
  if (before && after) {
    const changedKeys = Object.keys(after).filter((k) =>
      JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    ).slice(0, 4);
    if (changedKeys.length === 0) return <span className="text-muted-foreground text-caption">no changes</span>;
    return (
      <div className="space-y-0.5">
        {changedKeys.map((k) => (
          <div key={k} className="text-micro">
            <span className="font-medium text-foreground">{k}:</span>{" "}
            <span className="text-muted-foreground line-through">{String(before[k]).slice(0, 30)}</span>
            {" → "}
            <span className="text-success">{String(after[k]).slice(0, 30)}</span>
          </div>
        ))}
        {Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).length > 4 && (
          <div className="text-micro text-muted-foreground/60">
            +{Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).length - 4} more
          </div>
        )}
      </div>
    );
  }
  return null;
}
