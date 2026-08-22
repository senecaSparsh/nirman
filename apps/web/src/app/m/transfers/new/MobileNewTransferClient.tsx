"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Plus, Trash2, Loader2,
  Package, MapPin, Send, CheckCircle2, WifiOff,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useDrafts } from "@/lib/offline/use-drafts";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";

interface LocationItem { id: string; name: string; type: string; companyId?: string; companyName?: string | null; }
interface MaterialItem { id: string; name: string; code: string; unit: string; }

interface TransferLine {
  materialId: string;
  qty: string;
}

interface TransferDraft {
  fromLocationId: string;
  toLocationId: string;
  notes: string;
  lines: TransferLine[];
}

export default function MobileNewTransferClient() {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([{ materialId: "", qty: "" }]);

  // Transfer type: auto-detected from location selection.
  // "inHouse" = same company (warehouse→site, site→warehouse, etc.)
  // "C to C" = inter-company (company→company STO with transfer pricing)
  const [transferType, setTransferType] = useState<"inHouse" | "C to C">("inHouse");

  const [success, setSuccess] = useState<{ id: string } | null>(null);

  // Draft auto-save
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } = useDrafts<TransferDraft>(
    "stock-transfer",
    "stock-transfer-new",
  );
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [locRes, matRes] = await Promise.all([
          fetch("/api/stock-locations?group=true").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/materials").then((r) => (r.ok ? r.json() : [])),
        ]);
        if (cancelled) return;
        if (Array.isArray(locRes)) {
          setLocations(locRes);
          if (locRes.length > 0) {
            setFromLocationId(locRes[0].id);
            setToLocationId(locRes.length > 1 ? locRes[1].id : locRes[0].id);
          }
        }
        if (Array.isArray(matRes)) {
          setMaterials(matRes);
          if (matRes.length > 0) {
            setLines([{ materialId: matRes[0].id, qty: "" }]);
          }
        }
      } catch (err) {
        console.error("Failed to load transfer options:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  // Auto-save draft
  useEffect(() => {
    if (loading || success) return;
    saveDraft({ fromLocationId, toLocationId, notes, lines });
  }, [fromLocationId, toLocationId, notes, lines, loading, success, saveDraft]);

  // Auto-detect transfer type from selected locations
  useEffect(() => {
    const from = locations.find((l) => l.id === fromLocationId);
    const to = locations.find((l) => l.id === toLocationId);
    if (from?.companyId && to?.companyId) {
      setTransferType(from.companyId === to.companyId ? "inHouse" : "C to C");
    }
  }, [fromLocationId, toLocationId, locations]);

  // Unsaved-changes guard
  const isDirty = !success && lines.some((l) => Number(l.qty) > 0);
  useUnsavedGuard(isDirty);

  const handleAddLine = () => {
    const defaultMatId = materials.length > 0 ? materials[0]!.id : "";
    setLines([...lines, { materialId: defaultMatId, qty: "" }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof TransferLine, val: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    setLines(updated);
  };

  function handleRestoreDraft() {
    if (!draft) return;
    setFromLocationId(draft.fromLocationId);
    setToLocationId(draft.toLocationId);
    setNotes(draft.notes);
    setLines(draft.lines);
    setDraftRestored(true);
    haptic(10);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromLocationId) { toast.error("Select source location"); return; }
    if (!toLocationId) { toast.error("Select destination location"); return; }
    if (fromLocationId === toLocationId) { toast.error("Source and destination must be different"); return; }

    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item with quantity"); return; }

    setSubmitting(true);
    haptic(10);
    try {
      const payload = {
        fromLocationId,
        toLocationId,
        notes: notes.trim() || null,
        lines: validLines.map((l) => ({
          materialId: l.materialId,
          qty: Number(l.qty),
        })),
      };

      // Offline: queue for later sync
      if (!online) {
        await enqueue("stock-transfer", payload);
        haptic([10, 40, 80]);
        clearDraft();
        setSuccess({ id: "QUEUED" });
        toast.success("Transfer queued offline", {
          description: "Will sync when back online",
        });
        return;
      }

      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create transfer");

      haptic([10, 40, 80]);
      clearDraft();
      setSuccess({ id: data.id });
      toast.success("Transfer created successfully");
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed to create transfer");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-[0.6875rem] mt-2" style={{ color: "var(--color-ink-500)" }}>Loading form…</p>
      </div>
    );
  }

  if (success) {
    const isQueued = success.id === "QUEUED";
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
          {isQueued ? "Transfer Queued" : "Transfer Created"}
        </p>
        <p className="text-[0.6875rem] mb-4" style={{ color: "var(--color-ink-500)" }}>
          {isQueued ? "Will sync when back online." : "Stock has been moved between locations."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/m/transfers")}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            View All Transfers
          </button>
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: materials[0]?.id ?? "", qty: "" }]);
              setNotes("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-[0.6875rem] font-bold border press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  const fromLoc = locations.find((l) => l.id === fromLocationId);
  const toLoc = locations.find((l) => l.id === toLocationId);

  return (
    <>
      {hasDraft && !draftRestored && !success && (
        <DraftBanner
          formName="Stock Transfer"
          updatedAt={draftUpdatedAt}
          onRestore={handleRestoreDraft}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      )}
      <div className="pb-32">
        {/* Transfer type toggle — descriptive labels */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => {
              setTransferType("inHouse");
              haptic(5);
            }}
            className="rounded-[0.5rem] border py-2.5 px-2 flex flex-col items-center justify-center gap-0.5 press transition-colors"
            style={{
              borderColor: transferType === "inHouse" ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: transferType === "inHouse" ? "var(--color-ink-950)" : "var(--color-paper)",
              color: transferType === "inHouse" ? "#fff" : "var(--color-ink-700)",
            }}
          >
            <Package className="size-4" />
            <span className="text-[0.6875rem] font-bold">Within Company</span>
            <span className="text-[0.4375rem] font-medium" style={{ opacity: 0.7 }}>
              Warehouse ↔ Site
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTransferType("C to C");
              haptic(5);
            }}
            className="rounded-[0.5rem] border py-2.5 px-2 flex flex-col items-center justify-center gap-0.5 press transition-colors"
            style={{
              borderColor: transferType === "C to C" ? "var(--color-signal)" : "var(--color-line)",
              backgroundColor: transferType === "C to C" ? "var(--color-signal)" : "var(--color-paper)",
              color: transferType === "C to C" ? "#fff" : "var(--color-ink-700)",
            }}
          >
            <ArrowRight className="size-4" />
            <span className="text-[0.6875rem] font-bold">Company to Company</span>
            <span className="text-[0.4375rem] font-medium" style={{ opacity: 0.7 }}>
              Inter-company STO
            </span>
          </button>
        </div>
        {/* Transfer type description */}
        <p className="text-[0.4375rem] mb-3 px-1" style={{ color: "var(--color-ink-400)" }}>
          {transferType === "inHouse"
            ? "Move stock between your own warehouses and project sites. Cost flows at source MAC — no markup."
            : "Transfer stock to another company in your group. Includes transfer pricing (freight, handling, markup). The receiver must confirm receipt from their company login."}
        </p>

        {/* Route summary: from → to */}
        <div
          className="rounded-[0.625rem] border p-3 mb-3 flex items-center gap-2"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex-1 min-w-0 text-center">
            <MapPin className="size-3 mx-auto mb-1" style={{ color: "var(--color-ink-500)" }} />
            <p className="text-[0.5625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {fromLoc?.name ?? "Select source"}
            </p>
            {fromLoc?.companyName ? (
              <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                {fromLoc.companyName}
              </p>
            ) : null}
          </div>
          <ArrowRight className="size-4 shrink-0" style={{ color: "var(--color-signal)" }} />
          <div className="flex-1 min-w-0 text-center">
            <MapPin className="size-3 mx-auto mb-1" style={{ color: "var(--color-ink-500)" }} />
            <p className="text-[0.5625rem] font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {toLoc?.name ?? "Select destination"}
            </p>
            {toLoc?.companyName ? (
              <p className="text-[0.4375rem] truncate" style={{ color: "var(--color-ink-500)" }}>
                {toLoc.companyName}
              </p>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Source location */}
          <MobileSelectWithCreate
            label="From Location"
            required
            value={fromLocationId}
            onChange={setFromLocationId}
            options={locations.map((l) => ({
              value: l.id,
              label: l.companyName && transferType === "C to C" ? `${l.name} · ${l.companyName}` : l.name,
            }))}
            inputClass="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
            inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewStockLocationDialog
                open={open}
                onClose={onClose}
                projects={[]}
                onCreated={(l) => onCreated(l.id, l.name)}
              />
            )}
          />

          {/* Destination location */}
          <MobileSelectWithCreate
            label="To Location"
            required
            value={toLocationId}
            onChange={setToLocationId}
            options={locations.map((l) => ({
              value: l.id,
              label: l.companyName && transferType === "C to C" ? `${l.name} · ${l.companyName}` : l.name,
            }))}
            inputClass="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem] outline-none"
            inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewStockLocationDialog
                open={open}
                onClose={onClose}
                projects={[]}
                onCreated={(l) => onCreated(l.id, l.name)}
              />
            )}
          />

          {/* Line items */}
          <div className="flex items-center gap-1.5 mt-1">
            <Package className="size-3" style={{ color: "var(--color-steel)" }} />
            <span className="text-[0.5625rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
              Items
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-line)" }} />
          </div>

          <div className="flex flex-col gap-2">
            {lines.map((line, idx) => {
              const mat = materials.find((m) => m.id === line.materialId);
              return (
                <div
                  key={idx}
                  className="rounded-[0.625rem] border overflow-hidden"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
                >
                  <div
                    className="flex items-center justify-between px-2 py-1"
                    style={{ backgroundColor: "var(--color-paper-2)", borderBottom: "1px solid var(--color-line)" }}
                  >
                    <span className="text-[0.4375rem] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                      Item {idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="press"
                        style={{ color: "var(--color-stop)" }}
                      >
                        <Trash2 className="size-2.5" />
                      </button>
                    )}
                  </div>
                  <div className="p-2 flex flex-col gap-1.5">
                    {/* Material select */}
                    <MobileSelectWithCreate
                      label=""
                      value={line.materialId}
                      onChange={(val) => handleLineChange(idx, "materialId", val)}
                      options={materials.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                      inputClass="w-full h-9 rounded-[0.375rem] border px-2 text-[0.6875rem] outline-none"
                      inputStyle={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      labelClass="hidden"
                      renderDialog={({ open, onClose, onCreated }) => (
                        <MobileNewMaterialDialog
                          open={open}
                          onClose={onClose}
                          categories={[]}
                          onCreated={(m) => onCreated(m.id, m.name)}
                        />
                      )}
                    />
                    {/* Qty */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="next"
                        value={line.qty}
                        onChange={(e) => handleLineChange(idx, "qty", e.target.value)}
                        placeholder="Qty"
                        className="flex-1 h-9 rounded-[0.375rem] border px-2 text-[0.6875rem] font-bold tabular-nums outline-none"
                        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                      />
                      {mat && (
                        <span className="text-[0.5625rem] font-semibold shrink-0" style={{ color: "var(--color-ink-500)" }}>
                          {mat.unit}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add line */}
          <button
            type="button"
            onClick={handleAddLine}
            className="flex items-center justify-center gap-1 w-full rounded-[0.5rem] border border-dashed py-2.5 press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <Plus className="size-3.5" />
            <span className="text-[0.6875rem] font-bold">Add another item</span>
          </button>

          {/* Notes */}
          <div>
            <label className="text-[0.5625rem] font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Moving excess cement to Site B"
              rows={2}
              className="w-full rounded-[0.375rem] border px-2.5 py-2 text-[0.75rem] outline-none resize-none"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>
        </form>
      </div>

      {/* Sticky bottom bar */}
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
              {lines.filter((l) => Number(l.qty) > 0).length} items
            </p>
            <p className="text-[0.875rem] font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatNumber(lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), 2)} units
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-[0.75rem] font-bold press disabled:opacity-50"
            style={{
              backgroundColor: transferType === "C to C" ? "var(--color-signal)" : "var(--color-ink-950)",
              color: "#fff",
            }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Create {transferType} Transfer</span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
