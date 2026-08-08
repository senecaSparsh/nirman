"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Layers, PencilRuler, Pencil, Pause, Play, Trash2, CircleDollarSign,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { statusColor } from "@/components/page";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { LandParcelRow } from "@/lib/types";

type ParcelTreeNode = LandParcelRow & { children: ParcelTreeNode[] };

function buildTree(parcels: LandParcelRow[]): ParcelTreeNode[] {
  const byId = new Map<string, ParcelTreeNode>(
    parcels.map((p) => [p.id, { ...p, children: [] }]),
  );
  const roots: ParcelTreeNode[] = [];
  for (const p of parcels) {
    const node = byId.get(p.id)!;
    if (p.parentParcelId && byId.has(p.parentParcelId)) {
      byId.get(p.parentParcelId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: ParcelTreeNode[]) => {
    nodes.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
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

  if (parcels.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        title="No parcels yet"
        description="Record a land purchase to create the first parcel, then partition it into sellable sub-plots."
      />
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node, i) => (
        <ParcelNode
          key={node.id}
          node={node}
          depth={0}
          isLast={i === tree.length - 1}
          canPartition={canPartition}
          canSell={canSell}
          onPartition={onPartition}
          onCanvasPartition={onCanvasPartition}
          onValuate={onValuate}
          onSell={onSell}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function ParcelNode({
  node,
  depth,
  isLast,
  canPartition,
  canSell,
  onPartition,
  onCanvasPartition,
  onValuate,
  onSell,
  onDelete,
}: {
  node: ParcelTreeNode;
  depth: number;
  isLast: boolean;
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
  const [expanded, setExpanded] = useState(true);

  const hasChildren = node.children.length > 0;
  const color = statusColor(node.status);

  async function toggleStatus() {
    setActing(true);
    try {
      const action = node.status === "AVAILABLE" ? "hold" : "release";
      const res = await fetch(`/api/land-parcels/${node.id}`, {
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
    <div>
      <div
        className="group relative flex items-center gap-2.5 rounded-md py-2 transition-colors hover:bg-muted/30"
        style={{ paddingLeft: depth * 24 }}
      >
        {/* Tree connector — SVG elbow for children */}
        {depth > 0 && (
          <svg
            className="absolute shrink-0"
            width={24}
            height={20}
            style={{ left: depth * 24 - 24, top: 4 }}
          >
            {isLast ? (
              <path d="M 12 0 L 12 10 L 20 10" fill="none" stroke="var(--color-border)" strokeWidth={1} />
            ) : (
              <>
                <path d="M 12 0 L 12 20" fill="none" stroke="var(--color-border)" strokeWidth={1} />
                <path d="M 12 10 L 20 10" fill="none" stroke="var(--color-border)" strokeWidth={1} />
              </>
            )}
          </svg>
        )}

        {/* Expand toggle */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className={expanded ? "" : "rotate-[-90deg]"}>
              <path d="M 2 3 L 5 7 L 8 3" fill="none" stroke="currentColor" strokeWidth={1.5} />
            </svg>
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}

        {/* Status dot — colored by status. The dot IS the status indicator, no text badge. */}
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          title={node.status}
        />

        {/* Parcel number — mono, the identity */}
        <span className="shrink-0 font-mono text-caption font-medium text-foreground">{node.number}</span>

        {/* Inline data — varies by status to avoid showing meaningless numbers */}
        <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-0 text-caption text-muted-foreground tnum">
          <span>{formatNumber(node.area, 0)} {node.areaUnit}</span>
          {node.status === "PARTITIONED" ? (
            <span className="text-muted-foreground/60">
              split into {node.childCount} sub-parcel{node.childCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <>
              <span>val {formatCurrency(node.currentValuation)}</span>
              {node.askingPrice && <span>ask {formatCurrency(node.askingPrice)}</span>}
              {node.status === "SOLD" && node.salePrice != null && (
                <span className="text-danger">sold {formatCurrency(node.salePrice)}</span>
              )}
            </>
          )}
          {node.projectName && <span className="text-muted-foreground/60">· {node.projectName}</span>}
        </div>

        {/* Actions — hover only */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {node.status === "AVAILABLE" && (
            <>
              {canSell && (
                <button onClick={() => onSell(node)} disabled={acting} className="rounded p-1 text-brand hover:bg-brand/10" title="Sell parcel">
                  <CircleDollarSign className="h-3.5 w-3.5" />
                </button>
              )}
              {canPartition && (
                <>
                  <button onClick={() => onPartition(node)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Partition (form)">
                    <Layers className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => onCanvasPartition(node)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Partition (canvas)">
                    <PencilRuler className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button onClick={toggleStatus} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Put on hold">
                <Pause className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onValuate(node)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit valuation">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {onDelete && (
                <button onClick={() => onDelete(node)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Delete parcel">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
          {node.status === "HOLD" && (
            <>
              {canSell && (
                <button onClick={() => onSell(node)} disabled={acting} className="rounded p-1 text-brand hover:bg-brand/10" title="Sell parcel">
                  <CircleDollarSign className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={toggleStatus} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Release hold">
                <Play className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onValuate(node)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit valuation">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {onDelete && (
                <button onClick={() => onDelete(node)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Delete parcel">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
          {(node.status === "PARTITIONED" || node.status === "SOLD") && (
            <button onClick={() => onValuate(node)} disabled={acting} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Edit valuation">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {node.children.map((child, i) => (
            <ParcelNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              canPartition={canPartition}
              canSell={canSell}
              onPartition={onPartition}
              onCanvasPartition={onCanvasPartition}
              onValuate={onValuate}
              onSell={onSell}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
