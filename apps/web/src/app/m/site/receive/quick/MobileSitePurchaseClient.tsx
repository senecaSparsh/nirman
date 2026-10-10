"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { SelectorModal, UnderlineInput } from "@/components/mobile/v2/form-primitives";

interface SupplierOpt { id: string; name: string }
interface MaterialOpt { id: string; name: string; unit: string | null; gstRate: number | null }
interface LocationOpt { id: string; name: string; type: string; projectId: string | null }
interface ProjectOpt { id: string; name: string }
interface Line { materialId: string; qty: string; unitCost: string }

/**
 * Site purchase — the site bought material that arrived without a prior PO
 * (urgent/cash buy). Books a DirectPurchase (a bill under Cash purchases) +
 * posts the goods into stock, so the office sees the spend correctly.
 */
export function MobileSitePurchaseClient({
  suppliers,
  materials,
  locations,
  projects,
  initialLocationId,
  initialProjectId,
}: {
  suppliers: SupplierOpt[];
  materials: MaterialOpt[];
  locations: LocationOpt[];
  projects: ProjectOpt[];
  initialLocationId: string | null;
  initialProjectId: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [locationId, setLocationId] = useState(initialLocationId ?? "");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ materialId: "", qty: "", unitCost: "" }]);
  const [modal, setModal] = useState<"supplier" | "location" | "project" | number | null>(null);

  const supplier = suppliers.find((s) => s.id === supplierId);
  const location = locations.find((l) => l.id === locationId);
  const project = projects.find((p) => p.id === projectId);
  const supplierOk = !!supplierId || supplierName.trim().length > 1;
  const linesOk = lines.every((l) => l.materialId && Number(l.qty) > 0 && Number(l.unitCost) >= 0 && l.unitCost !== "");
  const canSubmit = !!locationId && supplierOk && linesOk && !submitting;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/goods-receipts/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          supplierName: supplierId ? undefined : supplierName.trim() || undefined,
          locationId,
          projectId: projectId || undefined,
          notes: notes.trim() || undefined,
          lines: lines.map((l) => ({ materialId: l.materialId, qty: Number(l.qty), unitCost: Number(l.unitCost) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to record site purchase");
      haptic([10, 40, 80]);
      toast.success(`Site purchase recorded — bill ${data.billNumber} posted; the office sees it under Cash purchases`);
      router.push("/m/site/stock");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const labelClass = "block text-m-caption font-bold mb-0";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <div className="flex flex-col gap-4 px-1 pb-6">
      <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
        Material bought on-site that arrived without a PO. Records the goods into stock + a bill the office sees under Cash purchases — so the books stay honest.
      </p>

      {/* Supplier — pick existing OR type a local vendor name */}
      <div>
        <span className={labelClass} style={labelStyle}>Vendor <span style={{ color: "var(--color-stop)" }}>*</span></span>
        <button
          type="button"
          onClick={() => setModal("supplier")}
          className="w-full h-9 rounded-[0.5rem] border px-3 text-left text-m-body font-bold press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: supplier ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
        >
          {supplier ? supplier.name : supplierName ? `${supplierName} (new vendor)` : "Pick supplier or type a new vendor"}
        </button>
        {!supplierId ? (
          <div className="mt-1.5">
            <UnderlineInput label="" value={supplierName} onChange={(v) => { setSupplierName(v); }} placeholder="Vendor name (if not in list)" />
          </div>
        ) : null}
      </div>

      <div>
        <span className={labelClass} style={labelStyle}>Delivered to <span style={{ color: "var(--color-stop)" }}>*</span></span>
        <button
          type="button"
          onClick={() => setModal("location")}
          className="w-full h-9 rounded-[0.5rem] border px-3 text-left text-m-body font-bold press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: location ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
        >
          {location ? location.name : "Pick the site store"}
        </button>
      </div>

      <div>
        <span className={labelClass} style={labelStyle}>Project (optional)</span>
        <button
          type="button"
          onClick={() => setModal("project")}
          className="w-full h-9 rounded-[0.5rem] border px-3 text-left text-m-body font-bold press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: project ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
        >
          {project ? project.name : "Company stock / not for a project"}
        </button>
      </div>

      {/* Material lines */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={labelClass} style={labelStyle}>Materials <span style={{ color: "var(--color-stop)" }}>*</span></span>
          <button type="button" onClick={() => setLines((ls) => [...ls, { materialId: "", qty: "", unitCost: "" }])} className="text-m-caption font-bold press" style={{ color: "var(--color-primary)" }}>
            + Add material
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const mat = materials.find((m) => m.id === l.materialId);
            return (
              <div key={i} className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModal(i)}
                    className="flex-1 h-9 rounded-[0.375rem] border px-2 text-left text-m-body font-bold press truncate"
                    style={{ borderColor: "var(--color-line)", color: mat ? "var(--color-ink-950)" : "var(--color-ink-400)" }}
                  >
                    {mat ? `${mat.name} · ${mat.unit ?? ""}` : "Pick material"}
                  </button>
                  {lines.length > 1 ? (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="p-1.5 press" aria-label="Remove">
                      <Trash2 className="size-3.5" style={{ color: "var(--color-ink-400)" }} />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <UnderlineInput label={`Qty ${mat?.unit ? `(${mat.unit})` : ""}`} value={l.qty} onChange={(v) => setLine(i, { qty: v })} inputMode="decimal" placeholder="0" />
                  <UnderlineInput label="Rate (₹/unit)" value={l.unitCost} onChange={(v) => setLine(i, { unitCost: v })} inputMode="decimal" placeholder="0.00" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <UnderlineInput label="Notes (optional)" value={notes} onChange={setNotes} placeholder="e.g. urgent cement for tomorrow's pour" />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="flex items-center justify-center gap-1.5 h-11 rounded-[0.625rem] font-bold text-m-section press disabled:opacity-50 mt-1"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <PackageOpen className="size-4" />}
        {submitting ? "Recording…" : "Record site purchase"}
      </button>

      {/* Pickers */}
      {modal === "supplier" ? (
        <SelectorModal title="Pick supplier" items={suppliers.map((s) => ({ id: s.id, label: s.name }))} selectedId={supplierId} onSelect={(id) => { setSupplierId(id); setSupplierName(""); setModal(null); }} onClose={() => setModal(null)} />
      ) : null}
      {modal === "location" ? (
        <SelectorModal title="Delivered to" items={locations.map((l) => ({ id: l.id, label: l.name, sub: l.type }))} selectedId={locationId} onSelect={(id) => { setLocationId(id); setModal(null); }} onClose={() => setModal(null)} />
      ) : null}
      {modal === "project" ? (
        <SelectorModal title="Project" items={projects.map((p) => ({ id: p.id, label: p.name }))} selectedId={projectId} onSelect={(id) => { setProjectId(id); setModal(null); }} onClose={() => setModal(null)} />
      ) : null}
      {typeof modal === "number" ? (
        <SelectorModal title="Pick material" items={materials.map((m) => ({ id: m.id, label: m.name, sub: m.unit ?? "" }))} selectedId={lines[modal]?.materialId ?? ""} onSelect={(id) => { setLine(modal, { materialId: id }); setModal(null); }} onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}
