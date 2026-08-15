"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Loader2, ChevronLeft, CheckCircle2,
  Search, X, ChevronRight, Truck, Building2, Package, MapPin,
  Send, Calendar, WifiOff,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useDrafts } from "@/lib/offline/use-drafts";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { DraftBanner } from "@/components/mobile/draft-banner";

interface SupplierItem { id: string; name: string; phone?: string | null; }
interface ProjectItem { id: string; name: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; gstRate: number; }
interface LocationItem { id: string; name: string; type: string; projectId: string | null; }

interface FormData {
  suppliers: SupplierItem[];
  projects: ProjectItem[];
  materials: MaterialItem[];
  locations: LocationItem[];
}

interface PoLine {
  materialId: string;
  qty: string;
  unitCost: string;
  gstRate: string;
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
}

export default function MobileNewProcurementClient({ data }: { data: FormData }) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const { suppliers, projects, materials, locations } = data;

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

  const [success, setSuccess] = useState<{ poNumber: string; total: number } | null>(null);

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
    saveDraft({ supplierId, scope, projectId, destinationLocationId: locationId, expectedDate, notes, lines });
  }, [supplierId, scope, projectId, locationId, expectedDate, notes, lines, success, saveDraft]);

  function restoreDraftState() {
    if (!draft) return;
    setSupplierId(draft.supplierId);
    setScope(draft.scope);
    setProjectId(draft.projectId);
    setLocationId(draft.destinationLocationId);
    setExpectedDate(draft.expectedDate);
    setNotes(draft.notes);
    setLines(draft.lines);
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
  };

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
  const gstTotal = lines.reduce((s, l) => {
    const rate = Number(l.gstRate) || 0;
    return s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0) * rate / 100;
  }, 0);
  const total = subtotal + gstTotal;

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedLocation = availableLocations.find((l) => l.id === locationId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) { toast.error("Please select a supplier"); return; }
    if (scope === "PROJECT" && !projectId) { toast.error("Please select a project for project-scoped PO"); return; }
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
            : "PO is in DRAFT. Submit for approval from the PO detail page."}
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

  /* ── Empty-data guard ── */
  if (suppliers.length === 0 || materials.length === 0 || locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <p className="text-[0.875rem] font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>Missing master data</p>
        <p className="text-[0.6875rem]" style={{ color: "var(--color-ink-500)" }}>
          {suppliers.length === 0 ? "Add a supplier first. " : ""}
          {materials.length === 0 ? "Add a material first. " : ""}
          {locations.length === 0 ? "Add a stock location first. " : ""}
        </p>
        <Link
          href="/m/procurement"
          className="mt-4 rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
        >
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
      total={total}
      selectedSupplier={selectedSupplier}
      selectedProject={selectedProject}
      selectedLocation={selectedLocation}
    />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Main form component — holds the selector modal state
 * ═══════════════════════════════════════════════════════════ */
function PoForm({
  suppliers, projects, materials, availableLocations,
  supplierId, setSupplierId,
  scope, setScope,
  projectId, setProjectId,
  locationId, setLocationId,
  expectedDate, setExpectedDate,
  notes, setNotes,
  lines,
  onAddLine, onRemoveLine, onLineChange,
  onSubmit, submitting, online,
  subtotal, gstTotal, total,
  selectedSupplier, selectedProject, selectedLocation,
}: {
  suppliers: SupplierItem[];
  projects: ProjectItem[];
  materials: MaterialItem[];
  availableLocations: LocationItem[];
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
  total: number;
  selectedSupplier?: SupplierItem;
  selectedProject?: ProjectItem;
  selectedLocation?: LocationItem;
}) {
  const [modal, setModal] = useState<{
    type: "supplier" | "project" | "location" | "material";
    lineIndex?: number;
  } | null>(null);

  const closeModal = () => setModal(null);

  const handleSelect = (id: string) => {
    if (!modal) return;
    if (modal.type === "supplier") setSupplierId(id);
    else if (modal.type === "project") setProjectId(id);
    else if (modal.type === "location") setLocationId(id);
    else if (modal.type === "material" && modal.lineIndex !== undefined) {
      const mat = materials.find((m) => m.id === id);
      onLineChange(modal.lineIndex, "materialId", id);
      if (mat) onLineChange(modal.lineIndex, "gstRate", String(mat.gstRate));
    }
    closeModal();
  };

  return (
    <div className="pb-32">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 mb-3">
        <Link href="/m/procurement" className="shrink-0">
          <ChevronLeft className="size-5" style={{ color: "var(--color-ink-700)" }} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Purchase Order
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <Truck className="size-2.5" />
          PO
        </span>
      </div>

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
              {formatCurrency(subtotal)} + {formatCurrency(gstTotal)} GST
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
                <span>{online ? "Create PO (Draft)" : "Queue PO (Offline)"}</span>
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
  type: _type, title, items, selectedId, onSelect, onClose,
}: {
  type: "supplier" | "project" | "location" | "material";
  title: string;
  items: { id: string; label: string; sub?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
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
      </div>
    </div>
  );
}
