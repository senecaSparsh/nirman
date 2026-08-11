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
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { haptic } from "@/lib/haptic";

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
}: {
  requisition: ReqPayload;
  lines: ReqLine[];
  suppliers: SupplierOpt[];
  locations: LocationOpt[];
  canApprove: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showConvert, setShowConvert] = useState(false);

  const showSubmit = requisition.status === "DRAFT" && canManage;
  const showApproveReject = requisition.status === "SUBMITTED" && canApprove;
  const canConvert = requisition.status === "APPROVED" && canManage;

  if (!showSubmit && !showApproveReject && !canConvert) return null;

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

  return (
    <div className="space-y-2 px-4 pb-6 pt-3">
      {showSubmit && (
        <BarButton
          onClick={() => act("submit", `Requisition ${requisition.reqNumber} submitted`)}
          busy={busy === "submit"}
          icon={Send}
          label="Submit for approval"
          variant="primary"
        />
      )}
      {showApproveReject && (
        <>
          <BarButton
            onClick={() => act("approve", `Requisition ${requisition.reqNumber} approved`)}
            busy={busy === "approve"}
            icon={CheckCircle2}
            label="Approve"
            variant="primary"
          />
          <BarButton
            onClick={() => act("reject", `Requisition ${requisition.reqNumber} rejected`)}
            busy={busy === "reject"}
            icon={XCircle}
            label="Reject"
            variant="outline"
          />
        </>
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
              onDone={() => {
                setShowConvert(false);
                router.refresh();
              }}
            />
          )}
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
  onDone,
}: {
  requisition: ReqPayload;
  lines: ReqLine[];
  suppliers: SupplierOpt[];
  locations: LocationOpt[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(lines[0]?.preferredSupplierId ?? suppliers[0]?.id ?? "");
  const [scope, setScope] = useState<"COMPANY" | "PROJECT">("COMPANY");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineCosts, setLineCosts] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.materialId, l.suggestedCost])),
  );
  const [submitting, setSubmitting] = useState(false);

  // Locations valid for the chosen scope.
  const scopedLocations = locations.filter((l) =>
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
      onDone();
      router.push(`/m/procurement/${data.poId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div>
        <Label>Supplier</Label>
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label>Procurement scope</Label>
        <Select
          value={scope}
          onChange={(e) => {
            const next = e.target.value as "COMPANY" | "PROJECT";
            setScope(next);
            // Reset location if it's not valid for the new scope
            const valid = locations.filter((l) =>
              next === "COMPANY" ? l.type === "COMPANY_WAREHOUSE" : l.type === "PROJECT_SITE",
            );
            if (!valid.some((l) => l.id === locationId) && valid[0]) setLocationId(valid[0].id);
          }}
        >
          <option value="COMPANY">Company warehouse</option>
          <option value="PROJECT">Project site</option>
        </Select>
      </div>

      <div>
        <Label>Receive at</Label>
        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          {scopedLocations.length === 0 ? (
            <option value="">No locations for this scope</option>
          ) : (
            scopedLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))
          )}
        </Select>
      </div>

      <div>
        <Label>Expected date (optional)</Label>
        <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
      </div>

      <div>
        <Label>Line costs</Label>
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.materialId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-meta font-medium text-foreground">{l.materialName}</div>
                <div className="text-caption text-muted-foreground">
                  {formatNumber(l.qtyRequested, 0)} {l.unit}
                </div>
              </div>
              <div className="relative w-28 shrink-0">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={lineCosts[l.materialId] ?? 0}
                  onChange={(e) =>
                    setLineCosts((c) => ({ ...c, [l.materialId]: Number(e.target.value) }))
                  }
                  className="pr-1 text-right"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-meta font-semibold">
          <span>Estimated total</span>
          <span className="tnum">
            {formatCurrency(
              lines.reduce((s, l) => s + (lineCosts[l.materialId] ?? 0) * l.qtyRequested, 0),
            )}
          </span>
        </div>
      </div>

      <div>
        <Label>Notes (optional)</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="PO notes"
        />
      </div>

      <button
        type="button"
        onClick={convert}
        disabled={submitting}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-raised transition-colors active:scale-[0.99] disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
        Create Purchase Order
      </button>
    </div>
  );
}

function BarButton({
  onClick,
  busy,
  icon: Icon,
  label,
  variant,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof CheckCircle2;
  label: string;
  variant: "primary" | "outline";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors active:scale-[0.99] disabled:opacity-60",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-raised"
          : "border border-border bg-card text-foreground",
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
