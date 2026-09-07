"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Send,
  Truck,
  Loader2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Crown,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyCompact, formatNumber } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { MobileNewSupplierDialog } from "@/app/m/suppliers/MobileNewSupplierDialog";
import { MobileNewStockLocationDialog } from "@/app/m/stock-locations/MobileNewStockLocationDialog";
import { EnumSelect } from "@/components/mobile/v2/form-primitives";

interface WinningQuoteData {
  id: string;
  supplierName: string;
  supplierId: string;
  landedTotal: number;
  selectedAt: string | null;
  selectionReason: string | null;
  isCheapest: boolean;
  lineCosts: Record<string, number>;
}

interface ReqPayload {
  id: string;
  reqNumber: string;
  status: string;
  projectName: string | null;
  projectId: string | null;
}
interface ReqLine {
  id: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  unit: string;
  qtyRequested: number;
  suggestedCost: number;
  preferredSupplierId: string | null;
}
interface SupplierOpt {
  id: string;
  name: string;
}
interface LocationOpt {
  id: string;
  name: string;
  type: string;
  projectId: string | null;
}

/**
 * Inline actions for a requisition on mobile:
 *   DRAFT     → submit (procurement.manage)
 *   SUBMITTED → approve / reject (requisition.approve)
 *   APPROVED  → convert to PO (procurement.manage) — expandable form
 */
export function MobileRequisitionActions({
  requisition,
  lines,
  suppliers,
  locations,
  canApprove,
  canManage,
  quoteCount = 0,
  minQuotesRequired = 3,
  quotesWaived = false,
  winningQuote = null,
}: {
  requisition: ReqPayload;
  lines: ReqLine[];
  suppliers: SupplierOpt[];
  locations: LocationOpt[];
  canApprove: boolean;
  canManage: boolean;
  quoteCount?: number;
  minQuotesRequired?: number;
  quotesWaived?: boolean;
  winningQuote?: WinningQuoteData | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showConvert, setShowConvert] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const showSubmit = requisition.status === "DRAFT" && canManage;
  const showApproveReject = requisition.status === "SUBMITTED" && canApprove;
  const canConvert = requisition.status === "APPROVED" && canManage;
  const showDelete =
    (requisition.status === "DRAFT" || requisition.status === "REJECTED") &&
    canManage;

  if (!showSubmit && !showApproveReject && !canConvert && !showDelete)
    return null;

  async function act(action: "submit" | "approve" | "reject", label: string) {
    haptic(10);
    setBusy(action);
    try {
      const res = await fetch(`/api/requisitions/${requisition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);
      toast.success(label);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setBusy(null);
    }
  }

  async function deleteReq() {
    haptic(30);
    setBusy("delete");
    try {
      const res = await fetch(`/api/requisitions/${requisition.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete indent");
      toast.success("Indent deleted");
      router.push("/m/procurement?tab=indents");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setBusy(null);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="space-y-2 px-4 pb-6 pt-3">
      {showSubmit && (
        <BarButton
          onClick={() => act("submit", `Indent ${requisition.reqNumber} submitted`)}
          busy={busy === "submit"}
          icon={Send}
          label="Submit for approval"
          variant="primary"
        />
      )}
      {showApproveReject && (
        <div className="flex gap-2">
          <BarButton
            onClick={() => act("approve", `Indent ${requisition.reqNumber} approved`)}
            busy={busy === "approve"}
            icon={CheckCircle2}
            label="Approve"
            variant="primary"
            className="flex-1"
          />
          <BarButton
            onClick={() => act("reject", `Indent ${requisition.reqNumber} rejected`)}
            busy={busy === "reject"}
            icon={XCircle}
            label="Reject"
            variant="outline"
            className="flex-1"
          />
        </div>
      )}
      {canConvert && (
        <>
          <BarButton
            onClick={() => setShowConvert((v) => !v)}
            busy={false}
            icon={showConvert ? ChevronDown : ChevronRight}
            label="Convert to Purchase Order"
            variant="primary"
          />
          {showConvert && (
            <ConvertForm
              requisition={requisition}
              lines={lines}
              suppliers={suppliers}
              locations={locations}
              quoteCount={quoteCount}
              minQuotesRequired={minQuotesRequired}
              quotesWaived={quotesWaived}
              winningQuote={winningQuote}
              onDone={() => {
                setShowConvert(false);
                router.refresh();
              }}
            />
          )}
        </>
      )}
      {showDelete && (
        <BarButton
          onClick={() => {
            haptic(10);
            setShowDeleteConfirm(true);
          }}
          busy={busy === "delete"}
          icon={Trash2}
          label="Delete Indent"
          variant="outline"
        />
      )}
      {showDeleteConfirm && (
        <>
          <div
            className="fixed inset-0 z-50"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
            onClick={() => !busy && setShowDeleteConfirm(false)}
          />
          <div
            className="fixed left-0 right-0 bottom-0 z-50 rounded-t-[1rem] border-t"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-line)",
              paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
            }}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: "var(--color-line)" }}
              />
            </div>
            <div
              className="flex items-center justify-between px-4 pb-2 border-b"
              style={{ borderColor: "var(--color-line)" }}
            >
              <p
                className="text-m-section font-bold"
                style={{ color: "var(--color-ink-950)" }}
              >
                Delete Requisition?
              </p>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={busy === "delete"}
                aria-label="Reject"
                className="touch grid place-items-center rounded-[0.5rem] text-m-body press"
                style={{ color: "var(--color-ink-500)" }}
              >
                <XCircle className="size-4" />
              </button>
            </div>
            <div className="px-4 py-3 flex flex-col gap-3">
              <p
                className="text-m-body"
                style={{ color: "var(--color-ink-500)" }}
              >
                This will permanently delete requisition{" "}
                <span className="font-bold font-mono" style={{ color: "var(--color-ink-950)" }}>
                  {requisition.reqNumber}
                </span>
                . This action cannot be undone.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={busy === "delete"}
                  className="flex-1 h-10 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={deleteReq}
                  disabled={busy === "delete"}
                  className="flex-1 h-10 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: "var(--color-stop)", color: "var(--color-paper)" }}
                >
                  {busy === "delete" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  {busy === "delete" ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ConvertForm({
  requisition,
  lines,
  suppliers,
  locations,
  quoteCount = 0,
  minQuotesRequired = 3,
  quotesWaived = false,
  winningQuote = null,
  onDone,
}: {
  requisition: ReqPayload;
  lines: ReqLine[];
  suppliers: SupplierOpt[];
  locations: LocationOpt[];
  quoteCount?: number;
  minQuotesRequired?: number;
  quotesWaived?: boolean;
  winningQuote?: WinningQuoteData | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [localSuppliers, setLocalSuppliers] = useState<SupplierOpt[]>(suppliers);
  const [localLocations, setLocalLocations] = useState<LocationOpt[]>(locations);
  // Pre-fill supplier from winning quote if available
  const [supplierId, setSupplierId] = useState(
    winningQuote?.supplierId ?? lines[0]?.preferredSupplierId ?? suppliers[0]?.id ?? "",
  );
  const [scope, setScope] = useState<"COMPANY" | "PROJECT">("COMPANY");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  // Pre-fill line costs from winning quote, fall back to suggestedCost
  const [lineCosts, setLineCosts] = useState<Record<string, number>>(
    Object.fromEntries(
      lines.map((l) => [
        l.materialId,
        winningQuote?.lineCosts[l.materialId] ?? l.suggestedCost,
      ]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [convertResult, setConvertResult] = useState<{ poId: string; poNumber: string } | null>(null);

  const gateSatisfied = quoteCount >= minQuotesRequired || quotesWaived;

  // Locations valid for the chosen scope.
  const scopedLocations = localLocations.filter((l) =>
    scope === "COMPANY" ? l.type === "COMPANY_WAREHOUSE" : l.type === "PROJECT_SITE",
  );

  async function convert() {
    if (!supplierId) return toast.error("Select a supplier");
    if (!locationId) return toast.error("Select a destination location");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/requisitions/${requisition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "convert",
          supplierId,
          procurementScope: scope,
          destinationLocationId: locationId,
          lineCosts,
          expectedDate: expectedDate || null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to convert");
      toast.success(`PO ${data.poNumber} created`);
      haptic(10);
      onDone();
      // Stay on the page — show inline success sheet instead of navigating away.
      setConvertResult({ poId: data.poId, poNumber: data.poNumber });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-[0.625rem] border p-3"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {/* ── Convert success sheet (inline, replaces router.push) ── */}
      {convertResult ? (
        <div
          className="flex flex-col gap-3 rounded-[0.5rem] border p-3"
          style={{ borderColor: "var(--color-go)", backgroundColor: "var(--color-go-wash)" }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 shrink-0" style={{ color: "var(--color-go-dark)" }} />
            <div className="flex-1">
              <p className="text-m-section font-bold" style={{ color: "var(--color-go-dark)" }}>
                PO {convertResult.poNumber} created
              </p>
              <p className="text-m-caption" style={{ color: "var(--color-ink-600)" }}>
                The purchase order has been generated from this indent.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/m/procurement/${convertResult.poId}`)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-[0.5rem] py-2 text-m-label font-bold press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
            >
              <Truck className="size-3.5" />
              View PO
            </button>
            <button
              type="button"
              onClick={() => { setConvertResult(null); onDone(); router.refresh(); }}
              className="flex-1 rounded-[0.5rem] border py-2 text-m-label font-bold press"
              style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            >
              Stay here
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* ── Quote gate status ── */}
      <div
        className="flex items-center gap-2 rounded-[0.5rem] px-2.5 py-2 text-m-label font-semibold"
        style={{
          backgroundColor: gateSatisfied ? "var(--color-go-wash)" : "var(--color-signal-wash)",
          color: gateSatisfied ? "var(--color-go-dark)" : "var(--color-signal-dark)",
        }}
      >
        {gateSatisfied ? (
          <ShieldCheck className="size-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="size-3.5 shrink-0" />
        )}
        <span className="flex-1">
          {quotesWaived
            ? `Quote requirement waived (${quoteCount}/${minQuotesRequired} uploaded)`
            : gateSatisfied
              ? `${quoteCount}/${minQuotesRequired} quotes collected — gate satisfied`
              : `${quoteCount}/${minQuotesRequired} quotes — need ${minQuotesRequired - quoteCount} more to convert`}
        </span>
      </div>

      {/* ── Winning quote summary ── */}
      {winningQuote && (
        <div
          className="flex items-center gap-2 rounded-[0.5rem] border px-2.5 py-2"
          style={{
            borderColor: "var(--color-steel)",
            backgroundColor: "var(--color-concrete)",
          }}
        >
          <Crown
            className="size-4 shrink-0"
            style={{ color: winningQuote.isCheapest ? "var(--color-go)" : "var(--color-steel)" }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              Winner: {winningQuote.supplierName}
            </p>
            <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
              Landed total: {formatCurrencyCompact(winningQuote.landedTotal)}
              {!winningQuote.isCheapest && " · not cheapest"}
              {winningQuote.selectionReason ? ` · ${winningQuote.selectionReason}` : ""}
            </p>
          </div>
        </div>
      )}

      <div>
        <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
          Supplier
        </label>
        <MobileSelectWithCreate
          label=""
          value={supplierId}
          onChange={setSupplierId}
          options={localSuppliers.map((s) => ({ value: s.id, label: s.name }))}
          inputClass="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
          inputStyle={{ backgroundColor: "transparent" }}
          labelClass="hidden"
          renderDialog={({ open, onClose, onCreated }) => (
            <MobileNewSupplierDialog
              open={open}
              onClose={onClose}
              onCreated={(s) => {
                setLocalSuppliers((p) => [...p, { id: s.id, name: s.name }]);
                onCreated(s.id, s.name);
              }}
            />
          )}
        />
      </div>

      <div>
        <EnumSelect
          label="Procurement scope"
          value={scope}
          onChange={(v) => {
            const next = v as "COMPANY" | "PROJECT";
            setScope(next);
            // Reset location if it's not valid for the new scope
            const valid = localLocations.filter((l) =>
              next === "COMPANY" ? l.type === "COMPANY_WAREHOUSE" : l.type === "PROJECT_SITE",
            );
            if (!valid.some((l) => l.id === locationId) && valid[0]) setLocationId(valid[0].id);
          }}
          options={[
            { value: "COMPANY", label: "Company warehouse" },
            { value: "PROJECT", label: "Project site" },
          ]}
        />
      </div>

      <div>
        <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
          Receive at
        </label>
        <MobileSelectWithCreate
          label=""
          value={locationId}
          onChange={setLocationId}
          options={scopedLocations.map((l) => ({ value: l.id, label: l.name }))}
          placeholder={scopedLocations.length === 0 ? "No locations for this scope" : "Select location…"}
          inputClass="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
          inputStyle={{ backgroundColor: "transparent" }}
          labelClass="hidden"
          renderDialog={({ open, onClose, onCreated }) => (
            <MobileNewStockLocationDialog
              open={open}
              onClose={onClose}
              projects={[]}
              onCreated={(l) => {
                setLocalLocations((p) => [...p, { id: l.id, name: l.name, type: l.type, projectId: null }]);
                onCreated(l.id, l.name);
              }}
            />
          )}
        />
      </div>

      <div>
        <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
          Expected date (optional)
        </label>
        <input
          type="date"
          value={expectedDate}
          onChange={(e) => setExpectedDate(e.target.value)}
          className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors"
          style={{ backgroundColor: "transparent" }}
        />
      </div>

      <div>
        <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
          Line costs
          {winningQuote && (
            <span className="ml-1 text-m-caption" style={{ color: "var(--color-steel)" }}>
              (auto-filled from winning quote)
            </span>
          )}
        </label>
        <div className="flex flex-col gap-2">
          {lines.map((l) => (
            <div key={l.materialId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>{l.materialName}</div>
                <div className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  {formatNumber(l.qtyRequested, 0)} {l.unit}
                </div>
              </div>
              <div className="relative w-28 shrink-0">
                <input
                  type="text"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={lineCosts[l.materialId] ?? 0}
                  onChange={(e) =>
                    setLineCosts((c) => ({ ...c, [l.materialId]: Number(e.target.value) }))
                  }
                  className="w-full h-9 rounded-[0.375rem] border px-2 text-right text-m-body tabular-nums outline-none"
                  style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
                />
              </div>
            </div>
          ))}
        </div>
        <div
          className="mt-2 flex justify-between border-t pt-2 text-m-caption font-bold"
          style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
        >
          <span>Estimated total</span>
          <span className="tabular-nums" style={{ color: "var(--color-go)" }}>
            {formatCurrencyCompact(
              lines.reduce((s, l) => s + (lineCosts[l.materialId] ?? 0) * l.qtyRequested, 0),
            )}
          </span>
        </div>
      </div>

      <div>
        <label className="block text-m-caption font-semibold mb-1" style={{ color: "var(--color-ink-500)" }}>
          Notes (optional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="PO notes"
          className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none"
          style={{ backgroundColor: "transparent" }}
        />
      </div>

      <button
        type="button"
        onClick={convert}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold press disabled:opacity-50"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-3.5" />}
        Create Purchase Order
      </button>
      </>
      )}
    </div>
  );
}

function BarButton({
  onClick,
  busy,
  icon: Icon,
  label,
  variant,
  className,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof CheckCircle2;
  label: string;
  variant: "primary" | "outline";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex w-full items-center justify-center gap-1.5 rounded-[0.5rem] py-2.5 text-m-body font-bold press disabled:opacity-50 ${className ?? ""}`}
      style={
        variant === "primary"
          ? { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }
          : { border: "2px solid var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)" }
      }
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {label}
    </button>
  );
}
