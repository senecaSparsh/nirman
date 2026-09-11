"use client";

import {useEffect, useState, useRef} from "react";
import {useRouter} from "next/navigation";
import {
  ArrowLeftRight, Package, Plus, Trash2,
  Send, Loader2, CheckCircle2, WifiOff, Truck,
  ShieldCheck, Printer, Clock, Info,
} from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useDrafts } from "@/lib/offline/use-drafts";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { VehicleCapture, type VehicleData } from "@/components/mobile/vehicle-capture";
import { } from "@/components/mobile/v2/bottom-sheet";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { SelectorModal } from "@/components/mobile/v2/form-primitives";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";

type Mode = "transfer" | "issue";

interface LocationItem {
  id: string; name: string; type: string;
  companyId?: string; companyName?: string | null;
}
interface ProjectItem { id: string; name: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; isLotTracked?: boolean; }
interface UnitItem { id: string; unitNumber: string; builtAreaSqft?: number; }
interface LotOption {
  id: string; lotNumber: string; currentQty: number;
  batchCode?: string | null; expiryDate?: string | null;
}

interface StockLine { materialId: string; qty: string; lotNumber: string; }

interface StockOutDraft {
  mode: Mode;
  fromLocationId: string;
  toLocationId: string;
  projectId: string;
  builtUnitId: string;
  receiverName: string;
  receiverMobile: string;
  vehicle: VehicleData;
  notes: string;
  lines: StockLine[];
  freight: string;
  handlingFee: string;
  markupPct: string;
}

const inputClass =
  "w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors";
const inputStyle = {
    borderColor: "var(--color-line)",
    backgroundColor: "transparent",
    color: "var(--color-ink-950)",
  };

// ── Shared label/input styles (match new quotation / PO pages) ──
const labelClass = "block text-m-caption font-bold mb-0";
const labelStyle = { color: "var(--color-ink-700)" };

export function MobileStockOutClient({
  canTransfer,
  canIssue,
  initialMode,
  initialProjectId,
  initialFromLocationId,
  onClose,
}: {
  canTransfer: boolean;
  canIssue: boolean;
  initialMode: Mode;
  initialProjectId: string;
  initialFromLocationId: string;
  onClose?: () => void;
}) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();

  // ── Mode ──
  const [mode, setMode] = useState<Mode>(initialMode);

  // ── Data ──
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Shared form state ──
  const [fromLocationId, setFromLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<StockLine[]>([{ materialId: "", qty: "", lotNumber: "" }]);
  const [submitting, setSubmitting] = useState(false);

  // ── Transfer-specific ──
  const [toLocationId, setToLocationId] = useState("");

  // ── Issue-specific ──
  const [projectId, setProjectId] = useState(initialProjectId);
  const [builtUnitId, setBuiltUnitId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [vehicle, setVehicle] = useState<VehicleData>({
    vehicleNumber: "", vehicleType: "",
  });

  // ── Transfer inter-company charges (optional, transfer mode only) ──
  const [freight, setFreight] = useState("");
  const [handlingFee, setHandlingFee] = useState("");
  const [markupPct, setMarkupPct] = useState("");

  // ── Selector modal state (from / to-location / to-project / material / lot) ──
  const [modal, setModal] = useState<{
    type: "from" | "to-location" | "to-project" | "material" | "lot";
    lineIndex?: number;
  } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState<
    "location" | "project" | "material" | null
  >(null);

  // ── Lots cache (fetched on demand when a lot-tracked material is selected) ──
  // Keyed by materialId. Fetched from /api/materials/{id}/lots.
  const [lotsCache, setLotsCache] = useState<Record<string, LotOption[]>>({});

  // ── Success state ──
  const [success, setSuccess] = useState<{
    id: string;
    number: string;
    totalAmount?: number;
    pending?: boolean;
  } | null>(null);

  // ── Drafts ──
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } =
    useDrafts<StockOutDraft>("stock-out", "stock-out-new");
  const [draftRestored, setDraftRestored] = useState(false);

  // ── Load options ──
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [locRes, projRes, matRes] = await Promise.all([
          fetch("/api/stock-locations?group=true").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/projects").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/materials").then((r) => (r.ok ? r.json() : { rows: [] })),
        ]);
        if (cancelled) return;
        const locs: LocationItem[] = Array.isArray(locRes) ? locRes : [];
        const projs: ProjectItem[] = Array.isArray(projRes) ? projRes : [];
        const mats: MaterialItem[] = matRes?.rows ?? [];
        setLocations(locs);
        setProjects(projs);
        setMaterials(mats);

        // Pre-fill from draft or defaults
        if (hasDraft && draft) {
          setMode(draft.mode);
          setFromLocationId(draft.fromLocationId);
          setToLocationId(draft.toLocationId);
          setProjectId(draft.projectId);
          setBuiltUnitId(draft.builtUnitId);
          setReceiverName(draft.receiverName);
          setReceiverMobile(draft.receiverMobile);
          setVehicle(draft.vehicle);
          setNotes(draft.notes);
          setLines(draft.lines.length > 0 ? draft.lines : [{ materialId: "", qty: "", lotNumber: "" }]);
          setFreight(draft.freight ?? "");
          setHandlingFee(draft.handlingFee ?? "");
          setMarkupPct(draft.markupPct ?? "");
          setDraftRestored(true);
        } else {
          if (initialFromLocationId && locs.some((l) => l.id === initialFromLocationId)) {
            setFromLocationId(initialFromLocationId);
          } else if (locs.length > 0) setFromLocationId(locs[0]!.id);
          if (locs.length > 1) setToLocationId(locs[1]!.id);
          if (initialProjectId && projs.some((p) => p.id === initialProjectId)) {
            setProjectId(initialProjectId);
          } else if (projs.length > 0) {
            setProjectId(projs[0]!.id);
          }
          if (mats.length > 0) setLines([{ materialId: "", qty: "", lotNumber: "" }]);
        }
      } catch (err) {
        console.error("Failed to load stock-out options:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save draft ──
  useEffect(() => {
    if (loading || success) return;
    // Only save when the user has entered something meaningful
    const hasContent = fromLocationId || toLocationId || projectId || builtUnitId ||
      receiverName || receiverMobile || notes ||
      lines.some((l) => l.materialId || l.qty) ||
      freight || handlingFee || markupPct;
    if (!hasContent) return;
    saveDraft({
      mode, fromLocationId, toLocationId, projectId, builtUnitId,
      receiverName, receiverMobile, vehicle, notes, lines,
      freight, handlingFee, markupPct,
    });
  }, [mode, fromLocationId, toLocationId, projectId, builtUnitId,
      receiverName, receiverMobile, vehicle, notes, lines,
      freight, handlingFee, markupPct, loading,
      success, saveDraft]);

  // ── Fetch built units when project changes (issue mode) ──
  useEffect(() => {
    if (mode !== "issue" || !projectId) {
      setUnits([]);
      setBuiltUnitId("");
      return;
    }
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUnits(data?.units && Array.isArray(data.units) ? data.units : []);
      })
      .catch(() => setUnits([]));
  }, [mode, projectId]);

  // ── Unsaved guard ──
  const isDirty = !success && lines.some((l) => Number(l.qty) > 0);
  useUnsavedGuard(isDirty);

  // ── Line management ──
  const handleAddLine = () => {
    setLines([...lines, { materialId: "", qty: "", lotNumber: "" }]);
  };
  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };
  const handleLineChange = (index: number, field: keyof StockLine, val: string) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    setLines(updated);
  };

  // ── Fetch lots for a lot-tracked material (cached per materialId) ──
  const fetchLots = async (materialId: string) => {
    if (lotsCache[materialId]) return; // already cached
    try {
      const res = await fetch(`/api/materials/${materialId}/lots`);
      if (!res.ok) return;
      const data = await res.json();
      const lots: LotOption[] = (data?.lots ?? []).map((l: {
        id: string; lotNumber: string; currentQty: number;
        batchCode?: string | null; expiryDate?: string | null;
      }) => ({
        id: l.id, lotNumber: l.lotNumber, currentQty: l.currentQty,
        batchCode: l.batchCode ?? null, expiryDate: l.expiryDate ?? null,
      }));
      setLotsCache((prev) => ({ ...prev, [materialId]: lots }));
    } catch {
      // best-effort — lot picker will just show empty
    }
  };

  // ── Open lot selector for a line (fetches lots first) ──
  const openLotPicker = (lineIndex: number) => {
    const line = lines[lineIndex];
    if (!line?.materialId) return;
    haptic(10);
    fetchLots(line.materialId);
    setModal({ type: "lot", lineIndex });
  };

  // ── Mode switch — clear destination-specific state ──
  const switchMode = (newMode: Mode) => {
    if (newMode === mode) return;
    haptic(5);
    setMode(newMode);
    setModal(null);
    // Don't clear shared fields (fromLocationId, lines, notes)
    // Clear destination-specific state to avoid cross-contamination
    if (newMode === "transfer") {
      setProjectId("");
      setBuiltUnitId("");
      setReceiverName("");
      setReceiverMobile("");
      setVehicle({ vehicleNumber: "", vehicleType: "" });
    } else {
      setToLocationId("");
      setFreight("");
      setHandlingFee("");
      setMarkupPct("");
    }
  };

  // ── Long-press on Transfer/Issue buttons → jump to the full dedicated page ──
  // A quick tap switches mode in-place (the segmented control). A long-press
  // (≥500ms) navigates to the transfers list or site dashboard — useful when
  // you need the full-page form with all options visible.
  //
  // We use Pointer Events directly (not the useLongPress hook) because:
  // 1. `touch-action: none` prevents the browser's native long-press
  //    context menu / text selection from interfering
  // 2. `onContextMenu` preventDefault stops the right-click menu on desktop
  // 3. Pointer Events unify mouse + touch + pen in one handler
  const longPressFired = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (target: "transfer" | "issue") => {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      haptic(50);
      // Long-press goes to the LIST page for that entity type:
      //   Transfer → /m/stock?tab=transfers (all stock transfers)
      //   Issue → /m/site (field dashboard with recent issues)
      const href = target === "transfer" ? "/m/stock?tab=transfers" : "/m/site";
      toast.message(`Opening ${target === "transfer" ? "Transfers" : "Issues"} list`, { duration: 1200 });
      router.push(href);
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  // Cleanup timer on unmount
  useEffect(() => () => cancelLongPress(), []);

  const handleModeTap = (newMode: Mode) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return; // suppress click — long-press already navigated
    }
    switchMode(newMode);
  };

  // ── Long-press the submit button → go to the list page ──
  const submitLongPress = useLongPressNav(
    mode === "transfer" ? "/m/stock?tab=transfers" : "/m/site",
    mode === "transfer" ? "Transfers list" : "Issues list",
  );

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) {
      toast.error("Add at least one item with quantity");
      return;
    }
    if (!fromLocationId) {
      toast.error("Select source location");
      return;
    }
    // Lot-tracked materials must have a lot selected
    const missingLot = validLines.find((l) => {
      const m = materials.find((mm) => mm.id === l.materialId);
      return m?.isLotTracked && !l.lotNumber;
    });
    if (missingLot) {
      const m = materials.find((mm) => mm.id === missingLot.materialId);
      toast.error(`Select a lot/batch for ${m?.name ?? "material"}`);
      return;
    }

    // Mode-specific validation before entering submitting state
    if (mode === "transfer") {
      if (!toLocationId) { toast.error("Select destination location"); return; }
      if (fromLocationId === toLocationId) {
        toast.error("Source and destination must be different");
        return;
      }
    } else {
      if (!projectId) { toast.error("Select target project"); return; }
    }

    setSubmitting(true);
    haptic(10);

    try {
      if (mode === "transfer") {
        // ── Transfer submit ──

        const payload = {
          fromLocationId,
          toLocationId,
          notes: notes.trim() || null,
          freight: freight ? Number(freight) : undefined,
          handlingFee: handlingFee ? Number(handlingFee) : undefined,
          markupPct: markupPct ? Number(markupPct) : undefined,
          lines: validLines.map((l) => ({
            materialId: l.materialId, qty: Number(l.qty),
            lotNumber: l.lotNumber.trim() || null,
          })),
        };

        if (!online) {
          await enqueue("stock-transfer", payload);
          haptic([10, 40, 80]);
          clearDraft();
          setSuccess({ id: "QUEUED", number: "QUEUED" });
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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to create transfer");

        haptic([10, 40, 80]);
        clearDraft();
        setSuccess({ id: data.id, number: "transfer" });
        toast.success("Transfer draft created", {
          description: "Dispatch it from the transfer detail page to move stock.",
        });
      } else {
        // ── Issue submit ──

        const payload = {
          fromLocationId,
          projectId,
          builtUnitId: builtUnitId || undefined,
          receiverName: receiverName.trim() || undefined,
          receiverMobile: receiverMobile.trim() || undefined,
          vehicleNumber: vehicle.vehicleNumber.trim() || undefined,
          vehicleType: vehicle.vehicleType || undefined,
          vehiclePhotoUrl: vehicle.photoUrl,
          driverName: vehicle.driverName,
          driverPhone: vehicle.driverPhone,
          notes: notes.trim() || undefined,
          lines: validLines.map((l) => ({
            materialId: l.materialId, qty: Number(l.qty),
            lotNumber: l.lotNumber.trim() || null,
          })),
          requireGatePass: true,
        };

        if (!online) {
          await enqueue("material-issue", payload);
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(50);
          }
          clearDraft();
          setSuccess({ id: "QUEUED", number: "QUEUED" });
          toast.success("Issue queued offline", {
            description: "Material issue will sync when back online",
          });
          return;
        }

        const res = await fetch("/api/issue-materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to issue materials");

        clearDraft();
        router.refresh();
        setSuccess({
          id: data.materialIssueId,
          number: data.pending ? "GATE PASS" : data.issueNumber,
          totalAmount: data.totalAmount || 0,
          pending: data.pending,
        });
        if (data.pending) {
          toast.success("Gate pass created — awaiting approval", {
            description: data.message ?? "Items cannot leave the gate until the gate pass is approved.",
            action: { label: "View Gate Passes", onClick: () => router.push("/m/gate-pass") },
          });
        } else {
          toast.success(`Challan ${data.issueNumber} generated successfully!`);
        }
      }
    } catch (err) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-700)" }} />
        <p className="text-m-body mt-2" style={{ color: "var(--color-ink-700)" }}>Loading form…</p>
      </div>
    );
  }

  // ── Success state ──
  if (success) {
    const isQueued = success.number === "QUEUED";
    const isGatePass = success.number === "GATE PASS";
    const isTransfer = success.number === "transfer";
    const label = isQueued
      ? (isTransfer ? "Transfer Queued" : "Issue Queued")
      : isGatePass
        ? "Gate Pass Created"
        : isTransfer
          ? "Transfer Created"
          : "Materials Issued";

    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{
            backgroundColor: isQueued || isGatePass || isTransfer
              ? "color-mix(in srgb, var(--color-signal) 12%, transparent)"
              : "color-mix(in srgb, var(--color-go) 12%, transparent)",
          }}
        >
          {isQueued ? (
            <WifiOff className="size-7" style={{ color: "var(--color-signal)" }} />
          ) : isGatePass ? (
            <ShieldCheck className="size-7" style={{ color: "var(--color-signal)" }} />
          ) : isTransfer ? (
            <Clock className="size-7" style={{ color: "var(--color-signal)" }} />
          ) : (
            <CheckCircle2 className="size-7" style={{ color: "var(--color-go)" }} />
          )}
        </div>
        <p className="text-m-section font-extrabold tracking-tight mb-1" style={{ color: "var(--color-ink-950)" }}>
          {label}
        </p>
        <p className="text-m-body mb-4" style={{ color: "var(--color-ink-700)" }}>
          {isQueued
            ? "Will sync when back online."
            : isGatePass
              ? "Awaiting gate pass approval before items can leave."
              : isTransfer
                ? "Draft created — dispatch it from the transfer detail page to move stock."
                : "Materials have been issued to the project."}
        </p>
        <div className="flex gap-1 flex-wrap justify-center">
          {!isQueued && !isGatePass && isTransfer && success.id !== "QUEUED" ? (
            <button
              onClick={() => router.push(`/m/transfers/${success.id}`)}
              className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              Dispatch This Transfer
            </button>
          ) : null}
          {!isQueued && !isGatePass && !isTransfer && success.id ? (
            <a
              href={`/print/issue/${success.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Printer className="size-3.5 inline mr-1" />
              Print Issue Slip
            </a>
          ) : null}
          {isGatePass ? (
            <a
              href="/m/gate-pass"
              className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              View Gate Passes
            </a>
          ) : null}
          <button
            onClick={() => {
              setSuccess(null);
              setLines([{ materialId: "", qty: "", lotNumber: "" }]);
              setNotes("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
          >
            {isTransfer ? "Add Another Transfer" : "Issue More Materials"}
          </button>
          {onClose ? (
            <button
              onClick={onClose}
              className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-700)" }}
            >
              Done
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const fromLoc = locations.find((l) => l.id === fromLocationId);
  const toLoc = locations.find((l) => l.id === toLocationId);
  const proj = projects.find((p) => p.id === projectId);

  // Route flow state: 0 = nothing selected, 1 = origin only, 2 = both endpoints
  const routeComplete = !!(fromLoc && (mode === "transfer" ? toLoc : proj));
  const routeOrigin = !!fromLoc;

  return (
    <>
      {/* Draft banner */}
      {hasDraft && !draftRestored && !success && (
        <DraftBanner
          formName={draft?.mode === "transfer" ? "Stock Transfer" : "Material Issue"}
          updatedAt={draftUpdatedAt}
          onRestore={() => {
            if (!draft) return;
            setMode(draft.mode);
            setFromLocationId(draft.fromLocationId);
            setToLocationId(draft.toLocationId);
            setProjectId(draft.projectId);
            setBuiltUnitId(draft.builtUnitId);
            setReceiverName(draft.receiverName);
            setReceiverMobile(draft.receiverMobile);
            setVehicle(draft.vehicle);
            setNotes(draft.notes);
            setLines(draft.lines.length > 0 ? draft.lines : [{ materialId: "", qty: "", lotNumber: "" }]);
          setFreight(draft.freight ?? "");
          setHandlingFee(draft.handlingFee ?? "");
          setMarkupPct(draft.markupPct ?? "");
            setDraftRestored(true);
            haptic(10);
          }}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      )}

      <div className="pb-32 space-y-3">
        {/* ══════ SECTION: MODE ══════ */}
        {(canTransfer && canIssue) ? (
          <div className="grid grid-cols-2 gap-1">
            {/* Transfer mode card */}
            <div className="relative">
              {/* Info chip on top-left border — expands to "i Hold for list" */}
              <div
                className="info-chip absolute -top-[0.625rem] left-2 z-10 flex items-center gap-1 px-1.5 h-5 rounded-full overflow-hidden"
                style={{
                  backgroundColor: "var(--color-paper-2)",
                  border: "1px solid var(--color-line)",
                  color: "var(--color-ink-500)",
                }}
              >
                <Info className="size-2.5 shrink-0" />
                <span className="info-chip-text text-[0.5rem] font-semibold leading-none">
                  Hold for list
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleModeTap("transfer")}
                onPointerDown={() => startLongPress("transfer")}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full rounded-[0.5rem] border py-2.5 px-2 flex flex-col items-center justify-center gap-1.5 text-m-body press transition-colors select-none"
                style={{
                  borderColor: mode === "transfer" ? "var(--color-ink-950)" : "var(--color-line)",
                  backgroundColor: mode === "transfer" ? "var(--color-ink-950)" : "var(--color-paper)",
                  color: mode === "transfer" ? "var(--color-paper)" : "var(--color-ink-700)",
                  touchAction: "none",
                }}
              >
                <ArrowLeftRight className="size-4" />
                <span className="text-m-body font-bold">Transfer</span>
                <span className="text-m-caption font-medium" style={{ opacity: 0.7 }}>
                  Location → Location
                </span>
              </button>
            </div>
            {/* Issue mode card */}
            <div className="relative">
              {/* Info chip on top-left border — expands to "i Hold for list" */}
              <div
                className="info-chip absolute -top-[0.625rem] left-2 z-10 flex items-center gap-1 px-1.5 h-5 rounded-full overflow-hidden"
                style={{
                  backgroundColor: "var(--color-paper-2)",
                  border: "1px solid var(--color-line)",
                  color: "var(--color-ink-500)",
                }}
              >
                <Info className="size-2.5 shrink-0" />
                <span className="info-chip-text text-[0.5rem] font-semibold leading-none">
                  Hold for list
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleModeTap("issue")}
                onPointerDown={() => startLongPress("issue")}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full rounded-[0.5rem] border py-2.5 px-2 flex flex-col items-center justify-center gap-1.5 text-m-body press transition-colors select-none"
                style={{
                  borderColor: mode === "issue" ? "var(--color-signal)" : "var(--color-line)",
                  backgroundColor: mode === "issue" ? "var(--color-signal)" : "var(--color-paper)",
                  color: mode === "issue" ? "var(--color-paper)" : "var(--color-ink-700)",
                  touchAction: "none",
                }}
              >
                <Package className="size-4" />
                <span className="text-m-body font-bold">Issue</span>
                <span className="text-m-caption font-medium" style={{ opacity: 0.7 }}>
                  Location → Project
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className="rounded-[0.625rem] border py-2.5 px-3 flex items-center gap-1.5"
            style={{
              borderColor: mode === "transfer" ? "var(--color-ink-950)" : "var(--color-signal)",
              backgroundColor: mode === "transfer" ? "var(--color-ink-950)" : "var(--color-signal)",
            }}
          >
            {mode === "transfer" ? (
              <ArrowLeftRight className="size-4" style={{ color: "var(--color-paper)" }} />
            ) : (
              <Package className="size-4" style={{ color: "var(--color-paper)" }} />
            )}
            <span className="text-m-body font-bold" style={{ color: "var(--color-paper)" }}>
              {mode === "transfer" ? "Stock Transfer" : "Material Issue"}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* ══════ SECTION: ROUTE (From → To) ══════ */}
          <div
            className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Route
            </p>

            {/* From + To — clean side-by-side with a centered arrow */}
            <div className="flex items-end gap-2">
              {/* ── FROM ── */}
              <div className="flex flex-col flex-1 min-w-0">
                <label className={labelClass} style={labelStyle}>
                  From <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={() => { haptic(10); setModal({ type: "from" }); }}
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left flex items-center gap-1 press truncate"
                  style={{
                    borderColor: routeOrigin ? "var(--color-go)" : "var(--color-line)",
                    backgroundColor: "transparent",
                    color: fromLoc ? "var(--color-ink-950)" : "var(--color-ink-500)",
                  }}
                >
                  {fromLoc ? (
                    <span className="truncate block">{fromLoc.name}</span>
                  ) : (
                    <span>— Select —</span>
                  )}
                </button>
              </div>

              {/* ── ARROW ── */}
              <div className="pb-1.5 shrink-0">
                <ArrowLeftRight
                  className="size-3.5"
                  style={{ color: routeComplete ? "var(--color-go)" : "var(--color-ink-300)" }}
                />
              </div>

              {/* ── TO ── */}
              <div className="flex flex-col flex-1 min-w-0">
                <label className={labelClass} style={labelStyle}>
                  {mode === "transfer" ? "To Loc" : "To Proj"} <span style={{ color: "var(--color-stop)" }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={() => { haptic(10); setModal(mode === "transfer" ? { type: "to-location" } : { type: "to-project" }); }}
                  className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left flex items-center gap-1 press truncate"
                  style={{
                    borderColor: routeComplete ? "var(--color-go)" : "var(--color-line)",
                    backgroundColor: "transparent",
                    color: (mode === "transfer" ? toLoc?.name : proj?.name) ? "var(--color-ink-950)" : "var(--color-ink-500)",
                  }}
                >
                  {mode === "transfer" ? (
                    toLoc?.name ? <span className="truncate block">{toLoc.name}</span> : <span>— Select —</span>
                  ) : (
                    proj?.name ? <span className="truncate block">{proj.name}</span> : <span>— Select —</span>
                  )}
                </button>
              </div>
            </div>

            {/* Inter-company indicator + charges (transfer mode) */}
            {mode === "transfer" &&
            fromLoc?.companyId && toLoc?.companyId &&
            fromLoc.companyId !== toLoc.companyId ? (
              <>
                <div
                  className="rounded-[0.5rem] px-2.5 py-2 text-m-caption font-semibold flex items-center gap-1.5"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--color-signal) 8%, transparent)",
                    color: "var(--color-signal-dark, var(--color-signal))",
                  }}
                >
                  <Truck className="size-3.5 shrink-0" />
                  <span>Inter-company transfer — transfer pricing applies</span>
                </div>

                {/* Inter-company STO charges */}
                <div className="grid grid-cols-3 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Freight
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={freight}
                      onChange={(e) => setFreight(e.target.value)}
                      placeholder="Amount"
                      className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Handling
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={handlingFee}
                      onChange={(e) => setHandlingFee(e.target.value)}
                      placeholder="Amount"
                      className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Markup %
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={markupPct}
                      onChange={(e) => setMarkupPct(e.target.value)}
                      placeholder="0%"
                      className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {/* Built unit (issue mode, if the project has units) */}
            {mode === "issue" && units.length > 0 ? (
              <div>
                <MobileSelectWithCreate
                  label="Built unit"
                  value={builtUnitId}
                  onChange={(v) => { setBuiltUnitId(v); haptic(10); }}
                  placeholder="General project allocation"
                  options={units.map((u) => ({
                    value: u.id,
                    label: `Unit ${u.unitNumber}`,
                    sub: u.builtAreaSqft ? `${u.builtAreaSqft} sqft` : undefined,
                  }))}
                  inputClass={inputClass}
                  inputStyle={inputStyle}
                />
              </div>
            ) : null}
          </div>

          {mode === "issue" ? (
            <>
              {/* ══════ SECTION: RECEIVER ══════ */}
              <div
                className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                  Receiver
                </p>
                <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value)}
                      placeholder="e.g. Guljaar"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={labelStyle}>
                      Mobile
                    </label>
                    <input
                      type="tel"
                      value={receiverMobile}
                      onChange={(e) => setReceiverMobile(e.target.value)}
                      placeholder="9876543210"
                      className={`${inputClass} font-mono`}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* ══════ SECTION: VEHICLE ══════ */}
              <div
                className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div
                  className="flex items-center gap-1.5 border-b pb-2"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <Truck className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                  <span className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-700)" }}>
                    Vehicle / Carrier
                  </span>
                </div>
                <VehicleCapture value={vehicle} onChange={setVehicle} compact />
              </div>
            </>
          ) : null}

          {/* ══════ SECTION: ITEMS ══════ */}
          <div
            className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {/* Heading + inline Add button (rightmost) */}
            <div className="flex items-center justify-between">
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Items ({lines.length})
              </p>
              <button
                type="button"
                onClick={handleAddLine}
                className="flex items-center gap-1 text-m-caption font-bold press px-2 py-1 rounded-full"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-signal) 10%, transparent)",
                  color: "var(--color-signal-dark, var(--color-signal))",
                }}
              >
                <Plus className="size-3" />
                <span>Add</span>
              </button>
            </div>

            {/* Lines — 2-col grid when 2+ items, single column when 1 */}
            <div className={lines.length > 1 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
              {lines.map((line, idx) => {
                const mat = materials.find((m) => m.id === line.materialId);
                const lotTracked = mat?.isLotTracked === true;
                const selectedLot = lotTracked && line.lotNumber
                  ? lotsCache[line.materialId]?.find((l) => l.lotNumber === line.lotNumber)
                  : null;
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
                          onClick={() => handleRemoveLine(idx)}
                          aria-label="Remove line"
                          className="text-m-body press"
                          style={{ color: "var(--color-stop)" }}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ) : null}

                    {/* Material + Qty — side by side (horizontal, like FAB popup) */}
                    <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                      <div>
                        <label className={labelClass} style={labelStyle}>
                          Material <span style={{ color: "var(--color-stop)" }}>*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => { haptic(10); setModal({ type: "material", lineIndex: idx }); }}
                          className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors text-left press truncate"
                          style={{
                            borderColor: "var(--color-line)",
                            backgroundColor: "transparent",
                            color: mat ? "var(--color-ink-950)" : "var(--color-ink-500)",
                          }}
                        >
                          {mat ? (
                            <span className="truncate block">
                              {mat.name}
                              <span className="font-normal" style={{ color: "var(--color-ink-700)" }}> · {mat.code}</span>
                            </span>
                          ) : (
                            <span>— Select —</span>
                          )}
                        </button>
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>
                          Qty{mat ? ` (${mat.unit})` : ""} <span style={{ color: "var(--color-stop)" }}>*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          enterKeyHint="next"
                          value={line.qty}
                          onChange={(e) => handleLineChange(idx, "qty", e.target.value)}
                          placeholder="Qty"
                          className="w-full h-7 px-1 text-m-caption font-bold tabular-nums outline-none border-b focus:border-b-2 transition-colors"
                          style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}
                        />
                      </div>
                    </div>

                    {/* Lot — selector for lot-tracked materials, hidden otherwise */}
                    {lotTracked ? (
                      <div>
                        <label className={labelClass} style={labelStyle}>
                          Lot / Batch <span style={{ color: "var(--color-stop)" }}>*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => openLotPicker(idx)}
                          className="w-full h-7 px-1 text-m-caption font-mono outline-none border-b focus:border-b-2 transition-colors text-left press truncate"
                          style={{
                            borderColor: "var(--color-line)",
                            backgroundColor: "transparent",
                            color: line.lotNumber ? "var(--color-ink-950)" : "var(--color-ink-500)",
                          }}
                        >
                          {selectedLot ? (
                            <span className="truncate block">
                              {selectedLot.lotNumber}
                              <span className="font-normal" style={{ color: "var(--color-ink-700)" }}>
                                {" "}· {selectedLot.currentQty} {mat?.unit ?? ""} avail
                              </span>
                            </span>
                          ) : line.lotNumber ? (
                            <span className="truncate block">{line.lotNumber}</span>
                          ) : (
                            <span>— Select lot —</span>
                          )}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ══════ SECTION: NOTES ══════ */}
          <div
            className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
              Notes
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={mode === "transfer"
                ? "e.g. Moving excess cement to Site B"
                : "e.g. Issued for Tower A foundation concreting"}
              rows={2}
              className="w-full px-1 py-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
              style={inputStyle}
            />
          </div>
        </form>
      </div>

      {/* ══════ STICKY BOTTOM BAR ══════ */}
      <div
        className="fixed left-0 right-0 z-30 border-t backdrop-blur-sm"
        style={{
          bottom: "calc(3.5rem + max(env(safe-area-inset-bottom), 0px))",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center justify-between gap-2">
          {/* Totals — compact, left-aligned (item count only; quantities can't be summed across mixed units) */}
          <div className="shrink-0 flex flex-col gap-0.5">
            <span className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-700)" }}>
              {lines.filter((l) => l.materialId && Number(l.qty) > 0).length} {lines.filter((l) => l.materialId && Number(l.qty) > 0).length === 1 ? "item" : "items"}
            </span>
            <span className="text-m-body font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {mode === "transfer" ? "Transfer" : "Issue"}
            </span>
          </div>

          {/* Submit button */}
          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; handleSubmit(e as unknown as React.FormEvent); }}
            disabled={submitting}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold text-m-body press disabled:opacity-50 select-none"
            style={{
              backgroundColor: mode === "issue" ? "var(--color-signal)" : "var(--color-ink-950)",
              color: "var(--color-paper)",
              touchAction: "none",
            }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {online ? <Send className="size-3.5" /> : <WifiOff className="size-3.5" />}
                <span>
                  {online
                    ? mode === "transfer"
                      ? "Create Transfer"
                      : "Generate Issue Challan"
                    : mode === "transfer"
                      ? "Queue Transfer (Offline)"
                      : "Queue Issue (Offline)"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODAL ══════ */}
      {modal ? (
        <SelectorModal
          title={
            modal.type === "from" ? "Select From Location" :
            modal.type === "to-location" ? "Select To Location" :
            modal.type === "to-project" ? "Select To Project" :
            modal.type === "lot" ? "Select Lot / Batch" :
            "Select Material"
          }
          createLabel={
            modal.type === "to-project" ? "project" :
            modal.type === "material" ? "material" :
            modal.type === "lot" ? undefined : "location"
          }
          items={
            modal.type === "from" || modal.type === "to-location"
              ? locations.map((l) => ({ id: l.id, label: l.name, sub: l.companyName ?? undefined }))
              : modal.type === "to-project"
                ? projects.map((p) => ({ id: p.id, label: p.name }))
                : modal.type === "lot"
                  ? (lotsCache[lines[modal.lineIndex ?? 0]?.materialId ?? ""] ?? []).map((l) => ({
                      id: l.lotNumber,
                      label: l.lotNumber,
                      sub: `${l.currentQty} ${materials.find((m) => m.id === lines[modal.lineIndex ?? 0]?.materialId)?.unit ?? ""} avail${l.expiryDate ? ` · exp ${new Date(l.expiryDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}`,
                    }))
                  : materials.map((m) => ({ id: m.id, label: m.name, sub: `${m.code} · ${m.unit}` }))
          }
          selectedId={
            modal.type === "from" ? fromLocationId :
            modal.type === "to-location" ? toLocationId :
            modal.type === "to-project" ? projectId :
            modal.type === "lot" ? (lines[modal.lineIndex ?? 0]?.lotNumber ?? "") :
            (lines[modal.lineIndex ?? 0]?.materialId ?? "")
          }
          onSelect={(id) => {
            if (modal.type === "from") setFromLocationId(id);
            else if (modal.type === "to-location") setToLocationId(id);
            else if (modal.type === "to-project") setProjectId(id);
            else if (modal.type === "lot" && modal.lineIndex !== undefined) {
              handleLineChange(modal.lineIndex, "lotNumber", id);
            }
            else if (modal.type === "material" && modal.lineIndex !== undefined) {
              handleLineChange(modal.lineIndex, "materialId", id);
              // Clear any stale lot when material changes
              handleLineChange(modal.lineIndex, "lotNumber", "");
            }
            setModal(null);
          }}
          onClose={() => setModal(null)}
          onCreate={
            modal.type === "lot" ? undefined : () => {
              if (modal) {
                setShowCreateDialog(
                  modal.type === "to-project" ? "project" :
                  modal.type === "material" ? "material" : "location",
                );
              }
            }
          }
        />
      ) : null}

      {/* ══════ INLINE CREATE DIALOGS ══════ */}
      {showCreateDialog === "location" ? (
        <MobileNewStockLocationDialog
          open
          onClose={() => setShowCreateDialog(null)}
          projects={[]}
          onCreated={(l) => {
            setLocations((prev) =>
              prev.some((x) => x.id === l.id)
                ? prev
                : [...prev, { id: l.id, name: l.name, type: l.type }],
            );
            if (modal?.type === "from") setFromLocationId(l.id);
            else if (modal?.type === "to-location") setToLocationId(l.id);
            setShowCreateDialog(null);
            setModal(null);
          }}
        />
      ) : null}
      {showCreateDialog === "project" ? (
        <MobileFabModal
          open
          onClose={() => setShowCreateDialog(null)}
          title="New Project"
        >
          <MobileNewProjectDialog
            open
            onClose={() => setShowCreateDialog(null)}
            onCreated={(p) => {
              setProjects((prev) =>
                prev.some((x) => x.id === p.id)
                  ? prev
                  : [...prev, { id: p.id, name: p.name }],
              );
              setProjectId(p.id);
              setShowCreateDialog(null);
              setModal(null);
            }}
          />
        </MobileFabModal>
      ) : null}
      {showCreateDialog === "material" ? (
        <MobileNewMaterialDialog
          open
          onClose={() => setShowCreateDialog(null)}
          categories={[]}
          onCreated={(m) => {
            setMaterials((prev) =>
              prev.some((x) => x.id === m.id)
                ? prev
                : [...prev, { id: m.id, name: m.name, code: m.code, unit: m.unit }],
            );
            if (modal?.lineIndex !== undefined) {
              handleLineChange(modal.lineIndex, "materialId", m.id);
            }
            setShowCreateDialog(null);
            setModal(null);
          }}
        />
      ) : null}
    </>
  );
}
