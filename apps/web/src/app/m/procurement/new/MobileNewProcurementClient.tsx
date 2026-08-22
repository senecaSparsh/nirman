"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, CheckCircle2,
  Search, X, ChevronRight, Truck, Building2, Package, MapPin,
  Send, Calendar, WifiOff,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useDrafts } from "@/lib/offline/use-drafts";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";

interface SupplierItem { id: string; name: string; phone?: string | null; }
interface ProjectItem { id: string; name: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; gstRate: number; }
interface LocationItem { id: string; name: string; type: string; projectId: string | null; }
interface CategoryItem { id: string; name: string; unit: string; }

interface FormData {
  suppliers: SupplierItem[];
  projects: ProjectItem[];
  materials: MaterialItem[];
  locations: LocationItem[];
  categories: CategoryItem[];
}

interface PoLine {
  materialId: string;
  qty: string;
  unitCost: string;
  gstRate: string;
}

interface PoCharge {
  heading: string;
  amount: string;
  notes: string;
}

type Scope = "COMPANY" | "PROJECT";

interface PoDraft {
  supplierId: string;
  scope: Scope;
  projectId: string;
  destinationLocationId: string;
  expectedDate: string;
  notes: string;
  lines: PoLine[];
  charges: PoCharge[];
}

export default function MobileNewProcurementClient({ data }: { data: FormData }) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const { categories } = data;
  const [suppliers, setSuppliers] = useState<SupplierItem[]>(data.suppliers);
  const [projects, setProjects] = useState<ProjectItem[]>(data.projects);
  const [materials, setMaterials] = useState<MaterialItem[]>(data.materials);
  const [locations, setLocations] = useState<LocationItem[]>(data.locations);

  const [submitting, setSubmitting] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [scope, setScope] = useState<Scope>("COMPANY");
  const [projectId, setProjectId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PoLine[]>(
    [{ materialId: materials[0]?.id ?? "", qty: "", unitCost: "", gstRate: String(materials[0]?.gstRate ?? 0) }],
  );
  const [charges, setCharges] = useState<PoCharge[]>([]);

  const [success, setSuccess] = useState<{ poNumber: string; total: number } | null>(null);
  // Track last-purchase-price source per line for the "auto-filled from last PO" hint
  const [lastPriceHint, setLastPriceHint] = useState<Record<number, { poNumber: string; date: string } | null>>({});

  // Draft auto-save
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<PoDraft>(
    "purchase-order",
    "purchase-order-new",
  );
  const [draftRestored, setDraftRestored] = useState(false);

  // Locations available for the selected scope
  const availableLocations = useMemo(() => {
    if (scope === "COMPANY") {
      return locations.filter((l) => l.type === "COMPANY_WAREHOUSE");
    }
    return locations.filter((l) => l.type === "PROJECT_SITE" && (!projectId || l.projectId === projectId));
  }, [locations, scope, projectId]);

  // Auto-clear location if it's no longer valid for the scope
  useEffect(() => {
    if (locationId && !availableLocations.find((l) => l.id === locationId)) {
      setLocationId(availableLocations[0]?.id ?? "");
    }
  }, [availableLocations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save draft
  useEffect(() => {
    if (success) return;
    saveDraft({ supplierId, scope, projectId, destinationLocationId: locationId, expectedDate, notes, lines, charges });
  }, [supplierId, scope, projectId, locationId, expectedDate, notes, lines, charges, success, saveDraft]);

  function restoreDraftState() {
    if (!draft) return;
    setSupplierId(draft.supplierId);
    setScope(draft.scope);
    setProjectId(draft.projectId);
    setLocationId(draft.destinationLocationId);
    setExpectedDate(draft.expectedDate);
    setNotes(draft.notes);
    setLines(draft.lines);
    if (draft.charges) setCharges(draft.charges);
    setDraftRestored(true);
  }

  const handleAddLine = () => {
    setLines([...lines, { materialId: materials[0]?.id ?? "", qty: "", unitCost: "", gstRate: String(materials[0]?.gstRate ?? 0) }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof PoLine, val: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    setLines(updated);

    // When material changes, auto-fill unit cost from last purchase price
    // and GST rate from the material master.
    if (field === "materialId" && val) {
      const mat = materials.find((m) => m.id === val);
      if (mat) {
        // Auto-fill GST rate from material master
        updated[index] = { ...updated[index]!, gstRate: String(mat.gstRate ?? 0) };
        setLines([...updated]);
        // Clear previous hint for this line
        setLastPriceHint((prev) => ({ ...prev, [index]: null }));
        // Fetch last purchase price (async, doesn't block)
        fetch(`/api/materials/${val}/last-purchase`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data && data.unitCost > 0) {
              setLines((prev) => {
                const next = [...prev];
                if (next[index] && next[index]!.materialId === val && !next[index]!.unitCost) {
                  next[index] = { ...next[index]!, unitCost: String(data.unitCost) };
                  // Record hint if source is a receipt
                  if (data.source === "receipt" && data.poNumber) {
                    setLastPriceHint((h) => ({
                      ...h,
                      [index]: { poNumber: data.poNumber, date: data.date },
                    }));
                  }
                }
                return next;
              });
            }
          })
          .catch(() => {});
      }
    }
  };

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
  const gstTotal = lines.reduce((s, l) => {
    const rate = Number(l.gstRate) || 0;
    return s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0) * rate / 100;
  }, 0);
  const miscChargesTotal = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const total = subtotal + gstTotal + miscChargesTotal;

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedLocation = availableLocations.find((l) => l.id === locationId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) { toast.error("Please select a supplier"); return; }
    if (scope === "PROJECT" && !projectId) { toast.error("Please select a project for project-scoped Purchase Order"); return; }
    if (!locationId) { toast.error("Please select a destination location"); return; }
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0 && Number(l.unitCost) >= 0);
    if (validLines.length === 0) { toast.error("Add at least one line item with qty and cost"); return; }

    setSubmitting(true);
    try {
      const payload = {
        supplierId,
        procurementScope: scope,
        projectId: scope === "PROJECT" ? projectId : null,
        destinationLocationId: locationId,
        expectedDate: expectedDate || null,
        notes: notes || null,
        lines: validLines.map((l) => ({
          materialId: l.materialId,
          qtyOrdered: Number(l.qty),
          unitCost: Number(l.unitCost),
          gstRate: Number(l.gstRate) || 0,
        })),
        charges: charges
          .filter((c) => c.heading.trim() && Number(c.amount) > 0)
          .map((c) => ({ heading: c.heading.trim(), amount: Number(c.amount), notes: c.notes.trim() || null })),
      };

      // Offline: queue for later sync
      if (!online) {
        await enqueue("purchase-order", payload);
        clearDraft();
        setSuccess({ poNumber: "QUEUED", total });
        toast.success("Purchase order queued offline", {
          description: "Will sync when back online",
        });
        return;
      }

      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create purchase order");
      }
      const data = await res.json();
      clearDraft();
      setSuccess({ poNumber: data.poNumber, total });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create purchase order");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    const isQueued = success.poNumber === "QUEUED";
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{ backgroundColor: isQueued ? "color-mix(in srgb, var(--color-signal) 12%, transparent)" : "color-mix(in srgb, var(--color-go) 12%, transparent)" }}
        >
          {isQueued ? (
            <WifiOff className="size-7" style={{ color: "var(--color-signal)" }} />
          ) : (
            <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
          )}
        </div>
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          {isQueued ? "Purchase Order Queued" : "Purchase Order Created"}
        </p>
        <p className="text-[0.6875rem] font-mono mb-3" style={{ color: "var(--color-ink-500)" }}>
          {isQueued ? "Pending sync" : success.poNumber}
        </p>
        <p className="text-[1rem] font-bold tabular-nums mb-4" style={{ color: "var(--color-go)" }}>
          {formatCurrency(success.total)}
        </p>
        <p className="text-[0.5625rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          {isQueued
            ? "Will be submitted as DRAFT when back online."
            : "Purchase Order is in DRAFT. Submit for approval from the Purchase Order detail page."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              router.refresh();
              router.push("/m/procurement");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            View All POs
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: materials[0]?.id ?? "", qty: "", unitCost: "", gstRate: String(materials[0]?.gstRate ?? 0) }]);
              setCharges([]);
              setNotes("");
              setExpectedDate("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty-data guard — with action buttons to create prerequisites ── */
  if (suppliers.length === 0 || materials.length === 0 || locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>Missing master data</p>
        <p className="text-[0.6875rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          You need these before creating a purchase order:
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {suppliers.length === 0 && (
            <Link href="/m/suppliers/new" className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press" style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}>
              <Plus className="size-3.5" /> Add a Supplier
            </Link>
          )}
          {materials.length === 0 && (
            <Link href="/m/materials/new" className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press" style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}>
              <Plus className="size-3.5" /> Add a Material
            </Link>
          )}
          {locations.length === 0 && (
            <Link href="/m/stock-locations/new" className="flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press" style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}>
              <Plus className="size-3.5" /> Add a Stock Location
            </Link>
          )}
        </div>
        <Link href="/m/procurement" className="mt-4 text-[0.6875rem] font-semibold press" style={{ color: "var(--color-ink-500)" }}>
          Back to POs
        </Link>
      </div>
    );
  }

  return (
    <>
      {hasDraft && !draftRestored && !success && (
        <DraftBanner
          formName="Purchase Order"
          updatedAt={draftUpdatedAt}
          onRestore={restoreDraftState}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      )}
      <PoForm
      suppliers={suppliers}
      projects={projects}
      materials={materials}
      availableLocations={availableLocations}
      categories={categories}
      setSuppliers={setSuppliers}
      setProjects={setProjects}
      setMaterials={setMaterials}
      setLocations={setLocations}
      supplierId={supplierId}
      setSupplierId={setSupplierId}
      scope={scope}
      setScope={setScope}
      projectId={projectId}
      setProjectId={setProjectId}
      locationId={locationId}
      setLocationId={setLocationId}
      expectedDate={expectedDate}
      setExpectedDate={setExpectedDate}
      notes={notes}
      setNotes={setNotes}
      lines={lines}
      onAddLine={handleAddLine}
      onRemoveLine={handleRemoveLine}
      onLineChange={handleLineChange}
      onSubmit={handleSubmit}
      submitting={submitting}
      online={online}
      subtotal={subtotal}
      gstTotal={gstTotal}
      miscChargesTotal={miscChargesTotal}
      total={total}
      selectedSupplier={selectedSupplier}
      selectedProject={selectedProject}
      selectedLocation={selectedLocation}
      lastPriceHint={lastPriceHint}
      charges={charges}
      setCharges={setCharges}
    />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Main form component — holds the selector modal state
 * ═══════════════════════════════════════════════════════════ */
function PoForm({
  suppliers, projects, materials, availableLocations,
  categories, setSuppliers, setProjects, setMaterials, setLocations,
  supplierId, setSupplierId,
  scope, setScope,
  projectId, setProjectId,
  locationId, setLocationId,
  expectedDate, setExpectedDate,
  notes, setNotes,
  lines,
  onAddLine, onRemoveLine, onLineChange,
  onSubmit, submitting, online,
  subtotal, gstTotal, miscChargesTotal, total,
  selectedSupplier, selectedProject, selectedLocation,
  lastPriceHint,
  charges, setCharges,
}: {
  suppliers: SupplierItem[];
  projects: ProjectItem[];
  materials: MaterialItem[];
  availableLocations: LocationItem[];
  categories: CategoryItem[];
  setSuppliers: React.Dispatch<React.SetStateAction<SupplierItem[]>>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectItem[]>>;
  setMaterials: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
  setLocations: React.Dispatch<React.SetStateAction<LocationItem[]>>;
  supplierId: string;
  setSupplierId: (v: string) => void;
  scope: Scope;
  setScope: (v: Scope) => void;
  projectId: string;
  setProjectId: (v: string) => void;
  locationId: string;
  setLocationId: (v: string) => void;
  expectedDate: string;
  setExpectedDate: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  lines: PoLine[];
  onAddLine: () => void;
  onRemoveLine: (i: number) => void;
  onLineChange: (i: number, field: keyof PoLine, val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  online: boolean;
  subtotal: number;
  gstTotal: number;
  miscChargesTotal: number;
  total: number;
  selectedSupplier?: SupplierItem;
  selectedProject?: ProjectItem;
  selectedLocation?: LocationItem;
  lastPriceHint: Record<number, { poNumber: string; date: string } | null>;
  charges: PoCharge[];
  setCharges: React.Dispatch<React.SetStateAction<PoCharge[]>>;
}) {
  const [modal, setModal] = useState<{
    type: "supplier" | "project" | "location" | "material";
    lineIndex?: number;
  } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState<"supplier" | "project" | "location" | "material" | null>(null);

  const closeModal = () => setModal(null);
  const closeCreateDialog = () => setShowCreateDialog(null);

  // When a new entity is created inline, add it to the list and select it
  const handleCreated = (type: "supplier" | "project" | "location" | "material", id: string, name: string, extra?: Partial<SupplierItem & ProjectItem & MaterialItem & LocationItem>) => {
    if (type === "supplier") {
      setSuppliers((prev) => [...prev, { id, name, phone: extra?.phone ?? null }]);
      setSupplierId(id);
    } else if (type === "project") {
      setProjects((prev) => [...prev, { id, name }]);
      setProjectId(id);
    } else if (type === "location") {
      setLocations((prev) => [...prev, { id, name, type: extra?.type ?? "PROJECT_SITE", projectId: extra?.projectId ?? null }]);
      setLocationId(id);
    } else if (type === "material") {
      setMaterials((prev) => [...prev, { id, name, code: extra?.code ?? "", unit: extra?.unit ?? "", gstRate: extra?.gstRate ?? 0 }]);
      if (modal?.lineIndex !== undefined) {
        onLineChange(modal.lineIndex, "materialId", id);
      }
    }
    closeCreateDialog();
    closeModal();
  };

  const handleSelect = (id: string) => {
    if (!modal) return;
    if (modal.type === "supplier") setSupplierId(id);
    else if (modal.type === "project") setProjectId(id);
    else if (modal.type === "location") setLocationId(id);
    else if (modal.type === "material" && modal.lineIndex !== undefined) {
      // handleLineChange auto-fills gstRate + last purchase price on materialId change
      onLineChange(modal.lineIndex, "materialId", id);
    }
    closeModal();
  };

  return (
    <div className="pb-32">

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: WHO ══════ */}
        <SectionHeader icon={Truck} label="Supplier" />

        <SelectorCard
          onClick={() => setModal({ type: "supplier" })}
          icon={Truck}
          label="Supplier"
          value={selectedSupplier?.name}
          subvalue={selectedSupplier?.phone}
          required
        />

        {/* ══════ SECTION: SCOPE ══════ */}
        <SectionHeader icon={Building2} label="Procurement Scope" />

        <div className="grid grid-cols-2 gap-1.5">
          <ScopeCard
            active={scope === "COMPANY"}
            onClick={() => setScope("COMPANY")}
            label="Company"
            sublabel="Warehouse"
          />
          <ScopeCard
            active={scope === "PROJECT"}
            onClick={() => setScope("PROJECT")}
            label="Project"
            sublabel="Site"
          />
        </div>

        {scope === "PROJECT" ? (
          <SelectorCard
            onClick={() => setModal({ type: "project" })}
            icon={Building2}
            label="Project"
            value={projectId ? selectedProject?.name : undefined}
            required
          />
        ) : null}

        <SelectorCard
          onClick={() => availableLocations.length > 0 ? setModal({ type: "location" }) : toast.error("No locations available for this scope")}
          icon={MapPin}
          label="Destination Location"
          value={selectedLocation?.name}
          subvalue={selectedLocation?.type.replace(/_/g, " ").toLowerCase()}
          required
        />

        {/* ══════ SECTION: WHAT ══════ */}
        <SectionHeader icon={Package} label="Line Items" />

        <div className={lines.length > 1 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
          {lines.map((line, idx) => {
            const mat = materials.find((m) => m.id === line.materialId);
            const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0);
            const lineGstRate = Number(line.gstRate) || 0;
            const lineGst = lineTotal * lineGstRate / 100;
            return (
              <div
                key={idx}
                className="rounded-[0.625rem] border overflow-hidden flex flex-col"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div
                  className="flex items-center justify-between px-2 py-1"
                  style={{ backgroundColor: "var(--color-paper-2)", borderBottom: "1px solid var(--color-line)" }}
                >
                  <span className="text-[0.4375rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                    Item {idx + 1}
                  </span>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onRemoveLine(idx)}
                      className="flex items-center gap-0.5 text-[0.4375rem] font-semibold press"
                      style={{ color: "var(--color-stop)" }}
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  ) : null}
                </div>

                <div className="p-1.5 flex flex-col gap-1.5 flex-1">
                  <SelectorRow
                    onClick={() => setModal({ type: "material", lineIndex: idx })}
                    icon={Package}
                    label="Material"
                    value={mat ? mat.name : undefined}
                    subvalue={mat ? `${mat.code} · ${mat.unit}` : undefined}
                    required
                    compact
                  />

                  <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                    <div>
                      <label className="text-[0.375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                        Qty{mat ? ` (${mat.unit})` : ""}
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.qty}
                        onChange={(e) => onLineChange(idx, "qty", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      />
                    </div>
                    <div>
                      <label className="text-[0.375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                        Unit Cost
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) => onLineChange(idx, "unitCost", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      />
                      {lastPriceHint[idx] ? (
                        <p className="text-[0.375rem] mt-0.5" style={{ color: "var(--color-steel)" }}>
                          From {lastPriceHint[idx]!.poNumber}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-1.5">
                    <label className="text-[0.375rem] font-semibold uppercase block mb-0.5" style={{ color: "var(--color-ink-500)" }}>
                      GST Rate %
                    </label>
                    <input
                      type="text" inputMode="decimal"
                      step="any"
                      min="0"
                      value={line.gstRate}
                      onChange={(e) => onLineChange(idx, "gstRate", e.target.value)}
                      placeholder="0"
                      className="w-full rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                    />
                  </div>

                  <div
                    className="flex items-center justify-between rounded-[0.375rem] px-1.5 py-1 mt-auto"
                    style={{ backgroundColor: "color-mix(in srgb, var(--color-go) 6%, transparent)" }}
                  >
                    <span className="text-[0.4375rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>
                      Total
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                        {formatCurrency(lineTotal + lineGst)}
                      </span>
                      {lineGstRate > 0 ? (
                        <span className="text-[0.375rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>
                          +{lineGstRate}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAddLine}
          className="flex items-center justify-center gap-1 w-full rounded-[0.5rem] border border-dashed py-2.5 press"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <Plus className="size-3.5" />
          <span className="text-[0.6875rem] font-bold">Add another item</span>
        </button>

        {/* ══════ SECTION: CHARGES (Freight, Loading, Misc) ══════ */}
        <SectionHeader icon={Truck} label="Charges & Freight" />

        <div className="flex flex-col gap-2">
          {charges.map((charge, idx) => (
            <div
              key={idx}
              className="rounded-[0.5rem] border p-2 flex flex-col gap-1.5"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={charge.heading}
                  onChange={(e) => {
                    const next = [...charges];
                    next[idx] = { ...next[idx]!, heading: e.target.value };
                    setCharges(next);
                  }}
                  placeholder="Heading (e.g. Loading, Freight, Fuel Charge)"
                  className="flex-1 rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-semibold outline-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
                <button
                  type="button"
                  onClick={() => setCharges(charges.filter((_, i) => i !== idx))}
                  className="shrink-0 grid place-items-center size-7 rounded-[0.375rem] press"
                  style={{ color: "var(--color-stop)" }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[0.5625rem] font-bold" style={{ color: "var(--color-ink-500)" }}>₹</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={charge.amount}
                  onChange={(e) => {
                    const next = [...charges];
                    next[idx] = { ...next[idx]!, amount: e.target.value };
                    setCharges(next);
                  }}
                  placeholder="0"
                  className="flex-1 rounded-[0.375rem] border px-2 py-1.5 text-[0.6875rem] font-bold tabular-nums outline-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setCharges([...charges, { heading: "", amount: "", notes: "" }])}
            className="flex items-center justify-center gap-1 w-full rounded-[0.5rem] border border-dashed py-2 press"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3" />
            <span className="text-[0.625rem] font-bold">Add charge (freight, loading, fuel…)</span>
          </button>
        </div>

        {/* ══════ SECTION: WHEN ══════ */}
        <SectionHeader icon={Calendar} label="Delivery" />

        <div>
          <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Expected Date (optional)
          </label>
          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Urgent delivery for foundation work"
            rows={2}
            className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none resize-none"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          />
        </div>
      </form>

      {/* ══════ STICKY BOTTOM BAR ══════ */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center gap-3">
          <div className="shrink-0">
            <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              {formatCurrency(subtotal)} + {formatCurrency(gstTotal)} GST{miscChargesTotal > 0 ? ` + ${formatCurrency(miscChargesTotal)} chg` : ""}
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>
              {formatCurrency(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => onSubmit(e as unknown as React.FormEvent)}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {online ? <Send className="size-3.5" /> : <WifiOff className="size-3.5" />}
                <span>{online ? "Create Purchase Order (Draft)" : "Queue Purchase Order (Offline)"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODAL ══════ */}
      {modal ? (
        <SelectorModal
          type={modal.type}
          title={
            modal.type === "supplier" ? "Select Supplier" :
            modal.type === "project" ? "Select Project" :
            modal.type === "material" ? "Select Material" :
            "Select Location"
          }
          items={
            modal.type === "supplier" ? suppliers.map((s) => ({ id: s.id, label: s.name, sub: s.phone ?? undefined })) :
            modal.type === "project" ? projects.map((p) => ({ id: p.id, label: p.name })) :
            modal.type === "material" ? materials.map((m) => ({ id: m.id, label: m.name, sub: `${m.code} · ${m.unit} · ${m.gstRate}% GST` })) :
            availableLocations.map((l) => ({ id: l.id, label: l.name, sub: l.type.replace(/_/g, " ").toLowerCase() }))
          }
          selectedId={
            modal.type === "supplier" ? supplierId :
            modal.type === "project" ? projectId :
            modal.type === "material" ? (lines[modal.lineIndex ?? 0]?.materialId ?? "") :
            locationId
          }
          onSelect={handleSelect}
          onClose={closeModal}
          onCreateNew={() => {
            if (modal) setShowCreateDialog(modal.type);
          }}
        />
      ) : null}

      {/* ══════ INLINE CREATE DIALOGS ══════ */}
      {showCreateDialog === "supplier" ? (
        <MobileNewSupplierDialog
          open
          onClose={closeCreateDialog}
          onCreated={(s) => handleCreated("supplier", s.id, s.name)}
        />
      ) : null}
      {showCreateDialog === "project" ? (
        <MobileNewProjectDialog
          open
          onClose={closeCreateDialog}
          onCreated={(p) => handleCreated("project", p.id, p.name)}
        />
      ) : null}
      {showCreateDialog === "location" ? (
        <MobileNewStockLocationDialog
          open
          onClose={closeCreateDialog}
          onCreated={(l) => handleCreated("location", l.id, l.name, { type: l.type, projectId: scope === "PROJECT" ? projectId : null })}
        />
      ) : null}
      {showCreateDialog === "material" ? (
        <MobileNewMaterialDialog
          open
          onClose={closeCreateDialog}
          categories={categories}
          onCreated={(m) => handleCreated("material", m.id, m.name, { code: m.code, unit: m.unit, gstRate: m.gstRate })}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Section header
 * ═══════════════════════════════════════════════════════════ */
function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Icon className="size-3" style={{ color: "var(--color-steel)" }} />
      <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Scope card — COMPANY / PROJECT selector
 * ═══════════════════════════════════════════════════════════ */
function ScopeCard({
  active, onClick, label, sublabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[0.5rem] border py-2 px-2 flex flex-col items-center press transition-colors"
      style={
        active
          ? { borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "#fff" }
          : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }
      }
    >
      <span className="text-[0.6875rem] font-bold">{label}</span>
      {sublabel ? (
        <span
          className="text-[0.4375rem] font-semibold truncate w-full text-center"
          style={active ? { color: "color-mix(in srgb, #fff 70%, transparent)" } : { color: "var(--color-ink-500)" }}
        >
          {sublabel}
        </span>
      ) : null}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Selector card — prominent tappable card
 * ═══════════════════════════════════════════════════════════ */
function SelectorCard({
  onClick, icon: Icon, label, value, subvalue, placeholder, required,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string | null;
  placeholder?: string;
  required?: boolean;
}) {
  const hasValue = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press text-left"
      style={{
        borderColor: hasValue ? "var(--color-line)" : "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <span
        className="grid place-items-center size-8 rounded-[0.5rem] shrink-0"
        style={{ backgroundColor: hasValue ? "var(--color-paper-2)" : "color-mix(in srgb, var(--color-signal) 8%, transparent)" }}
      >
        <Icon
          className="size-4"
          style={{ color: hasValue ? "var(--color-ink-700)" : "var(--color-signal)" }}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.4375rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
          {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </p>
        {hasValue ? (
          <>
            <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {value}
            </p>
            {subvalue ? (
              <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                {subvalue}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[0.75rem] font-medium" style={{ color: "var(--color-ink-500)" }}>
            {placeholder ?? "Tap to select…"}
          </p>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0" style={{ color: "var(--color-ink-500)" }} />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Selector row — compact tappable row for line item selectors
 * ═══════════════════════════════════════════════════════════ */
function SelectorRow({
  onClick, icon: Icon, label, value, subvalue, required, compact,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const hasValue = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 rounded-[0.375rem] border press text-left ${compact ? "px-1.5 py-1" : "px-2 py-1.5"}`}
      style={{
        borderColor: hasValue ? "var(--color-line)" : "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
        backgroundColor: hasValue ? "var(--color-paper)" : "color-mix(in srgb, var(--color-signal) 4%, var(--color-paper))",
      }}
    >
      <Icon className={`shrink-0 ${compact ? "size-2.5" : "size-3"}`} style={{ color: hasValue ? "var(--color-ink-700)" : "var(--color-signal)" }} />
      <div className="min-w-0 flex-1">
        <span className={`font-semibold uppercase ${compact ? "text-[0.375rem]" : "text-[0.4375rem]"}`} style={{ color: "var(--color-ink-500)" }}>
          {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
        </span>
        {hasValue ? (
          <p className={`font-bold truncate ${compact ? "text-[0.5625rem]" : "text-[0.6875rem]"}`} style={{ color: "var(--color-ink-950)" }}>
            {value}{subvalue ? <span className="font-normal" style={{ color: "var(--color-ink-500)" }}> · {subvalue}</span> : null}
          </p>
        ) : (
          <p className={`text-[0.5625rem]`} style={{ color: "var(--color-ink-500)" }}>Tap to select…</p>
        )}
      </div>
      <ChevronRight className={`shrink-0 ${compact ? "size-2.5" : "size-3"}`} style={{ color: "var(--color-ink-500)" }} />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Selector modal — bottom-sheet with searchable list
 * ═══════════════════════════════════════════════════════════ */
function SelectorModal({
  type: _type, title, items, selectedId, onSelect, onClose, onCreateNew,
}: {
  type: "supplier" | "project" | "location" | "material";
  title: string;
  items: { id: string; label: string; sub?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCreateNew?: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sub?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 50%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[0.75rem] flex flex-col"
        style={{ backgroundColor: "var(--color-paper)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</p>
          <button onClick={onClose} className="press">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>

        <div className="p-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5"
              style={{ color: "var(--color-ink-500)" }}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus
              className="w-full h-9 rounded-[0.5rem] border pl-8 pr-2 text-[0.75rem] outline-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-950)" }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search className="size-5 mb-1.5" style={{ color: "var(--color-ink-300)" }} />
              <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--color-ink-500)" }}>No results</p>
            </div>
          ) : (
            filtered.map((item, i) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  key={item.id || i}
                  onClick={() => onSelect(item.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 press text-left"
                  style={{
                    backgroundColor: isSelected ? "color-mix(in srgb, var(--color-ink-950) 5%, transparent)" : "transparent",
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[0.75rem] font-bold truncate"
                      style={{ color: isSelected ? "var(--color-ink-950)" : "var(--color-ink-900)" }}
                    >
                      {item.label}
                    </p>
                    {item.sub ? (
                      <p className="text-[0.5625rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                        {item.sub}
                      </p>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--color-go)" }} />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {/* ── Create new ── */}
        {onCreateNew ? (
          <div className="border-t" style={{ borderColor: "var(--color-line)" }}>
            <button
              type="button"
              onClick={onCreateNew}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-3 press"
              style={{ color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-4" />
              <span className="text-[0.75rem] font-bold">Create new {title.replace("Select ", "").toLowerCase()}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
