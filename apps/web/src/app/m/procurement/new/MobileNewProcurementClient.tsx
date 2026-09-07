"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, CheckCircle2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronRight,
  Send, WifiOff,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useDrafts } from "@/lib/offline/use-drafts";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { ScanButton } from "@/components/mobile/v2/scan-button";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useSmartDefaults } from "@/lib/use-smart-defaults";
import { SmartDefaultsBadge } from "@/components/mobile/v2/smart-defaults-badge";
import { SelectorModal } from "@/components/mobile/v2/form-primitives";

interface SupplierItem { id: string; name: string; phone?: string | null; }
interface ProjectItem { id: string; name: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; gstRate: number; barcode?: string | null; }
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function MobileNewProcurementClient({ data, onClose, onCreated }: { data: FormData; onClose?: () => void; onCreated?: (id: string) => void }) {
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
    [{ materialId: "", qty: "", unitCost: "", gstRate: "0" }],
  );
  const [charges, setCharges] = useState<PoCharge[]>([]);

  const [success, setSuccess] = useState<{ poId: string; poNumber: string; total: number } | null>(null);
  // Track last-purchase-price source per line for the "auto-filled from last PO" hint
  const [lastPriceHint, setLastPriceHint] = useState<Record<number, { poNumber: string; date: string } | null>>({});
  // Empty-data guard dialog state (declared early to respect rules-of-hooks)
  const [guardDialog, setGuardDialog] = useState<"supplier" | "material" | "location" | null>(null);

  // Draft auto-save
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<PoDraft>(
    "purchase-order",
    "purchase-order-new",
  );
  const [draftRestored, setDraftRestored] = useState(false);

  // ── Smart defaults — pre-fill from last-used values (if no draft to restore) ──
  const { getDefault, recordDefaults, hasDefaults: _hasSmartDefaults } = useSmartDefaults("po");
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    // Only apply smart defaults if there's no draft to restore (draft takes priority)
    if (hasDraft || draftRestored || defaultsApplied) return;
    const defSupplier = getDefault("supplierId");
    const defScope = getDefault("scope") as Scope | undefined;
    const defProject = getDefault("projectId");
    const defLocation = getDefault("locationId");
    let applied = false;
    if (defSupplier && suppliers.some((s) => s.id === defSupplier)) {
      setSupplierId(defSupplier);
      applied = true;
    }
    if (defScope && (defScope === "COMPANY" || defScope === "PROJECT")) {
      setScope(defScope);
      applied = true;
    }
    if (defProject && projects.some((p) => p.id === defProject)) {
      setProjectId(defProject);
      applied = true;
    }
    if (defLocation && locations.some((l) => l.id === defLocation)) {
      setLocationId(defLocation);
      applied = true;
    }
    if (applied) setDefaultsApplied(true);
  }, [hasDraft, draftRestored, defaultsApplied, getDefault, suppliers, projects, locations]);

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
    const hasContent = supplierId || projectId || locationId || expectedDate || notes ||
      lines.some((l) => l.materialId || l.qty);
    if (!hasContent) return;
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
    setLines([...lines, { materialId: "", qty: "", unitCost: "", gstRate: "0" }]);
  };

  // Scan barcode → find material → add a line pre-filled with it
  const handleScan = (code: string) => {
    const matched = materials.find((m) => m.barcode === code || m.code === code);
    if (!matched) {
      toast.error(`No material found for: ${code}`);
      return;
    }
    setLines((prev) => [...prev, { materialId: matched.id, qty: "", unitCost: "", gstRate: String(matched.gstRate) }]);
    toast.success(`Added: ${matched.name}`);
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
      // Record smart defaults for next time
      recordDefaults({
        supplierId,
        scope,
        projectId: scope === "PROJECT" ? projectId : undefined,
        locationId,
      });

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
        setSuccess({ poId: "", poNumber: "QUEUED", total });
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
      setSuccess({ poId: data.id, poNumber: data.poNumber, total });
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
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          {isQueued ? "Purchase Order Queued" : "Purchase Order Created"}
        </p>
        <p className="text-m-caption font-mono mb-3" style={{ color: "var(--color-ink-700)" }}>
          {isQueued ? "Pending sync" : success.poNumber}
        </p>
        <p className="text-m-section font-bold tabular-nums mb-4" style={{ color: "var(--color-go)" }}>
          {formatCurrency(success.total)}
        </p>
        <p className="text-m-caption mb-4" style={{ color: "var(--color-ink-700)" }}>
          {isQueued
            ? "Will be submitted as DRAFT when back online."
            : "Purchase Order is in DRAFT. Submit for approval from the Purchase Order detail page."}
        </p>
        <div className="flex flex-col gap-3">
          {!isQueued && success.poId ? (
            <button
              onClick={() => {
                if (onCreated) {
                  onCreated(success.poId);
                } else {
                  router.push(`/m/procurement/${success.poId}`);
                }
              }}
              className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              View {success.poNumber}
            </button>
          ) : null}
          <button
            onClick={() => {
              if (onCreated) {
                onCreated("");
              } else {
                router.refresh();
                router.push("/m/procurement");
              }
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            View All POs
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: "", qty: "", unitCost: "", gstRate: "0" }]);
              setCharges([]);
              setNotes("");
              setExpectedDate("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty-data guard — with inline create dialogs (no redirection) ── */
  if (suppliers.length === 0 || materials.length === 0 || locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>Missing master data</p>
        <p className="text-m-body mb-4" style={{ color: "var(--color-ink-700)" }}>
          You need these before creating a purchase order:
        </p>
        <div className="flex flex-wrap gap-3 w-full max-w-sm justify-center">
          {suppliers.length === 0 && (
            <button
              type="button"
              onClick={() => setGuardDialog("supplier")}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" /> Add a Supplier
            </button>
          )}
          {materials.length === 0 && (
            <button
              type="button"
              onClick={() => setGuardDialog("material")}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" /> Add a Material
            </button>
          )}
          {locations.length === 0 && (
            <button
              type="button"
              onClick={() => setGuardDialog("location")}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" /> Add a Stock Location
            </button>
          )}
        </div>
        <Link href="/m/procurement" className="mt-4 text-m-body font-semibold text-m-body press" style={{ color: "var(--color-ink-700)" }}>
          Back to POs
        </Link>

        {/* Inline create dialogs — no redirection */}
        {guardDialog === "supplier" ? (
          <MobileNewSupplierDialog
            open
            nested
            onClose={() => setGuardDialog(null)}
            onCreated={(s) => { setSuppliers((p) => [...p, { id: s.id, name: s.name, phone: null }]); setGuardDialog(null); }}
          />
        ) : null}
        {guardDialog === "material" ? (
          <MobileNewMaterialDialog
            open
            nested
            onClose={() => setGuardDialog(null)}
            categories={categories}
            onCreated={(m) => { setMaterials((p) => [...p, { id: m.id, name: m.name, code: m.code, unit: m.unit, gstRate: m.gstRate }]); setGuardDialog(null); }}
          />
        ) : null}
        {guardDialog === "location" ? (
          <MobileNewStockLocationDialog
            open
            nested
            onClose={() => setGuardDialog(null)}
            projects={[]}
            onCreated={(l) => { setLocations((p) => [...p, { id: l.id, name: l.name, type: l.type, projectId: null }]); setGuardDialog(null); }}
          />
        ) : null}
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
      {defaultsApplied && !hasDraft && (
        <SmartDefaultsBadge onDismiss={() => setDefaultsApplied(false)} />
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
      onScan={handleScan}
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
  onAddLine, onRemoveLine, onLineChange, onScan,
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
  onScan: (code: string) => void;
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
  const submitLongPress = useLongPressNav("/m/procurement", "POs list");
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
    <div className="">

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: WHO ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <SelectorCard
            onClick={() => setModal({ type: "supplier" })}
            label="Supplier"
            value={selectedSupplier?.name}
            subvalue={selectedSupplier?.phone}
            required
          />
        </div>

        {/* ══════ SECTION: SCOPE ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Procurement Scope
          </p>

          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
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
              label="Project"
              value={projectId ? selectedProject?.name : undefined}
              required
            />
          ) : null}

          <SelectorCard
            onClick={() => availableLocations.length > 0 ? setModal({ type: "location" }) : toast.error("No locations available for this scope")}
            label="Deliver to"
            value={selectedLocation?.name}
            subvalue={selectedLocation?.type.replace(/_/g, " ").toLowerCase()}
            required
          />
        </div>

        {/* ══════ SECTION: WHAT ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Line Items
          </p>

          <div className={lines.length > 1 ? "grid grid-cols-2 gap-2 divide-x" : "flex flex-col gap-3"} style={{ borderColor: "var(--color-line)" }}>
            {lines.map((line, idx) => {
              const mat = materials.find((m) => m.id === line.materialId);
              const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0);
              const lineGstRate = Number(line.gstRate) || 0;
              const lineGst = lineTotal * lineGstRate / 100;
              return (
                <div
                  key={idx}
                  className="rounded-[0.5rem] border p-2 flex flex-col gap-2.5"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                >
                  {lines.length > 1 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-700)" }}>
                        Item {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveLine(idx)}
                        aria-label="Remove line"
                        className="text-m-body press"
                        style={{ color: "var(--color-stop)" }}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ) : null}

                  <SelectorRow
                    onClick={() => setModal({ type: "material", lineIndex: idx })}
                    label="Material"
                    value={mat ? mat.name : undefined}
                    subvalue={mat ? `${mat.code} · ${mat.unit}` : undefined}
                    required
                  />

                  <div className="grid grid-cols-2 gap-1.5 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <div>
                      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                        Qty{mat ? ` (${mat.unit})` : ""}
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.qty}
                        onChange={(e) => onLineChange(idx, "qty", e.target.value)}
                        placeholder="Qty"
                        className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                      />
                    </div>
                    <div>
                      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                        Unit Cost
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) => onLineChange(idx, "unitCost", e.target.value)}
                        placeholder="Cost"
                        className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                      />
                      {lastPriceHint[idx] ? (
                        <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
                          From {lastPriceHint[idx]!.poNumber}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* GST Rate + Line Total (side by side) */}
                  <div className="grid grid-cols-2 gap-1.5 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <div>
                      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                        GST %
                      </label>
                      <input
                        type="text" inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.gstRate}
                        onChange={(e) => onLineChange(idx, "gstRate", e.target.value)}
                        placeholder="0%"
                        className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                      />
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-m-caption font-bold" style={{ color: "var(--color-ink-700)" }}>
                        Total
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-m-caption font-bold tabular-nums" style={{ color: lineTotal > 0 ? "var(--color-ink-500)" : "var(--color-ink-300)" }}>
                          {lineTotal > 0 ? formatCurrency(lineTotal + lineGst) : "—"}
                        </span>
                        {lineGstRate > 0 ? (
                          <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-700)" }}>
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
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAddLine}
            className="flex-1 flex items-center justify-center gap-1 rounded-[0.5rem] border border-dashed py-2.5 text-m-body press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <Plus className="size-3.5" />
            <span className="text-m-body font-bold">Add another item</span>
          </button>
          <ScanButton onScan={onScan} label="Scan" />
        </div>

        {/* ══════ SECTION: CHARGES (Freight, Loading, Misc) ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Charges & Freight
          </p>

          <div className="flex flex-col gap-3">
            {charges.map((charge, idx) => (
              <div
                key={idx}
                className="rounded-[0.5rem] border p-2 flex flex-col gap-2"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="grid grid-cols-2 gap-1.5 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                      Heading
                    </label>
                    <input
                      type="text"
                      value={charge.heading}
                      onChange={(e) => {
                        const next = [...charges];
                        next[idx] = { ...next[idx]!, heading: e.target.value };
                        setCharges(next);
                      }}
                      placeholder="e.g. Freight, Loading"
                      className="w-full h-7 px-1 text-m-caption font-semibold outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                      Amount (₹)
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-m-caption font-bold shrink-0" style={{ color: "var(--color-ink-700)" }}>₹</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={charge.amount}
                        onChange={(e) => {
                          const next = [...charges];
                          next[idx] = { ...next[idx]!, amount: e.target.value };
                          setCharges(next);
                        }}
                        placeholder="Amount"
                        className="flex-1 h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCharges(charges.filter((_, i) => i !== idx))}
                  className="self-end text-m-caption font-semibold text-m-body press"
                  style={{ color: "var(--color-stop)" }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setCharges([...charges, { heading: "", amount: "", notes: "" }])}
              className="flex items-center justify-center gap-1 w-full rounded-[0.5rem] border border-dashed py-2 text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3" />
              <span className="text-m-label font-bold">Add charge (freight, loading, fuel…)</span>
            </button>
          </div>
        </div>

        {/* ══════ SECTION: WHEN ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Delivery
          </p>

          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Expected Date
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
                style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </div>
            <div>
              <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Urgent delivery"
                rows={1}
                className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
                style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>
        </div>
      </form>

      {/* ══════ STICKY BOTTOM BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-30 border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          {/* Totals — compact, right-aligned numbers */}
          <div className="shrink-0 flex flex-col gap-0.5">
            {total > 0 ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-m-caption font-semibold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                    {formatCurrency(subtotal)}
                  </span>
                  {gstTotal > 0 ? (
                    <>
                      <span className="text-m-caption" style={{ color: "var(--color-ink-300)" }}>+</span>
                      <span className="text-m-caption font-semibold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                        {formatCurrency(gstTotal)}
                      </span>
                    </>
                  ) : null}
                  {miscChargesTotal > 0 ? (
                    <>
                      <span className="text-m-caption" style={{ color: "var(--color-ink-300)" }}>+</span>
                      <span className="text-m-caption font-semibold tabular-nums" style={{ color: "var(--color-ink-500)" }}>
                        {formatCurrency(miscChargesTotal)}
                      </span>
                    </>
                  ) : null}
                </div>
                <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                  {formatCurrency(total)}
                </span>
              </>
            ) : (
              <span className="text-m-caption" style={{ color: "var(--color-ink-300)" }}>
                Add items to see total
              </span>
            )}
          </div>

          {/* Submit button */}
          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; onSubmit(e as unknown as React.FormEvent); }}
            disabled={submitting}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold text-m-body press disabled:opacity-50 select-none"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", touchAction: "none" }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {online ? <Send className="size-3.5" /> : <WifiOff className="size-3.5" />}
                <span>{online ? "Create Draft PO" : "Queue Offline"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODAL ══════ */}
      {modal ? (
        <SelectorModal
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
          onCreate={() => {
            if (modal) setShowCreateDialog(modal.type);
          }}
        />
      ) : null}

      {/* ══════ INLINE CREATE DIALOGS ══════ */}
      {showCreateDialog === "supplier" ? (
        <MobileNewSupplierDialog
          open
          nested
          onClose={closeCreateDialog}
          onCreated={(s) => handleCreated("supplier", s.id, s.name)}
        />
      ) : null}
      {showCreateDialog === "project" ? (
        <MobileFabModal open onClose={closeCreateDialog} title="New Project" nested>
          <MobileNewProjectDialog open onClose={closeCreateDialog} onCreated={(p) => handleCreated("project", p.id, p.name)} />
        </MobileFabModal>
      ) : null}
      {showCreateDialog === "location" ? (
        <MobileNewStockLocationDialog
          open
          nested
          onClose={closeCreateDialog}
          onCreated={(l) => handleCreated("location", l.id, l.name, { type: l.type, projectId: scope === "PROJECT" ? projectId : null })}
        />
      ) : null}
      {showCreateDialog === "material" ? (
        <MobileNewMaterialDialog
          open
          nested
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <Icon className="size-3" style={{ color: "var(--color-ink-950)" }} />
      <span className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
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
      className="rounded-[0.5rem] border py-2 px-2 flex flex-col items-center text-m-body press transition-colors"
      style={
        active
          ? { borderColor: "var(--color-ink-950)", backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
          : { borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }
      }
    >
      <span className="text-m-body font-bold">{label}</span>
      {sublabel ? (
        <span
          className="text-m-caption font-semibold truncate w-full text-center"
          style={active ? { color: "color-mix(in srgb, var(--color-paper) 70%, transparent)" } : { color: "var(--color-ink-700)" }}
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
  onClick, label, value, subvalue, required,
}: {
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string | null;
  placeholder?: string;
  required?: boolean;
}) {
  const hasValue = !!value;
  return (
    <div>
      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
        {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      <button
        type="button"
        onClick={onClick}
        className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left press"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "transparent",
          color: hasValue ? "var(--color-ink-950)" : "var(--color-ink-500)",
        }}
      >
        {hasValue ? (
          <span className="truncate block">
            {value}{subvalue ? <span className="font-normal" style={{ color: "var(--color-ink-700)" }}> · {subvalue}</span> : null}
          </span>
        ) : (
          <span>— Select —</span>
        )}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Selector row — compact tappable row for line item selectors
 * ═══════════════════════════════════════════════════════════ */
function SelectorRow({
  onClick, label, value, subvalue, required,
}: {
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value?: string;
  subvalue?: string;
  required?: boolean;
  compact?: boolean;
}) {
  const hasValue = !!value;
  return (
    <div>
      <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>
        {label}{required ? <span style={{ color: "var(--color-stop)" }}> *</span> : null}
      </label>
      <button
        type="button"
        onClick={onClick}
        className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left press"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "transparent",
          color: hasValue ? "var(--color-ink-950)" : "var(--color-ink-500)",
        }}
      >
        {hasValue ? (
          <span className="truncate block">
            {value}{subvalue ? <span className="font-normal" style={{ color: "var(--color-ink-700)" }}> · {subvalue}</span> : null}
          </span>
        ) : (
          <span>— Select —</span>
        )}
      </button>
    </div>
  );
}


