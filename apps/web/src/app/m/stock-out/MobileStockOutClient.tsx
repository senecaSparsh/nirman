"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, ArrowLeftRight, Package, MapPin, Plus, Trash2,
  Send, Loader2, CheckCircle2, WifiOff, User, Truck,
  ShieldCheck, Printer, Building2, Clock,
} from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useDrafts } from "@/lib/offline/use-drafts";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { DraftBanner } from "@/components/mobile/draft-banner";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { MobileNewProjectDialog } from "@/app/m/projects/MobileNewProjectDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import { VehicleCapture, type VehicleData } from "@/components/mobile/vehicle-capture";

type Mode = "transfer" | "issue";

interface LocationItem {
  id: string; name: string; type: string;
  companyId?: string; companyName?: string | null;
}
interface ProjectItem { id: string; name: string; }
interface MaterialItem { id: string; name: string; code: string; unit: string; }
interface UnitItem { id: string; unitNumber: string; builtAreaSqft?: number; }

interface StockLine { materialId: string; qty: string; }

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
}

const inputClass =
  "w-full rounded-[0.375rem] border px-2.5 py-2 text-m-section font-medium outline-none";
const inputStyle = {
  borderColor: "var(--color-line)",
  backgroundColor: "var(--color-paper)",
  color: "var(--color-ink-950)",
};

export function MobileStockOutClient({
  canTransfer,
  canIssue,
  initialMode,
  initialProjectId,
}: {
  canTransfer: boolean;
  canIssue: boolean;
  initialMode: Mode;
  initialProjectId: string;
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
  const [lines, setLines] = useState<StockLine[]>([{ materialId: "", qty: "" }]);
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
          setLines(draft.lines.length > 0 ? draft.lines : [{ materialId: "", qty: "" }]);
          setDraftRestored(true);
        } else {
          if (locs.length > 0) setFromLocationId(locs[0]!.id);
          if (locs.length > 1) setToLocationId(locs[1]!.id);
          if (initialProjectId && projs.some((p) => p.id === initialProjectId)) {
            setProjectId(initialProjectId);
          } else if (projs.length > 0) {
            setProjectId(projs[0]!.id);
          }
          if (mats.length > 0) setLines([{ materialId: mats[0]!.id, qty: "" }]);
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
    saveDraft({
      mode, fromLocationId, toLocationId, projectId, builtUnitId,
      receiverName, receiverMobile, vehicle, notes, lines,
    });
  }, [mode, fromLocationId, toLocationId, projectId, builtUnitId,
      receiverName, receiverMobile, vehicle, notes, lines, loading,
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
    const defaultMatId = materials.length > 0 ? materials[0]!.id : "";
    setLines([...lines, { materialId: defaultMatId, qty: "" }]);
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

  // ── Mode switch — clear destination-specific state ──
  const switchMode = (newMode: Mode) => {
    if (newMode === mode) return;
    haptic(5);
    setMode(newMode);
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
    }
  };

  // ── Long-press on Transfer/Issue buttons → jump to the full dedicated page ──
  // A quick tap switches mode in-place (the segmented control). A long-press
  // (≥500ms) navigates to the standalone /m/transfers/new or /m/site/issue
  // page — useful when you need the full-page form with all options visible.
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
      //   Transfer → /m/transfers (all stock transfers)
      //   Issue → /m/site (field dashboard with recent issues)
      const href = target === "transfer" ? "/m/transfers" : "/m/site";
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
    mode === "transfer" ? "/m/transfers" : "/m/site",
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

    setSubmitting(true);
    haptic(10);

    try {
      if (mode === "transfer") {
        // ── Transfer submit ──
        if (!toLocationId) { toast.error("Select destination location"); return; }
        if (fromLocationId === toLocationId) {
          toast.error("Source and destination must be different");
          return;
        }

        const payload = {
          fromLocationId,
          toLocationId,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId, qty: Number(l.qty),
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create transfer");

        haptic([10, 40, 80]);
        clearDraft();
        setSuccess({ id: data.id, number: "transfer" });
        toast.success("Transfer draft created", {
          description: "Dispatch it from the transfer detail page to move stock.",
        });
      } else {
        // ── Issue submit ──
        if (!projectId) { toast.error("Select target project"); return; }

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
        const data = await res.json();
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
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-500)" }} />
        <p className="text-m-body mt-2" style={{ color: "var(--color-ink-500)" }}>Loading form…</p>
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
        <p className="text-m-section font-bold mb-1" style={{ color: "var(--color-ink-950)" }}>
          {label}
        </p>
        <p className="text-m-body mb-4" style={{ color: "var(--color-ink-500)" }}>
          {isQueued
            ? "Will sync when back online."
            : isGatePass
              ? "Awaiting gate pass approval before items can leave."
              : isTransfer
                ? "Draft created — dispatch it from the transfer detail page to move stock."
                : "Materials have been issued to the project."}
        </p>
        <div className="flex gap-2 flex-wrap justify-center">
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
              setLines([{ materialId: materials[0]?.id ?? "", qty: "" }]);
              setNotes("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
          >
            {isTransfer ? "Add Another Transfer" : "Issue More Materials"}
          </button>
        </div>
      </div>
    );
  }

  const fromLoc = locations.find((l) => l.id === fromLocationId);
  const toLoc = locations.find((l) => l.id === toLocationId);
  const proj = projects.find((p) => p.id === projectId);

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
            setLines(draft.lines.length > 0 ? draft.lines : [{ materialId: "", qty: "" }]);
            setDraftRestored(true);
            haptic(10);
          }}
          onDiscard={() => { clearDraft(); setDraftRestored(true); }}
        />
      )}

      <div className="pb-32">
        {/* ── Mode toggle — segmented control ── */}
        {(canTransfer && canIssue) ? (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={() => handleModeTap("transfer")}
              onPointerDown={() => startLongPress("transfer")}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onContextMenu={(e) => e.preventDefault()}
              className="rounded-[0.5rem] border py-2.5 px-2 flex flex-col items-center justify-center gap-0.5 text-m-body press transition-colors select-none"
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
              <span className="text-m-caption font-normal" style={{ opacity: 0.5 }}>
                Hold for list
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleModeTap("issue")}
              onPointerDown={() => startLongPress("issue")}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onContextMenu={(e) => e.preventDefault()}
              className="rounded-[0.5rem] border py-2.5 px-2 flex flex-col items-center justify-center gap-0.5 text-m-body press transition-colors select-none"
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
              <span className="text-m-caption font-normal" style={{ opacity: 0.5 }}>
                Hold for list
              </span>
            </button>
          </div>
        ) : (
          <div
            className="rounded-[0.5rem] border px-3 py-2 mb-3 flex items-center gap-2"
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

        {/* ── Route summary: from → to ── */}
        <div
          className="rounded-[0.625rem] border p-3 mb-3 flex items-center gap-2"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex-1 min-w-0 text-center">
            <MapPin className="size-3 mx-auto mb-1" style={{ color: "var(--color-ink-500)" }} />
            <p className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {fromLoc?.name ?? "Select source"}
            </p>
            {fromLoc?.companyName ? (
              <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                {fromLoc.companyName}
              </p>
            ) : null}
          </div>
          <ArrowRight className="size-4 shrink-0" style={{ color: "var(--color-signal)" }} />
          <div className="flex-1 min-w-0 text-center">
            {mode === "transfer" ? (
              <>
                <MapPin className="size-3 mx-auto mb-1" style={{ color: "var(--color-ink-500)" }} />
                <p className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {toLoc?.name ?? "Select destination"}
                </p>
                {toLoc?.companyName ? (
                  <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                    {toLoc.companyName}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <Building2 className="size-3 mx-auto mb-1" style={{ color: "var(--color-ink-500)" }} />
                <p className="text-m-caption font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {proj?.name ?? "Select project"}
                </p>
              </>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* ── Source location (shared) ── */}
          <MobileSelectWithCreate
            label="From Location"
            required
            value={fromLocationId}
            onChange={setFromLocationId}
            options={locations.map((l) => ({
              value: l.id,
              label: l.companyName ? `${l.name} · ${l.companyName}` : l.name,
            }))}
            inputClass="w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none"
            inputStyle={inputStyle}
            renderDialog={({ open, onClose, onCreated }) => (
              <MobileNewStockLocationDialog
                open={open}
                onClose={onClose}
                projects={[]}
                onCreated={(l) => onCreated(l.id, l.name)}
              />
            )}
          />

          {/* ── Destination section (mode-specific) ── */}
          {mode === "transfer" ? (
            <>
              {/* Transfer: destination location */}
              <MobileSelectWithCreate
                label="To Location"
                required
                value={toLocationId}
                onChange={setToLocationId}
                options={locations.map((l) => ({
                  value: l.id,
                  label: l.companyName ? `${l.name} · ${l.companyName}` : l.name,
                }))}
                inputClass="w-full h-10 rounded-[0.5rem] border px-3 text-m-section outline-none"
                inputStyle={inputStyle}
                renderDialog={({ open, onClose, onCreated }) => (
                  <MobileNewStockLocationDialog
                    open={open}
                    onClose={onClose}
                    projects={[]}
                    onCreated={(l) => onCreated(l.id, l.name)}
                  />
                )}
              />
              {/* Inter-company indicator */}
              {fromLoc?.companyId && toLoc?.companyId && fromLoc.companyId !== toLoc.companyId ? (
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
              ) : null}
            </>
          ) : (
            <>
              {/* Issue: project + built unit + receiver + vehicle */}
              <div
                className="rounded-[0.625rem] border p-3 space-y-2.5"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div
                  className="flex items-center gap-1.5 border-b pb-2"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <Building2 className="size-3.5" style={{ color: "var(--color-steel)" }} />
                  <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                    Destination
                  </span>
                </div>

                <MobileSelectWithCreate
                  label="To project"
                  required
                  value={projectId}
                  onChange={setProjectId}
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  inputClass={inputClass}
                  inputStyle={inputStyle}
                  renderDialog={({ open, onClose, onCreated }) => (
                    <MobileNewProjectDialog
                      open={open}
                      onClose={onClose}
                      onCreated={(p) => onCreated(p.id, p.name)}
                    />
                  )}
                />

                {units.length > 0 ? (
                  <div>
                    <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
                      Built unit (optional)
                    </label>
                    <select
                      value={builtUnitId}
                      onChange={(e) => setBuiltUnitId(e.target.value)}
                      className={inputClass}
                      style={inputStyle}
                    >
                      <option value="">General project allocation</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          Unit {u.unitNumber}{u.builtAreaSqft ? ` (${u.builtAreaSqft} sqft)` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              {/* Receiver */}
              <div
                className="rounded-[0.625rem] border p-3 space-y-2.5"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div
                  className="flex items-center gap-1.5 border-b pb-2"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <User className="size-3.5" style={{ color: "var(--color-steel)" }} />
                  <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                    Receiver
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
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
                    <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
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

              {/* Vehicle */}
              <div className="space-y-2">
                <div
                  className="flex items-center gap-1.5 border-b pb-2"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <Truck className="size-3.5" style={{ color: "var(--color-steel)" }} />
                  <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                    Vehicle / Carrier
                  </span>
                </div>
                <VehicleCapture value={vehicle} onChange={setVehicle} compact />
              </div>
            </>
          )}

          {/* ── Material lines (shared) ── */}
          <div className="flex items-center gap-1.5 mt-1">
            <Package className="size-3" style={{ color: "var(--color-steel)" }} />
            <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-steel)" }}>
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
                    <span className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
                      Item {idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="text-m-body press"
                        style={{ color: "var(--color-stop)" }}
                      >
                        <Trash2 className="size-2.5" />
                      </button>
                    )}
                  </div>
                  <div className="p-2 flex flex-col gap-1.5">
                    <MobileSelectWithCreate
                      label=""
                      value={line.materialId}
                      onChange={(val) => handleLineChange(idx, "materialId", val)}
                      options={materials.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                      inputClass="w-full h-9 rounded-[0.375rem] border px-2 text-m-body outline-none"
                      inputStyle={inputStyle}
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
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="next"
                        value={line.qty}
                        onChange={(e) => handleLineChange(idx, "qty", e.target.value)}
                        placeholder="Qty"
                        className="flex-1 h-9 rounded-[0.375rem] border px-2 text-m-body font-bold tabular-nums outline-none"
                        style={inputStyle}
                      />
                      {mat && (
                        <span className="text-m-caption font-semibold shrink-0" style={{ color: "var(--color-ink-500)" }}>
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
            className="flex items-center justify-center gap-1 w-full rounded-[0.5rem] border border-dashed py-2.5 text-m-body press"
            style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
          >
            <Plus className="size-3.5" />
            <span className="text-m-body font-bold">Add another item</span>
          </button>

          {/* Notes (shared) */}
          <div>
            <label className="text-m-caption font-semibold block mb-1" style={{ color: "var(--color-ink-500)" }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={mode === "transfer"
                ? "e.g. Moving excess cement to Site B"
                : "e.g. Issued for Tower A foundation concreting"}
              rows={2}
              className="w-full rounded-[0.375rem] border px-2.5 py-2 text-m-section outline-none resize-none"
              style={inputStyle}
            />
          </div>
        </form>
      </div>

      {/* ── Sticky bottom bar ── */}
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
            <p className="text-m-caption font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>
              {lines.filter((l) => Number(l.qty) > 0).length} items
            </p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>
              {formatNumber(lines.reduce((s, l) => s + (Number(l.qty) || 0), 0), 2)} units
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; handleSubmit(e as unknown as React.FormEvent); }}
            disabled={submitting}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50 select-none"
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
    </>
  );
}
