"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Layers, PencilRuler, Pencil, Pause, Play, Trash2, CircleDollarSign,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatNumber, formatDate, cn } from "@/lib/utils";
import type { LandParcelRow } from "@/lib/types";

/** Flattened row — the tree is flattened into a list with depth + parent info. */
type FlatParcel = LandParcelRow & { _depth: number; _hasChildren: boolean };

type TreeNode = LandParcelRow & { children: TreeNode[] };

function buildTree(parcels: LandParcelRow[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(
    parcels.map((p) => [p.id, { ...p, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const p of parcels) {
    const node = byId.get(p.id)!;
    if (p.parentParcelId && byId.has(p.parentParcelId)) {
      byId.get(p.parentParcelId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Flatten the tree, but only include children of expanded parents. */
function flattenVisible(roots: TreeNode[], expanded: Set<string>): FlatParcel[] {
  const flat: FlatParcel[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      const hasChildren = n.children.length > 0;
      flat.push({ ...n, _depth: depth, _hasChildren: hasChildren });
      if (hasChildren && expanded.has(n.id)) {
        walk(n.children, depth + 1);
      }
    }
  };
  walk(roots, 0);
  return flat;
}

export function ParcelsTree({
  parcels,
  canPartition,
  canSell,
  onPartition,
  onCanvasPartition,
  onValuate,
  onSell,
  onDelete,
}: {
  parcels: LandParcelRow[];
  canPartition: boolean;
  canSell: boolean;
  onPartition: (p: LandParcelRow) => void;
  onCanvasPartition: (p: LandParcelRow) => void;
  onValuate: (p: LandParcelRow) => void;
  onSell: (p: LandParcelRow) => void;
  onDelete?: (p: LandParcelRow) => void;
}) {
  const tree = useMemo(() => buildTree(parcels), [parcels]);
  // Default: all parents with children expanded
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) ids.add(n.id);
        collect(n.children);
      }
    };
    collect(tree);
    return ids;
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const flat = useMemo(() => flattenVisible(tree, expanded), [tree, expanded]);

  if (parcels.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        title="No parcels yet"
        description="Record a land purchase to create the first parcel, then partition it into sellable sub-plots."
      />
    );
  }

  const columns: Column<FlatParcel>[] = [
    {
      key: "number",
      label: "Parcel",
      sortable: true,
      sortValue: (p) => p.number,
      render: (p) => (
        <div className="flex items-center gap-2" style={{ paddingLeft: p._depth * 20 }}>
          {p._hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" className={expanded.has(p.id) ? "" : "rotate-[-90deg]"}>
                <path d="M 2 3 L 5 7 L 8 3" fill="none" stroke="currentColor" strokeWidth={1.5} />
              </svg>
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}
          <span className="font-mono text-body font-semibold text-foreground">{p.number}</span>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (p) => {
        if (p.status === "PARTITIONED") {
          return (
            <span className="text-caption text-muted-foreground">
              {p.childCount} sub-parcel{p.childCount !== 1 ? "s" : ""}
            </span>
          );
        }
        return <StatusPill status={p.status} />;
      },
    },
    {
      key: "area",
      label: "Area",
      align: "right",
      sortable: true,
      render: (p) =>
        p.status === "PARTITIONED" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tnum text-muted-foreground">
            {formatNumber(p.area, 0)} <span className="text-micro">{p.areaUnit}</span>
          </span>
        ),
    },
    {
      key: "currentValuation",
      label: "Valuation",
      align: "right",
      sortable: true,
      render: (p) =>
        p.status === "PARTITIONED" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tnum font-medium text-foreground">{formatCurrency(p.currentValuation)}</span>
        ),
    },
    {
      key: "askingPrice",
      label: "Asking",
      align: "right",
      render: (p) =>
        p.askingPrice ? (
          <span className="tnum text-muted-foreground">{formatCurrency(p.askingPrice)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "salePrice",
      label: "Sold Price",
      align: "right",
      sortable: true,
      sortValue: (p) => p.salePrice ?? 0,
      render: (p) =>
        p.salePrice != null ? (
          <span className="tnum font-medium text-foreground">{formatCurrency(p.salePrice)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      exportValue: (p) => p.salePrice ?? "",
    },
    {
      key: "saleProfit",
      label: "Profit",
      align: "right",
      sortable: true,
      sortValue: (p) => p.saleProfit ?? 0,
      render: (p) =>
        p.saleProfit != null ? (
          <span className={cn("tnum font-medium", p.saleProfit >= 0 ? "text-success" : "text-danger")}>
            {p.saleProfit >= 0 ? "+" : ""}{formatCurrency(p.saleProfit)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      exportValue: (p) => p.saleProfit ?? "",
    },
    {
      key: "customerName",
      label: "Buyer",
      render: (p) =>
        p.customerName ? (
          <span className="text-foreground">{p.customerName}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      exportValue: (p) => p.customerName ?? "",
    },
    {
      key: "saleDate",
      label: "Sale Date",
      sortable: true,
      sortValue: (p) => (p.saleDate ? new Date(p.saleDate).getTime() : 0),
      render: (p) =>
        p.saleDate ? (
          <span className="tnum text-muted-foreground">{formatDate(p.saleDate)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      exportValue: (p) => (p.saleDate ? formatDate(p.saleDate) : ""),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      noExport: true,
      render: (p) => (
        <ParcelActions
          parcel={p}
          canPartition={canPartition}
          canSell={canSell}
          onPartition={onPartition}
          onCanvasPartition={onCanvasPartition}
          onValuate={onValuate}
          onSell={onSell}
          onDelete={onDelete}
        />
      ),
    },
  ];

  return (
    <DataTable
      data={flat}
      columns={columns}
      getRowId={(p) => p.id}
      storageKey="land-parcels-tree"
      hideable
      exportFileName="land-parcels"
      searchable
      searchPlaceholder="Search parcel, status, buyer…"
      pageSize={50}
    />
  );
}

function ParcelActions({
  parcel,
  canPartition,
  canSell,
  onPartition,
  onCanvasPartition,
  onValuate,
  onSell,
  onDelete,
}: {
  parcel: FlatParcel;
  canPartition: boolean;
  canSell: boolean;
  onPartition: (p: LandParcelRow) => void;
  onCanvasPartition: (p: LandParcelRow) => void;
  onValuate: (p: LandParcelRow) => void;
  onSell: (p: LandParcelRow) => void;
  onDelete?: (p: LandParcelRow) => void;
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);

  async function toggleStatus() {
    setActing(true);
    try {
      const action = parcel.status === "AVAILABLE" ? "hold" : "release";
      const res = await fetch(`/api/land-parcels/${parcel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Status change failed");
      toast.success(action === "hold" ? "Parcel put on hold" : "Parcel released");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {parcel.status === "AVAILABLE" && (
        <>
          {canSell && (
            <button onClick={() => onSell(parcel)} disabled={acting} className="rounded p-1 text-brand hover:bg-brand/10" title="Sell parcel">
              <CircleDollarSign className="h-3.5 w-3.5" />
            </button>
          )}
          {canPartition && (
            <>
              <button onClick={() => onPartition(parcel)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Partition (form)">
                <Layers className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onCanvasPartition(parcel)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Partition (canvas)">
                <PencilRuler className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button onClick={toggleStatus} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Put on hold">
            <Pause className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onValuate(parcel)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button onClick={() => onDelete(parcel)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Delete parcel">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
      {parcel.status === "HOLD" && (
        <>
          {canSell && (
            <button onClick={() => onSell(parcel)} disabled={acting} className="rounded p-1 text-brand hover:bg-brand/10" title="Sell parcel">
              <CircleDollarSign className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={toggleStatus} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Release hold">
            <Play className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onValuate(parcel)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button onClick={() => onDelete(parcel)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Delete parcel">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
      {(parcel.status === "PARTITIONED" || parcel.status === "SOLD") && (
        <button onClick={() => onValuate(parcel)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
