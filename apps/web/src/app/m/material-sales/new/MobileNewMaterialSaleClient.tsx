"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronDown,
  User,
  MapPin,
  Package,
  Building2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Wallet,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Send,
  WifiOff,
  ShieldCheck,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useDrafts } from "@/lib/offline/use-drafts";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { DraftBanner } from "@/components/mobile/draft-banner";
import {
  MobileChequeFields,
  EMPTY_MOBILE_CHEQUE,
  type MobileChequeState,
} from "../../sales/MobileChequeFields";
import { haptic } from "@/lib/haptic";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";
import { useLongPressNav } from "@/lib/use-long-press-nav";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { MobileNewCustomerDialog } from "@/app/m/sales/MobileNewCustomerDialog";
import { MobileNewMaterialDialog } from "@/app/m/materials/MobileNewMaterialDialog";
import {
  VehicleCapture,
  type VehicleData,
} from "@/components/mobile/vehicle-capture";
import { useSmartDefaults } from "@/lib/use-smart-defaults";
import { SmartDefaultsBadge } from "@/components/mobile/v2/smart-defaults-badge";
import { SelectorModal, SelectorCard, SelectorRow, TypeCard } from "@/components/mobile/v2/form-primitives";

interface CustomerItem {
  id: string;
  name: string;
  phone?: string | null;
}
interface LocationItem {
  id: string;
  name: string;
  type: string;
}
interface MaterialItem {
  id: string;
  name: string;
  code: string;
  unit: string;
  gstRate: number;
}
interface ProjectItem {
  id: string;
  name: string;
}

interface SaleLine {
  materialId: string;
  locationId: string;
  qty: string;
  unitPrice: string;
}

const PAYMENT_MODES = ["CASH", "BANK", "UPI", "CHEQUE"] as const;
type PaymentMode = (typeof PAYMENT_MODES)[number];
type PaymentType = "credit" | "paid";

interface PaymentSplit {
  id: string;
  amount: string;
  mode: PaymentMode;
  cheque?: MobileChequeState;
}

interface SaleDraft {
  customerId: string;
  projectId: string;
  paymentType: PaymentType;
  paymentSplits: PaymentSplit[];
  notes: string;
  partyName: string;
  lines: SaleLine[];
}

export default function MobileNewMaterialSaleClient({
  onClose,
  onCreated,
}: {
  onClose?: () => void;
  onCreated?: () => void;
} = {}) {
  const router = useRouter();
  const { online, enqueue } = useOfflineQueue();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ── Smart defaults: last-known prices + last-used payment mode ──
  const [lastPrices, setLastPrices] = useState<Record<string, number>>({});

  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("credit");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([
    { id: crypto.randomUUID(), amount: "", mode: "CASH" },
  ]);
  const [notes, setNotes] = useState("");
  const [partyName, setPartyName] = useState("");
  const [vehicle, setVehicle] = useState<VehicleData>({
    vehicleNumber: "",
    vehicleType: "",
  });
  const [lines, setLines] = useState<SaleLine[]>([
    { materialId: "", locationId: "", qty: "", unitPrice: "" },
  ]);

  const [success, setSuccess] = useState<{
    saleId?: string;
    saleNumber: string;
    totalAmount: number;
    amountPaid?: number;
  } | null>(null);

  // ── Draft auto-save (IndexedDB) — survives interruptions / offline ──
  const { draft, hasDraft, draftUpdatedAt, saveDraft, clearDraft } =
    useDrafts<SaleDraft>("material-sale", "material-sale-new");
  const [draftRestored, setDraftRestored] = useState(false);

  // ── Smart defaults — pre-fill customer from last-used (if no draft) ──
  const { getDefault, recordDefaults } = useSmartDefaults("material-sale");
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [custRes, locRes, matRes, projRes, salesRes] = await Promise.all([
          fetch("/api/customers").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/stock-locations").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/materials").then((r) => (r.ok ? r.json() : { rows: [] })),
          fetch("/api/projects").then((r) => (r.ok ? r.json() : [])),
          fetch("/api/material-sales?limit=20").then((r) =>
            r.ok ? r.json() : [],
          ),
        ]);
        if (cancelled) return;
        if (Array.isArray(custRes)) {
          setCustomers(custRes);
          if (custRes.length > 0) {
            // Smart default: last-used customer (if no draft)
            const defCustomer = getDefault("customerId");
            if (!hasDraft && defCustomer && custRes.some((c) => c.id === defCustomer)) {
              setCustomerId(defCustomer);
              setDefaultsApplied(true);
            } else {
              setCustomerId(custRes[0].id);
            }
          }
        }
        if (Array.isArray(locRes)) {
          setLocations(locRes);
          if (locRes.length > 0 && matRes?.rows?.length > 0) {
            setLines([
              {
                materialId: matRes.rows[0].id,
                locationId: locRes[0].id,
                qty: "",
                unitPrice: "",
              },
            ]);
          }
        }
        if (matRes?.rows) setMaterials(matRes.rows);
        if (Array.isArray(projRes)) setProjects(projRes);

        // ── Build last-known price map from recent sales ──
        if (Array.isArray(salesRes)) {
          const priceMap: Record<string, number> = {};
          // Sales are newest-first; iterate to keep the most recent price per material
          for (const sale of salesRes) {
            const lines = sale.lines ?? sale.items ?? [];
            for (const line of lines) {
              if (
                line.materialId &&
                line.unitPrice &&
                !priceMap[line.materialId]
              ) {
                priceMap[line.materialId] = Number(line.unitPrice);
              }
            }
          }
          if (!cancelled && Object.keys(priceMap).length > 0) {
            setLastPrices(priceMap);
          }
        }
      } catch (err) {
        console.error("Failed to load form options:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();

    // ── Read last-used payment mode from localStorage ──
    try {
      const savedMode = localStorage.getItem(
        "nirman.last-payment-mode",
      ) as PaymentMode | null;
      if (savedMode && PAYMENT_MODES.includes(savedMode)) {
        setPaymentSplits((prev) =>
          prev.map((s, i) => (i === 0 ? { ...s, mode: savedMode } : s)),
        );
      }
    } catch {
      // localStorage may be blocked — ignore
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount only
  }, []);

  // ── Auto-save draft whenever form state changes (debounced 2s) ──
  useEffect(() => {
    // Don't save until options are loaded (avoid overwriting draft with empty defaults)
    if (loading) return;
    // Don't save after successful submit
    if (success) return;
    // Only save when the user has entered something meaningful
    const hasContent = customerId || projectId || partyName || notes ||
      lines.some((l) => l.materialId || l.qty);
    if (!hasContent) return;
    saveDraft({
      customerId,
      projectId,
      paymentType,
      paymentSplits,
      notes,
      partyName,
      lines,
    });
  }, [
    customerId,
    projectId,
    paymentType,
    paymentSplits,
    notes,
    partyName,
    lines,
    loading,
    success,
    saveDraft,
  ]);

  const handleAddLine = () => {
    const defaultMatId = materials.length > 0 ? materials[0]!.id : "";
    const defaultLocId = locations.length > 0 ? locations[0]!.id : "";
    setLines([
      ...lines,
      {
        materialId: defaultMatId,
        locationId: defaultLocId,
        qty: "",
        unitPrice: "",
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (
    index: number,
    field: keyof SaleLine,
    val: string,
  ) => {
    const updated = [...lines];
    updated[index] = { ...updated[index]!, [field]: val };
    // ── Smart default: auto-fill unit price from last sale when material changes ──
    if (field === "materialId" && val && !updated[index]!.unitPrice) {
      const lastPrice = lastPrices[val];
      if (lastPrice) {
        updated[index] = { ...updated[index]!, unitPrice: String(lastPrice) };
      }
    }
    setLines(updated);
  };

  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0),
    0,
  );
  const gstTotal = lines.reduce((s, l) => {
    const mat = materials.find((m) => m.id === l.materialId);
    const rate = mat?.gstRate ?? 0;
    return s + ((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * rate) / 100;
  }, 0);
  const total = subtotal + gstTotal;

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedProject = projects.find((p) => p.id === projectId);

  // ── Unsaved-changes guard — warns on accidental back/navigation ──
  const isDirty =
    !success &&
    (lines.some((l) => Number(l.qty) > 0 || Number(l.unitPrice) > 0) ||
      paymentSplits.some((s) => Number(s.amount) > 0) ||
      notes.trim().length > 0);
  useUnsavedGuard(isDirty);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    const validLines = lines.filter(
      (l) =>
        l.materialId &&
        l.locationId &&
        Number(l.qty) > 0 &&
        Number(l.unitPrice) > 0,
    );
    if (validLines.length === 0) {
      toast.error("Add at least one line item with qty and price");
      return;
    }

    // Validate payment splits
    const validSplits =
      paymentType === "paid"
        ? paymentSplits.filter((s) => Number(s.amount) > 0)
        : [];
    const totalPaid = validSplits.reduce(
      (s, sp) => s + (Number(sp.amount) || 0),
      0,
    );

    if (paymentType === "paid") {
      if (validSplits.length === 0) {
        toast.error("Add at least one payment with an amount");
        return;
      }
      if (totalPaid > total + 0.01) {
        toast.error(
          `Total payments (${formatCurrency(totalPaid)}) exceed sale total (${formatCurrency(total)})`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      // Record smart defaults for next time
      recordDefaults({ customerId, projectId });

      const salePayload = {
        customerId,
        projectId: projectId || null,
        paymentMode:
          paymentType === "credit" ? null : (validSplits[0]?.mode ?? null),
        vehicleNumber: vehicle.vehicleNumber.trim() || undefined,
        vehicleType: vehicle.vehicleType || undefined,
        vehiclePhotoUrl: vehicle.photoUrl,
        driverName: vehicle.driverName,
        driverPhone: vehicle.driverPhone,
        partyName: partyName.trim() || null,
        notes: notes || null,
        requireGatePass: true,
        lines: validLines.map((l) => {
          const mat = materials.find((m) => m.id === l.materialId);
          return {
            materialId: l.materialId,
            locationId: l.locationId,
            qty: Number(l.qty),
            unitPrice: Number(l.unitPrice),
            gstRate: mat?.gstRate ?? 0,
          };
        }),
      };

      // Offline: queue the sale creation (payments recorded after sync)
      if (!online) {
        await enqueue("material-sale", salePayload);
        haptic([10, 40, 80]);
        clearDraft();
        onCreated?.();
        setSuccess({
          saleNumber: "QUEUED",
          totalAmount: total,
          amountPaid: undefined,
        });
        toast.success("Sale queued offline", {
          description: "Record payments after sync completes",
        });
        return;
      }

      // 1. Create the sale
      const res = await fetch("/api/material-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(salePayload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create sale");
      }
      const data = await res.json();
      const saleId = data.id;

      // Gate pass pending flow: sale is PENDING, stock hasn't moved yet.
      // Payments are recorded after the gate pass is approved and the sale executes.
      if (data.pending) {
        haptic([10, 40, 80]);
        clearDraft();
        onCreated?.();
        setSuccess({
          saleNumber: "GATE PASS",
          totalAmount: total,
          amountPaid: undefined,
        });
        toast.success("Gate pass created — awaiting approval", {
          description:
            data.message ??
            "Items cannot leave the gate until the gate pass is approved.",
          action: {
            label: "View Gate Passes",
            onClick: () => router.push("/m/gate-pass"),
          },
        });
        return;
      }

      // 2. Record each payment split sequentially
      //    Backend tracks previouslyPaid and prevents overpayment
      let paymentFailed = false;
      for (const split of validSplits) {
        const payRes = await fetch(`/api/material-sales/${saleId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(split.amount),
            paymentMode: split.mode,
            ...(split.mode === "CHEQUE" && split.cheque
              ? {
                  chequeNo: split.cheque.chequeNo.trim() || undefined,
                  chequeDate: split.cheque.chequeDate || undefined,
                  chequeBank: split.cheque.chequeBank.trim() || undefined,
                  chequePhotoUrl: split.cheque.chequePhotoUrl || undefined,
                }
              : {}),
          }),
        });
        if (!payRes.ok) {
          const err = await payRes.json().catch(() => ({}));
          toast.warning(
            `Payment of ${formatCurrency(Number(split.amount))} via ${split.mode} failed: ${err.error ?? "unknown"}`,
          );
          paymentFailed = true;
          break;
        }
      }

      setSuccess({
        saleId: data.id,
        saleNumber: data.saleNumber,
        totalAmount: total,
        amountPaid: paymentFailed ? undefined : totalPaid,
      });
      // Haptic + clear draft on success
      haptic(paymentFailed ? [10, 40, 10] : [10, 40, 80]);
      clearDraft();
      // Refresh server-rendered cache so the material sales list
      // shows the new sale when the user navigates back.
      router.refresh();
      onCreated?.();
      // ── Persist last-used payment mode for next sale ──
      if (validSplits.length > 0) {
        try {
          localStorage.setItem(
            "nirman.last-payment-mode",
            validSplits[0]!.mode,
          );
        } catch {
          // ignore
        }
      }
    } catch (err) {
      haptic([50, 20, 50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed to create sale");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (success) {
    const isQueued = success.saleNumber === "QUEUED";
    const isGatePass = success.saleNumber === "GATE PASS";
    const isPending = isQueued || isGatePass;
    const isPaid =
      !isPending &&
      success.amountPaid !== undefined &&
      success.amountPaid >= success.totalAmount - 0.01;
    const isPartial =
      !isPending &&
      success.amountPaid !== undefined &&
      success.amountPaid < success.totalAmount - 0.01;
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div
          className="grid place-items-center size-14 rounded-full mb-3"
          style={{
            backgroundColor: isPending
              ? "color-mix(in srgb, var(--color-signal) 12%, transparent)"
              : "color-mix(in srgb, var(--color-go) 12%, transparent)",
          }}
        >
          {isQueued ? (
            <WifiOff
              className="size-7"
              style={{ color: "var(--color-signal)" }}
            />
          ) : isGatePass ? (
            <ShieldCheck
              className="size-7"
              style={{ color: "var(--color-signal)" }}
            />
          ) : (
            <CheckCircle2
              className="size-7"
              style={{ color: "var(--color-go)" }}
            />
          )}
        </div>
        <p
          className="text-m-section font-extrabold tracking-tight mb-1"
          style={{ color: "var(--color-ink-950)" }}
        >
          {isQueued
            ? "Sale Queued Offline"
            : isGatePass
              ? "Gate Pass Created"
              : "Sale Created"}
        </p>
        <p
          className="text-m-body font-mono mb-3"
          style={{ color: "var(--color-ink-500)" }}
        >
          {isQueued
            ? "Pending sync"
            : isGatePass
              ? "Gate pass pending"
              : success.saleNumber}
        </p>
        <p
          className="text-m-section font-bold tabular-nums mb-1"
          style={{ color: "var(--color-go)" }}
        >
          {formatCurrency(success.totalAmount)}
        </p>
        {/* Payment status badge */}
        {isQueued ? (
          <p
            className="text-m-caption font-bold uppercase mb-4"
            style={{ color: "var(--color-signal)" }}
          >
            Record Payments After Sync
          </p>
        ) : isGatePass ? (
          <p
            className="text-m-caption font-bold uppercase mb-4"
            style={{ color: "var(--color-signal)" }}
          >
            Awaiting Gate Pass Approval
          </p>
        ) : isPaid ? (
          <p
            className="text-m-caption font-bold uppercase mb-4"
            style={{ color: "var(--color-go)" }}
          >
            Fully Paid
          </p>
        ) : isPartial ? (
          <p
            className="text-m-caption font-bold uppercase mb-4"
            style={{ color: "var(--color-signal)" }}
          >
            Partial ·{" "}
            {formatCurrency(success.totalAmount - (success.amountPaid ?? 0))}{" "}
            Due
          </p>
        ) : (
          <p
            className="text-m-caption font-bold uppercase mb-4"
            style={{ color: "var(--color-signal)" }}
          >
            Unpaid · Credit
          </p>
        )}
        <div className="flex flex-col gap-3">
          {isGatePass ? (
            <button
              onClick={() => router.push("/m/gate-pass")}
              className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
              style={{
                backgroundColor: "var(--color-ink-950)",
                color: "var(--color-paper)",
              }}
            >
              View Gate Passes
            </button>
          ) : (
            <>
              {!isQueued && success.saleId ? (
                <button
                  onClick={() => router.push(`/m/material-sales/${success.saleId}`)}
                  className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
                  style={{
                    backgroundColor: "var(--color-ink-950)",
                    color: "var(--color-paper)",
                  }}
                >
                  View {success.saleNumber}
                </button>
              ) : null}
              <button
                onClick={() => {
                  router.refresh();
                  onClose?.();
                  router.push("/m/material-sales");
                }}
                className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
                style={{
                  backgroundColor: "var(--color-ink-950)",
                  color: "var(--color-paper)",
                }}
              >
                View All Sales
              </button>
            </>
          )}
          <button
            onClick={() => {
              setSuccess(null);
              setLines([
                {
                  materialId: "",
                  locationId: "",
                  qty: "",
                  unitPrice: "",
                },
              ]);
              setPaymentSplits([
                { id: crypto.randomUUID(), amount: "", mode: "CASH" },
              ]);
              setNotes("");
            }}
            className="rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "transparent",
              color: "var(--color-ink-950)",
            }}
          >
            Add Another
          </button>
        </div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2
          className="size-6 animate-spin"
          style={{ color: "var(--color-ink-500)" }}
        />
        <p
          className="text-m-body mt-2"
          style={{ color: "var(--color-ink-500)" }}
        >
          Loading form…
        </p>
      </div>
    );
  }

  // ── Restore draft handler ──
  function handleRestoreDraft() {
    if (!draft) return;
    setCustomerId(draft.customerId);
    setProjectId(draft.projectId);
    setPaymentType(draft.paymentType);
    setPaymentSplits(draft.paymentSplits);
    setNotes(draft.notes);
    setPartyName(draft.partyName ?? "");
    setLines(draft.lines);
    setDraftRestored(true);
    haptic(10);
  }

  return (
    <>
      {hasDraft && !draftRestored && !success && (
        <DraftBanner
          formName="Material Sale"
          updatedAt={draftUpdatedAt}
          onRestore={handleRestoreDraft}
          onDiscard={() => {
            clearDraft();
            setDraftRestored(true);
          }}
        />
      )}
      {defaultsApplied && !hasDraft && !success && (
        <SmartDefaultsBadge onDismiss={() => setDefaultsApplied(false)} />
      )}
      <SaleForm
        customers={customers}
        locations={locations}
        materials={materials}
        projects={projects}
        customerId={customerId}
        setCustomerId={setCustomerId}
        projectId={projectId}
        setProjectId={setProjectId}
        partyName={partyName}
        setPartyName={setPartyName}
        paymentType={paymentType}
        setPaymentType={setPaymentType}
        paymentSplits={paymentSplits}
        setPaymentSplits={setPaymentSplits}
        notes={notes}
        vehicle={vehicle}
        setVehicle={setVehicle}
        setNotes={setNotes}
        lines={lines}
        setLines={setLines}
        onAddLine={handleAddLine}
        onRemoveLine={handleRemoveLine}
        onLineChange={handleLineChange}
        onSubmit={handleSubmit}
        submitting={submitting}
        subtotal={subtotal}
        gstTotal={gstTotal}
        total={total}
        selectedCustomer={selectedCustomer}
        selectedProject={selectedProject}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Main form component — holds the selector modal state
 * ═══════════════════════════════════════════════════════════ */
function SaleForm({
  customers,
  locations,
  materials,
  projects,
  customerId,
  setCustomerId,
  projectId,
  setProjectId,
  partyName,
  setPartyName,
  paymentType,
  setPaymentType,
  paymentSplits,
  setPaymentSplits,
  notes,
  setNotes,
  vehicle,
  setVehicle,
  lines,
  setLines: _setLines,
  onAddLine,
  onRemoveLine,
  onLineChange,
  onSubmit,
  submitting,
  subtotal: _subtotal,
  gstTotal: _gstTotal,
  total,
  selectedCustomer,
  selectedProject,
}: {
  customers: CustomerItem[];
  locations: LocationItem[];
  materials: MaterialItem[];
  projects: ProjectItem[];
  customerId: string;
  setCustomerId: (v: string) => void;
  projectId: string;
  setProjectId: (v: string) => void;
  partyName: string;
  setPartyName: (v: string) => void;
  paymentType: PaymentType;
  setPaymentType: (v: PaymentType) => void;
  paymentSplits: PaymentSplit[];
  setPaymentSplits: React.Dispatch<React.SetStateAction<PaymentSplit[]>>;
  notes: string;
  setNotes: (v: string) => void;
  vehicle: VehicleData;
  setVehicle: (v: VehicleData) => void;
  lines: SaleLine[];
  setLines: React.Dispatch<React.SetStateAction<SaleLine[]>>;
  onAddLine: () => void;
  onRemoveLine: (i: number) => void;
  onLineChange: (i: number, field: keyof SaleLine, val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  subtotal: number;
  gstTotal: number;
  total: number;
  selectedCustomer?: CustomerItem;
  selectedProject?: ProjectItem;
}) {
  // Selector modal state
  const [modal, setModal] = useState<{
    type: "customer" | "project" | "material" | "location";
    lineIndex?: number;
  } | null>(null);
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false);
  const [showNewMaterialDialog, setShowNewMaterialDialog] = useState(false);
  const [extraCustomers, setExtraCustomers] = useState<CustomerItem[]>([]);
  const [extraMaterials, setExtraMaterials] = useState<MaterialItem[]>([]);
  const submitLongPress = useLongPressNav("/m/material-sales", "Sales list");

  const allCustomers = useMemo(
    () => [...customers, ...extraCustomers],
    [customers, extraCustomers],
  );
  const allMaterials = useMemo(
    () => [...materials, ...extraMaterials],
    [materials, extraMaterials],
  );

  const closeModal = () => setModal(null);

  const handleSelect = (id: string) => {
    if (!modal) return;
    if (modal.type === "customer") setCustomerId(id);
    else if (modal.type === "project") setProjectId(id);
    else if (modal.type === "material" && modal.lineIndex !== undefined) {
      onLineChange(modal.lineIndex, "materialId", id);
    } else if (modal.type === "location" && modal.lineIndex !== undefined) {
      onLineChange(modal.lineIndex, "locationId", id);
    }
    closeModal();
  };

  return (
    <div className="pb-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        {/* ══════ SECTION: WHO — big border box ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Customer & Project
          </p>

          {/* Customer + Project selectors — side-by-side */}
          <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
          <SelectorCard
            onClick={() => setModal({ type: "customer" })}
            icon={User}
            label="Customer"
            value={selectedCustomer?.name}
            subvalue={selectedCustomer?.phone}
            required
            compact
          />
          <SelectorCard
            onClick={() => setModal({ type: "project" })}
            icon={Building2}
            label="Project (optional)"
            value={projectId ? selectedProject?.name : undefined}
            compact
          />
        </div>

        {/* Party name override — for walk-in / cash customers without a CRM record */}
        <div>
          <label
            className="block text-m-caption font-bold mb-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            Party name (optional)
          </label>
          <input
            type="text"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="Walk-in customer name on invoice"
            className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "transparent",
              color: "var(--color-ink-950)",
            }}
          />
        </div>

        </div>

        {/* ══════ SECTION: WHAT — Line Items ══════ */}
        <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
          Line Items
        </p>

        <div className={lines.length > 1 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-3"}>
          {lines.map((line, idx) => {
            const mat = materials.find((m) => m.id === line.materialId);
            const loc = locations.find((l) => l.id === line.locationId);
            const lineTotal =
              (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
            return (
              <div
                key={idx}
                className="rounded-[0.625rem] border overflow-hidden flex flex-col"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                }}
              >
                {/* Line header with number + add/remove */}
                <div
                  className="flex items-center justify-between px-2 py-1"
                  style={{
                    backgroundColor: "var(--color-paper-2)",
                    borderBottom: "1px solid var(--color-line)",
                  }}
                >
                  <span
                    className="text-m-caption font-bold"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    Item {idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onAddLine}
                      className="flex items-center text-m-caption press"
                      style={{ color: "var(--color-ink-700)" }}
                    >
                      <Plus className="size-3" />
                    </button>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => onRemoveLine(idx)}
                        className="flex items-center text-m-caption press"
                        style={{ color: "var(--color-stop)" }}
                      >
                        <Trash2 className="size-2.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="p-1.5 flex flex-col gap-1.5 flex-1">
                  {/* Material + From selectors — side-by-side (same hierarchy layer) */}
                  <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <SelectorRow
                      onClick={() =>
                        setModal({ type: "material", lineIndex: idx })
                      }
                      icon={Package}
                      label="Material"
                      value={mat ? mat.name : undefined}
                      subvalue={mat ? `${mat.code} · ${mat.unit}` : undefined}
                      required
                      compact
                    />
                    <SelectorRow
                      onClick={() =>
                        setModal({ type: "location", lineIndex: idx })
                      }
                      icon={MapPin}
                      label="From"
                      value={loc?.name}
                      compact
                    />
                  </div>

                  {/* Qty + Price inputs — label left, number right */}
                  <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                    <div
                      className="relative pr-2 pb-0.5 border-b focus-within:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)" }}
                    >
                      {!line.qty && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 text-m-caption font-normal pointer-events-none"
                          style={{ color: "var(--color-ink-500)" }}
                        >
                          {`Qty${mat ? ` (${mat.unit})` : ""}`}
                        </span>
                      )}
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="next"
                        value={line.qty}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, "");
                          onLineChange(idx, "qty", v);
                        }}
                        className="w-full h-7 px-1 text-m-caption font-bold tabular-nums text-right outline-none"
                        style={{
                          backgroundColor: "transparent",
                          color: "var(--color-ink-950)",
                        }}
                      />
                    </div>
                    <div
                      className="relative pl-2 pb-0.5 border-b focus-within:border-b-2 transition-colors"
                      style={{ borderColor: "var(--color-line)" }}
                    >
                      {!line.unitPrice && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 text-m-caption font-normal pointer-events-none"
                          style={{ color: "var(--color-ink-500)" }}
                        >
                          Price
                        </span>
                      )}
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="next"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, "");
                          onLineChange(idx, "unitPrice", v);
                        }}
                        className="w-full h-7 px-1 text-m-caption font-bold tabular-nums text-right outline-none"
                        style={{
                          backgroundColor: "transparent",
                          color: "var(--color-ink-950)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Line total */}
                  <div className="flex items-center justify-between pt-0.5">
                    <span
                      className="text-m-caption font-bold"
                      style={{ color: "var(--color-ink-700)" }}
                    >
                      Total
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className="text-m-caption font-bold tabular-nums"
                        style={{ color: lineTotal > 0 ? "var(--color-ink-950)" : "var(--color-ink-300)" }}
                      >
                        {lineTotal > 0 ? formatCurrency(lineTotal) : "—"}
                      </span>
                      {mat && mat.gstRate > 0 ? (
                        <span
                          className="text-m-caption font-normal"
                          style={{ color: "var(--color-ink-500)" }}
                        >
                          +{mat.gstRate}%
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══════ SECTION: HOW — Payment — big border box ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Payment
          </p>

          {/* Payment type selector — 2 options */}
          <div className="grid grid-cols-2 gap-2">
          <TypeCard
            active={paymentType === "credit"}
            onClick={() => setPaymentType("credit")}
            label="Credit"
          />
          <TypeCard
            active={paymentType === "paid"}
            onClick={() => {
              setPaymentType("paid");
              // Pre-fill first split with full amount if empty
              setPaymentSplits((prev) => {
                if (prev.length === 1 && !prev[0]!.amount) {
                  return [{ ...prev[0]!, amount: String(total) }];
                }
                return prev;
              });
            }}
            label="Pay Now"
          />
        </div>

        {/* Payment splits (only for "paid") */}
        {paymentType === "paid" ? (
          <div className="flex flex-col gap-2">
            {paymentSplits.map((split, idx) => {
              return (
                <div key={split.id} className="space-y-1.5">
                  {/* Payment label + amount + mode selector + add/remove — all on one line */}
                  <div
                    className="flex items-center gap-1.5 pb-0.5 border-b focus-within:border-b-2 transition-colors"
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    <span
                      className="text-m-caption font-bold shrink-0"
                      style={{ color: "var(--color-ink-700)" }}
                    >
                      Payment{paymentSplits.length > 1 ? ` ${idx + 1}` : ""}:
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="done"
                      value={split.amount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        setPaymentSplits((prev) =>
                          prev.map((s) =>
                            s.id === split.id
                              ? { ...s, amount: v }
                              : s,
                          ),
                        )
                      }}
                      placeholder="0"
                      className="flex-1 min-w-0 h-7 px-1 text-m-caption font-bold tabular-nums text-right outline-none w-full"
                      style={{
                        backgroundColor: "transparent",
                        color: "var(--color-ink-950)",
                      }}
                    />
                    <div className="shrink-0">
                      <EnumSelect
                        label=""
                        inline
                        value={split.mode}
                        onChange={(v) => {
                          const mode = v as PaymentMode;
                          setPaymentSplits((prev) =>
                            prev.map((s) =>
                              s.id === split.id
                                ? {
                                    ...s,
                                    mode,
                                    ...(mode !== "CHEQUE"
                                      ? { cheque: undefined }
                                      : !s.cheque
                                        ? { cheque: EMPTY_MOBILE_CHEQUE }
                                        : {}),
                                  }
                                : s,
                            ),
                          );
                        }}
                        options={PAYMENT_MODES.map((mode) => ({ value: mode, label: mode }))}
                      />
                    </div>
                    {/* Add payment — plus button next to selector */}
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentSplits((prev) => [
                          ...prev,
                          { id: crypto.randomUUID(), amount: "", mode: "CASH" },
                        ])
                      }
                      className="flex items-center justify-center rounded-[0.25rem] h-5 w-5 press shrink-0"
                      style={{
                        backgroundColor: "var(--color-ink-950)",
                        color: "var(--color-paper)",
                      }}
                    >
                      <Plus className="size-2.5" />
                    </button>
                    {paymentSplits.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentSplits((prev) =>
                            prev.filter((s) => s.id !== split.id),
                          )
                        }
                        className="flex items-center text-m-caption press shrink-0"
                        style={{ color: "var(--color-stop)" }}
                      >
                        <Trash2 className="size-2.5" />
                      </button>
                    ) : null}
                  </div>

                  {/* Cheque fields when CHEQUE mode selected */}
                  {split.mode === "CHEQUE" && (
                    <MobileChequeFields
                      value={split.cheque ?? EMPTY_MOBILE_CHEQUE}
                      onChange={(v) =>
                        setPaymentSplits((prev) =>
                          prev.map((s) =>
                            s.id === split.id ? { ...s, cheque: v } : s,
                          ),
                        )
                      }
                    />
                  )}
                </div>
              );
            })}

            {/* Payment summary */}
            {(() => {
              const totalPaid = paymentSplits.reduce(
                (s, sp) => s + (Number(sp.amount) || 0),
                0,
              );
              const balance = total - totalPaid;
              const overpaid = totalPaid > total + 0.01;
              const fullyPaid = total > 0 && Math.abs(balance) <= 0.01;
              return (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-m-caption">
                    <span style={{ color: "var(--color-ink-500)" }}>
                      Total paying
                    </span>
                    <span
                      className="font-bold tabular-nums"
                      style={{ color: "var(--color-ink-950)" }}
                    >
                      {formatCurrency(totalPaid)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-m-caption">
                    <span style={{ color: "var(--color-ink-500)" }}>
                      {overpaid
                        ? "Overpaid by"
                        : fullyPaid
                          ? "Status"
                          : "Balance due"}
                    </span>
                    <span
                      className="font-bold tabular-nums"
                      style={{
                        color: overpaid
                          ? "var(--color-stop)"
                          : fullyPaid
                            ? "var(--color-go)"
                            : "var(--color-signal)",
                      }}
                    >
                      {overpaid
                        ? formatCurrency(totalPaid - total)
                        : fullyPaid
                          ? "Fully paid"
                          : formatCurrency(balance)}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* Credit info banner */
          <div
            className="flex items-center gap-1 rounded-[0.5rem] border px-3 py-2"
            style={{
              borderColor:
                "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))",
              backgroundColor:
                "color-mix(in srgb, var(--color-signal) 6%, var(--color-paper))",
            }}
          >
            <span
              className="text-m-caption"
              style={{ color: "var(--color-ink-700)" }}
            >
              Sale will be created as{" "}
              <span
                className="font-bold"
                style={{ color: "var(--color-signal)" }}
              >
                unpaid
              </span>
              . Record payment later from the sale detail page.
            </span>
          </div>
        )}
        </div>

        {/* ══════ SECTION: DETAILS — Dispatch — big border box ══════ */}
        <div
          className="rounded-[0.625rem] border p-3 flex flex-col gap-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
            Dispatch Details
          </p>

          {/* Vehicle / Carrier — how goods are dispatched */}
          <div>
            <VehicleCapture value={vehicle} onChange={setVehicle} compact />
          </div>

        {/* Notes — inline label, full-width underline */}
        <div
          className="flex items-center gap-1 pb-0.5 border-b focus-within:border-b-2 transition-colors"
          style={{ borderColor: "var(--color-line)" }}
        >
          <span
            className="text-m-caption font-bold shrink-0 h-7 leading-7"
            style={{ color: "var(--color-ink-700)" }}
          >
            Notes:
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Surplus cement sold to local contractor"
            rows={1}
            className="flex-1 min-w-0 h-7 px-1 text-m-caption leading-7 outline-none resize-none"
            style={{
              backgroundColor: "transparent",
              color: "var(--color-ink-950)",
            }}
          />
        </div>
        </div>
      </form>

      {/* ══════ STICKY BOTTOM ACTION BAR ══════ */}
      <div
        className="sticky bottom-0 left-0 right-0 z-20 border-t"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-line)",
        }}
      >
        <div className="max-w-md mx-auto px-3.5 py-2 flex items-center justify-between gap-3">
          {/* Total summary */}
          <div className="shrink-0">
            <p
              className="text-m-caption font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-ink-500)" }}
            >
              {paymentType === "paid" ? "Paid" : "Credit"}
            </p>
            <p
              className="text-m-section font-bold tabular-nums"
              style={{ color: "var(--color-ink-950)" }}
            >
              {formatCurrency(total)}
            </p>
            {paymentType === "paid" ? (
              <p
                className="text-m-caption"
                style={{ color: "var(--color-ink-500)" }}
              >
                {(() => {
                  const paid = paymentSplits.reduce(
                    (s, sp) => s + (Number(sp.amount) || 0),
                    0,
                  );
                  const bal = total - paid;
                  if (paid > total + 0.01)
                    return `overpaid ${formatCurrency(paid - total)}`;
                  if (bal > 0.01) return `${formatCurrency(bal)} on credit`;
                  return "fully paid";
                })()}
              </p>
            ) : null}
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={(e) => { if (submitLongPress.wasLongPress()) return; onSubmit(e as unknown as React.FormEvent); }}
            disabled={submitting}
            {...submitLongPress.longPressProps}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-section font-bold text-m-body press disabled:opacity-50 select-none"
            style={{
              backgroundColor: "var(--color-ink-950)",
              color: "var(--color-paper)",
              touchAction: "none",
            }}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <span>Create Sale</span>
            )}
          </button>
        </div>
      </div>

      {/* ══════ SELECTOR MODAL ══════ */}
      {modal ? (
        <SelectorModal
          title={
            modal.type === "customer"
              ? "Select Customer"
              : modal.type === "project"
                ? "Select Project"
                : modal.type === "material"
                  ? "Select Material"
                  : "Select Location"
          }
          items={
            modal.type === "customer"
              ? allCustomers.map((c) => ({
                  id: c.id,
                  label: c.name,
                  sub: c.phone ?? undefined,
                }))
              : modal.type === "project"
                ? [
                    { id: "", label: "No project linkage", sub: undefined },
                    ...projects.map((p) => ({ id: p.id, label: p.name })),
                  ]
                : modal.type === "material"
                  ? allMaterials.map((m) => ({
                      id: m.id,
                      label: m.name,
                      sub: `${m.code} · ${m.unit} · ${m.gstRate}% GST`,
                    }))
                  : locations.map((l) => ({
                      id: l.id,
                      label: l.name,
                      sub: l.type.replace(/_/g, " ").toLowerCase(),
                    }))
          }
          selectedId={
            modal.type === "customer"
              ? customerId
              : modal.type === "project"
                ? projectId
                : modal.type === "material"
                  ? (lines[modal.lineIndex ?? 0]?.materialId ?? "")
                  : (lines[modal.lineIndex ?? 0]?.locationId ?? "")
          }
          onSelect={handleSelect}
          onClose={closeModal}
          onCreate={
            modal.type === "customer"
              ? () => {
                  setShowNewCustomerDialog(true);
                }
              : modal.type === "material"
                ? () => {
                    setShowNewMaterialDialog(true);
                  }
                : undefined
          }
          createLabel={
            modal.type === "customer"
              ? "Create new customer"
              : modal.type === "material"
                ? "Create new material"
                : undefined
          }
        />
      ) : null}

      {/* Inline customer create dialog */}
      <MobileNewCustomerDialog
        open={showNewCustomerDialog}
        onClose={() => setShowNewCustomerDialog(false)}
        nested
        onCreated={(c) => {
          setExtraCustomers((prev) => [
            ...prev,
            { id: c.id, name: c.name, phone: null },
          ]);
          setCustomerId(c.id);
          setShowNewCustomerDialog(false);
          closeModal();
        }}
      />

      {/* Inline material create dialog */}
      <MobileNewMaterialDialog
        open={showNewMaterialDialog}
        onClose={() => setShowNewMaterialDialog(false)}
        categories={[]}
        nested
        onCreated={(m) => {
          const newMat: MaterialItem = {
            id: m.id,
            name: m.name,
            code: m.code,
            unit: m.unit,
            gstRate: m.gstRate,
          };
          setExtraMaterials((prev) => [...prev, newMat]);
          if (modal?.lineIndex !== undefined) {
            onLineChange(modal.lineIndex, "materialId", m.id);
          }
          setShowNewMaterialDialog(false);
          closeModal();
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Section header — divides the form into purpose-driven sections
 * ═══════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SectionHeader({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span
        className="text-m-section font-extrabold tracking-tight"
        style={{ color: "var(--color-ink-950)" }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-px"
        style={{ backgroundColor: "var(--color-line)" }}
      />
    </div>
  );
}
