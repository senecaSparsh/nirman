"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2, Loader2, Check, Search, X, Package, MapPin, Warehouse, Building2, HardHat } from "lucide-react";
import { toast } from "sonner";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";

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
    for (const g of locationGroups) {
      const loc = g.locations.find((l) => l.id === destinationLocationId);
      if (loc) return { ...loc, companyName: g.companyName, isCurrent: g.isCurrent, isParent: g.isParent, isChild: g.isChild };
    }
    return null;
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

  const inputClass =
    "w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] font-medium outline-none focus:ring-2";
  const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "var(--color-paper)",
    color: "var(--color-ink-950)",
  };

  return (
    <div className="space-y-3">
      {onClose ? (
        <div className="flex items-center gap-2 mb-2">
          <button type="button" onClick={onClose} className="p-1 -ml-1" style={{ color: "var(--color-ink-700)" }}>
            <X className="size-5" />
          </button>
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Quotation Request
          </p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-3">
        {/* ── Details card ── */}
        <div
          className="rounded-[0.625rem] border p-3 space-y-2.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center gap-1.5 border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <FileText className="size-3.5" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              Request Details
            </span>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Title <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Steel + Cement for Tower A foundation"
              required
              autoFocus
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Project */}
          <div>
            <MobileSelectWithCreate
              label="Project (optional)"
              value={projectId}
              onChange={setProjectId}
              placeholder="No specific project"
              options={data.projects.map((p) => ({ value: p.id, label: p.name }))}
              inputClass={inputClass}
              inputStyle={inputStyle}
              renderDialog={({ open, onClose, onCreated }) => (
                <MobileNewProjectDialog open={open} onClose={onClose} onCreated={(p) => onCreated(p.id, p.name)} />
              )}
            />
          </div>

          {/* Min quotes */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Minimum quotes required
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="20"
              value={minQuotes}
              onChange={(e) => setMinQuotes(e.target.value)}
              className={`${inputClass} font-mono w-24`}
              style={inputStyle}
            />
          </div>

          {/* Required by date */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Required by date <span style={{ color: "var(--color-stop)" }}>*</span>
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

          {/* Work activity */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
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

          {/* Destination location — where should the material be delivered? */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Deliver to <span style={{ color: "var(--color-stop)" }}>*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              className={`${inputClass} text-left flex items-center gap-1.5`}
              style={inputStyle}
            >
              <MapPin className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} />
              {selectedLocation ? (
                <span className="truncate">
                  {selectedLocation.name}
                  {!selectedLocation.isCurrent ? (
                    <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                      {" "}({selectedLocation.companyName})
                    </span>
                  ) : null}
                </span>
              ) : (
                <span style={{ color: "var(--color-ink-500)" }}>Select delivery location…</span>
              )}
            </button>
            {selectedLocation ? (
              <p className="text-[0.5rem] mt-1 flex items-center gap-1" style={{ color: "var(--color-ink-500)" }}>
                {selectedLocation.type === "PROJECT_SITE" ? <HardHat className="size-2.5" /> : <Warehouse className="size-2.5" />}
                {selectedLocation.type === "PROJECT_SITE" ? `Project site${selectedLocation.projectName ? ` — ${selectedLocation.projectName}` : ""}` : "Warehouse"}
                {selectedLocation.isParent ? " · Parent company" : selectedLocation.isChild ? " · Subsidiary" : ""}
              </p>
            ) : null}
          </div>

          {/* Location picker overlay */}
          {showLocationPicker ? (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setShowLocationPicker(false)}>
              <div
                className="w-full max-h-[80vh] overflow-y-auto rounded-t-[1rem] p-3 space-y-2"
                style={{ backgroundColor: "var(--color-canvas)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between sticky top-0 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
                  <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>Select delivery location</p>
                  <button type="button" onClick={() => setShowLocationPicker(false)}>
                    <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
                  </button>
                </div>
                {locationGroups.map((g) => (
                  <div key={g.companyId} className="space-y-1">
                    <div className="flex items-center gap-1.5 pt-2 pb-1">
                      <Building2 className="size-3" style={{ color: "var(--color-steel)" }} />
                      <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                        {g.companyName}
                      </span>
                      {g.isParent ? <span className="text-[0.4375rem] px-1 rounded" style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}>PARENT</span> : null}
                      {g.isCurrent ? <span className="text-[0.4375rem] px-1 rounded" style={{ backgroundColor: "var(--color-go-wash)", color: "var(--color-go-dark)" }}>CURRENT</span> : null}
                      {g.isChild ? <span className="text-[0.4375rem] px-1 rounded" style={{ backgroundColor: "var(--color-steel-wash)", color: "var(--color-steel-dark)" }}>SUBSIDIARY</span> : null}
                    </div>
                    {g.locations.length === 0 ? (
                      <p className="text-[0.5rem] italic pl-4" style={{ color: "var(--color-ink-500)" }}>No locations</p>
                    ) : (
                      g.locations.map((loc) => (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => {
                            setDestinationLocationId(loc.id);
                            setShowLocationPicker(false);
                          }}
                          className="w-full flex items-center gap-2 rounded-[0.5rem] border p-2 text-left"
                          style={{
                            borderColor: destinationLocationId === loc.id ? "var(--color-steel)" : "var(--color-line)",
                            backgroundColor: destinationLocationId === loc.id ? "var(--color-steel-wash)" : "var(--color-paper)",
                          }}
                        >
                          {loc.type === "PROJECT_SITE" ? <HardHat className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} /> : <Warehouse className="size-3.5 shrink-0" style={{ color: "var(--color-steel)" }} />}
                          <div className="min-w-0 flex-1">
                            <p className="text-[0.6875rem] font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>{loc.name}</p>
                            <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>
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
              </div>
            </div>
          ) : null}

          {/* Notes */}
          <div>
            <label className="block text-[0.5625rem] font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any special instructions for suppliers…"
              className={`${inputClass} resize-none`}
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── Materials card ── */}
        <div
          className="rounded-[0.625rem] border p-3 space-y-2"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--color-line)" }}>
            <div className="flex items-center gap-1.5">
              <Package className="size-3.5" style={{ color: "var(--color-steel)" }} />
              <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                Materials ({lines.length})
              </span>
            </div>
          </div>

          {/* Line items */}
          {lines.length === 0 ? (
            <p className="text-[0.6875rem] text-center py-3" style={{ color: "var(--color-ink-500)" }}>
              No materials added yet
            </p>
          ) : (
            <div className="space-y-1.5">
              {lines.map((l) => (
                <div
                  key={l.key}
                  className="rounded-[0.5rem] border p-2 space-y-1.5"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper-2)" }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6875rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {l.materialName}
                      </p>
                      <p className="text-[0.5rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
                        {l.materialCode}
                        {l.hsnCode ? ` · HSN ${l.hsnCode}` : ""}
                        {` · GST ${l.gstRate}%`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="shrink-0 p-1"
                      style={{ color: "var(--color-stop)" }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.001"
                      step="any"
                      value={l.qty}
                      onChange={(e) => updateQty(l.key, e.target.value)}
                      placeholder="Qty"
                      className={`${inputClass} font-mono w-24`}
                      style={inputStyle}
                    />
                    <span className="text-[0.5625rem]" style={{ color: "var(--color-ink-500)" }}>
                      {l.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add material button */}
          <button
            type="button"
            onClick={() => setShowMaterialPicker(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2 text-[0.6875rem] font-bold press"
            style={{ borderColor: "var(--color-signal)", color: "var(--color-signal-dark)" }}
          >
            <Plus className="size-3.5" />
            Add Material
          </button>
        </div>

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={saving || !title.trim() || !requiredByDate || lines.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-[0.625rem] py-3.5 text-[0.8125rem] font-bold press transition-transform active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
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
      </form>

      {/* ── Material picker modal ── */}
      {showMaterialPicker ? (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: "var(--color-paper)" }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 p-3 border-b"
            style={{ borderColor: "var(--color-line)" }}
          >
            <button
              type="button"
              onClick={() => {
                setShowMaterialPicker(false);
                setMaterialSearch("");
              }}
              className="p-1"
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
                className="w-full h-10 rounded-[0.625rem] border-2 pl-9 pr-3 text-[0.8125rem] focus:outline-none"
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
              <p className="text-center py-8 text-[0.75rem]" style={{ color: "var(--color-ink-500)" }}>
                No materials found
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--color-line)" }}>
                {filteredMaterials.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addLine(m)}
                    className="flex items-center justify-between w-full p-3 text-left press active:opacity-70"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.75rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                        {m.name}
                      </p>
                      <p className="text-[0.5625rem] font-mono" style={{ color: "var(--color-ink-500)" }}>
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
              className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] border-2 border-dashed py-2.5 text-[0.6875rem] font-bold press"
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
