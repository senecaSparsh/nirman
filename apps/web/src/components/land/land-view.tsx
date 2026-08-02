"use client";

import { useMemo, useState } from "react";
import { Plus, Search, X, LandPlot, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { LandPurchaseFormDialog } from "./land-purchase-form-dialog";
import { PartitionDialog } from "./partition-dialog";
import { PartitionCanvasDialog } from "./partition-canvas-dialog";
import { ParcelValuationDialog } from "./parcel-valuation-dialog";
import { LandPortfolioStrip } from "./land-portfolio-strip";
import { LandPurchaseRow } from "./land-purchase-row";
import { ParcelsTree } from "./parcels-tree";
import { LandDetailDrawer } from "./land-detail-drawer";
import { CadastreLegend } from "./cadastre-plan";
import type {
  LandPurchaseRow as LandPurchaseRowType, LandParcelRow, LandParcelSummary, LandPortfolio, ProjectOption,
} from "@/lib/types";

export function LandView({
  purchases,
  parcels,
  parcelSummaries,
  projects,
  portfolio,
  permissions,
}: {
  purchases: LandPurchaseRowType[];
  parcels: LandParcelRow[];
  parcelSummaries: LandParcelSummary[];
  projects: ProjectOption[];
  portfolio: LandPortfolio;
  permissions?: { canCreate?: boolean; canEdit?: boolean; canPartition?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? true;
  const canEdit = permissions?.canEdit ?? true;
  const canPartition = permissions?.canPartition ?? true;

  const [tab, setTab] = useState("purchases");
  const [purchaseFilter, setPurchaseFilter] = useState<string | null>(null);
  const [quickView, setQuickView] = useState<LandPurchaseRowType | null>(null);

  const [partitionParcel, setPartitionParcel] = useState<LandParcelRow | null>(null);
  const [canvasParcel, setCanvasParcel] = useState<LandParcelRow | null>(null);
  const [valuateParcel, setValuateParcel] = useState<LandParcelRow | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LandPurchaseRowType | null>(null);

  return (
    <div className="space-y-6">
      <LandPortfolioStrip portfolio={portfolio} parcels={parcelSummaries} />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="purchases">
              <span className="flex items-center gap-1.5"><LandPlot className="h-3.5 w-3.5" /> Purchases</span>
            </TabsTrigger>
            <TabsTrigger value="parcels">
              <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Parcels</span>
            </TabsTrigger>
          </TabsList>

          {canCreate && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> New Purchase
            </Button>
          )}
        </div>

        <TabsContent value="purchases">
          <PurchasesTab
            purchases={purchases}
            canCreate={canCreate}
            canEdit={canEdit}
            onNew={() => { setEditing(null); setFormOpen(true); }}
            onQuickView={setQuickView}
            onEdit={(p) => { setEditing(p); setFormOpen(true); }}
          />
        </TabsContent>

        <TabsContent value="parcels">
          <ParcelsTab
            parcels={parcels}
            canPartition={canPartition}
            purchaseFilter={purchaseFilter}
            onClearFilter={() => setPurchaseFilter(null)}
            onPartition={setPartitionParcel}
            onCanvasPartition={setCanvasParcel}
            onValuate={setValuateParcel}
          />
        </TabsContent>
      </Tabs>

      <LandDetailDrawer purchase={quickView} onClose={() => setQuickView(null)} />

      <LandPurchaseFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        projects={projects}
        editing={editing}
      />
      <PartitionDialog
        open={partitionParcel != null}
        onOpenChange={(o) => !o && setPartitionParcel(null)}
        parcel={partitionParcel}
      />
      <PartitionCanvasDialog
        open={canvasParcel != null}
        onOpenChange={(o) => !o && setCanvasParcel(null)}
        parcel={canvasParcel}
      />
      <ParcelValuationDialog
        open={valuateParcel != null}
        onOpenChange={(o) => !o && setValuateParcel(null)}
        parcel={valuateParcel}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Purchases tab — list rows with cadastre thumbnails
// ───────────────────────────────────────────────────────────

function PurchasesTab({
  purchases,
  canCreate,
  canEdit,
  onNew,
  onQuickView,
  onEdit,
}: {
  purchases: LandPurchaseRowType[];
  canCreate: boolean;
  canEdit: boolean;
  onNew: () => void;
  onQuickView: (p: LandPurchaseRowType) => void;
  onEdit: (p: LandPurchaseRowType) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => purchases.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.sellerName.toLowerCase().includes(q) && !(p.projectName ?? "").toLowerCase().includes(q) && !(p.location ?? "").toLowerCase().includes(q)) {
        return false;
      }
    }
    if (status === "available" && p.availableCount === 0) return false;
    if (status === "sold" && p.soldCount === 0) return false;
    if (status === "subdivided" && !p.hasChildren) return false;
    return true;
  }), [purchases, search, status]);

  if (purchases.length === 0) {
    return (
      <EmptyState
        icon={<LandPlot className="h-5 w-5" />}
        title="No land purchases yet"
        description="Record your first land purchase to start tracking land inventory. A purchase creates an initial parcel covering the full area, which you can partition into sellable sub-plots."
        action={
          canCreate ? (
            <Button size="sm" onClick={onNew}>
              <Plus className="h-4 w-4" /> New Purchase
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search seller, project, location…"
            className="pl-8"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:max-w-[160px]">
          <option value="">All purchases</option>
          <option value="available">Has available</option>
          <option value="sold">Has sold</option>
          <option value="subdivided">Subdivided</option>
        </Select>
        {(search || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatus(""); }} className="text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<LandPlot className="h-5 w-5" />}
          title="No purchases match the filters"
          description="Try adjusting your search or filters."
        />
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((p) => (
            <LandPurchaseRow
              key={p.id}
              purchase={p}
              canEdit={canEdit}
              onQuickView={() => onQuickView(p)}
              onEdit={() => onEdit(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Parcels tab — hierarchical tree with filters
// ───────────────────────────────────────────────────────────

function ParcelsTab({
  parcels,
  canPartition,
  purchaseFilter,
  onClearFilter,
  onPartition,
  onCanvasPartition,
  onValuate,
}: {
  parcels: LandParcelRow[];
  canPartition: boolean;
  purchaseFilter: string | null;
  onClearFilter: () => void;
  onPartition: (p: LandParcelRow) => void;
  onCanvasPartition: (p: LandParcelRow) => void;
  onValuate: (p: LandParcelRow) => void;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let scope = parcels;
    if (purchaseFilter) {
      const inTree = new Set<string>();
      const addDescendants = (id: string) => {
        parcels.filter((p) => p.parentParcelId === id).forEach((c) => {
          inTree.add(c.id);
          addDescendants(c.id);
        });
      };
      parcels.filter((p) => p.landPurchaseId === purchaseFilter).forEach((p) => {
        inTree.add(p.id);
        addDescendants(p.id);
      });
      scope = parcels.filter((p) => inTree.has(p.id));
    }
    return scope.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.number.toLowerCase().includes(q) && !(p.projectName ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [parcels, purchaseFilter, statusFilter, search]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parcel number, project…"
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[160px]">
          <option value="">All statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="HOLD">Hold</option>
          <option value="PARTITIONED">Partitioned</option>
          <option value="SOLD">Sold</option>
        </Select>
        {(statusFilter || search || purchaseFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(""); setSearch(""); onClearFilter(); }} className="text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      {purchaseFilter && (
        <div className="inline-flex items-center gap-2 text-caption">
          <span className="text-muted-foreground">Filtered to one purchase&apos;s tree</span>
          <button type="button" className="text-muted-foreground transition-colors hover:text-foreground" onClick={onClearFilter} title="Clear filter">
            ✕
          </button>
        </div>
      )}

      {/* Count (only when filtered — otherwise the tree is self-evident) + legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {(statusFilter || search || purchaseFilter) && (
          <span className="text-caption text-muted-foreground tnum">
            {filtered.length} of {parcels.length} parcels
          </span>
        )}
        <CadastreLegend />
      </div>

      <ParcelsTree
        parcels={filtered}
        canPartition={canPartition}
        onPartition={onPartition}
        onCanvasPartition={onCanvasPartition}
        onValuate={onValuate}
      />
    </div>
  );
}
