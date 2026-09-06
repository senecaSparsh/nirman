"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Check, Search, X, Package, MapPin, Warehouse, Building2, HardHat } from "lucide-react";
import { toast } from "sonner";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

type Material = { id: string; name: string; code: string; unit: string; hsnCode: string | null; gstRate: number };
type Project = { id: string; name: string };

type LocationGroup = {
  companyId: string;
  companyName: string;
  isParent: boolean;
  isCurrent: boolean;
  isChild: boolean;
  locations: { id: string; name: string; type: string; projectId: string | null; projectName: string | null }[];
};

type LineItem = {
  key: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  unit: string;
  hsnCode: string | null;
  gstRate: number;
  qty: string;
};

export function MobileNewQuotationClient({
  data,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClose,
  onCreated,
}: {
  data: { projects: Project[]; materials: Material[] };
  onClose?: () => void;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [minQuotes, setMinQuotes] = useState("3");
  const [requiredByDate, setRequiredByDate] = useState("");
  const [workActivity, setWorkActivity] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [locationGroups, setLocationGroups] = useState<LocationGroup[]>([]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [showNewMaterialDialog, setShowNewMaterialDialog] = useState(false);
  const [extraMaterials, setExtraMaterials] = useState<Material[]>([]);
  const lineCounter = useRef(0);

  // Fetch stock locations in the company group (parent + self + children).
  useEffect(() => {
    fetch("/api/quotations/locations")
      .then((r) => r.json())
      .then((data: LocationGroup[]) => setLocationGroups(data))
      .catch(() => {});
  }, []);

  const selectedLocation = useMemo(() => {
    const found = locationGroups
      .map((g) => {
        const loc = g.locations.find((l) => l.id === destinationLocationId);
        return loc ? { ...loc, companyName: g.companyName, isCurrent: g.isCurrent, isParent: g.isParent, isChild: g.isChild } : null;
      })
      .find((x) => x !== null);
    return found ?? null;
  }, [destinationLocationId, locationGroups]);

  const allMaterials = useMemo(() => [...data.materials, ...extraMaterials], [data.materials, extraMaterials]);

  const filteredMaterials = useMemo(() => {
    if (!materialSearch.trim()) return allMaterials.slice(0, 50);
    const q = materialSearch.toLowerCase();
    return allMaterials
      .filter((m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q))
      .slice(0, 50);
  }, [allMaterials, materialSearch]);

  function addLine(material: Material) {
    lineCounter.current += 1;
    const key = `${material.id}-${lineCounter.current}`;
    setLines((prev) => [
      ...prev,
      {
        key,
        materialId: material.id,
        materialName: material.name,
        materialCode: material.code,
        unit: material.unit,
        hsnCode: material.hsnCode,
        gstRate: material.gstRate,
        qty: "",
      },
    ]);
    setShowMaterialPicker(false);
    setMaterialSearch("");
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateQty(key: string, qty: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!requiredByDate) {
      toast.error("Required-by date is mandatory — when does the site need this material?");
      return;
    }
    if (!destinationLocationId) {
      toast.error("Destination location is mandatory — pick where the material should be delivered");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one material");
      return;
    }
    for (const l of lines) {
      const qty = parseFloat(l.qty);
      if (!qty || qty <= 0) {
        toast.error(`Enter a valid quantity for ${l.materialName}`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        projectId: projectId || null,
        notes: notes.trim() || null,
        minQuotesRequired: parseInt(minQuotes) || 3,
        requiredByDate: requiredByDate || null,
        workActivity: workActivity.trim() || null,
        destinationLocationId,
        lines: lines.map((l) => ({
          materialId: l.materialId,
          qtyRequired: parseFloat(l.qty),
        })),
      };
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to create quotation request");
      toast.success("Quotation request created", {
        description: result.requestNumber,
      });
      if (onCreated) {
        onCreated(result.id);
      } else {
        router.push(`/m/quotations/${result.id}`);
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  // Underline-style inputs — no box, just a subtle bottom border
  const inputClass =
    "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };
  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        {/* ── Details — one big border box ── */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Request Details
          </p>

          {/* Title + Project (side by side) */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Title <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Steel + Cement"
                required
                autoFocus
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div>
              <MobileSelectWithCreate
                label="Project"
                value={projectId}
                onChange={setProjectId}
                placeholder="No specific project"
                options={data.projects.map((p) => ({ value: p.id, label: p.name }))}
                inputClass={inputClass}
                inputStyle={inputStyle}
                labelClass={labelClass}
                labelStyle={labelStyle}
                renderDialog={({ open, onClose, onCreated, originRect }) => (
                  <MobileFabModal open={open} onClose={onClose} originRect={originRect} title="New Project" nested>
                    <MobileNewProjectDialog open={open} onClose={onClose} onCreated={(p) => onCreated(p.id, p.name)} />
                  </MobileFabModal>
                )}
              />
            </div>
          </div>

          {/* Min quotes + Required by date */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <label className={labelClass} style={labelStyle}>
                Min quotes
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="20"
                value={minQuotes}
                onChange={(e) => setMinQuotes(e.target.value)}
                className={`${inputClass} font-mono tabular-nums`}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelClass} style={labelStyle}>
                Required by <span style={{ color: "var(--color-stop)" }}>*</span>
              </label>
              <input
                type="date"
                value={requiredByDate}
                onChange={(e) => setRequiredByDate(e.target.value)}
                required
                className={`${inputClass} font-mono`}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Work activity */}
          <div className="">
            <label className={labelClass} style={labelStyle}>
              Work activity (optional)
            </label>
            <input
              type="text"
              value={workActivity}
              onChange={(e) => setWorkActivity(e.target.value)}
              placeholder="e.g. 3rd floor slab casting, blockwork"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Destination location */}
          <div className="">
            <label className={labelClass} style={labelStyle}>
              Deliver to <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              className={`${inputClass} text-left flex items-center gap-1.5 press`}
              style={inputStyle}
            >
              <MapPin className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} />
              {selectedLocation ? (
                <span className="truncate">
                  {selectedLocation.name}
                  {!selectedLocation.isCurrent ? (
                    <span className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                      {" "}({selectedLocation.companyName})
                    </span>
                  ) : null}
                </span>
              ) : (
                <span style={{ color: "var(--color-ink-500)" }}>Select delivery location…</span>
              )}
            </button>
            {selectedLocation ? (
              <p className="text-m-caption mt-1 flex items-center gap-1" style={{ color: "var(--color-ink-500)" }}>
                {selectedLocation.type === "PROJECT_SITE" ? <HardHat className="size-2.5" /> : <Warehouse className="size-2.5" />}
                {selectedLocation.type === "PROJECT_SITE" ? `Project site${selectedLocation.projectName ? ` — ${selectedLocation.projectName}` : ""}` : "Warehouse"}
                {selectedLocation.isParent ? " · Parent company" : selectedLocation.isChild ? " · Subsidiary" : ""}
              </p>
            ) : null}
          </div>

          {/* Location picker overlay */}
          {showLocationPicker ? (
            <MobileDialog open={showLocationPicker} onClose={() => setShowLocationPicker(false)} title="Select delivery location" nested>
                {locationGroups.map((g) => (
                  <div key={g.companyId} className="space-y-3">
                    <div className="flex items-center gap-1.5 pt-2 pb-1">
                      <Building2 className="size-3" style={{ color: "var(--color-steel)" }} />
                      <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                        {g.companyName}
                      </span>
                      {g.isParent ? <span className="text-m-caption px-1 rounded" style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}>PARENT</span> : null}
                      {g.isCurrent ? <span className="text-m-caption px-1 rounded" style={{ backgroundColor: "var(--color-go-wash)", color: "var(--color-go-dark)" }}>CURRENT</span> : null}
                      {g.isChild ? <span className="text-m-caption px-1 rounded" style={{ backgroundColor: "var(--color-steel-wash)", color: "var(--color-steel-dark)" }}>SUBSIDIARY</span> : null}
                    </div>
                    {g.locations.length === 0 ? (
                      <p className="text-m-caption italic pl-4" style={{ color: "var(--color-ink-500)" }}>No locations</p>
                    ) : (
                      g.locations.map((loc) => (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => {
                            setDestinationLocationId(loc.id);
                            setShowLocationPicker(false);
                          }}
                          className="w-full flex items-center gap-1 rounded-[0.5rem] border p-2 text-left press"
                          style={{
                            borderColor: destinationLocationId === loc.id ? "var(--color-steel)" : "var(--color-line)",
                            backgroundColor: destinationLocationId === loc.id ? "var(--color-steel-wash)" : "var(--color-paper)",
                          }}
                        >
                          {loc.type === "PROJECT_SITE" ? <HardHat className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} /> : <Warehouse className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} />}
                          <div className="min-w-0 flex-1">
                            <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>{loc.name}</p>
                            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                              {loc.type === "PROJECT_SITE" ? "Project site" : "Warehouse"}
                              {loc.projectName ? ` · ${loc.projectName}` : ""}
                            </p>
                          </div>
                          {destinationLocationId === loc.id ? <Check className="size-3.5 shrink-0" style={{ color: "var(--color-go)" }} /> : null}
                        </button>
                      ))
                    )}
                  </div>
                ))}
            </MobileDialog>
          ) : null}

          {/* Notes */}
          <div className="">
            <label className={labelClass} style={labelStyle}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any special instructions for suppliers…"
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 resize-none transition-colors"
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── Materials — one big border box ── */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Materials ({lines.length})
            </p>
          </div>

          {/* Line items */}
          {lines.length === 0 ? (
            <MobileEmptyState
              icon={Package}
              title="No materials added yet"
              size="compact"
            />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
              {lines.map((l) => (
                <div
                  key={l.key}
                  className="py-2 space-y-1.5"
                >
                  {/* Material name + Qty (side by side) */}
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {l.materialName}
                      </p>
                      <p className="text-m-caption font-mono" style={{ color: "var(--color-ink-500)" }}>
                        {l.materialCode}
                        {l.hsnCode ? ` · HSN ${l.hsnCode}` : ""}
                        {` · GST ${l.gstRate}%`}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        step="any"
                        value={l.qty}
                        onChange={(e) => updateQty(l.key, e.target.value)}
                        placeholder="Qty"
                        className="w-16 h-7 px-1 text-m-caption font-mono font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors text-center"
                        style={inputStyle}
                      />
                      <span className="text-m-caption shrink-0" style={{ color: "var(--color-ink-500)" }}>
                        {l.unit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="shrink-0 p-1 press"
                      style={{ color: "var(--color-stop)" }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add material button */}
          <button
            type="button"
            onClick={() => setShowMaterialPicker(true)}
            className="flex w-full items-center justify-center gap-1 py-2 text-m-body font-bold text-m-body press"
            style={{ color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3.5" />
            Add Material
          </button>
        </div>

        {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
        <div
          className="sticky bottom-0 left-0 right-0 z-20 border-t -mx-4 -mb-4 px-4 py-2"
          style={{
            backgroundColor: "var(--color-paper)",
            borderColor: "var(--color-line)",
          }}
        >
          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={saving || !title.trim() || !requiredByDate || lines.length === 0}
              className="flex-1 flex items-center justify-center gap-1 rounded-[0.625rem] py-3.5 text-m-section font-bold text-m-body press transition-transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Check className="size-4" />
                  <span>Create Quotation Request</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ── Material picker modal ── */}
      {showMaterialPicker ? (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: "var(--color-paper)" }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-1 p-3 border-b"
            style={{ borderColor: "var(--color-line)" }}
          >
            <button
              type="button"
              onClick={() => {
                setShowMaterialPicker(false);
                setMaterialSearch("");
              }}
              className="p-1 press"
              style={{ color: "var(--color-ink-700)" }}
            >
              <X className="size-5" />
            </button>
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4"
                style={{ color: "var(--color-ink-500)" }}
              />
              <input
                type="search"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                placeholder="Search materials…"
                autoFocus
                className="w-full h-10 rounded-[0.625rem] border-2 pl-9 pr-3 text-m-section focus:outline-none"
                style={{
                  borderColor: materialSearch ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                  color: "var(--color-ink-950)",
                }}
              />
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {filteredMaterials.length === 0 ? (
              <p className="text-center py-8 text-m-section" style={{ color: "var(--color-ink-500)" }}>
                No materials found
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
                {filteredMaterials.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addLine(m)}
                    className="flex items-center justify-between w-full p-3 text-left text-m-body press active:opacity-70"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {m.name}
                      </p>
                      <p className="text-m-caption font-mono" style={{ color: "var(--color-ink-500)" }}>
                        {m.code} · {m.unit}
                        {m.hsnCode ? ` · HSN ${m.hsnCode}` : ""}
                        {` · GST ${m.gstRate}%`}
                      </p>
                    </div>
                    <Plus className="size-4 shrink-0" style={{ color: "var(--color-signal)" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create new material button */}
          <div
            className="border-t p-3"
            style={{ borderColor: "var(--color-line)" }}
          >
            <button
              type="button"
              onClick={() => setShowNewMaterialDialog(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-m-body font-bold text-m-body press"
              style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
            >
              <Plus className="size-3.5" />
              Create new material
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Inline material create dialog ── */}
      <MobileNewMaterialDialog
        open={showNewMaterialDialog}
        onClose={() => setShowNewMaterialDialog(false)}
        categories={[]}
        nested
        onCreated={(m) => {
          const newMat: Material = {
            id: m.id,
            name: m.name,
            code: m.code,
            unit: m.unit,
            hsnCode: m.hsnCode,
            gstRate: m.gstRate,
          };
          setExtraMaterials((prev) => [...prev, newMat]);
          addLine(newMat);
          setShowNewMaterialDialog(false);
          setShowMaterialPicker(false);
          setMaterialSearch("");
        }}
      />
    </div>
  );
}
